// Edge Function: send-announcement
//
// Admin verschickt eine Plattform-Ankuendigung an eine Zielgruppe
// (all | owners | providers): legt den announcements-Datensatz an und stellt
// optional Push zu — APNs (iOS, via send-push) und Web Push (RFC 8291).
//
// POST (Bearer = Admin-JWT) {
//   title, body, accent?, category?, audience?, action_url?, send_push?
// }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { sendWebPush, type WebPushSub } from "../_shared/webpush.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@skipily.app";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!accessToken) return json({ error: "Nicht authentifiziert" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Aufrufer muss Admin sein.
    const { data: { user }, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !user) return json({ error: "User-Verifizierung fehlgeschlagen" }, 401);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (prof?.role !== "admin") return json({ error: "Keine Berechtigung" }, 403);

    // 2) Eingaben
    const b = await req.json().catch(() => ({}));
    const title = String(b.title || "").trim();
    const bodyText = String(b.body || "").trim();
    if (!title || !bodyText) return json({ error: "title und body erforderlich" }, 400);
    const audience = ["all", "owners", "providers"].includes(b.audience) ? b.audience : "all";
    const accent = String(b.accent || "blue").slice(0, 16);
    const category = b.category ? String(b.category).slice(0, 32) : null;
    const actionUrl = b.action_url ? String(b.action_url).slice(0, 2000) : null;
    const sendPush = b.send_push !== false; // default: ja

    // 3) In alle sechs Sprachen uebersetzen (title + body) via translate-text.
    //    So kann die Push-Nachricht je Geraet in der passenden Sprache zugestellt
    //    und die Liste im Client lokalisiert angezeigt werden.
    const LANGS = ["de", "en", "es", "fr", "it", "nl"];
    const translations: Record<string, { title: string; body: string }> = {};
    await Promise.all(LANGS.map(async (lang) => {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/translate-text`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ texts: [{ id: "title", text: title }, { id: "body", text: bodyText }], target_lang: lang }),
        });
        const jr = await r.json().catch(() => ({}));
        const tr = jr?.translations || {};
        translations[lang] = {
          title: (tr.title && String(tr.title)) || title,
          body: (tr.body && String(tr.body)) || bodyText,
        };
      } catch (e) {
        console.error("translate-text", lang, e);
        translations[lang] = { title, body: bodyText };
      }
    }));

    // 3b) Ankuendigung anlegen (inkl. Uebersetzungen)
    const { data: ann, error: insErr } = await admin.from("announcements").insert({
      title, body: bodyText, accent, category, audience,
      action_url: actionUrl, created_by: user.id, translations,
    }).select("id").single();
    if (insErr) throw insErr;
    const announcementId = ann.id as string;

    // 4) Empfaenger aufloesen
    const { data: recips, error: recErr } = await admin.rpc("announcement_recipient_ids", { p_audience: audience });
    if (recErr) throw recErr;
    const userIds = (recips || []).map((r: { id?: string } | string) =>
      typeof r === "string" ? r : r.id).filter(Boolean) as string[];

    const result = { id: announcementId, recipients: userIds.length, apns: 0, web: 0, web_gone: 0 };

    if (sendPush && userIds.length) {
      const data = { type: "announcement", id: announcementId, url: actionUrl || "", accent };

      // 4a) APNs ueber bestehende send-push-Function (Service-Role-Bearer).
      //     localized -> send-push waehlt je Geraet (device_tokens.locale) die Sprache.
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: userIds, title, body: bodyText, data, localized: translations }),
        });
        const jr = await r.json().catch(() => ({}));
        result.apns = Number(jr?.sent ?? jr?.delivered ?? 0) || 0;
      } catch (e) {
        console.error("APNs send error:", e);
      }

      // 4b) Web Push an alle Abos der Empfaenger.
      if (VAPID_PUBLIC && VAPID_PRIVATE) {
        const { data: subs } = await admin
          .from("web_push_subscriptions")
          .select("endpoint, p256dh, auth, locale")
          .in("user_id", userIds);
        const dead: string[] = [];
        for (const s of (subs || []) as (WebPushSub & { locale?: string })[]) {
          const loc = (s.locale && translations[s.locale]) ? s.locale : null;
          const t = loc ? translations[loc] : { title, body: bodyText };
          const payload = { title: t.title, body: t.body, url: actionUrl || "", id: announcementId, accent };
          try {
            const res = await sendWebPush(s, payload, {
              publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: VAPID_SUBJECT,
            });
            if (res.ok) result.web++;
            else if (res.gone) dead.push(s.endpoint);
          } catch (e) {
            console.error("WebPush error:", e);
          }
        }
        if (dead.length) {
          await admin.from("web_push_subscriptions").delete().in("endpoint", dead);
          result.web_gone = dead.length;
        }
      }
    }

    return json({ ok: true, ...result });
  } catch (err) {
    console.error("send-announcement error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
