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

// 'de' als Ziel ergaenzt: Produkte kommen inzwischen auch in anderen Sprachen
// (z.B. italienische Anbieter) — deutsche Nutzer brauchen daher ebenfalls eine
// Uebersetzung. DeepL erkennt die Quelle automatisch (de->de bleibt unveraendert).
const SUPPORTED_LANGS = ["de", "en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const DEEPL_TARGET: Record<Lang, string> = {
  de: "DE",
  en: "EN-GB",
  es: "ES",
  fr: "FR",
  it: "IT",
  nl: "NL",
};

const LANG_NAME: Record<Lang, string> = {
  de: "German", en: "English", es: "Spanish", fr: "French", it: "Italian", nl: "Dutch",
};

// Claude-Fallback: uebersetzt ein String-Array in die Zielsprache, gleiche
// Reihenfolge/Laenge. Genutzt, wenn DeepL fehlt oder ausfaellt (z.B. Quota).
async function claudeTranslateAll(texts: string[], lang: Lang): Promise<string[]> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("kein ANTHROPIC_API_KEY fuer Fallback");
  const out: string[] = [];
  const BATCH = 15;
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        system:
          `You translate product texts for a marine/boating marketplace into ${LANG_NAME[lang]}. ` +
          `Keep brand names, model names, part numbers, SKUs and units unchanged. ` +
          `Return ONLY a JSON array of strings, same length and order as the input, no commentary.`,
        messages: [{ role: "user", content: JSON.stringify(chunk) }],
      }),
    });
    if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    const txt = (data.content?.[0]?.text ?? "[]").trim();
    let arr: string[] = [];
    try { arr = JSON.parse(txt); }
    catch {
      const m = txt.match(/\[[\s\S]*\]/);
      arr = m ? JSON.parse(m[0]) : [];
    }
    for (let j = 0; j < chunk.length; j++) out.push(typeof arr[j] === "string" ? arr[j] : chunk[j]);
  }
  return out;
}

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
    const apiKey = Deno.env.get("DEEPL_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // DeepL ist optional: faellt es aus (Quota) oder fehlt der Key, wird
    // ueber Claude uebersetzt. Nur Supabase-Config ist zwingend.
    if (!supabaseUrl || !serviceKey) {
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

      // Kosten-Transparenz: neu erzeugte Uebersetzungen als ai_usage buchen
      // (translate_product zaehlt NICHT gegen die Free-Quota des Nutzers).
      try {
        const chars = toTranslate.reduce((s, p) => s + (p.name?.length ?? 0) + (p.description?.length ?? 0), 0);
        await admin.from("ai_usage").insert({
          feature: "translate_product",
          source: "provider_quota",
          cost_tokens: Math.ceil(chars / 4),
          metadata: { kind: "translation", target_lang: lang, products: toTranslate.length, chars },
        });
      } catch (_e) { /* best-effort */ }
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

  // DeepL zuerst (wenn Key vorhanden); bei Fehler/Quota -> Claude-Fallback.
  let translated: string[];
  try {
    if (!apiKey) throw new Error("kein DeepL-Key");
    translated = await deeplTranslateAll(strings, lang, apiKey);
  } catch (e) {
    console.warn("DeepL nicht verfuegbar, Fallback Claude:", (e as Error).message);
    translated = await claudeTranslateAll(strings, lang);
  }

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
