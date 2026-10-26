// =====================================================================
// update-news-post — Bearbeitet einen News-Beitrag (Ersteller ODER Admin) und
// moderiert ihn erneut per KI (gleiche Logik wie create-news-post). Medien
// werden durch die übergebene Liste ersetzt.
//
// Input:  { post_id, title, subtitle, boat_ref, equipment_ref, body,
//           product_id?, media_urls?: string[], video_urls?: string[] }
// Output: { id, status, moderation_reason }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveSystemAiCall } from "../_shared/systemBudget.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const ADMIN_NOTIFY_SECRET = Deno.env.get("ADMIN_NOTIFY_SECRET") ?? "";

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

function normalizeYouTube(input: string): string {
  const s = str(input);
  if (!s) return "";
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  ) || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : "";
}

async function notifyAdminsReview(postId: string) {
  if (!ADMIN_NOTIFY_SECRET) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-admins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "x-internal-secret": ADMIN_NOTIFY_SECRET,
      },
      body: JSON.stringify({ event: "news_review", post_id: postId }),
    });
  } catch (e) { console.error("notify-admins (news_review):", e); }
}

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
    const postId = str(b.post_id);
    const title = str(b.title);
    if (!postId || !title) return json({ error: "Pflichtfelder fehlen" }, 400);
    const mediaUrls: string[] = Array.isArray(b.media_urls) ? b.media_urls.filter((x: unknown) => typeof x === "string").slice(0, 5) : [];
    const videoUrls: string[] = Array.isArray(b.video_urls) ? b.video_urls.filter((x: unknown) => typeof x === "string").slice(0, 2) : [];
    const youtubeUrl = normalizeYouTube(str(b.youtube_url));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Bestehenden Beitrag + Berechtigung prüfen (Autor ODER Admin)
    const { data: existing } = await admin.from("news_posts").select("id, author_id, kind, provider_id").eq("id", postId).maybeSingle();
    if (!existing) return json({ error: "Beitrag nicht gefunden" }, 404);
    let allowed = existing.author_id === userId;
    if (!allowed) {
      const { data: isAdmin } = await userClient.rpc("is_admin");
      allowed = isAdmin === true;
    }
    if (!allowed) return json({ error: "Kein Zugriff" }, 403);
    const kind = existing.kind === "product" ? "product" : "solution";

    // ── KI-Moderation (Text + Bilder) — gleiche Logik wie create
    let decision = "review";
    let reason = "";
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (apiKey && await reserveSystemAiCall()) {
      try {
        const imageBlocks: unknown[] = [];
        for (const url of mediaUrls) {
          try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const ct = r.headers.get("content-type") ?? "image/jpeg";
            const mt = ALLOWED_MEDIA.includes(ct) ? ct : "image/jpeg";
            const buf = new Uint8Array(await r.arrayBuffer());
            let bin = ""; for (const byte of buf) bin += String.fromCharCode(byte);
            imageBlocks.push({ type: "image", source: { type: "base64", media_type: mt, data: btoa(bin) } });
          } catch { /* skip */ }
        }
        const prompt = `Du moderierst Beiträge einer App-Community „Ideen, Tipps und Tricks für Bootseigner".
Bewerte den folgenden (bearbeiteten) Beitrag (Text${imageBlocks.length ? " + Bilder" : ""}).

Titel: ${title}
Untertitel: ${str(b.subtitle)}
Schiff: ${str(b.boat_ref)}
Ausrüstung: ${str(b.equipment_ref)}
Beschreibung: ${str(b.body)}
Typ: ${kind === "product" ? "Produktvorstellung eines Anbieters" : "Lösungsvorstellung eines Eigners"}

Antworte NUR mit JSON: {"decision":"allow|block|review","reason":"kurz, Deutsch"}.
- "block": NUR sexuelle Inhalte oder herabwürdigende/beleidigende Aussagen gegen Personen.
- "review": NUR wenn der Beitrag keinerlei Bezug zu Booten/Wassersport/Ausrüstung hat ODER klar Betrug, Belästigung oder Gefährdung ist.
- "allow": alles Übrige.
WICHTIG: Produktwerbung, Markennennungen und konkrete Kaufempfehlungen sind ausdrücklich ERWÜNSCHT und sind NIEMALS ein Grund für "review" oder "block". Werte Werblichkeit NICHT negativ.`;
        const resp = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: MODEL, max_tokens: 200, messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }] }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const txt = (data?.content?.[0]?.text ?? "").replace(/```json\s*|\s*```/g, "").trim();
          const parsed = JSON.parse(txt);
          const d = str(parsed.decision);
          decision = ["allow", "block", "review"].includes(d) ? d : "review";
          reason = str(parsed.reason);
        }
      } catch (e) {
        console.error("moderation failed, fallback to review:", e);
        decision = "review";
      }
    }
    const status = decision === "allow" ? "published" : decision === "block" ? "blocked" : "pending_review";

    // Produktliste (nur eigene Produkte des Anbieters); erstes → product_id.
    let productIds: string[] = [];
    if (kind === "product" && existing.provider_id) {
      const raw: string[] = Array.isArray(b.product_ids)
        ? b.product_ids.filter((x: unknown) => typeof x === "string")
        : (str(b.product_id) ? [str(b.product_id)] : []);
      if (raw.length > 0) {
        const { data: own } = await admin.from("metashop_products")
          .select("id").eq("provider_id", existing.provider_id).in("id", raw.slice(0, 30));
        const ownSet = new Set((own ?? []).map((r: { id: string }) => r.id));
        productIds = raw.filter((id) => ownSet.has(id)).slice(0, 30);
      }
    }
    const primaryProductId = productIds[0] ?? (str(b.product_id) || null);

    const { data: post, error: uErr } = await admin.from("news_posts").update({
      title,
      subtitle: str(b.subtitle),
      boat_ref: str(b.boat_ref),
      equipment_ref: str(b.equipment_ref),
      body: str(b.body),
      product_id: primaryProductId,
      status,
      moderation_reason: reason,
      published_at: status === "published" ? new Date().toISOString() : null,
    }).eq("id", postId).select("id, status, moderation_reason").single();
    if (uErr) throw uErr;

    if (post.status === "pending_review") await notifyAdminsReview(post.id);

    // Medien ersetzen
    await admin.from("news_post_media").delete().eq("post_id", postId);
    const mediaRows = [
      ...mediaUrls.map((url, i) => ({ post_id: postId, media_type: "image", url, sort_order: i })),
      ...videoUrls.map((url, i) => ({ post_id: postId, media_type: "video", url, sort_order: mediaUrls.length + i })),
      ...(youtubeUrl ? [{ post_id: postId, media_type: "youtube", url: youtubeUrl, sort_order: mediaUrls.length + videoUrls.length }] : []),
    ];
    if (mediaRows.length > 0) {
      const { error: mErr } = await admin.from("news_post_media").insert(mediaRows);
      if (mErr) console.error("media insert:", mErr.message);
    }

    // Verlinkte Produkte ersetzen
    if (kind === "product") {
      await admin.from("news_post_products").delete().eq("post_id", postId);
      if (productIds.length > 0) {
        const rows = productIds.map((pid, i) => ({ post_id: postId, product_id: pid, sort_order: i }));
        const { error: ppErr } = await admin.from("news_post_products").insert(rows);
        if (ppErr) console.error("news_post_products insert:", ppErr.message);
      }
    }

    // Alte Übersetzungen verwerfen + im Hintergrund neu in alle 6 Sprachen.
    await admin.from("news_post_translations").delete().eq("post_id", postId);
    const _bg = translateNewsAllLangs(admin, postId, title, str(b.subtitle), str(b.body));
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(_bg); else await _bg;

    return json({ id: post.id, status: post.status, moderation_reason: post.moderation_reason });
  } catch (err) {
    console.error("update-news-post error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

// Vorübersetzung in alle 6 App-Sprachen im Hintergrund (Cache warm -> schnell).
const ALL_LANGS = ["de", "en", "fr", "it", "es", "nl"];
async function translateNewsAllLangs(
  admin: ReturnType<typeof createClient>,
  postId: string, title: string, subtitle: string, body: string,
) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return;
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
    if (!resp.ok) return;
    const data = await resp.json();
    const txt = (data?.content?.[0]?.text ?? "").replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(txt);
    const rows: Array<Record<string, unknown>> = [];
    for (const lang of ALL_LANGS) {
      const tr = parsed?.[lang];
      if (!tr) continue;
      rows.push({
        post_id: postId, lang,
        title: str(tr.title) || title,
        subtitle: str(tr.subtitle) || subtitle,
        body: str(tr.body) || body,
      });
    }
    if (rows.length > 0) await admin.from("news_post_translations").upsert(rows, { onConflict: "post_id,lang" });
  } catch (e) {
    console.error("translateNewsAllLangs:", e);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
