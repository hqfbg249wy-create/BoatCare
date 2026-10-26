// =====================================================================
// create-news-post — Legt einen News-Beitrag an und moderiert ihn per KI.
// Eigner: kind='solution'. Provider: kind='product' (+ shop_url/product_id,
// Gratis-Kontingent 2/Woche Pro, 4/Woche Enterprise).
//
// Ablauf: Client lädt Bilder vorab in Bucket user-photos (news/<uid>/…) und
// übergibt deren URLs. Diese Function lädt sie für die Moderation, prüft Text
// + Bilder via Claude und setzt den Status:
//   allow  → published        (sichtbar)
//   review → pending_review    (Admin-Moderation)
//   block  → blocked           (sexuell/herabwürdigend)
//
// Input:  { kind, title, subtitle, boat_ref, equipment_ref, body,
//           shop_url?, product_id?, provider_id?, media_urls?: string[] }
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

// Erkennt eine YouTube-URL/ID und liefert eine normalisierte Watch-URL zurueck
// (oder "", wenn es keine gueltige YouTube-Referenz ist).
function normalizeYouTube(input: string): string {
  const s = str(input);
  if (!s) return "";
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  ) || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : "";
}

// Admins benachrichtigen, wenn ein Beitrag auf Freigabe wartet.
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
    const kind = str(b.kind) === "product" ? "product" : "solution";
    const title = str(b.title);
    if (!title) return json({ error: "Titel fehlt" }, 400);
    const mediaUrls: string[] = Array.isArray(b.media_urls)
      ? b.media_urls.filter((x: unknown) => typeof x === "string").slice(0, 5) : [];
    const videoUrls: string[] = Array.isArray(b.video_urls)
      ? b.video_urls.filter((x: unknown) => typeof x === "string").slice(0, 2) : [];
    // YouTube-Link (statt/zusaetzlich zu einem hochgeladenen Video). Nur gueltige
    // YouTube-URLs werden als media_type='youtube' gespeichert.
    const youtubeUrl = normalizeYouTube(str(b.youtube_url));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Provider-Beitrag: Mitgliedschaft prüfen + Gratis-Kontingent (Pro 2 / Enterprise 4 pro Woche)
    let providerId: string | null = null;
    if (kind === "product") {
      providerId = str(b.provider_id) || null;
      if (!providerId) return json({ error: "provider_id fehlt" }, 400);
      const { data: mem } = await admin.from("provider_members")
        .select("provider_id").eq("provider_id", providerId).eq("user_id", userId).maybeSingle();
      const { data: prov } = await admin.from("service_providers")
        .select("id, subscription_plan, user_id").eq("id", providerId).maybeSingle();
      if (!prov) return json({ error: "Anbieter nicht gefunden" }, 404);
      // Berechtigung: Mitglied ODER Eigentümer (service_providers.user_id).
      if (!mem && prov.user_id !== userId) {
        return json({ error: "Kein Zugriff auf diesen Anbieter" }, 403);
      }
      const plan = String(prov.subscription_plan ?? "");
      const weeklyLimit = plan.startsWith("ent") ? 4 : plan.startsWith("pro") ? 2 : 0;
      if (weeklyLimit === 0) {
        return json({ error: "Produktvorstellungen sind Pro/Enterprise-Anbietern vorbehalten.", quota_exceeded: true }, 402);
      }
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      const { count } = await admin.from("news_posts")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId).eq("kind", "product")
        .in("status", ["published", "pending_review"])
        .gte("created_at", weekAgo);
      if ((count ?? 0) >= weeklyLimit) {
        return json({
          error: `Wochen-Kontingent erreicht (${weeklyLimit}/Woche). Zusätzliche Schaltungen sind in Kürze kostenpflichtig buchbar.`,
          quota_exceeded: true,
        }, 402);
      }
    }

    // ── KI-Moderation (Text + Bilder)
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
            // base64 encodieren
            let bin = ""; for (const byte of buf) bin += String.fromCharCode(byte);
            imageBlocks.push({ type: "image", source: { type: "base64", media_type: mt, data: btoa(bin) } });
          } catch { /* Bild überspringen */ }
        }
        const prompt = `Du moderierst Beiträge einer App-Community „Ideen, Tipps und Tricks für Bootseigner".
Bewerte den folgenden Beitrag (Text${imageBlocks.length ? " + Bilder" : ""}).

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
WICHTIG: Produktwerbung, Markennennungen und konkrete Kaufempfehlungen sind auf dieser Plattform ausdrücklich ERWÜNSCHT und sind NIEMALS ein Grund für "review" oder "block" — Boots-Lösungen hängen fast immer an konkreten Produkten. Werte Werblichkeit NICHT negativ.`;
        const resp = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL, max_tokens: 200,
            messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
          }),
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

    // ── Autor-Snapshot (Name + Bild) für den News-Kopf
    let authorName = "";
    let authorAvatar = "";
    if (kind === "product" && providerId) {
      const { data: sp } = await admin.from("service_providers").select("name, logo_url").eq("id", providerId).maybeSingle();
      authorName = str(sp?.name);
      authorAvatar = str(sp?.logo_url);
    } else {
      const { data: prof } = await admin.from("profiles").select("full_name, email, avatar_url").eq("id", userId).maybeSingle();
      authorName = str(prof?.full_name) || str(prof?.email).split("@")[0];
      authorAvatar = str(prof?.avatar_url);
    }

    // ── Produktliste (Provider verlinkt mehrere eigene Shop-Produkte).
    // Nur IDs akzeptieren, die wirklich dem Anbieter gehören. Das erste
    // Produkt landet zusätzlich in product_id (Abwärtskompatibilität).
    let productIds: string[] = [];
    if (kind === "product" && providerId) {
      const raw: string[] = Array.isArray(b.product_ids)
        ? b.product_ids.filter((x: unknown) => typeof x === "string")
        : (str(b.product_id) ? [str(b.product_id)] : []);
      if (raw.length > 0) {
        const { data: own } = await admin.from("metashop_products")
          .select("id").eq("provider_id", providerId).in("id", raw.slice(0, 30));
        const ownSet = new Set((own ?? []).map((r: { id: string }) => r.id));
        productIds = raw.filter((id) => ownSet.has(id)).slice(0, 30);
      }
    }
    const primaryProductId = productIds[0] ?? (str(b.product_id) || null);

    // ── Beitrag + Medien anlegen (Service-Role → darf published setzen)
    const { data: post, error: pErr } = await admin.from("news_posts").insert({
      author_id: userId,
      author_role: kind === "product" ? "provider" : "owner",
      provider_id: providerId,
      kind,
      title,
      subtitle: str(b.subtitle),
      boat_ref: str(b.boat_ref),
      equipment_ref: str(b.equipment_ref),
      body: str(b.body),
      shop_url: str(b.shop_url),
      product_id: primaryProductId,
      status,
      moderation_reason: reason,
      author_name: authorName,
      author_avatar_url: authorAvatar,
      published_at: status === "published" ? new Date().toISOString() : null,
    }).select("id, status, moderation_reason").single();
    if (pErr) throw pErr;

    // Wartet der Beitrag auf Freigabe -> Admins per Push informieren.
    if (post.status === "pending_review") await notifyAdminsReview(post.id);

    const mediaRows = [
      ...mediaUrls.map((url, i) => ({ post_id: post.id, media_type: "image", url, sort_order: i })),
      ...videoUrls.map((url, i) => ({ post_id: post.id, media_type: "video", url, sort_order: mediaUrls.length + i })),
      ...(youtubeUrl ? [{ post_id: post.id, media_type: "youtube", url: youtubeUrl, sort_order: mediaUrls.length + videoUrls.length }] : []),
    ];
    if (mediaRows.length > 0) {
      const { error: mErr } = await admin.from("news_post_media").insert(mediaRows);
      if (mErr) console.error("media insert:", mErr.message);
    }

    // Verlinkte Produkte (Reihenfolge = Anzeigereihenfolge im Shop).
    if (productIds.length > 0) {
      const rows = productIds.map((pid, i) => ({ post_id: post.id, product_id: pid, sort_order: i }));
      const { error: ppErr } = await admin.from("news_post_products").insert(rows);
      if (ppErr) console.error("news_post_products insert:", ppErr.message);
    }

    // Vorübersetzung in alle 6 Sprachen im Hintergrund (Autor wartet nicht).
    const _bg = translateNewsAllLangs(admin, post.id, title, str(b.subtitle), str(b.body));
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(_bg); else await _bg;

    return json({ id: post.id, status: post.status, moderation_reason: post.moderation_reason });
  } catch (err) {
    console.error("create-news-post error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

// Uebersetzt einen Beitrag im HINTERGRUND in alle 6 App-Sprachen und cached die
// Ergebnisse in news_post_translations. So ist der Feed fuer jede Nutzersprache
// sofort verfuegbar (kein langsames On-the-fly-Uebersetzen), und deutsche
// Beitraege liegen ebenso in allen Landessprachen vor. Ein Claude-Call je Beitrag.
const ALL_LANGS = ["de", "en", "fr", "it", "es", "nl"];
export async function translateNewsAllLangs(
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
