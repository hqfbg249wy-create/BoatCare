// =====================================================================
// analyze-provider-photo — Extrahiert Stammdaten eines Service-Betriebs
// aus einem Foto (Schild, Ladenfront, Visitenkarte, Fahrzeugbeschriftung).
// Dient dem "+"-Flow auf der Karte: Nutzer fotografiert einen Betrieb, die
// KI füllt das Vorschlags-Formular vor, der Nutzer prüft und sendet ab.
//
// Input:
//   POST /functions/v1/analyze-provider-photo
//   { image_base64: "<base64, ohne data:-Präfix>",
//     media_type: "image/jpeg" | "image/png" | "image/webp",
//     lang: "de" | "en" | "fr" | "es" | "it" | "nl" }
//
// Output:
//   { fields: { name, category, street, postal_code, city, country,
//               phone, email, website, description },
//     confidence: "high" | "medium" | "low",
//     note: "kurzer Hinweis in Landessprache" }
//
// Nur ECHTE, im Bild klar lesbare Werte werden zurückgegeben — nichts
// erfunden. Nicht erkennbare Felder bleiben leer.
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

const SUPPORTED_LANGS = ["de", "en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAMES: Record<Lang, string> = {
  de: "German", en: "English", es: "Spanish",
  fr: "French", it: "Italian", nl: "Dutch",
};

// dbKeys aus ServiceCategory (Swift) — muss synchron bleiben.
const VALID_CATEGORIES = [
  "repair", "boatbuilder", "supplies", "sailmaker", "rigging",
  "instruments", "heating", "crane", "painting", "surveyor", "diver", "other",
];

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
    const { image_base64, media_type, lang, userLocale } = body ?? {};

    if (typeof image_base64 !== "string" || image_base64.length < 100) {
      return json({ error: "image_base64 fehlt" }, 400);
    }
    const mediaType = ALLOWED_MEDIA.includes(String(media_type)) ? String(media_type) : "image/jpeg";
    const userLang: Lang = (typeof lang === "string" && SUPPORTED_LANGS.includes(lang)) ? lang : "de";
    // Soft-coded: echte Gerätesprache (userLocale) bestimmt die KI-Antwort­sprache
    // — keine harte 6-Sprachen-Whitelist mehr; Claude beherrscht ~alle Sprachen.
    let langName: string = LANG_NAMES[userLang];
    {
      const _tag = (typeof userLocale === "string" && userLocale.trim()) ? userLocale.trim() : userLang;
      const _prim = _tag.split(/[-_]/)[0].toLowerCase();
      try {
        const _dn = new Intl.DisplayNames(["en"], { type: "language" }).of(_prim);
        if (_dn && _dn.toLowerCase() !== _prim) langName = _dn;
      } catch (_e) { /* Whitelist-Name bleibt gültig */ }
    }

    // ── AI-Quota-Check vor dem teuren API-Call
    const quota = await checkAiQuota({ userId, providerId: null, feature: "photo_analysis" });
    if (!quota.allowed) {
      return json({
        error: quota.reason || "KI-Kontingent aufgebraucht",
        upgrade_hint: quota.upgradeHint,
        quota_exhausted: true,
      }, 402);
    }

    const prompt = `You are helping catalog marine/boat service businesses.
Look at this photo (a shop front, sign, business card, vehicle lettering,
flyer, or similar) and extract the REAL, clearly visible business details.

Return ONLY a JSON object (no prose, no markdown fences) shaped exactly like:
{
  "name": "",
  "category": "one of: ${VALID_CATEGORIES.join(", ")}",
  "street": "street + number",
  "postal_code": "",
  "city": "",
  "country": "country name in ${langName}",
  "phone": "",
  "email": "",
  "website": "",
  "description": "1 short sentence in ${langName} about the services, only if visible",
  "confidence": "high" | "medium" | "low",
  "note": "1 short sentence in ${langName}: what you could/couldn't read"
}

STRICT RULES (credibility matters):
- Only fill a field if it is ACTUALLY readable in the image. If something is
  not visible, use an empty string "". NEVER guess or invent addresses,
  phone numbers, emails or websites.
- "category": pick the BEST match from the allowed list based on what the
  business clearly does; if unclear use "other".
- Do not translate the business name, phone, email or website — copy them
  verbatim as printed.
- If the image is not a business at all, set every field to "" and
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
            { type: "image", source: { type: "base64", media_type: mediaType, data: image_base64 } },
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
      category: VALID_CATEGORIES.includes(cat) ? cat : "other",
      street: str(parsed.street),
      postal_code: str(parsed.postal_code),
      city: str(parsed.city),
      country: str(parsed.country),
      phone: str(parsed.phone),
      email: str(parsed.email),
      website: str(parsed.website),
      description: str(parsed.description),
    };
    const confidence = ["high", "medium", "low"].includes(str(parsed.confidence))
      ? str(parsed.confidence) : "low";

    // ── Quota verbuchen (nicht-blockierend)
    const usedTokens =
      (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
    recordAiUsage({
      userId, providerId: null, feature: "photo_analysis",
      source: quota.source!, costTokens: usedTokens,
      metadata: { model: MODEL, lang: userLang },
    }).catch(() => null);

    return json({ fields, confidence, note: str(parsed.note) });
  } catch (err) {
    console.error("analyze-provider-photo error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
