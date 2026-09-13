// Edge Function: attach-order-payment
//
// Teil des deferred-payment-Flows. Nachdem der Kaeufer beim Bestellabschluss
// eine Zahlungsmethode via SetupIntent hinterlegt hat (KEINE Abbuchung),
// speichert diese Function die entstandene payment_method an den betroffenen
// Bestellungen. confirm-shipment nutzt sie spaeter fuer die off-session
// Abbuchung bei Versand.
//
// Body: { order_ids: string[], setup_intent_id: string }
// Auth: Bearer <user-jwt> des Kaeufers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const svc = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { order_ids, setup_intent_id } = await req.json();
    if (!Array.isArray(order_ids) || order_ids.length === 0 || !setup_intent_id) {
      return json({ error: "order_ids und setup_intent_id erforderlich" }, 400);
    }

    // SetupIntent laden -> payment_method ermitteln.
    const si = await stripe.setupIntents.retrieve(setup_intent_id);
    const paymentMethod = typeof si.payment_method === "string"
      ? si.payment_method
      : si.payment_method?.id;
    if (si.status !== "succeeded" || !paymentMethod) {
      return json({ error: "SetupIntent nicht abgeschlossen", code: "setup_incomplete" }, 409);
    }

    // Sicherheit: der SetupIntent-Customer muss dem Kaeufer gehoeren.
    const { data: profile } = await svc
      .from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    const siCustomer = typeof si.customer === "string" ? si.customer : si.customer?.id;
    if (!profile?.stripe_customer_id || siCustomer !== profile.stripe_customer_id) {
      return json({ error: "SetupIntent gehoert nicht zum Kaeufer" }, 403);
    }

    // Nur eigene, deferred-Bestellungen aktualisieren, die noch nicht bezahlt sind.
    const { data: updated, error: updErr } = await svc
      .from("orders")
      .update({ stripe_payment_method_id: paymentMethod, stripe_setup_intent_id: setup_intent_id })
      .in("id", order_ids)
      .eq("buyer_id", user.id)
      .eq("payment_flow", "deferred")
      .eq("payment_status", "pending")
      .select("id");

    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true, updated: (updated || []).length });
  } catch (err) {
    console.error("attach-order-payment FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
