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

    const { inquiry_id, variant_id } = await req.json();
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

    const { data: provider } = await svc
      .from("service_providers").select("commission_rate").eq("id", inq.provider_id).maybeSingle();
    const rate = Number(provider?.commission_rate ?? 10);
    const currency = (inq.offer_currency || "EUR").toUpperCase();
    const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

    // Lieferadresse aus dem Kaeufer-Profil.
    const { data: buyer } = await svc
      .from("profiles")
      .select("full_name, shipping_street, shipping_postal_code, shipping_city, shipping_country")
      .eq("id", user.id).maybeSingle();

    // Betraege + Positionen bestimmen: Tauwerk-Variante ODER flaches Angebot.
    let subtotal = 0;
    let shipping = 0;
    const items: Array<Record<string, unknown>> = [];

    if (variant_id) {
      const { data: v } = await svc.from("inquiry_offer_variants")
        .select("id, inquiry_id, subtotal, discount_type, discount_value, discount_label, shipping_mode, shipping_cost")
        .eq("id", variant_id).maybeSingle();
      if (!v || v.inquiry_id !== inquiry_id) return json({ error: "Variante nicht gefunden" }, 404);
      const { data: vitems } = await svc.from("inquiry_offer_items")
        .select("label, qty, unit_price, line_total, product_id")
        .eq("variant_id", variant_id).order("sort_order");
      const goods = r2(v.subtotal);
      const dAmt = v.discount_type === "percent" ? r2(goods * Number(v.discount_value) / 100)
                 : v.discount_type === "amount" ? r2(v.discount_value) : 0;
      subtotal = Math.max(0, r2(goods - dAmt));
      if (v.shipping_mode === "engine") {
        try {
          const rs = await fetch(`${supabaseUrl}/functions/v1/calculate-shipping`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ provider_id: inq.provider_id, country: buyer?.shipping_country || "DE", subtotal, items: [{ quantity: 1 }] }),
          });
          const jr = await rs.json().catch(() => ({}));
          shipping = r2(jr?.shipping_cost);
        } catch { shipping = 0; }
      } else {
        shipping = r2(v.shipping_cost);
      }
      for (const it of (vitems || [])) {
        const qn = Number(it.qty) || 1;
        const up = Number(it.unit_price) || 0;
        const label = qn !== 1
          ? `${it.label} (${String(qn).replace(".", ",")} × ${up.toFixed(2).replace(".", ",")})`
          : String(it.label);
        items.push({ product_id: it.product_id ?? null, quantity: 1, unit_price: r2(it.line_total), total: r2(it.line_total), product_name: label.slice(0, 300) });
      }
      if (dAmt > 0) {
        items.push({ product_id: null, quantity: 1, unit_price: -dAmt, total: -dAmt, product_name: (v.discount_label || "Rabatt").slice(0, 300) });
      }
      await svc.from("service_inquiries").update({ offer_selected_variant_id: variant_id }).eq("id", inquiry_id);
    } else {
      subtotal = Number(inq.offer_amount);
      shipping = Number(inq.offer_shipping || 0);
      items.push({ product_id: null, quantity: 1, unit_price: subtotal, total: subtotal, product_name: (inq.offer_description || "Angebot").slice(0, 300) });
    }

    const total = r2(subtotal + shipping);
    const commission = r2(subtotal * (rate / 100));

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

    await svc.from("order_items").insert(items.map((it) => ({ ...it, order_id: order.id })));

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
