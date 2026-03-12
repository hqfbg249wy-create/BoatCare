// Edge Function: stripe-webhook
// Handles Stripe webhook events for payment confirmations and transfers
//
// Set STRIPE_WEBHOOK_SECRET in Supabase Dashboard > Settings > Edge Functions > Secrets

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

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

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const orderIds = paymentIntent.metadata?.order_ids?.split(",") || [];

        console.log(`Payment succeeded for orders: ${orderIds.join(", ")}`);

        // Update all associated orders
        for (const orderId of orderIds) {
          if (!orderId) continue;

          await supabase
            .from("orders")
            .update({
              payment_status: "paid",
              status: "confirmed",
            })
            .eq("id", orderId.trim());
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
