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
import { reserveSystemAiCall } from "../_shared/systemBudget.ts";

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

// Debug: letzte Claude-Rohausgabe (nur fuer force-Tests im Response sichtbar).
let lastClaudeRaw = "";

// Claude-Fallback: uebersetzt ein String-Array in die Zielsprache, gleiche
// Reihenfolge/Laenge. Genutzt, wenn DeepL fehlt oder ausfaellt (z.B. Quota).
async function claudeTranslateAll(texts: string[], lang: Lang): Promise<string[]> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("kein ANTHROPIC_API_KEY fuer Fallback");
  // System-Deckel: der Claude-Fallback (DeepL-Ausfall) darf das Tagesbudget
  // nicht sprengen. Bei erschoepftem Budget abbrechen -> nichts wird uebersetzt
  // oder faelschlich als Uebersetzung gecacht (Client zeigt Originaltext).
  if (!(await reserveSystemAiCall())) {
    throw new Error("System-KI-Tagesbudget erreicht (translate-product Claude-Fallback)");
  }
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
        model: "claude-haiku-5-5",
        // Haiku 5.5 hat Thinking standardmaessig an; max_tokens hoeher, damit
        // Thinking + JSON-Ausgabe sicher passen (der Parser nimmt den
        // text-Block nach einem evtl. thinking-Block).
        max_tokens: 4000,
        system:
          `You are a professional translator for a marine/boating e-commerce shop. ` +
          `The inputs are PRODUCT TITLES that mix an article code, a brand, and descriptive words in Italian or English. ` +
          `Translate EVERY descriptive word into ${LANG_NAME[lang]} — including a foreign product-type noun even when it stands at the start of an otherwise English title. ` +
          `Keep UNCHANGED only: the article/SKU code (e.g. "19.0016.11", "DBBPL0602", "01.0065.04"), brand names (e.g. KONG, Osculati), and measurements with units (e.g. "60MM", "1''1/4", "Ø 6mm", "AISI 316"). ` +
          `Italian->German glossary (apply the same idea for other target languages): MOSCHETTONE=Karabiner, LUCCHETTO=Vorhaengeschloss, MANICOTTO=Muffe, NIPLES=Nippel, TERMINALE=Anschluss, RACCORDO=Fitting, OTTONE=Messing, INOX/ACCIAIO=Edelstahl, GIORNALE NAUTICO=Logbuch, "Presa d'aria"=Lueftung, RIDOTTO=reduziert, DIRITTO=gerade, MASCHIO=Aussengewinde, FEMMINA=Innengewinde. ` +
          `Never leave an Italian word untranslated. Return ONLY a JSON array of strings, same length and order as the input, no commentary.`,
        messages: [{ role: "user", content: JSON.stringify(chunk) }],
      }),
    });
    if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    // WICHTIG: den TEXT-Block nehmen — das Modell liefert ggf. zuerst einen
    // "thinking"-Block, dann den "text"-Block.
    const textBlock = Array.isArray(data.content)
      ? data.content.find((c: { type?: string; text?: string }) => c?.type === "text" && typeof c.text === "string")
      : null;
    const txt = (textBlock?.text ?? "[]").trim();
    lastClaudeRaw = txt.slice(0, 400);
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

interface VariantOptionDef { name?: string; values?: string[] }
interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  variant_options: VariantOptionDef[] | null;
  translations:
    | Record<string, { name?: string; description?: string; v?: number; vopts?: Record<string, string> }>
    | null;
}

// Alle uebersetzbaren Varianten-Begriffe (Optionsnamen + Werte) eines Produkts.
function optionStrings(vo: VariantOptionDef[] | null): string[] {
  if (!Array.isArray(vo)) return [];
  const s = new Set<string>();
  for (const o of vo) {
    if (o?.name && String(o.name).trim()) s.add(String(o.name).trim());
    for (const v of (o?.values ?? [])) if (v && String(v).trim()) s.add(String(v).trim());
  }
  return [...s];
}

