// Einmaliger/wiederholbarer Backfill: uebersetzt alle veroeffentlichten
// News-Beitraege in alle 6 App-Sprachen und cached sie in news_post_translations.
// Waermt den Cache -> Feed in jeder Sprache sofort verfuegbar (schnell).
// Service-Role, kein Nutzer-Login noetig (deploy mit --no-verify-jwt).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const ALL_LANGS = ["de", "en", "fr", "it", "es", "nl"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-skipily-platform",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

// deno-lint-ignore no-explicit-any
async function translateOne(admin: any, postId: string, title: string, subtitle: string, body: string): Promise<boolean> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return false;
  const prompt = `Translate the following boat-community post into these languages: German, English, French, Italian, Spanish, Dutch.
If a field is already written in a target language, copy it UNCHANGED (verbatim) for that language.
Keep the meaning and marine/sailing terminology natural. Do NOT translate brand names, model numbers or product names. Keep line breaks.
Return ONLY a minified JSON object mapping each language code (de,en,fr,it,es,nl) to its translated fields, exactly:
{"de":{"title":"...","subtitle":"...","body":"..."},"en":{...},"fr":{...},"it":{...},"es":{...},"nl":{...}}
Input (JSON): ${JSON.stringify({ title, subtitle, body })}`;
  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    const txt = (data?.content?.[0]?.text ?? "").replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(txt);
    const rows: Array<Record<string, unknown>> = [];
    for (const lang of ALL_LANGS) {
      const tr = parsed?.[lang];
      if (!tr) continue;
      rows.push({ post_id: postId, lang, title: str(tr.title) || title, subtitle: str(tr.subtitle) || subtitle, body: str(tr.body) || body });
    }
    if (rows.length > 0) await admin.from("news_post_translations").upsert(rows, { onConflict: "post_id,lang" });
    return true;
  } catch (e) {
    console.error("translateOne:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const onlyMissing = body?.only_missing !== false; // default: nur Beitraege mit fehlenden Sprachen
    const onePost = typeof body?.post_id === "string" ? body.post_id : null;

    let q = admin.from("news_posts").select("id, title, subtitle, body").eq("status", "published");
    if (onePost) q = q.eq("id", onePost);
    const { data: posts } = await q;
    if (!posts || posts.length === 0) return json({ done: 0, note: "keine Beitraege" });

    // Vorhandene Cache-Abdeckung je Beitrag ermitteln.
    const { data: existing } = await admin.from("news_post_translations").select("post_id, lang");
    const byPost: Record<string, Set<string>> = {};
    for (const e of (existing ?? [])) {
      (byPost[e.post_id] ??= new Set()).add(e.lang);
    }

    let done = 0;
    for (const p of posts) {
      const have = byPost[p.id] ?? new Set();
      const complete = ALL_LANGS.every((l) => have.has(l));
      if (onlyMissing && complete) continue;
      const ok = await translateOne(admin, p.id, str(p.title), str(p.subtitle), str(p.body));
      if (ok) done++;
    }
    return json({ done, total: posts.length });
  } catch (err) {
    console.error("backfill-news-translations:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});
