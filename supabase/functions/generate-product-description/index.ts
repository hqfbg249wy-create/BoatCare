// Edge Function: generate-product-description
//
// Generiert eine SEO-optimierte Produktbeschreibung aus knappen Eckdaten
// (Name, Hersteller, Kategorie, optional Tags + Maße).
//
// Body: {
//   name: string,
//   manufacturer?: string,
//   part_number?: string,
//   category?: string,
//   tags?: string[],
//   dimensions?: string,
//   lang?: 'de'|'en'|...
// }
//
// Response: { description: string, quota: { ... } }
//
// Verbraucht 1 Call aus provider_quota.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 800;

const LANG_NAMES: Record<string, string> = {
  de: "German", en: "English", fr: "French",
  es: "Spanish", it: "Italian", nl: "Dutch",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: "Ungültiger Token" }, 401);

    // Provider des Aufrufers ermitteln (entweder user_id = Provider-Owner,
    // oder Member eines Providers)
    const { data: ownedProvider } = await admin
      .from("service_providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    let providerId = ownedProvider?.id;
    if (!providerId) {
      const { data: memberOf } = await admin
        .from("provider_members")
        .select("provider_id")
        .eq("user_id", user.id)
        .not("accepted_at", "is", null)
        .limit(1)
        .maybeSingle();
      providerId = memberOf?.provider_id;
    }
    if (!providerId) {
      return json({ error: "Kein Provider-Profil zu diesem Nutzer gefunden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { name, manufacturer, part_number, category, tags, dimensions, lang } = body ?? {};
    if (!name) return json({ error: "name ist Pflicht" }, 400);
    const userLang = LANG_NAMES[lang] ? lang : "de";

    // Quota-Check
    const quota = await checkAiQuota({
      userId:     user.id,
      providerId,
      feature:    "chat",
    });
    if (!quota.allowed || quota.source !== "provider_quota") {
      return json({
        error:        "Der Beschreibungs-Generator ist im Pro/Enterprise-Tarif enthalten. Aktuell hast du dafür kein Kontingent.",
        upgrade_hint: quota.upgradeHint ?? "Bitte auf Pro oder Enterprise upgraden.",
        quota_exhausted: true,
      }, 402);
    }

    // Prompt
    const tagList = Array.isArray(tags) && tags.length > 0 ? tags.join(", ") : "";
    const userPrompt = `Eckdaten zum Produkt:
- Name: ${name}
${manufacturer ? `- Hersteller: ${manufacturer}` : ""}
${part_number  ? `- Artikelnummer: ${part_number}` : ""}
${category     ? `- Kategorie: ${category}` : ""}
${dimensions   ? `- Maße/Specs: ${dimensions}` : ""}
${tagList      ? `- Tags: ${tagList}` : ""}

Schreibe eine professionelle Produktbeschreibung für einen Marine-/Bootszubehör-Shop in ${LANG_NAMES[userLang]}.

Anforderungen:
- 80–150 Wörter
- Einsteiger-freundlich, aber technisch korrekt
- Klare Struktur: Was ist das? Wofür? Wichtige Eigenschaften? An welchen Booten/Motoren passend?
- KEINE Floskeln wie "Hochwertig" oder "Top-Qualität" ohne Belege
- KEINE Aufzählungspunkte mit Bullet-Symbolen — fließender Text in 2–3 Absätzen
- SEO-relevante Schlagwörter (Hersteller-Modellnamen, Boots-Klassen) natürlich einflechten

Antworte NUR mit dem reinen Beschreibungstext, kein Vorwort, kein Markdown, keine Überschrift.`;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "AI-Service nicht konfiguriert" }, 500);

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
      const t = await resp.text();
      return json({ error: `AI-Fehler (${resp.status}): ${t.substring(0, 200)}` }, 502);
    }

    const result = await resp.json();
    const description = result.content?.[0]?.text?.trim() ?? "";

    const usedTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
    recordAiUsage({
      userId:     user.id,
      providerId,
      feature:    "chat",
      source:     "provider_quota",
      costTokens: usedTokens,
      metadata:   { model: MODEL, lang: userLang, kind: "product_description", product_name: name },
    }).catch(() => null);

    return json({
      description,
      quota: { source: "provider_quota", remaining: (quota.remaining ?? Infinity) - 1, limit: quota.limit },
    });

  } catch (err) {
    console.error("generate-product-description error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
