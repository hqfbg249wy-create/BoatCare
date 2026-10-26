// =====================================================================
// notify-admins — Web-Push an Administratoren bei Plattform-Ereignissen:
//   event = 'news_review'  (News-Beitrag wartet auf Freigabe)
//           'new_provider' (neuer Anbieter registriert/übernommen)
//           'new_user'     (neuer Nutzer registriert)
//
// Empfänger = Admins (profiles.role='admin'), die das jeweilige Ereignis in
// admin_notification_prefs aktiviert haben (Default: an). Versand über Web Push
// (VAPID), identisch zu send-announcement.
//
// Geschützt durch Shared-Secret (x-internal-secret == ADMIN_NOTIFY_SECRET);
// aufgerufen von DB-Triggern (pg_net, Migration 196) und von create-/update-
// news-post. Deployen mit --no-verify-jwt.
//
// Input (JSON): { event, post_id?, provider_id?, user_id? }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush, type WebPushSub } from "../_shared/webpush.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET           = Deno.env.get("ADMIN_NOTIFY_SECRET") ?? "";
const VAPID_PUBLIC     = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE    = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT    = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@skipily.app";

const ADMIN_URL = "https://admin.skipily.app";

type EventType = "news_review" | "new_provider" | "new_user";
const PREF_COL: Record<EventType, "news_review" | "new_provider" | "new_user"> = {
  news_review: "news_review", new_provider: "new_provider", new_user: "new_user",
};

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SECRET || req.headers.get("x-internal-secret") !== SECRET) {
      return json({ error: "forbidden" }, 403);
    }
    const b = await req.json().catch(() => ({}));
    const event = str(b.event) as EventType;
    if (!PREF_COL[event]) return json({ error: "unknown event" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Titel/Text je Ereignis (mit Kontext aus der DB).
    let title = "Skipily";
    let body = "";
    let url = ADMIN_URL;
    if (event === "news_review") {
      title = "News wartet auf Freigabe";
      const { data: p } = await admin.from("news_posts").select("title").eq("id", str(b.post_id)).maybeSingle();
      body = p?.title ? `„${p.title}" prüfen und freigeben` : "Ein News-Beitrag muss geprüft werden";
      url = `${ADMIN_URL}/?view=news`;
    } else if (event === "new_provider") {
      title = "Neuer Anbieter";
      const { data: p } = await admin.from("service_providers").select("name, city").eq("id", str(b.provider_id)).maybeSingle();
      body = p?.name ? `${p.name}${p.city ? ", " + p.city : ""} hat sich registriert` : "Ein neuer Anbieter hat sich registriert";
      url = `${ADMIN_URL}/?view=providers`;
    } else if (event === "new_user") {
      title = "Neuer Nutzer";
      const { data: u } = await admin.from("profiles").select("full_name, email").eq("id", str(b.user_id)).maybeSingle();
      const who = str(u?.full_name) || str(u?.email) || "Ein neuer Nutzer";
      body = `${who} hat sich registriert`;
      url = `${ADMIN_URL}/?view=users`;
    }

    // Empfänger: Admins mit aktiviertem Schalter (Default an).
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    const adminIds = (admins ?? []).map((r: { id: string }) => r.id);
    if (adminIds.length === 0) return json({ ok: true, recipients: 0, web: 0 });

    const { data: prefsRows } = await admin
      .from("admin_notification_prefs")
      .select("admin_id, news_review, new_provider, new_user")
      .in("admin_id", adminIds);
    const prefs = new Map<string, Record<string, boolean>>();
    for (const r of (prefsRows ?? []) as Array<Record<string, unknown>>) {
      prefs.set(String(r.admin_id), r as unknown as Record<string, boolean>);
    }
    const col = PREF_COL[event];
    const recipients = adminIds.filter((id) => {
      const p = prefs.get(id);
      return p ? p[col] !== false : true; // Default: an
    });
    if (recipients.length === 0) return json({ ok: true, recipients: 0, web: 0 });

    const result = { ok: true, recipients: recipients.length, web: 0, web_gone: 0 };
    if (VAPID_PUBLIC && VAPID_PRIVATE) {
      const { data: subs } = await admin
        .from("web_push_subscriptions")
        .select("endpoint, p256dh, auth")
        .in("user_id", recipients);
      const dead: string[] = [];
      const payload = { title, body, url, id: `admin-${event}-${Date.now()}`, accent: "#f97316" };
      for (const s of (subs || []) as WebPushSub[]) {
        try {
          const res = await sendWebPush(s, payload, {
            publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: VAPID_SUBJECT,
          });
          if (res.ok) result.web++;
          else if (res.gone) dead.push(s.endpoint);
        } catch (e) { console.error("WebPush error:", e); }
      }
      if (dead.length) {
        await admin.from("web_push_subscriptions").delete().in("endpoint", dead);
        result.web_gone = dead.length;
      }
    }
    return json(result);
  } catch (err) {
    console.error("notify-admins error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
