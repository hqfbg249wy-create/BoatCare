// Edge Function: send-push
//
// Sendet APNs-Push-Notifications an die Geraete eines oder mehrerer User.
// Wird INTERN von anderen Functions/Crons aufgerufen (notify-message,
// push-maintenance-due) — NICHT direkt vom Client. Absicherung: der Aufrufer
// muss den Service-Role-Key als Bearer mitschicken.
//
// Aufruf: POST {
//   user_id?: string, user_ids?: string[],   // Empfaenger (mind. einer)
//   title: string, body: string,
//   data?: Record<string, string>            // landet in aps.payload (Deep-Link)
// }
//
// Benoetigte Secrets (supabase secrets set ...):
//   APNS_KEY_ID       - 10-stellige Key-ID des APNs-Auth-Keys
//   APNS_TEAM_ID      - Apple Team-ID
//   APNS_PRIVATE_KEY  - Inhalt der .p8-Datei (PEM inkl. BEGIN/END-Zeilen)
//   APNS_TOPIC        - Bundle-ID (Default: Boating.Skipily)
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY werden von der Plattform gesetzt.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_TOPIC = Deno.env.get("APNS_TOPIC") ?? "Boating.Skipily";

const HOST_PROD = "api.push.apple.com";
const HOST_SANDBOX = "api.sandbox.push.apple.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── APNs-JWT (ES256) ────────────────────────────────────────────────────────
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

async function importP8(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
}

async function makeJWT(key: CryptoKey): Promise<string> {
  const header = b64urlStr(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const payload = b64urlStr(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  // WebCrypto liefert bei ECDSA die rohe r||s-Signatur = JOSE-Format fuer ES256.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

interface ApnsResult { status: number; reason?: string; }

async function apnsSend(host: string, token: string, jwt: string, payload: unknown): Promise<ApnsResult> {
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 200) { await res.text().catch(() => {}); return { status: 200 }; }
  let reason: string | undefined;
  try { reason = (await res.json())?.reason; } catch { /* leer bei 200 */ }
  return { status: res.status, reason };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Nur intern: gemeinsames Secret erforderlich (unabhaengig vom Supabase-
  // Key-System). Aufrufer (notify-message, Cron) senden x-internal-secret.
  const internal = Deno.env.get("PUSH_INTERNAL_SECRET") ?? "";
  if (!internal || req.headers.get("x-internal-secret") !== internal) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    return json({ error: "APNs-Secrets nicht gesetzt" }, 500);
  }

  try {
    const { user_id, user_ids, title, body, data } = await req.json();
    const ids: string[] = Array.isArray(user_ids)
      ? user_ids
      : (typeof user_id === "string" ? [user_id] : []);
    if (ids.length === 0) return json({ error: "user_id/user_ids fehlt" }, 400);
    if (!title || !body) return json({ error: "title/body fehlt" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: tokens, error } = await supabase
      .from("device_tokens")
      .select("token, environment")
      .in("user_id", ids);
    if (error) return json({ error: error.message }, 500);
    if (!tokens || tokens.length === 0) return json({ status: "no_devices", sent: 0 });

    const key = await importP8(APNS_PRIVATE_KEY);
    const jwt = await makeJWT(key);

    const apsPayload = {
      aps: { alert: { title, body }, sound: "default" },
      ...(data && typeof data === "object" ? data : {}),
    };

    let sent = 0;
    const dead: string[] = [];

    for (const row of tokens) {
      const primary = row.environment === "sandbox" ? HOST_SANDBOX : HOST_PROD;
      const secondary = primary === HOST_PROD ? HOST_SANDBOX : HOST_PROD;

      let r = await apnsSend(primary, row.token, jwt, apsPayload);
      // Falsche Umgebung? APNs meldet BadDeviceToken -> anderen Host probieren.
      if (r.status === 400 && r.reason === "BadDeviceToken") {
        r = await apnsSend(secondary, row.token, jwt, apsPayload);
      }
      if (r.status === 200) {
        sent++;
      } else if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") {
        dead.push(row.token); // Token tot -> aufraeumen
      } else {
        console.warn(`APNs ${row.token.slice(0, 8)}…: ${r.status} ${r.reason ?? ""}`);
      }
    }

    if (dead.length > 0) {
      await supabase.from("device_tokens").delete().in("token", dead);
    }

    return json({ status: "ok", sent, cleaned: dead.length, devices: tokens.length });
  } catch (err) {
    console.error("send-push error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
