// Edge Function: create-billing-portal
//
// Erstellt eine Stripe-Billing-Portal-Session, damit der Provider sein laufendes
// Abo selbst verwalten (kündigen, Zahlungsmethode ändern) kann.
//
// ENV-Variablen:
//   STRIPE_SECRET_KEY
//   STRIPE_BILLING_PORTAL_RETURN_URL  (default: https://provider.skipily.app/profile)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const returnUrl          = Deno.env.get("STRIPE_BILLING_PORTAL_RETURN_URL")
                           ?? "https://provider.skipily.app/profile";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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

    const { provider_id } = await req.json();
    if (!provider_id) {
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
      .select("id, user_id, owner_user_id, stripe_customer_id")
      .eq("id", provider_id)
      .single();

    if (provErr || !provider) {
      return new Response(JSON.stringify({ error: "Provider nicht gefunden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const allowed = [provider.user_id, provider.owner_user_id].filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(user.id)) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!provider.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "Kein Stripe-Kunde — bitte zuerst Abo abschließen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   provider.stripe_customer_id,
      return_url: returnUrl,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-billing-portal error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
