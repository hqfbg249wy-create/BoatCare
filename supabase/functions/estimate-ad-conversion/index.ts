// =====================================================================
// estimate-ad-conversion — unverbindliche KI-Schätzung der voraussichtlichen
// Reichweite/Conversions einer News-Anzeige beim gewählten Tagesbudget.
// Rein informativ (Entscheidungshilfe beim Buchen), KEINE Abrechnungsgrundlage.
//
// Input:  { daily_budget_cents, days, category? }
// Output: { reach_per_day, conversions_per_day, note }
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Proportionale Schätzung: die Wirkung wächst direkt mit dem Tagesbudget.
// Rein informativ, KEINE Abrechnungsgrundlage. Bewusst deterministisch, damit
// ein höheres Budget IMMER proportional mehr Reichweite/Conversions zeigt.
const IMPRESSIONS_PER_EURO = 60;   // Impressionen je €/Tag
const CONVERSION_RATE      = 0.02; // 2 % der Impressionen

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await userClient.auth.getUser();
    if (!ud.user?.id) return json({ error: "Nicht authentifiziert" }, 401);

    const b = await req.json().catch(() => ({}));
    const daily = Math.max(1000, parseInt(String(b.daily_budget_cents ?? 1000), 10) || 1000);
    const euroPerDay = daily / 100;

    const reach = Math.round(euroPerDay * IMPRESSIONS_PER_EURO);
    const conversions = Math.max(1, Math.round(reach * CONVERSION_RATE));

    return json({
      reach_per_day: reach,
      conversions_per_day: conversions,
      note: "Unverbindliche Schätzung: die Wirkung steigt proportional mit dem Tagesbudget.",
      estimated: true,
    });
  } catch (err) {
    console.error("estimate-ad-conversion error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
