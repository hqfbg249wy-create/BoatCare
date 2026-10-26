// =====================================================================
// analyze-equipment-photo — Extrahiert Stammdaten eines Ausrüstungs-
// gegenstands aus bis zu 5 Fotos (Typenschild, Gerät, Verpackung, Label).
// Dient dem Erfassungs-Flow: Nutzer fotografiert einen Ausrüstungs-
// gegenstand, die KI schlägt Name, Hersteller, Modell, Seriennummer,
// Teilenummer, Beschreibung und Kategorie vor. Der Nutzer prüft die
// Vorschläge und übernimmt sie feldweise (kein Auto-Overwrite).
//
// Input:
//   POST /functions/v1/analyze-equipment-photo
//   { images: [{ image_base64: "<base64, ohne data:-Präfix>",
//                media_type: "image/jpeg" | "image/png" | "image/webp" }],
//     lang: "de" | "en" | "fr" | "es" | "it" | "nl",
//     userLocale?: "de-DE" }
//   (Abwärtskompatibel: { image_base64, media_type } als Einzelbild.)
//
// Output:
//   { fields: { name, manufacturer, model, serial_number, part_number,
//               item_description, category },
//     confidence: "high" | "medium" | "low",
//     note: "kurzer Hinweis in Landessprache" }
//
// Nur ECHTE, in den Bildern klar lesbare Werte werden zurückgegeben —
// nichts erfunden. Nicht erkennbare Felder bleiben leer.
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";
import { checkFeature, gateBody } from "../_shared/featureGate.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Sonnet für bessere Bild-Erkennung (Bauart/Typ/Marke/Größe). Modell-ID gegen
// die Anthropic-API verifiziert (liefert 200) am 2026-10-16.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1000;
const MAX_IMAGES = 5;

const SUPPORTED_LANGS = ["de", "en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAMES: Record<Lang, string> = {
  de: "German", en: "English", es: "Spanish",
  fr: "French", it: "Italian", nl: "Dutch",
};

// Fallback, falls die DB-Tabelle equipment_categories (Migration 192) noch
// nicht erreichbar ist. Zur Laufzeit werden die gueltigen Kategorien bevorzugt
// aus der DB geladen (serverseitige Quelle, ohne Deploy aenderbar).
const FALLBACK_CATEGORIES = [
  "engine", "electrical", "electrical_12v", "electrical_230v",
  "navigation", "safety", "communication",
  "rigging", "sails", "rope", "hull", "deck", "anchor",
  "hvac", "plumbing", "galley", "paint", "other",
];

