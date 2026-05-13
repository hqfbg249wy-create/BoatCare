// Edge Function: sync-subscription-status
//
// Fallback wenn der Stripe-Webhook (noch) nicht das Subscription-Event
// verarbeitet hat: holt aktiv den aktuellen Subscription-Status für einen
// Provider von Stripe ab und schreibt ihn in service_providers.
//
// Aufruf vom Provider-Portal, sobald der User von der Checkout-Success-URL
// zurückkommt. Idempotent — kann jederzeit aufgerufen werden.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PLAN_MAP: Record<string, string> = {
  "price_1TWIBKAKSxHR03mTLBHJkIvb": "pro_monthly",
  "price_1TWI7bAKSxHR03mTLIBshinq": "pro_yearly",
  "price_1TWIDLAKSxHR03mT7o48URgq": "ent_monthly",
  "price_1TWIE6AKSxHR03mT2gFOvwdw": "ent_yearly",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const providerId: string | undefined = body.provider_id;
    if (!providerId) {
      return new Response(JSON.stringify({ error: "provider_id fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "User-Verifizierung fehlgeschlagen" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: provider, error: provErr } = await supabase
      .from("service_providers")
      .select("id, user_id, stripe_customer_id")
      .eq("id", providerId)
      .single();
    if (provErr || !provider) {
      return new Response(JSON.stringify({ error: "Provider nicht gefunden: " + (provErr?.message || "kein Datensatz") }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (provider.user_id && provider.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!provider.stripe_customer_id) {
      return new Response(JSON.stringify({ status: "no_customer", message: "Kein Stripe-Customer — noch kein Abo gestartet." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Aktive Subscription bei Stripe abfragen
    const subs = await stripe.subscriptions.list({
      customer: provider.stripe_customer_id,
      status:   "all",
      limit:    5,
    });

    // Bevorzugt eine aktive/trialing-Subscription, sonst die jüngste
    let chosen = subs.data.find((s: any) => s.status === "active" || s.status === "trialing");
    if (!chosen && subs.data.length > 0) {
      chosen = subs.data.sort((a: any, b: any) => b.created - a.created)[0];
    }

    if (!chosen) {
      // Keine Subscription → Provider fällt auf Standard zurück
      await supabase.from("service_providers")
        .update({
          subscription_tier:        "standard",
          subscription_status:      "active",
          subscription_plan:        null,
          stripe_subscription_id:   null,
          stripe_price_id:          null,
          subscription_period_end:  null,
        })
        .eq("id", providerId);
      return new Response(JSON.stringify({ status: "no_subscription" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeStatus: string = chosen.status;
    let ourStatus = "active";
    if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") ourStatus = "cancelled";
    else if (stripeStatus === "past_due" || stripeStatus === "unpaid")        ourStatus = "past_due";
    else if (stripeStatus === "trialing")                                     ourStatus = "trial";
    else if (stripeStatus === "active")                                       ourStatus = "active";
    else                                                                       ourStatus = "expired";

    const priceId   = chosen.items?.data?.[0]?.price?.id ?? null;
    const planCode  = (priceId && PLAN_MAP[priceId]) || null;
    const periodEnd = chosen.current_period_end ? new Date(chosen.current_period_end * 1000).toISOString() : null;
    const startedAt = chosen.start_date         ? new Date(chosen.start_date * 1000).toISOString()         : null;

    const effectiveTier = (stripeStatus === "canceled" || stripeStatus === "incomplete_expired")
      ? "standard"
      : "professional";

    const update: Record<string, unknown> = {
      subscription_tier:       effectiveTier,
      subscription_status:     ourStatus,
      subscription_period_end: periodEnd,
      stripe_subscription_id:  chosen.id,
      stripe_price_id:         priceId,
      subscription_plan:       effectiveTier === "standard" ? null : planCode,
    };
    if (startedAt) update.subscription_started_at = startedAt;

    const { error: updErr } = await supabase
      .from("service_providers")
      .update(update)
      .eq("id", providerId);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({
      status:       "synced",
      tier:         effectiveTier,
      plan:         planCode,
      sub_status:   ourStatus,
      period_end:   periodEnd,
      stripe_status: stripeStatus,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-subscription-status error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
