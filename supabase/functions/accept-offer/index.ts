// Edge Function: accept-offer
//
// Der Kunde nimmt das Angebot eines Anbieters (auf eine Anfrage) an. Daraus wird
// eine Bestellung im DEFERRED-Zahlungsflow erzeugt (Karte hinterlegen -> Abbuchung
// bei Versandbestaetigung -> Connect-Transfer an Anbieter + Skipily-Provision).
// Damit laeuft die tatsaechliche Zahlung ueber Stripe.
//
// Body: { inquiry_id }
// Auth: Bearer <user-jwt> des Kaeufers (Eigner der Anfrage).
// Antwort: { ok, order_id, boat_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
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

    const { inquiry_id } = await req.json();
    if (!inquiry_id) return json({ error: "inquiry_id fehlt" }, 400);

    const { data: inq } = await svc
      .from("service_inquiries")
      .select("id, owner_id, provider_id, boat_id, subject, offer_amount, offer_shipping, offer_currency, offer_description, offer_status, order_id")
      .eq("id", inquiry_id).maybeSingle();
    if (!inq) return json({ error: "Anfrage nicht gefunden" }, 404);
    if (inq.owner_id !== user.id) return json({ error: "Keine Berechtigung" }, 403);
    if (inq.order_id) return json({ ok: true, order_id: inq.order_id, boat_id: inq.boat_id, note: "bereits angenommen" });
    if (inq.offer_status !== "offered" || !(Number(inq.offer_amount) > 0)) {
      return json({ error: "Kein annehmbares Angebot vorhanden", code: "no_offer" }, 409);
    }

    // Provision + Betraege
    const { data: provider } = await svc
      .from("service_providers").select("commission_rate").eq("id", inq.provider_id).maybeSingle();
    const rate = Number(provider?.commission_rate ?? 10);
    const subtotal = Number(inq.offer_amount);
    const shipping = Number(inq.offer_shipping || 0);
    const total = subtotal + shipping;
    const commission = Math.round(subtotal * (rate / 100) * 100) / 100;
    const currency = (inq.offer_currency || "EUR").toUpperCase();

    // Lieferadresse aus dem Kaeufer-Profil.
    const { data: buyer } = await svc
      .from("profiles")
      .select("full_name, shipping_street, shipping_postal_code, shipping_city, shipping_country")
      .eq("id", user.id).maybeSingle();

    // Bestellung im Deferred-Flow anlegen.
    const { data: order, error: oErr } = await svc.from("orders").insert({
      buyer_id: user.id,
      provider_id: inq.provider_id,
      boat_id: inq.boat_id,
      status: "pending",
      payment_status: "pending",
      payment_flow: "deferred",
      subtotal,
      shipping_cost: shipping,
      commission_rate: rate,
      commission_amount: commission,
      total,
      currency,
      shipping_name: buyer?.full_name ?? "",
      shipping_street: buyer?.shipping_street ?? "",
      shipping_city: buyer?.shipping_city ?? "",
      shipping_postal_code: buyer?.shipping_postal_code ?? "",
      shipping_country: buyer?.shipping_country ?? "",
      buyer_note: inq.subject ?? null,
    }).select("id").single();
    if (oErr || !order) return json({ error: "Bestellung konnte nicht angelegt werden: " + (oErr?.message ?? "") }, 500);

    // Position aus dem Angebot.
    await svc.from("order_items").insert({
      order_id: order.id,
      quantity: 1,
      unit_price: subtotal,
      total: subtotal,
      product_name: (inq.offer_description || "Angebot").slice(0, 300),
    });

    // Anfrage verknuepfen.
    await svc.from("service_inquiries").update({
      offer_status: "ordered",
      order_id: order.id,
    }).eq("id", inquiry_id);

    return json({ ok: true, order_id: order.id, boat_id: inq.boat_id });
  } catch (err) {
    console.error("accept-offer FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