async function loadValidCategories(): Promise<string[]> {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data, error } = await sb
      .from("equipment_categories").select("key").eq("active", true);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_CATEGORIES;
    return data.map((r: { key: string }) => r.key);
  } catch {
    return FALLBACK_CATEGORIES;
  }
}

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Server-Konfiguration fehlt" }, 500);

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
    if (!userId) return json({ error: "Nicht authentifiziert" }, 401);

    const body = await req.json().catch(() => ({}));
    const { images, image_base64, media_type, lang, userLocale } = body ?? {};

    // Bilder normalisieren: neues Array-Format ODER Einzelbild (abwärtskompatibel)
    const rawImages: Array<{ image_base64?: unknown; media_type?: unknown }> =
      Array.isArray(images) && images.length > 0
        ? images
        : (typeof image_base64 === "string" ? [{ image_base64, media_type }] : []);

    const imageBlocks = rawImages
      .slice(0, MAX_IMAGES)
      .map((im) => {
        const data = typeof im?.image_base64 === "string" ? im.image_base64 : "";
        if (data.length < 100) return null;
        const mt = ALLOWED_MEDIA.includes(String(im?.media_type)) ? String(im.media_type) : "image/jpeg";
        return { type: "image" as const, source: { type: "base64" as const, media_type: mt, data } };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    if (imageBlocks.length === 0) {
      return json({ error: "Kein gültiges Bild übergeben" }, 400);
    }

    const userLang: Lang = (typeof lang === "string" && SUPPORTED_LANGS.includes(lang)) ? lang : "de";
    // Soft-coded: echte Gerätesprache (userLocale) bestimmt die KI-Antwortsprache.
    let langName: string = LANG_NAMES[userLang];
    {
      const _tag = (typeof userLocale === "string" && userLocale.trim()) ? userLocale.trim() : userLang;
      const _prim = _tag.split(/[-_]/)[0].toLowerCase();
      try {
        const _dn = new Intl.DisplayNames(["en"], { type: "language" }).of(_prim);
        if (_dn && _dn.toLowerCase() !== _prim) langName = _dn;
      } catch (_e) { /* Whitelist-Name bleibt gültig */ }
    }

    // Gueltige Kategorien aus der DB (Fallback: fest eingebaut)
    const VALID_CATEGORIES = await loadValidCategories();

    // Paywall: Ausruestung per Foto erfassen ist ab Basic verfuegbar.
    const access = await checkFeature(userId, "equipment_photo", userLang);
    if (!access.allowed) return json({ ...gateBody(access), quota_exhausted: true }, 402);

    // ── AI-Quota-Check vor dem teuren API-Call
    const quota = await checkAiQuota({ userId, providerId: null, feature: "photo_analysis" });
    if (!quota.allowed) {
      return json({
        error: quota.reason || "KI-Kontingent aufgebraucht",
        upgrade_hint: quota.upgradeHint,
        quota_exhausted: true,
      }, 402);
    }

    const prompt = `You are a marine-equipment expert cataloguing ONE piece of
boat equipment. The ${imageBlocks.length} image(s) all show the SAME item (e.g.
a block/pulley, winch, cleat, shackle, bilge pump, VHF radio, chartplotter,
seacock, stove, water pump, heater). They may show a rating/type plate, a label,
the bare device, or its packaging. Combine all images to identify this ONE item
as precisely as a chandlery catalogue would.

ACTIVELY IDENTIFY the item, do not just transcribe a plate:
- Determine the exact TYPE / construction (e.g. "ratchet block", "self-tailing
  winch", "folding padeye", "diaphragm bilge pump"), not just a generic word.
- Estimate the SIZE / dimension from visible proportions and reference features
  (sheave diameter in mm, rope/line capacity, winch size number, hose diameter,
  power rating). Give concrete numbers with "ca."/"approx." when estimated.
- Recognise the MANUFACTURER from the characteristic design, housing shape,
  colour scheme, logo or typical construction even when no name is printed
  (e.g. Harken, Lewmar, Ronstan, Selden, Garmin, Raymarine, Jabsco, Webasto).

Return ONLY a JSON object (no prose, no markdown fences) shaped exactly like:
{
  "name": "specific designation incl. type and size, in ${langName} (e.g. 'Fußblock 57 mm, Carbo-Serie')",
  "manufacturer": "brand / maker (read OR recognised by design)",
  "model": "model name / model number / product series",
  "serial_number": "serial number (S/N)",
  "part_number": "article / part number (P/N, Art.-Nr.)",
  "item_description": "1-2 sentences in ${langName}: type, estimated size/capacity, build and typical use",
  "category": "one of: ${VALID_CATEGORIES.join(", ")}",
  "confidence": "high" | "medium" | "low",
  "note": "1 short sentence in ${langName}: what is read vs. estimated/inferred"
}

RULES:
- serial_number and part_number: ONLY if ACTUALLY readable in an image, copied
  VERBATIM (original spelling, casing, hyphens). NEVER guess or invent these.
  If not visible, use "".
- manufacturer, model, name, item_description, category: you MAY infer these
  from the visible construction/design even without printed text, but be honest
  about certainty via "confidence" and say in "note" what was read vs. inferred
  (e.g. "Marke an der Bauart geschätzt"). Do not fabricate a model number that
  looks like a printed code; describe the series/type instead if unsure.
- Keep brand and model names in their original spelling; do not translate them.
- "category": pick the BEST match from the allowed list; "galley" = stove/oven/
  fridge/sink, "plumbing" = pumps/tanks/seacocks/hoses/heads, "hvac" = heating/
  AC/ventilation, "deck" = blocks/winches/cleats/hatches/fittings. For electrical
  items distinguish the voltage: "electrical_12v" = 12/24 V DC onboard system
  (batteries, DC panels, chargers, DC pumps/lights), "electrical_230v" = 110/230 V
  AC shore power / mains (shore inlet, AC panel, inverter, AC outlets, water
  heater on mains); use the generic "electrical" only if the voltage is unclear.
  If truly unclear use "other".
- "name" and "item_description" in ${langName}.
- If the images show no identifiable equipment at all, set every field to "" and
  confidence "low".`;

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
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude-API ${resp.status}: ${errText.substring(0, 200)}`);
    }

    const data = await resp.json();
    const content: string = data?.content?.[0]?.text ?? "";
    const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("KI-Antwort ist kein gültiges JSON");
    }

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const cat = str(parsed.category);
    const fields = {
      name: str(parsed.name),
      manufacturer: str(parsed.manufacturer),
      model: str(parsed.model),
      serial_number: str(parsed.serial_number),
      part_number: str(parsed.part_number),
      item_description: str(parsed.item_description),
      category: VALID_CATEGORIES.includes(cat) ? cat : "other",
    };
    const confidence = ["high", "medium", "low"].includes(str(parsed.confidence))
      ? str(parsed.confidence) : "low";

    // ── Quota verbuchen (nicht-blockierend)
    const usedTokens =
      (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
    recordAiUsage({
      platform: req.headers.get("x-skipily-platform"),
      userId, providerId: null, feature: "photo_analysis",
      source: quota.source!, costTokens: usedTokens,
      metadata: { model: MODEL, lang: userLang, images: imageBlocks.length },
      model: MODEL,
      inputTokens:  data?.usage?.input_tokens ?? 0,
      outputTokens: data?.usage?.output_tokens ?? 0,
    }).catch(() => null);

    return json({ fields, confidence, note: str(parsed.note) });
  } catch (err) {
    console.error("analyze-equipment-photo error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
