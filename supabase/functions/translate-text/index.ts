// =====================================================================
// translate-text — Generischer Textübersetzer für freie Strings
// (Reviews, Kommentare, Beschreibungen, …) in eine Zielsprache.
//
// Im Gegensatz zu translate-product / translate-provider gibt es hier
// keinen DB-Cache — der Aufrufer (Client) ist für etwaiges Caching
// zuständig. Eingabe-Strings können in beliebiger Quellsprache sein,
// Claude erkennt sie automatisch.
//
// Aufruf:
//   POST /functions/v1/translate-text
//   { texts: [{id: "uuid1", text: "..."}, ...], target_lang: "en" }
//
// Antwort:
//   { translations: { "uuid1": "Translated text", ... } }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

const SUPPORTED_LANGS = ["de", "en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAMES: Record<Lang, string> = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
};

interface TextItem {
  id: string;
  text: string;
}

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
    const { texts, target_lang } = body ?? {};

    if (!Array.isArray(texts) || texts.length === 0) {
      return json({ error: "texts[] ist Pflicht" }, 400);
    }
    if (texts.length > 50) {
      return json({ error: "Max. 50 Texte pro Request" }, 400);
    }
    if (!target_lang || !SUPPORTED_LANGS.includes(target_lang)) {
      return json({
        error: `target_lang muss ∈ {${SUPPORTED_LANGS.join(", ")}}`,
      }, 400);
    }

    const lang = target_lang as Lang;
    const items: TextItem[] = texts
      .filter((t: TextItem) => t?.id && typeof t?.text === "string" && t.text.trim().length > 0)
      .map((t: TextItem, i: number) => ({ id: t.id, text: t.text }));

    if (items.length === 0) {
      return json({ translations: {} });
    }

    const translations = await translateBatch(items, lang, apiKey);
    return json({ translations });
  } catch (err) {
    console.error("translate-text error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

// ---------- Claude Translation ----------

async function translateBatch(
  items: TextItem[],
  lang: Lang,
  apiKey: string,
): Promise<Record<string, string>> {
  const langName = LANG_NAMES[lang];

  const indexed = items.map((it, i) => ({ idx: i + 1, id: it.id, text: it.text }));

  const userPrompt = `Translate the following texts to ${langName}.
Detect each input's source language automatically and translate to ${langName}.
If a text is already in ${langName}, return it unchanged.
Return ONLY a valid JSON array (no prose, no markdown fences) where each
element matches: { "idx": number, "text": "translated content" }.
Keep the same idx as input. Preserve line breaks (\\n) and punctuation.

Input:
${JSON.stringify(indexed, null, 2)}`;

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
  let parsed: Array<{ idx: number; text: string }>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude-Antwort ist kein gültiges JSON");
  }

  const out: Record<string, string> = {};
  for (const entry of parsed) {
    const orig = indexed.find((i) => i.idx === entry.idx);
    if (!orig) continue;
    const translated = (entry.text ?? "").trim();
    if (translated) out[orig.id] = translated;
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
