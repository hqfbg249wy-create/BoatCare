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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
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

    const body = await req.json().catch(() => ({}));
    const { boat, existing_equipment, lang } = body ?? {};

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

    const userPrompt = `You are an experienced marine technician advising a boat owner.

Boat: ${boatLine || "(no details given)"}

Equipment the owner has already documented:
${existingLines}

Suggest 6-10 additional items the owner SHOULD typically maintain or
inspect on this kind of boat but has NOT yet listed. Focus on
maintenance-relevant gear: filters, impellers, anodes, batteries, ropes,
EPIRBs, fire extinguishers, life raft, gas detector, bilge pump, …

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

    return json({ suggestions });
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
