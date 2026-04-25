// =====================================================================
// translate-product — Übersetzt Produkt-Name + -Beschreibung in Zielsprache
// und cacht das Ergebnis in metashop_products.translations (JSONB).
//
// Strategie B aus dem i18n-Plan:
//   - Beim ersten Request für ein Produkt+Sprache wird Claude aufgerufen
//   - Antwort landet in translations->lang->{name,description}
//   - Nächster Request liefert direkt aus dem Cache
//
// Aufruf:
//   POST /functions/v1/translate-product
//   { product_ids: ["uuid1", "uuid2"], target_lang: "en" }
//
// Antwort:
//   { translations: { "uuid1": {name, description}, ... } }
//
// Authentifizierung: Bearer Token (User darf alle aktiven Produkte sehen,
// daher reicht anon-key + RLS-bypass via service-role nur für UPDATE).
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;

const SUPPORTED_LANGS = ["en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
};

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  translations: Record<string, { name?: string; description?: string }> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceKey) {
      return json({ error: "Server-Konfiguration fehlt" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { product_ids, target_lang } = body ?? {};

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return json({ error: "product_ids[] ist Pflicht" }, 400);
    }
    if (product_ids.length > 50) {
      return json({ error: "Max. 50 Produkte pro Request" }, 400);
    }
    if (!target_lang || !SUPPORTED_LANGS.includes(target_lang)) {
      return json({
        error: `target_lang muss ∈ {${SUPPORTED_LANGS.join(", ")}}`,
      }, 400);
    }

    const lang = target_lang as Lang;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Produkte laden
    const { data: products, error: loadErr } = await admin
      .from("metashop_products")
      .select("id, name, description, translations")
      .in("id", product_ids);

    if (loadErr) {
      return json({ error: "Produkte laden: " + loadErr.message }, 500);
    }

    const result: Record<string, { name: string; description: string | null }> =
      {};
    const toTranslate: ProductRow[] = [];

    // Cache-Hits sammeln, Misses für Translation merken
    for (const p of (products ?? []) as ProductRow[]) {
      const cached = p.translations?.[lang];
      if (cached?.name) {
        result[p.id] = {
          name: cached.name,
          description: cached.description ?? p.description,
        };
      } else {
        toTranslate.push(p);
      }
    }

    // Misses übersetzen (in einem einzigen Claude-Call → batch-fähig)
    if (toTranslate.length > 0) {
      const translated = await translateBatch(toTranslate, lang, apiKey);

      // Result befüllen + DB-Update parallel
      const updates = await Promise.allSettled(
        toTranslate.map(async (p) => {
          const t = translated[p.id];
          if (!t) return;
          result[p.id] = { name: t.name, description: t.description };

          const newTranslations = {
            ...(p.translations ?? {}),
            [lang]: { name: t.name, description: t.description },
          };
          await admin
            .from("metashop_products")
            .update({ translations: newTranslations })
            .eq("id", p.id);
        }),
      );

      const failed = updates.filter((u) => u.status === "rejected").length;
      if (failed > 0) console.error(`translate-product: ${failed} DB-Updates fehlgeschlagen`);
    }

    return json({
      translations: result,
      stats: {
        requested: product_ids.length,
        cached: product_ids.length - toTranslate.length,
        newly_translated: toTranslate.length,
      },
    });
  } catch (err) {
    console.error("translate-product error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

// ---------- Claude Translation ----------

async function translateBatch(
  rows: ProductRow[],
  lang: Lang,
  apiKey: string,
): Promise<Record<string, { name: string; description: string | null }>> {
  const langName = LANG_NAMES[lang];

  // Eingabe als nummerierte Liste, damit Claude die IDs sauber zuordnen kann
  const items = rows.map((r, i) => ({
    idx: i + 1,
    id: r.id,
    name: r.name,
    description: r.description ?? "",
  }));

  const userPrompt = `Translate the following German marine product entries to ${langName}.
Return ONLY a valid JSON array (no prose, no markdown fences) where each
element matches: { "idx": number, "name": "...", "description": "..." }.
Keep the same idx as input. Description may be empty string. Stay concise,
use proper marine terminology, and preserve units (mm, kg, V, A) verbatim.

Input:
${JSON.stringify(items, null, 2)}`;

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

  // Robustes JSON-Parsing: Markdown-Fences entfernen, falls Claude doch welche schickt
  const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
  let parsed: Array<{ idx: number; name: string; description: string }>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude-Antwort ist kein gültiges JSON");
  }

  const out: Record<string, { name: string; description: string | null }> = {};
  for (const entry of parsed) {
    const orig = items.find((i) => i.idx === entry.idx);
    if (!orig) continue;
    out[orig.id] = {
      name: entry.name?.trim() || orig.name,
      description: entry.description?.trim() || null,
    };
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
