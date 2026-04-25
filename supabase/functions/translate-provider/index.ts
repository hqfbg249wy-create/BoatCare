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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;

const SUPPORTED_LANGS = ["en", "es", "fr", "it", "nl"] as const;
type Lang = typeof SUPPORTED_LANGS[number];

const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
};

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
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceKey) {
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

// ---------- Claude Translation ----------

async function translateBatch(
  rows: ProviderRow[],
  lang: Lang,
  apiKey: string,
): Promise<Record<string, TranslatedProvider>> {
  const langName = LANG_NAMES[lang];

  // Eingabe als nummerierte Liste
  const items = rows.map((r, i) => ({
    idx: i + 1,
    id: r.id,
    services: r.services ?? [],
    description: r.description ?? "",
    slogan: r.slogan ?? "",
  }));

  const userPrompt =
    `Translate the following German marine service-provider entries to ${langName}.
Return ONLY a valid JSON array (no prose, no markdown fences) where each
element matches:
  { "idx": number, "services": [string,...], "description": string, "slogan": string }
Keep the same idx and the same array length for "services".
Use proper marine terminology (sailing/yachting context). Empty strings stay empty.
Skip items that are obviously not translatable (e.g. coordinates) — keep them as-is.

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

  const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
  let parsed: Array<{
    idx: number;
    services: string[];
    description: string;
    slogan: string;
  }>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude-Antwort ist kein gültiges JSON");
  }

  const out: Record<string, TranslatedProvider> = {};
  for (const entry of parsed) {
    const orig = items.find((i) => i.idx === entry.idx);
    if (!orig) continue;
    out[orig.id] = {
      services: Array.isArray(entry.services) && entry.services.length > 0
        ? entry.services.map((s) => (s ?? "").trim() || "")
        : orig.services,
      description: entry.description?.trim() || null,
      slogan: entry.slogan?.trim() || null,
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
