// =====================================================================
// news-subtitles — Erzeugt Untertitel (WebVTT) für das Video eines News-
// Beitrags in der Zielsprache des Betrachters. Lazy + gecacht:
//   1) Transkript via OpenAI Whisper (verbose_json, mit Zeitmarken) — einmal
//      pro Video, in news_video_transcripts gespeichert.
//   2) Übersetzung der Segmente in die Zielsprache (Claude) + WebVTT-Bau,
//      gecacht in news_video_subtitles.
//
// Input:  { post_id, target_lang }
// Output: { vtt } | { status: 'too_large'|'failed'|'no_video' }
// Whisper-Limit: 25 MB pro Datei → größere Videos werden übersprungen.
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";
import { checkFeature } from "../_shared/featureGate.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY   = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const WHISPER_MAX = 25 * 1024 * 1024;

const LANG_NAMES: Record<string, string> = {
  de: "German", en: "English", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch",
  pt: "Portuguese", pl: "Polish", sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
};

interface Seg { start: number; end: number; text: string; }

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

function ts(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}

function buildVtt(segs: Seg[], texts: string[]): string {
  let out = "WEBVTT\n\n";
  segs.forEach((seg, i) => {
    const t = (texts[i] ?? seg.text ?? "").trim();
    if (!t) return;
    out += `${ts(seg.start)} --> ${ts(seg.end)}\n${t}\n\n`;
  });
  return out;
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
    const targetLang = str(b.target_lang).toLowerCase().split(/[-_]/)[0] || "en";
    if (!postId) return json({ error: "post_id fehlt" }, 400);

    // Paywall: Untertitel in der Nutzersprache gehören zur Autoübersetzung (ab Basic).
    const access = await checkFeature(userId, "auto_translate", targetLang);
    if (!access.allowed) {
      return json({ status: "quota", quota_exhausted: true, requires_plus: true, upgrade_hint: access.message });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // KI-Budget-Gate (nur einmal, nur wenn echte KI-Arbeit nötig ist).
    let quotaChecked = false, quotaSource: string | null = null, usedTokens = 0;
    async function ensureQuota(): Promise<{ allowed: boolean; hint?: string }> {
      if (quotaChecked) return { allowed: quotaSource !== null };
      quotaChecked = true;
      const q = await checkAiQuota({ userId, providerId: null, feature: "chat" });
      if (q.allowed) { quotaSource = q.source ?? "free"; return { allowed: true }; }
      return { allowed: false, hint: q.upgradeHint };
    }

    // 1) Cache: fertige Untertitelspur?
    const { data: cachedSub } = await admin.from("news_video_subtitles")
      .select("vtt").eq("post_id", postId).eq("lang", targetLang).maybeSingle();
    if (cachedSub?.vtt) return json({ vtt: cachedSub.vtt });

    // Video-URL ermitteln
    const { data: media } = await admin.from("news_post_media")
      .select("url, media_type").eq("post_id", postId).eq("media_type", "video").limit(1).maybeSingle();
    if (!media?.url) return json({ status: "no_video" });

    // 2) Transkript sicherstellen
    let transcript: { source_lang: string; segments: Seg[]; status: string } | null = null;
    const { data: tRow } = await admin.from("news_video_transcripts")
      .select("source_lang, segments, status").eq("post_id", postId).maybeSingle();
    if (tRow) {
      transcript = { source_lang: tRow.source_lang ?? "", segments: (tRow.segments ?? []) as Seg[], status: tRow.status };
    } else {
      if (!OPENAI_API_KEY) return json({ status: "failed", error: "ASR nicht konfiguriert" });
      // KI-Budget prüfen (Transkription ist KI-Arbeit)
      const g = await ensureQuota();
      if (!g.allowed) return json({ status: "quota", quota_exhausted: true, upgrade_hint: g.hint ?? "Weitere Untertitel sind mit einem Skipily-Abo möglich." });
      // Video laden + Größe prüfen
      const vresp = await fetch(media.url);
      if (!vresp.ok) return json({ status: "failed" });
      const buf = new Uint8Array(await vresp.arrayBuffer());
      if (buf.byteLength > WHISPER_MAX) {
        await admin.from("news_video_transcripts").upsert({ post_id: postId, status: "too_large", segments: [] });
        return json({ status: "too_large" });
      }
      // Whisper-Transkription
      const fd = new FormData();
      fd.append("file", new Blob([buf], { type: "video/mp4" }), "video.mp4");
      fd.append("model", "whisper-1");
      fd.append("response_format", "verbose_json");
      const wresp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
        body: fd,
      });
      if (!wresp.ok) {
        console.error("whisper error:", wresp.status, (await wresp.text()).slice(0, 200));
        await admin.from("news_video_transcripts").upsert({ post_id: postId, status: "failed", segments: [] });
        return json({ status: "failed" });
      }
      const wdata = await wresp.json();
      const segs: Seg[] = Array.isArray(wdata?.segments)
        ? wdata.segments.map((s: Record<string, unknown>) => ({
            start: Number(s.start) || 0, end: Number(s.end) || 0, text: str(s.text),
          })).filter((s: Seg) => s.text)
        : [];
      const sourceLang = str(wdata?.language) || "de";
      await admin.from("news_video_transcripts").upsert({
        post_id: postId, source_lang: sourceLang, segments: segs, status: "ready",
      });
      transcript = { source_lang: sourceLang, segments: segs, status: "ready" };
    }

    if (transcript.status !== "ready") return json({ status: transcript.status });
    const segs = transcript.segments;
    if (segs.length === 0) return json({ status: "failed" });

    // 3) VTT bauen (ggf. übersetzen)
    const src = (transcript.source_lang || "de").toLowerCase().split(/[-_]/)[0];
    let texts = segs.map((s) => s.text);
    if (src !== targetLang) {
      const g = await ensureQuota();
      if (!g.allowed) return json({ status: "quota", quota_exhausted: true, upgrade_hint: g.hint ?? "Weitere Untertitel sind mit einem Skipily-Abo möglich." });
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      const langName = LANG_NAMES[targetLang] ?? targetLang;
      const translated: string[] = new Array(segs.length).fill("");
      const CHUNK = 40;
      for (let off = 0; off < segs.length; off += CHUNK) {
        const chunk = segs.slice(off, off + CHUNK);
        if (!apiKey) break;
        const prompt = `Translate these subtitle lines into ${langName}. Keep them short and natural for subtitles. Do NOT merge or split lines. Do NOT translate brand/model names.
Return ONLY a JSON array of strings, same length and order as the input.
Input: ${JSON.stringify(chunk.map((s) => s.text))}`;
        try {
          const resp = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
          });
          if (resp.ok) {
            const data = await resp.json();
            usedTokens += (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
            const txt = (data?.content?.[0]?.text ?? "").replace(/```json\s*|\s*```/g, "").trim();
            const arr = JSON.parse(txt);
            if (Array.isArray(arr)) {
              for (let i = 0; i < chunk.length; i++) translated[off + i] = str(arr[i]) || chunk[i].text;
            }
          }
        } catch (e) { console.error("subtitle translate chunk:", e); }
      }
      texts = segs.map((s, i) => translated[i] || s.text);
    }

    const vtt = buildVtt(segs, texts);
    await admin.from("news_video_subtitles").upsert({ post_id: postId, lang: targetLang, vtt });

    // KI-Nutzung verbuchen (Transkription + Übersetzung = eine Einheit)
    if (quotaSource) {
      recordAiUsage({
        platform: req.headers.get("x-skipily-platform"),
        userId, providerId: null, feature: "chat",
        source: quotaSource as "free" | "basic" | "plus" | "provider_quota",
        costTokens: usedTokens, metadata: { kind: "news_subtitles", target: targetLang },
        model: MODEL, inputTokens: 0, outputTokens: usedTokens,
      }).catch(() => null);
    }

    return json({ vtt });
  } catch (err) {
    console.error("news-subtitles error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
