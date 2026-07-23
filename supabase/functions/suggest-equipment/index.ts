// =====================================================================
// suggest-equipment — Schlägt typischerweise wartungsbedürftige
// Ausrüstungsgegenstände vor, die für ein bestimmtes Boot fehlen.
//
// Input:
//   POST /functions/v1/suggest-equipment
//   {
//     boat: { type: "Segelyacht", manufacturer: "...", model: "...",
//             year: 2013, length: 12.6, engine: "Yanmar 3JH5E" },
//     existing_equipment: [{ name: "Yanmar Service Kit", category: "engine" }, ...],
//     lang: "de" | "en" | "fr" | "es" | "it" | "nl"
//   }
//
// Output:
//   {
//     suggestions: [
//       {
//         name: "Impeller (Kühlwasserpumpe)",
//         category: "engine",
//         manufacturer_hint: "Jabsco / Johnson Pump",
//         why: "Sollte alle 1-2 Jahre gewechselt werden, sonst Motor-Überhitzungsrisiko",
//         maintenance_cycle_years: 2
//       },
//       ...
//     ]
//   }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

const SUPPORTED_LANGS = ["de", "en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAMES: Record<Lang, string> = {
  de: "German", en: "English", es: "Spanish",
  fr: "French", it: "Italian", nl: "Dutch",
};

