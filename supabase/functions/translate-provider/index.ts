// =====================================================================
// translate-provider — Übersetzt Service-Provider-Felder (services-Array,
// description, slogan) in eine Zielsprache und cacht das Ergebnis in
// service_providers.translations (JSONB).
//
// Strategie B aus dem i18n-Plan, analog zu translate-product:
//   - Beim ersten Request für einen Provider+Sprache wird Claude aufgerufen
//   - Antwort landet in translations->lang->{services[], description, slogan}
//   - Nächster Request liefert direkt aus dem Cache
//
// Aufruf:
//   POST /functions/v1/translate-provider
//   { provider_ids: ["uuid1", "uuid2"], target_lang: "en" }
//
// Antwort:
//   { translations: { "uuid1": {services, description, slogan}, ... } }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// DeepL Free-API (api-free.deepl.com). Key als Supabase-Secret DEEPL_API_KEY.
const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";
const DEEPL_MAX_BATCH = 50;

// 'de' als Ziel ergaenzt (auslaendische Betriebe -> deutsche Nutzer).
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

// Claude-Fallback (wenn DeepL fehlt/ausfaellt, z.B. Quota).
async function claudeTranslateAll(texts: string[], lang: Lang): Promise<string[]> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("kein ANTHROPIC_API_KEY fuer Fallback");
  const out: string[] = [];
  const BATCH = 20;
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 3000,
        system: `You are a professional translator for a marine marketplace. Translate EACH input string fully into ${LANG_NAME[lang]}. ` +
          `Translate all descriptive service/product words; keep UNCHANGED only company/brand names. ` +
          `Do NOT leave foreign words untranslated. Return ONLY a JSON array of strings, same length and order.`,
        messages: [{ role: "user", content: JSON.stringify(chunk) }],
      }),
    });
    if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    // TEXT-Block nehmen (Modell liefert ggf. zuerst einen thinking-Block).
    const textBlock = Array.isArray(data.content)
      ? data.content.find((c: { type?: string; text?: string }) => c?.type === "text" && typeof c.text === "string")
      : null;
    const txt = (textBlock?.text ?? "[]").trim();
    let arr: string[] = [];
    try { arr = JSON.parse(txt); } catch { const m = txt.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : []; }
    for (let j = 0; j < chunk.length; j++) out.push(typeof arr[j] === "string" ? arr[j] : chunk[j]);
  }
  return out;
}

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

interface ProviderRow {
  id: string;
  description: string | null;
  slogan: string | null;
  services: string[] | null;
  translations:
    | Record<
      string,
      {
        services?: string[];
        description?: string;
        slogan?: string;
      }
    >
    | null;
}

interface TranslatedProvider {
  services: string[];
  description: string | null;
  slogan: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("DEEPL_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server-Konfiguration fehlt" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const { provider_ids, target_lang } = body ?? {};

    if (!Array.isArray(provider_ids) || provider_ids.length === 0) {
      return json({ error: "provider_ids[] ist Pflicht" }, 400);
    }
    if (provider_ids.length > 30) {
      return json({ error: "Max. 30 Provider pro Request" }, 400);
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

    // Provider laden
    const { data: providers, error: loadErr } = await admin
      .from("service_providers")
      .select("id, description, slogan, services, translations")
      .in("id", provider_ids);

    if (loadErr) {
      return json({ error: "Provider laden: " + loadErr.message }, 500);
    }

    const result: Record<string, TranslatedProvider> = {};
    const toTranslate: ProviderRow[] = [];

    // Cache-Hits sammeln
    for (const p of (providers ?? []) as ProviderRow[]) {
      const cached = p.translations?.[lang];
      if (cached?.services) {
        result[p.id] = {
          services: cached.services,
          description: cached.description ?? p.description,
          slogan: cached.slogan ?? p.slogan,
        };
      } else {
        toTranslate.push(p);
      }
    }

    // Misses übersetzen (in einem Claude-Call → batch-fähig)
    if (toTranslate.length > 0) {
      const translated = await translateBatch(toTranslate, lang, apiKey);

      const updates = await Promise.allSettled(
        toTranslate.map(async (p) => {
          const t = translated[p.id];
          if (!t) return;
          result[p.id] = t;

          const newTranslations = {
            ...(p.translations ?? {}),
            [lang]: {
              services: t.services,
              description: t.description,
              slogan: t.slogan,
            },
          };
          await admin
            .from("service_providers")
            .update({ translations: newTranslations })
            .eq("id", p.id);
        }),
      );

      const failed = updates.filter((u) => u.status === "rejected").length;
      if (failed > 0) console.error(`translate-provider: ${failed} DB-Updates fehlgeschlagen`);

      // Kosten-Transparenz (zaehlt nicht gegen Free-Quota).
      try {
        await admin.from("ai_usage").insert({
          feature: "translate_provider",
          source: "provider_quota",
          cost_tokens: toTranslate.length * 20,
          metadata: { kind: "translation", target_lang: lang, providers: toTranslate.length },
        });
      } catch (_e) { /* best-effort */ }
    }

    return json({
      translations: result,
      stats: {
        requested: provider_ids.length,
        cached: provider_ids.length - toTranslate.length,
        newly_translated: toTranslate.length,
      },
    });
  } catch (err) {
    console.error("translate-provider error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

// ---------- DeepL Translation ----------

async function translateBatch(
  rows: ProviderRow[],
  lang: Lang,
  apiKey: string,
): Promise<Record<string, TranslatedProvider>> {
  // Flache String-Liste: description, slogan und jedes services[]-Element.
  // Leere Strings werden übersprungen und bleiben unverändert.
  const strings: string[] = [];
  const map: Array<
    { id: string; field: "description" | "slogan" | "service"; arrIdx?: number; idx: number }
  > = [];
  for (const r of rows) {
    if (r.description && r.description.trim()) {
      strings.push(r.description);
      map.push({ id: r.id, field: "description", idx: strings.length - 1 });
    }
    if (r.slogan && r.slogan.trim()) {
      strings.push(r.slogan);
      map.push({ id: r.id, field: "slogan", idx: strings.length - 1 });
    }
    (r.services ?? []).forEach((s, ai) => {
      if (s && s.trim()) {
        strings.push(s);
        map.push({ id: r.id, field: "service", arrIdx: ai, idx: strings.length - 1 });
      }
    });
  }

  let translated: string[];
  try {
    if (!apiKey) throw new Error("kein DeepL-Key");
    translated = await deeplTranslateAll(strings, lang, apiKey);
  } catch (e) {
    console.warn("DeepL nicht verfuegbar, Fallback Claude:", (e as Error).message);
    translated = await claudeTranslateAll(strings, lang);
  }

  // Default = Original
  const out: Record<string, TranslatedProvider> = {};
  for (const r of rows) {
    out[r.id] = {
      services: [...(r.services ?? [])],
      description: r.description ?? null,
      slogan: r.slogan ?? null,
    };
  }
  for (const m of map) {
    const val = (translated[m.idx] ?? "").trim();
    if (!val) continue;
    if (m.field === "description") out[m.id].description = val;
    else if (m.field === "slogan") out[m.id].slogan = val;
    else if (m.field === "service" && m.arrIdx != null) out[m.id].services[m.arrIdx] = val;
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