// Plain-String-Array uebersetzen (Claude zuerst, DeepL als Fallback).
async function translateStrings(strings: string[], lang: Lang, apiKey: string): Promise<string[]> {
  if (!strings.length) return [];
  try { return await claudeTranslateAll(strings, lang); }
  catch (e) {
    if (!apiKey) throw e;
    return await deeplTranslateAll(strings, lang, apiKey);
  }
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
    const { product_ids, target_lang, force } = body ?? {};

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
      .select("id, name, description, variant_options, translations")
      .in("id", product_ids);

    if (loadErr) {
      return json({ error: "Produkte laden: " + loadErr.message }, 500);
    }

    const rows = (products ?? []) as ProductRow[];
    const result: Record<string, { name: string; description: string | null; vopts?: Record<string, string> }> = {};
    const toTranslate: ProductRow[] = []; // Name/Beschreibung fehlt
    const vNeed: ProductRow[] = [];       // Varianten-Begriffe (vopts) fehlen

    // Cache-Hits sammeln, Misses für Translation merken. Selbstheilend: gueltig,
    // wenn Marker v:2/v:3 ODER Name klar vom Original abweicht. vopts (Varianten)
    // werden separat ergaenzt, auch wenn Name/Beschreibung schon gecacht sind.
    for (const p of rows) {
      const cached = p.translations?.[lang];
      const validHit = !!cached?.name && (cached.v === 2 || cached.v === 3 || cached.name !== p.name);
      if (!force && validHit) {
        result[p.id] = {
          name: cached!.name!,
          description: cached!.description ?? p.description,
          vopts: cached!.vopts,
        };
      } else {
        toTranslate.push(p);
      }
      if ((force || !cached?.vopts) && optionStrings(p.variant_options).length > 0) {
        vNeed.push(p);
      }
    }

    // 1) Name/Beschreibung uebersetzen (ein Batch).
    let nameDesc: Record<string, { name: string; description: string | null }> = {};
    if (toTranslate.length > 0) nameDesc = await translateBatch(toTranslate, lang, apiKey);

    // 2) Varianten-Begriffe uebersetzen: ALLE distinct Strings in EINEM Aufruf.
    const vmap: Record<string, string> = {};
    if (vNeed.length > 0) {
      const distinct = [...new Set(vNeed.flatMap((p) => optionStrings(p.variant_options)))];
      const tr = await translateStrings(distinct, lang, apiKey);
      distinct.forEach((s, i) => { const t = (tr[i] ?? "").trim(); if (t) vmap[s] = t; });
    }

    // 3) Zusammenfuehren + je betroffenem Produkt EIN DB-Update.
    const affected = [...new Set([...toTranslate, ...vNeed].map((p) => p.id))];
    const updates = await Promise.allSettled(affected.map(async (id) => {
      const p = rows.find((x) => x.id === id)!;
      const cached = p.translations?.[lang] ?? {};
      const nd = nameDesc[id];
      const name = nd?.name ?? cached.name ?? p.name;
      const description = nd?.description ?? cached.description ?? p.description ?? null;
      let vopts = cached.vopts;
      if (vNeed.some((x) => x.id === id)) {
        vopts = { ...(cached.vopts ?? {}) };
        for (const s of optionStrings(p.variant_options)) if (vmap[s]) vopts[s] = vmap[s];
      }
      result[id] = { name, description, vopts };
      const newTranslations = {
        ...(p.translations ?? {}),
        [lang]: { name, description, v: 3, ...(vopts ? { vopts } : {}) },
      };
      await admin.from("metashop_products").update({ translations: newTranslations }).eq("id", id);
    }));
    const failed = updates.filter((u) => u.status === "rejected").length;
    if (failed > 0) console.error(`translate-product: ${failed} DB-Updates fehlgeschlagen`);

    // Kosten-Transparenz: neu erzeugte Uebersetzungen als ai_usage buchen.
    if (toTranslate.length > 0 || vNeed.length > 0) {
      try {
        const chars = toTranslate.reduce((s, p) => s + (p.name?.length ?? 0) + (p.description?.length ?? 0), 0)
          + Object.keys(vmap).reduce((s, k) => s + k.length, 0);
        await admin.from("ai_usage").insert({
          feature: "translate_product",
          source: "provider_quota",
          cost_tokens: Math.ceil(chars / 4),
          metadata: { kind: "translation", target_lang: lang, products: toTranslate.length, variant_terms: Object.keys(vmap).length, chars },
        });
      } catch (_e) { /* best-effort */ }
    }

    return json({
      translations: result,
      stats: {
        requested: product_ids.length,
        cached: product_ids.length - toTranslate.length,
        newly_translated: toTranslate.length,
        variant_terms: Object.keys(vmap).length,
        ...(force ? { claude_raw: lastClaudeRaw } : {}),
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

  // Produkttitel mischen Artikelcode + Marke + IT/EN-Woerter. DeepL erkennt nur
  // EINE Quellsprache und laesst einzelne Fremdwoerter stehen -> Claude ZUERST
  // (Glossar, gemischte Sprachen), DeepL nur als Fallback wenn Claude ausfaellt.
  let translated: string[];
  try {
    translated = await claudeTranslateAll(strings, lang);
  } catch (e) {
    console.warn("Claude nicht verfuegbar, Fallback DeepL:", (e as Error).message);
    if (!apiKey) throw e;
    translated = await deeplTranslateAll(strings, lang, apiKey);
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
