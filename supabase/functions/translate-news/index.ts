// =====================================================================
// translate-news — Übersetzt Titel/Untertitel/Beschreibung von News-Beiträgen
// in die Zielsprache (Claude) und cached sie in news_post_translations.
// Basissprache = Deutsch; aufgerufen wird nur, wenn der Betrachter eine andere
// Sprache hat.
//
// Input:  { posts: [{ id, title, subtitle, body }], target_lang }
// Output: { translations: { "<id>": { title, subtitle, body } } }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";
import { checkFeature } from "../_shared/featureGate.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

const LANG_NAMES: Record<string, string> = {
  de: "German", en: "English", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch",
  pt: "Portuguese", pl: "Polish", sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
};

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: ud } = await userClient.auth.getUser();
    const userId = ud.user?.id;
    if (!userId) return json({ error: "Nicht authentifiziert" }, 401);

    const b = await req.json().catch(() => ({}));
    const targetLang = str(b.target_lang).toLowerCase().split(/[-_]/)[0] || "en";
    const posts: Array<{ id: string; title?: string; subtitle?: string; body?: string }> =
      Array.isArray(b.posts) ? b.posts.filter((p: { id?: unknown }) => typeof p?.id === "string").slice(0, 40) : [];
    if (posts.length === 0) return json({ translations: {} });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const ids = posts.map((p) => p.id);

    // Cache laden
    const { data: cached } = await admin.from("news_post_translations")
      .select("post_id, title, subtitle, body").eq("lang", targetLang).in("post_id", ids);
    const result: Record<string, { title: string; subtitle: string; body: string }> = {};
    for (const c of (cached ?? [])) {
      result[c.post_id] = { title: c.title ?? "", subtitle: c.subtitle ?? "", body: c.body ?? "" };
    }

    // Paywall: Autoübersetzung ab Basic. Free-Nutzer sehen die Originale; der
    // Hinweis kommt nur, wenn tatsächlich etwas übersetzt worden wäre (Cache
    // weicht vom Original ab bzw. noch nicht übersetzte Beiträge).
    const access = await checkFeature(userId, "auto_translate", targetLang);
    if (!access.allowed) {
      const differs = posts.some((p) => {
        const c = result[p.id];
        if (!c) return false;
        return c.title !== str(p.title) || c.subtitle !== str(p.subtitle) || c.body !== str(p.body);
      });
      const originals: Record<string, { title: string; subtitle: string; body: string }> = {};
      for (const p of posts) originals[p.id] = { title: str(p.title), subtitle: str(p.subtitle), body: str(p.body) };
      return json(differs
        ? { translations: originals, quota_exhausted: true, requires_plus: true, upgrade_hint: access.message }
        : { translations: originals });
    }

    // Fehlende übersetzen — in kleinen Chunks, damit die JSON-Antwort nicht
    // das Token-Limit sprengt (sonst abgeschnitten → Parse-Fehler → keine Übersetzung).
    const missing = posts.filter((p) => !result[p.id]);
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const langName = LANG_NAMES[targetLang] ?? targetLang;

    // KI-Budget des Nutzers: nur bei echtem Übersetzungsbedarf (Cache-Miss) belasten.
    let quotaSource: string | null = null;
    let usedTokens = 0;
    if (missing.length > 0) {
      const quota = await checkAiQuota({ userId, providerId: null, feature: "chat" });
      if (!quota.allowed) {
        // Bereits gecachte Übersetzungen trotzdem liefern; Rest bleibt Original.
        for (const p of missing) {
          result[p.id] = { title: str(p.title), subtitle: str(p.subtitle), body: str(p.body) };
        }
        return json({
          translations: result,
          quota_exhausted: true,
          upgrade_hint: quota.upgradeHint ?? "Weitere Übersetzungen sind mit einem Skipily-Abo möglich.",
        });
      }
      quotaSource = quota.source ?? "free";
    }

    const CHUNK = 5;
    for (let off = 0; off < missing.length; off += CHUNK) {
      const chunk = missing.slice(off, off + CHUNK);
      if (!apiKey) break;
      const payload = chunk.map((p) => ({
        id: p.id, title: str(p.title), subtitle: str(p.subtitle), body: str(p.body),
      }));
      const prompt = `Translate the following boat-community posts into ${langName}.
If a field is ALREADY written in ${langName}, copy it UNCHANGED (verbatim, do not rephrase).
Keep the meaning and marine/sailing terminology natural. Do NOT translate brand names, model numbers or product names. Keep line breaks.
Return ONLY a minified JSON object mapping each id to its translated fields, exactly:
{"<id>":{"title":"...","subtitle":"...","body":"..."}}
Input (JSON): ${JSON.stringify(payload)}`;
      try {
        const resp = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
        });
        if (resp.ok) {
          const data = await resp.json();
          usedTokens += (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
          const txt = (data?.content?.[0]?.text ?? "").replace(/```json\s*|\s*```/g, "").trim();
          const parsed = JSON.parse(txt);
          const rows: Array<Record<string, unknown>> = [];
          for (const p of chunk) {
            const tr = parsed?.[p.id];
            if (!tr) continue;
            const entry = {
              title: str(tr?.title) || str(p.title),
              subtitle: str(tr?.subtitle) || str(p.subtitle),
              body: str(tr?.body) || str(p.body),
            };
            result[p.id] = entry;
            rows.push({ post_id: p.id, lang: targetLang, ...entry });
          }
          if (rows.length > 0) {
            await admin.from("news_post_translations").upsert(rows, { onConflict: "post_id,lang" });
          }
        } else {
          console.error("translate-news claude status:", resp.status, (await resp.text()).slice(0, 200));
        }
      } catch (e) {
        console.error("translate-news chunk error:", e);
      }
    }
    // Fallback: Originaltext, wenn Übersetzung nicht möglich
    for (const p of missing) {
      if (!result[p.id]) result[p.id] = { title: str(p.title), subtitle: str(p.subtitle), body: str(p.body) };
    }

    // KI-Nutzung verbuchen (eine Einheit je Vorgang mit echter Übersetzung)
    if (quotaSource) {
      recordAiUsage({
        platform: req.headers.get("x-skipily-platform"),
        userId, providerId: null, feature: "chat",
        source: quotaSource as "free" | "basic" | "plus" | "provider_quota",
        costTokens: usedTokens, metadata: { kind: "news_translation", target: targetLang },
        model: MODEL, inputTokens: 0, outputTokens: usedTokens,
      }).catch(() => null);
    }

    return json({ translations: result });
  } catch (err) {
    console.error("translate-news error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
