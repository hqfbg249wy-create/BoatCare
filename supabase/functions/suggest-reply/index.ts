// Edge Function: suggest-reply
//
// Generiert einen Antwort-Vorschlag für eine Kundenanfrage im Provider-Chat.
// Nutzt:
//   - die letzten ~10 Nachrichten der Conversation als Kontext
//   - Provider-Profil (Services, Marken, Beschreibung)
//   - Provider-Shop-Produkte (Top 30) für ggf. passende Produkt-Verlinkungen
//
// Body: { conversation_id: UUID, lang?: 'de'|'en'|... }
// Response: { reply: string, quota: { source, remaining, limit } }
//
// Auth: muss eingeloggter Provider (oder Provider-Member) sein, der zu der
// Conversation gehört. Verbraucht 1 Call aus provider_quota.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

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

    const body = await req.json().catch(() => ({}));
    const { conversation_id, lang } = body ?? {};
    if (!conversation_id) return json({ error: "conversation_id fehlt" }, 400);
    const userLang = LANG_NAMES[lang] ? lang : "de";

    // ── Conversation laden + Berechtigung prüfen
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("id, user_id, provider_id")
      .eq("id", conversation_id)
      .single();
    if (convErr || !conv) return json({ error: "Conversation nicht gefunden" }, 404);

    // Hat der eingeloggte User Zugriff auf den Provider?
    const { data: canAccess } = await admin.rpc("user_can_access_provider", {
      p_user_id: user.id,
      p_provider_id: conv.provider_id,
    });
    if (!canAccess) return json({ error: "Kein Zugriff auf diese Conversation" }, 403);

    // ── Quota: Provider trägt die Kosten
    const quota = await checkAiQuota({
      userId:     user.id,
      providerId: conv.provider_id,
      feature:    "chat",
    });
    if (!quota.allowed) {
      return json({
        error:        quota.reason || "KI-Kontingent aufgebraucht",
        upgrade_hint: quota.upgradeHint,
        quota_exhausted: true,
      }, 402);
    }
    // Provider-zentrische Calls dürfen nur aus dem Provider-Quota gehen.
    if (quota.source !== "provider_quota") {
      return json({
        error:        "KI-Antwort-Vorschläge sind im Pro/Enterprise-Tarif enthalten. Aktuell hast du dafür kein Kontingent.",
        upgrade_hint: "Bitte auf Pro oder Enterprise upgraden.",
        quota_exhausted: true,
      }, 402);
    }

    // ── Provider-Kontext laden
    const { data: provider } = await admin
      .from("service_providers")
      .select("name, description, services, brands, category, city, country, opening_hours, phone, email")
      .eq("id", conv.provider_id)
      .single();

    // Letzte 10 Nachrichten der Conversation (älteste zuerst)
    const { data: messagesRaw } = await admin
      .from("messages")
      .select("sender_type, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);
    const messages = (messagesRaw || []).reverse();

    // Letzte Kundenanfrage extrahieren
    const lastCustomerMsg = [...messages].reverse().find(m => m.sender_type === "user");
    if (!lastCustomerMsg) {
      return json({ error: "Keine Kundenanfrage zum Beantworten gefunden." }, 400);
    }

    // Top 30 Produkte des Providers (für mögliche Empfehlungen)
    const { data: products } = await admin
      .from("metashop_products")
      .select("name, manufacturer, part_number, price, currency")
      .eq("provider_id", conv.provider_id)
      .eq("is_active", true)
      .order("name")
      .limit(30);

    // ── Prompt zusammenbauen
    const services = Array.isArray(provider?.services) ? provider.services : [];
    const brands   = Array.isArray(provider?.brands)   ? provider.brands : [];
    const productLines = (products || [])
      .map(p => `- ${p.name}${p.manufacturer ? ` (${p.manufacturer})` : ""}${p.price ? ` ${p.price} ${p.currency || "EUR"}` : ""}`)
      .join("\n");

    const conversationLog = messages
      .map(m => `${m.sender_type === "provider" ? "WIR" : "KUNDE"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `Du bist Assistent für einen Marine-Service-Anbieter und hilfst beim Verfassen freundlicher, kompetenter Antworten auf Kundenanfragen. Du schreibst IMMER in der Ich-Perspektive des Anbieters ("wir" / "unser Team").

Anbieter-Kontext:
- Name: ${provider?.name ?? "(unbekannt)"}
- Standort: ${[provider?.city, provider?.country].filter(Boolean).join(", ") || "(unbekannt)"}
- Kategorie: ${provider?.category ?? ""}
- Beschreibung: ${provider?.description ?? ""}
- Öffnungszeiten: ${provider?.opening_hours ?? "—"}
- Telefon: ${provider?.phone ?? "—"}
${services.length > 0 ? `- Leistungen: ${services.join(", ")}` : ""}
${brands.length > 0 ? `- Marken: ${brands.join(", ")}` : ""}

${productLines ? `Produkte im Shop (Auswahl):\n${productLines}` : ""}

Aufgabe:
- Verfasse eine Antwort auf die letzte Kundennachricht
- Bleibe sachlich-freundlich, ohne Floskeln-Overkill
- Wenn passende Produkte aus dem Shop helfen, erwähne sie konkret (Name + Hersteller)
- Wenn die Anfrage nicht eindeutig ist, stelle 1-2 gezielte Rückfragen
- Sprache: ${LANG_NAMES[userLang]}
- Halte dich kurz (max. 4-6 Sätze), klare Struktur
- KEINE Phrasen wie "Vielen Dank für Ihre Nachricht" oder ausschweifende Einleitungen
- Antworte NUR mit dem reinen Antwort-Text — keine Anrede-Markierungen, kein Markdown, kein Vorwort wie "Hier mein Vorschlag:"`;

    const userPrompt = `Conversation-Verlauf (älteste zuerst):
${conversationLog}

Bitte formuliere unsere Antwort auf die letzte Kundennachricht.`;

    // ── Claude API
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "AI-Service nicht konfiguriert" }, 500);

    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return json({ error: `AI-Fehler (${anthropicResponse.status}): ${errText.substring(0, 200)}` }, 502);
    }

    const result = await anthropicResponse.json();
    const reply = result.content?.[0]?.text?.trim() ?? "";

    // Quota verbuchen
    const usedTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
    recordAiUsage({
      userId:     user.id,
      providerId: conv.provider_id,
      feature:    "chat",
      source:     "provider_quota",
      costTokens: usedTokens,
      metadata:   { model: MODEL, lang: userLang, conversation_id, kind: "suggest_reply" },
    }).catch(() => null);

    return json({
      reply,
      quota: { source: "provider_quota", remaining: (quota.remaining ?? Infinity) - 1, limit: quota.limit },
    });

  } catch (err) {
    console.error("suggest-reply error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
