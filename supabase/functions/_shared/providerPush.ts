// Web-Push an einen Provider bei neuer Anfrage/Angebotsanfrage.
// "Wenn gewuenscht" = der Provider hat im Provider-Portal Push aktiviert
// (es existiert ein web_push_subscriptions-Eintrag fuer seine user_id).
// Fehler hier duerfen die Anfrage NIE scheitern lassen (alles best-effort).
import { sendWebPush, type WebPushSub } from "./webpush.ts";

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };

export async function pushToProvider(
  admin: Db,
  providerId: string,
  msg: { title: string; body: string; url: string },
): Promise<void> {
  try {
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@skipily.app";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

    const { data: prov } = await admin.from("service_providers")
      .select("user_id").eq("id", providerId).maybeSingle();
    const uid = prov?.user_id;
    if (!uid) return; // Provider ohne verknuepftes Konto -> kein Push-Ziel

    const { data: subs } = await admin.from("web_push_subscriptions")
      .select("endpoint,p256dh,auth").eq("user_id", uid);
    if (!subs || subs.length === 0) return; // Push nicht aktiviert

    const payload = { title: msg.title, body: msg.body, url: msg.url };
    const dead: string[] = [];
    for (const s of subs as WebPushSub[]) {
      try {
        const res = await sendWebPush(s, payload, {
          publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: VAPID_SUBJECT,
        });
        if (res.gone) dead.push(s.endpoint);
      } catch (e) {
        console.error("pushToProvider send failed:", (e as Error).message);
      }
    }
    if (dead.length) {
      await admin.from("web_push_subscriptions").delete().in("endpoint", dead);
    }
  } catch (e) {
    console.error("pushToProvider failed:", (e as Error).message);
  }
}
