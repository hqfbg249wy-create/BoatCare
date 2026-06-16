// Edge Function: stripe-webhook
// Handles Stripe webhook events for payment confirmations and transfers
//
// Erwartet diese Secrets im Supabase Dashboard > Edge Functions > Secrets:
//   STRIPE_WEBHOOK_SECRET          → Platform-Webhook ('Ihr Konto')
//   STRIPE_WEBHOOK_SECRET_CONNECT  → Connected-Accounts-Webhook ('Verbundene Konten')
// Beide Webhooks zeigen auf dieselbe URL, weil Stripe pro Event nur das passende
// Signing Secret verwendet. Wir probieren beide Secrets durch, das jeweils
// gültige verifiziert das Event.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Beide bekannten Webhook-Secrets sammeln (leere/nicht-gesetzte ignorieren).
const webhookSecrets: string[] = [
  Deno.env.get("STRIPE_WEBHOOK_SECRET")          ?? "",
  Deno.env.get("STRIPE_WEBHOOK_SECRET_CONNECT")  ?? "",
].filter((s) => s.length > 0);

if (webhookSecrets.length === 0) {
  console.error("Kein STRIPE_WEBHOOK_SECRET* in den Secrets gesetzt — Webhook wird jede Anfrage ablehnen.");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  try {
    const body = await req.text();

    // Webhook-Signatur gegen ALLE konfigurierten Secrets prüfen.
    // Sobald eines verifiziert, weiterarbeiten. Wenn keines greift,
    // den letzten Fehler zurückgeben.
    let event;
    let lastErr: unknown;
    for (const secret of webhookSecrets) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, secret);
        break; // erfolgreich verifiziert
      } catch (err) {
        lastErr = err;
      }
    }
    if (!event) {
      const msg = (lastErr as Error)?.message ?? "no webhook secrets configured";
      console.error("Webhook signature verification failed:", msg);
      return new Response(`Webhook Error: ${msg}`, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const orderIds = paymentIntent.metadata?.order_ids?.split(",") || [];

        console.log(`Payment succeeded for orders: ${orderIds.join(", ")}`);

        // Update all associated orders + Provider-/Käufer-Webhook anstoßen
        for (const orderId of orderIds) {
          if (!orderId) continue;
          const oid = orderId.trim();

          await supabase
            .from("orders")
            .update({
              payment_status: "paid",
              status: "confirmed",
            })
            .eq("id", oid);

          // order-webhooks benachrichtigt den Provider (webhook_url) + Käufer.
          // Fire-and-forget, damit der Stripe-Webhook schnell mit 200 antwortet.
          fetch(`${supabaseUrl}/functions/v1/order-webhooks`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ order_id: oid, event_type: "order_confirmed" }),
          }).catch((e) => console.warn("order-webhooks Trigger fehlgeschlagen:", e?.message));
        }

        // Create transfers for multi-provider orders
        if (orderIds.length > 1) {
          for (const orderId of orderIds) {
            if (!orderId) continue;

            const { data: order } = await supabase
              .from("orders")
              .select("total, commission_amount, provider_id, service_providers(stripe_account_id)")
              .eq("id", orderId.trim())
              .single();

            if (!order) continue;

            const stripeAccountId = (order as any).service_providers?.stripe_account_id;
            if (!stripeAccountId) continue;

            const transferAmount = Math.round(
              (order.total - (order.commission_amount || 0)) * 100
            );

            try {
              const transfer = await stripe.transfers.create({
                amount: transferAmount,
                currency: "eur",
                destination: stripeAccountId,
                source_transaction: paymentIntent.latest_charge as string,
                metadata: { order_id: orderId.trim() },
              });

              await supabase
                .from("orders")
                .update({ stripe_transfer_id: transfer.id })
                .eq("id", orderId.trim());

              console.log(`Transfer ${transfer.id} created for order ${orderId}`);
            } catch (transferErr) {
              console.error(`Transfer failed for order ${orderId}:`, transferErr);
            }
          }
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        const orderIds = paymentIntent.metadata?.order_ids?.split(",") || [];

        console.log(`Payment failed for orders: ${orderIds.join(", ")}`);

        for (const orderId of orderIds) {
          if (!orderId) continue;
          await supabase
            .from("orders")
            .update({ payment_status: "failed" })
            .eq("id", orderId.trim());
        }

        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent;

        console.log(`Refund processed for payment intent: ${paymentIntentId}`);

        // Find orders by payment intent ID
        const { data: orders } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntentId);

        if (orders) {
          for (const order of orders) {
            await supabase
              .from("orders")
              .update({
                payment_status: "refunded",
                status: "refunded",
              })
              .eq("id", order.id);
          }
        }

        break;
      }

      case "account.updated": {
        // Connected account updated (provider onboarding status)
        const account = event.data.object;
        console.log(`Connected account updated: ${account.id}`);

        // Update provider's Stripe status
        if (account.charges_enabled && account.payouts_enabled) {
          await supabase
            .from("service_providers")
            .update({
              stripe_account_id: account.id,
              is_shop_active: true,
            })
            .eq("stripe_account_id", account.id);
        }

        break;
      }

      // ─── Subscription Lifecycle ─────────────────────────────────────────
      // Wenn der Provider ein Professional-Abo abschließt, ändert oder
      // kündigt, synchronisieren wir subscription_tier/_status/_period_end
      // auf service_providers.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const providerId = sub.metadata?.provider_id;

        // Status-Mapping Stripe → unsere subscription_status-Enum
        const stripeStatus: string = sub.status; // active, past_due, canceled, trialing, ...
        let ourStatus = "active";
        if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") ourStatus = "cancelled";
        else if (stripeStatus === "past_due" || stripeStatus === "unpaid")        ourStatus = "past_due";
        else if (stripeStatus === "trialing")                                     ourStatus = "trial";
        else if (stripeStatus === "active")                                       ourStatus = "active";
        else                                                                       ourStatus = "expired";

        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        const startedAt = sub.start_date
          ? new Date(sub.start_date * 1000).toISOString()
          : null;

        // Bei Kündigung/Deletion fallen wir auf "standard" zurück
        const effectiveTier =
          (event.type === "customer.subscription.deleted" || stripeStatus === "canceled")
            ? "standard"
            : "professional";

        // Aktiver Preis ist immer das erste Subscription-Item (wir nutzen nur 1 line item)
        const stripePriceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;

        // price_id → plan-code Mapping (Source of Truth ist auch SQL, hier zur Resilienz)
        const PLAN_MAP: Record<string, string> = {
          "price_1TWIBKAKSxHR03mTLBHJkIvb": "pro_monthly",
          "price_1TWI7bAKSxHR03mTLIBshinq": "pro_yearly",
          "price_1TWIDLAKSxHR03mT7o48URgq": "ent_monthly",
          "price_1TWIE6AKSxHR03mT2gFOvwdw": "ent_yearly",
        };
        const planCode = (stripePriceId && PLAN_MAP[stripePriceId]) || null;

        const updateFields: Record<string, unknown> = {
          subscription_tier:        effectiveTier,
          subscription_status:      ourStatus,
          subscription_period_end:  periodEnd,
          stripe_subscription_id:   sub.id,
          stripe_price_id:          stripePriceId,
          subscription_plan:        effectiveTier === "standard" ? null : planCode,
        };
        if (startedAt) updateFields.subscription_started_at = startedAt;

        // Provider bevorzugt über metadata.provider_id finden, sonst über Customer-ID
        let query = supabase.from("service_providers").update(updateFields);
        if (providerId) {
          query = query.eq("id", providerId);
        } else if (sub.customer) {
          query = query.eq("stripe_customer_id", sub.customer);
        } else {
          console.warn("Subscription event ohne provider_id und ohne customer — skipped");
          break;
        }
        const { error: updErr } = await query;
        if (updErr) {
          console.error(`Subscription update failed for ${sub.id}:`, updErr);
        } else {
          console.log(`Subscription ${event.type} → ${providerId || sub.customer}: tier=${effectiveTier}, status=${ourStatus}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        // Failed recurring charge → mark past_due (Stripe sendet meist auch
        // ein customer.subscription.updated, aber wir setzen es sicherheitshalber).
        const invoice = event.data.object as any;
        if (invoice.subscription) {
          await supabase
            .from("service_providers")
            .update({ subscription_status: "past_due" })
            .eq("stripe_subscription_id", invoice.subscription);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(`Webhook Error: ${err.message}`, { status: 500 });
  }
});
