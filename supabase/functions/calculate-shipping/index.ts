// calculate-shipping — Versandkosten-Engine
//
// Berechnet die Versandkosten eines Provider-Warenkorbs anhand der
// provider_shipping_rules (Freigrenze pro Zone + gewichtsbasierte Staffel).
// Fällt auf den höchsten Produkt-shipping_cost zurück, wenn die Engine
// für den Provider nicht aktiv ist.
//
// POST /calculate-shipping
//   { provider_id, country, subtotal,
//     items: [{ weight_kg?, quantity, shipping_cost? }] }
//
// Antwort: { shipping_cost, free, zone, currency, reason }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EU = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { provider_id, country, subtotal, items } = await req.json();
    if (!provider_id) return json({ error: "provider_id required" }, 400);

    const dest = String(country || "DE").toUpperCase();
    const sub = Number(subtotal) || 0;
    const list = Array.isArray(items) ? items : [];

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: rule } = await supabase
      .from("provider_shipping_rules")
      .select("*")
      .eq("provider_id", provider_id)
      .maybeSingle();

    // ── Fallback: Engine nicht aktiv → höchster Produkt-shipping_cost ──
    if (!rule || !rule.enabled) {
      const fallback = list.reduce((m, it) => Math.max(m, Number(it.shipping_cost) || 0), 0);
      return json({ shipping_cost: round2(fallback), free: fallback === 0, zone: "flat", reason: "Engine inaktiv — Produkt-Versand", currency: "EUR" });
    }

    // ── Zone bestimmen ──
    let zone: "domestic" | "eu" | "world";
    if (dest === String(rule.domestic_country).toUpperCase()) zone = "domestic";
    else if (EU.has(dest)) zone = "eu";
    else zone = "world";

    // ── Freigrenze prüfen ──
    if (zone === "domestic" && rule.free_threshold_domestic != null && sub >= Number(rule.free_threshold_domestic)) {
      return json({ shipping_cost: 0, free: true, zone, reason: `Frei ab ${rule.free_threshold_domestic} € (${zone})`, currency: "EUR" });
    }
    if (zone === "eu" && rule.free_threshold_eu != null && sub >= Number(rule.free_threshold_eu)) {
      return json({ shipping_cost: 0, free: true, zone, reason: `Frei ab ${rule.free_threshold_eu} € (${zone})`, currency: "EUR" });
    }

    // ── Gesamtgewicht ──
    const defW = Number(rule.default_item_weight) || 0.5;
    const totalWeight = list.reduce((sum, it) => {
      const w = (it.weight_kg != null && Number(it.weight_kg) > 0) ? Number(it.weight_kg) : defW;
      return sum + w * (Number(it.quantity) || 1);
    }, 0);

    // ── Tarif je Zone ──
    const base = Number(rule[`rate_${zone}_base`]) || 0;
    const perKg = Number(rule[`rate_${zone}_per_kg`]) || 0;
    let cost = base + perKg * totalWeight;
    if (rule.max_shipping != null) cost = Math.min(cost, Number(rule.max_shipping));

    return json({
      shipping_cost: round2(cost),
      free: false,
      zone,
      weight_kg: round2(totalWeight),
      reason: `${zone}: ${base} € + ${perKg} €/kg × ${round2(totalWeight)} kg`,
      currency: "EUR",
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

const round2 = (n: number) => Math.round(n * 100) / 100;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
