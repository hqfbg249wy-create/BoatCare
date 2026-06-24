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

// DeepL Free-API (api-free.deepl.com). Key als Supabase-Secret DEEPL_API_KEY.
const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";
const DEEPL_MAX_BATCH = 50; // max. Texte pro DeepL-Request

const SUPPORTED_LANGS = ["en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const DEEPL_TARGET: Record<Lang, string> = {
  en: "EN-GB",
  es: "ES",
  fr: "FR",
  it: "IT",
  nl: "NL",
};

// Übersetzt ein beliebiges String-Array in Chunks (≤50), behält die Reihenfolge.
// Quelle wird von DeepL automatisch erkannt (source==target → unverändert).
async function deeplTranslateAll(
  texts: string[],
  lang: Lang,
  key: string,
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += DEEPL_MAX_BATCH) {
    const chunk = texts.slice(i, i + DEEPL_MAX_BATCH);
    const resp = await fetch(DEEPL_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: chunk, target_lang: DEEPL_TARGET[lang] }),
    });
    if (!resp.ok) {
      throw new Error(`DeepL-API ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    for (const t of (data.translations ?? [])) out.push(t.text ?? "");
  }
  return out;
}

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
    const apiKey = Deno.env.get("DEEPL_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceKey) {
      return json({ error: "Server-Konfiguration fehlt (DEEPL_API_KEY?)" }, 500);
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

// ---------- DeepL Translation ----------

async function translateBatch(
  rows: ProductRow[],
  lang: Lang,
  apiKey: string,
): Promise<Record<string, { name: string; description: string | null }>> {
  // Flache String-Liste aus Name + (optional) Beschreibung bauen und
  // Rückzuordnung merken. Leere Beschreibungen werden nicht übersetzt.
  const strings: string[] = [];
  const map: Array<{ id: string; field: "name" | "description"; idx: number }> = [];
  for (const r of rows) {
    strings.push(r.name);
    map.push({ id: r.id, field: "name", idx: strings.length - 1 });
    if (r.description && r.description.trim()) {
      strings.push(r.description);
      map.push({ id: r.id, field: "description", idx: strings.length - 1 });
    }
  }

  const translated = await deeplTranslateAll(strings, lang, apiKey);

  // Default = Original, dann mit Übersetzungen überschreiben
  const out: Record<string, { name: string; description: string | null }> = {};
  for (const r of rows) out[r.id] = { name: r.name, description: r.description ?? null };
  for (const m of map) {
    const val = (translated[m.idx] ?? "").trim();
    if (!val) continue;
    if (m.field === "name") out[m.id].name = val;
    else out[m.id].description = val;
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