const VALID_CATEGORIES = [
  "navigation", "safety", "engine", "electrical", "rigging",
  "sails", "anchor", "communication", "hvac", "paint", "rope", "other",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "Server-Konfiguration fehlt" }, 500);
    }

    // ── Auth (für Quota-Tracking)
    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await sb.auth.getUser();
      userId = data.user?.id ?? null;
    }
    if (!userId) {
      return json({ error: "Nicht authentifiziert" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { boat, existing_equipment, lang, providerId, focus } = body ?? {};
    // focus (optional): ein konkretes Gerät, dessen typische Ersatz-/
    // Verschleißteile vorgeschlagen werden sollen (z.B. Motor "Yanmar 3JH5E"
    // → Impeller, Seewasserpumpe, Ölfilter, Dieselvorfilter …).
    const focusItem = (focus && typeof focus === "object") ? focus as {
      name?: string; category?: string; manufacturer?: string; model?: string;
    } : null;

    // ── AI-Quota-Check vor dem teuren API-Call
    const quota = await checkAiQuota({
      userId,
      providerId: providerId || null,
      feature:    "suggest_equipment",
    });
    if (!quota.allowed) {
      return json({
        error:        quota.reason || "KI-Kontingent aufgebraucht",
        upgrade_hint: quota.upgradeHint,
        quota_exhausted: true,
      }, 402);
    }

    const userLang: Lang = (typeof lang === "string" && SUPPORTED_LANGS.includes(lang)) ? lang : "de";
    const langName = LANG_NAMES[userLang];

    if (!boat || typeof boat !== "object") {
      return json({ error: "boat ist Pflicht" }, 400);
    }

    const existing = Array.isArray(existing_equipment) ? existing_equipment : [];

    const boatLine = [
      boat.type ? `Type: ${boat.type}` : null,
      boat.manufacturer ? `Manufacturer: ${boat.manufacturer}` : null,
      boat.model ? `Model: ${boat.model}` : null,
      boat.year ? `Year: ${boat.year}` : null,
      boat.length ? `Length: ${boat.length}m` : null,
      boat.engine ? `Engine: ${boat.engine}` : null,
    ].filter(Boolean).join(", ");

    const existingLines = existing.length > 0
      ? existing.map((e: { name?: string; category?: string }) =>
          `- ${e.name ?? "?"} (${e.category ?? "?"})`).join("\n")
      : "(none)";

    // Fokus-Zeile für den Spare-Parts-Modus.
    const focusLine = focusItem
      ? [
          focusItem.name ? `Name: ${focusItem.name}` : null,
          focusItem.category ? `Category: ${focusItem.category}` : null,
          focusItem.manufacturer ? `Manufacturer: ${focusItem.manufacturer}` : null,
          focusItem.model ? `Model: ${focusItem.model}` : null,
        ].filter(Boolean).join(", ")
      : "";

    const taskBlock = focusItem
      ? `The owner has this SPECIFIC piece of equipment installed:
  ${focusLine || "(no details given)"}

List the typical WEAR PARTS, CONSUMABLES and SPARE PARTS that genuinely fit
THIS EXACT unit and that an owner should keep on board or replace
periodically. Example — for a Yanmar 3JH5E engine: impeller / raw-water
pump, engine oil filter, fuel pre-filter, fuel filter, zinc anodes, V-belt,
thermostat, coolant.

CREDIBILITY RULES (very important — the app's trust depends on this):
- Only list parts that REALLY apply to this exact manufacturer/model. If you
  are not certain the model exists or its exact parts, list only the GENERIC
  part TYPES that are standard for such a unit.
- NEVER invent specific part numbers or fake product names.
- Do NOT include the unit itself — only its serviceable parts/consumables.
- Skip parts that are already in the owner's existing list.
- Return 5-10 items.`
      : `Suggest 6-10 additional items the owner SHOULD typically maintain or
inspect on this kind of boat but has NOT yet listed. Focus on
maintenance-relevant gear: filters, impellers, anodes, batteries, ropes,
EPIRBs, fire extinguishers, life raft, gas detector, bilge pump, …`;

    const userPrompt = `You are an experienced marine technician advising a boat owner.

Boat: ${boatLine || "(no details given)"}

Equipment the owner has already documented:
${existingLines}

${taskBlock}

For each suggestion return JSON like:
  {
    "name": "Short name in ${langName}",
    "category": "one of: ${VALID_CATEGORIES.join(", ")}",
    "manufacturer_hint": "Common brand examples (or empty string)",
    "why": "1-sentence reason why it matters, in ${langName}",
    "maintenance_cycle_years": 1 | 2 | 5 | null
  }

Category mapping rules (use the MOST SPECIFIC match, only fall back to
"other" if truly nothing else fits):
- engine        — motor, impeller, fuel filter, oil filter, alternator, fuel hose, anodes (Zinkanoden)
- safety        — life raft, EPIRB, life jacket, fire extinguisher, flares, gas detector, MOB
- electrical    — battery, charger, inverter, solar panel, switch panel, navigation lights
- navigation    — chartplotter, compass, log, depth sounder, AIS, autopilot
- communication — VHF, satphone, antenna, radar
- rigging       — shrouds, stays, terminals, blocks, halyards-as-hardware
- sails         — mainsail, jib, gennaker, code 0, storm sails, sail covers
- anchor        — anchor, chain, windlass, anchor rope
- hvac          — heater, fan, AC, fridge
- paint         — antifouling, gelcoat, primer, varnish
- rope          — sheets, halyards, dock lines, mooring
- other         — only when nothing else fits

Return ONLY a valid JSON array (no prose, no markdown fences).
Skip items that look like they ARE in the existing list (avoid duplicates).
Stay realistic for the boat type.`;

    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude-API ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const content: string = data?.content?.[0]?.text ?? "";
    const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();

    let parsed: Array<Record<string, unknown>>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Claude-Antwort ist kein gültiges JSON");
    }

    const suggestions = parsed
      .map((p) => ({
        name: typeof p.name === "string" ? p.name.trim() : "",
        category: VALID_CATEGORIES.includes(String(p.category)) ? String(p.category) : "other",
        manufacturer_hint: typeof p.manufacturer_hint === "string" ? p.manufacturer_hint.trim() : "",
        why: typeof p.why === "string" ? p.why.trim() : "",
        maintenance_cycle_years: typeof p.maintenance_cycle_years === "number" ? p.maintenance_cycle_years : null,
      }))
      .filter((s) => s.name.length > 0);

    // ── Quota verbuchen (nicht-blockierend)
    const usedTokens =
      (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
    recordAiUsage({
      userId,
      providerId: providerId || null,
      feature:    "suggest_equipment",
      source:     quota.source!,
      costTokens: usedTokens,
      metadata:   { model: MODEL, lang: userLang },
    }).catch(() => null);

    return json({
      suggestions,
      quota: { source: quota.source, remaining: (quota.remaining ?? Infinity) - 1, limit: quota.limit },
    });
  } catch (err) {
    console.error("suggest-equipment error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
