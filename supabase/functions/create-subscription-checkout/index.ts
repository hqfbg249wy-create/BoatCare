// Edge Function: create-subscription-checkout
//
// Erstellt eine Stripe-Checkout-Session für das Professional-Abo eines
// ServiceProviders und liefert die Redirect-URL zurück. Der Provider-Portal
// schickt einen authentifizierten POST mit dem provider_id; wir verifizieren,
// dass der eingeloggte User zu diesem Provider gehört.
//
// ENV-Variablen (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY              → bestehender Stripe-Key
//   STRIPE_PROFESSIONAL_PRICE_ID   → ID des Stripe-Price für das Professional-Abo
//   STRIPE_SUBSCRIPTION_RETURN_URL → z.B. https://provider.skipily.app/profile
//
// Aufruf (vom Provider-Portal):
//   POST /functions/v1/create-subscription-checkout
//   { provider_id: "<uuid>" }
//   Authorization: Bearer <user access_token>

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl       = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const defaultPriceId    = Deno.env.get("STRIPE_PROFESSIONAL_PRICE_ID") ?? "";

/**
 * Liefert eine valide Return-URL. Wenn STRIPE_SUBSCRIPTION_RETURN_URL leer,
 * unsauber (z.B. ohne https://) oder ein App-Scheme ist, fallen wir auf die
 * Default-Web-URL zurück. Apple-Pay-Redirects scheitern an custom Schemes mit
 * "Safari kann die Seite nicht öffnen".
 */
function sanitizedReturnUrl(): string {
  const raw  = (Deno.env.get("STRIPE_SUBSCRIPTION_RETURN_URL") ?? "").trim();
  const fallback = "https://provider.skipily.app/profile";
  if (!raw) return fallback;
  if (!raw.startsWith("https://") && !raw.startsWith("http://")) {
    console.warn("STRIPE_SUBSCRIPTION_RETURN_URL ist kein http(s)-URL, falle zurück:", raw);
    return fallback;
  }
  return raw;
}

// Whitelist erlaubter Stripe-Price-IDs. Wird sowohl als Sicherheits-Gate
// (kein beliebiger Client darf zufällige Preise nutzen) als auch als
// Fallback verwendet, falls kein env-Default gesetzt ist.
const ALLOWED_PRICE_IDS: string[] = [
  "price_1TWIBKAKSxHR03mTLBHJkIvb", // Pro Monatlich
  "price_1TWI7bAKSxHR03mTLIBshinq", // Pro Jährlich
  "price_1TWIDLAKSxHR03mT7o48URgq", // Enterprise Monatlich
  "price_1TWIE6AKSxHR03mT2gFOvwdw", // Enterprise Jährlich
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const providerId = body.provider_id;
    if (!providerId) {
      return new Response(JSON.stringify({ error: "provider_id fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // price_id aus Request bevorzugen, sonst env-Default. Muss in der Whitelist sein.
    const requestedPriceId: string = (body.price_id || defaultPriceId || "").trim();
    if (!requestedPriceId) {
      return new Response(JSON.stringify({ error: "price_id fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!ALLOWED_PRICE_IDS.includes(requestedPriceId)) {
      return new Response(JSON.stringify({ error: "Unbekannte price_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Service-Role-Client für DB-Zugriff
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // User aus dem JWT extrahieren
    const { data: { user }, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "User-Verifizierung fehlgeschlagen" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Provider laden und prüfen, dass der eingeloggte User zugriffsberechtigt ist
    const { data: provider, error: provErr } = await supabase
      .from("service_providers")
      .select("id, name, email, user_id, stripe_customer_id, subscription_tier, subscription_status")
      .eq("id", providerId)
      .single();

    if (provErr || !provider) {
      console.error("Provider lookup failed:", provErr?.message, "id=", providerId);
      return new Response(JSON.stringify({ error: "Provider nicht gefunden: " + (provErr?.message || "kein Datensatz") }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Berechtigungs-Check: nur der zugeordnete User darf Checkout starten
    if (provider.user_id && provider.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung für diesen Provider" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Stripe-Customer anlegen falls noch nicht vorhanden
    let customerId = provider.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: provider.email || user.email || undefined,
        name:  provider.name || undefined,
        metadata: { provider_id: provider.id, supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("service_providers")
        .update({ stripe_customer_id: customerId })
        .eq("id", provider.id);
    }

    // Checkout Session — URLs werden sauber zusammengebaut, damit Apple Pay
    // im Erfolgsfall sauber zurück redirecten kann (sonst "Safari kann die
    // Seite nicht öffnen, da die Adresse ungültig ist" — passiert bei
    // custom-Schemes oder fehlerhaftem STRIPE_SUBSCRIPTION_RETURN_URL).
    const returnUrl = sanitizedReturnUrl();
    const successUrl = `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}subscription=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}subscription=cancelled`;
    console.log("checkout-session URLs:", { successUrl, cancelUrl });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: requestedPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { provider_id: provider.id },
      },
      metadata: { provider_id: provider.id },
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-subscription-checkout error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
