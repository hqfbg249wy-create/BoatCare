// resend-webhook — empfaengt Zustell-Events von Resend (Svix-signiert) und
// traegt den echten Status (delivered/bounced/complained/opened/...) in die
// Tabelle platform_events nach, gematcht ueber die Resend-Message-ID.
//
// Einrichtung: In Resend unter Webhooks eine Endpoint-URL auf diese Function
// setzen und das Signing-Secret als RESEND_WEBHOOK_SECRET in den Edge-Env
// hinterlegen. Ohne gesetztes Secret wird die Signatur NICHT geprueft
// (nur fuer lokale Tests).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resend-Event -> unser Status im Log.
const STATUS_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "queued",
  "email.opened": "opened",
  "email.clicked": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

// Rangfolge: ein spaeteres, "schwaecheres" Event darf ein finales nicht
// ueberschreiben (z. B. soll 'opened' nicht 'bounced' verdraengen).
const RANK: Record<string, number> = {
  triggered: 0, queued: 1, sent: 2, delivered: 3, opened: 4,
  bounced: 5, complained: 6, failed: 5,
};

async function verifySvix(secret: string, id: string, ts: string, body: string, sigHeader: string): Promise<boolean> {
  try {
    const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signed = `${id}.${ts}.${body}`;
    const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signed));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    // Header-Format: "v1,<sig> v1,<sig2> ..."
    return sigHeader.split(" ").some((part) => {
      const [, sig] = part.split(",");
      return sig === expected;
    });
  } catch (e) {
    console.error("verifySvix error:", (e as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const body = await req.text();
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (secret) {
    const id = req.headers.get("svix-id") ?? "";
    const ts = req.headers.get("svix-timestamp") ?? "";
    const sig = req.headers.get("svix-signature") ?? "";
    const ok = await verifySvix(secret, id, ts, body, sig);
    if (!ok) return new Response("invalid signature", { status: 401 });
  }

  let payload: { type?: string; data?: { email_id?: string; to?: string[] } };
  try { payload = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }

  const type = payload.type ?? "";
  const newStatus = STATUS_MAP[type];
  const messageId = payload.data?.email_id;
  if (!newStatus || !messageId) {
    // Unbekanntes Event oder ohne Message-ID: bestaetigen, nichts tun.
    return new Response(JSON.stringify({ ignored: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Aktuelle Zeile(n) mit dieser Message-ID holen und nur "hochstufen".
  const { data: rows } = await supabase
    .from("platform_events")
    .select("id, status")
    .eq("provider_message_id", messageId);

  for (const row of rows ?? []) {
    const cur = RANK[row.status] ?? 0;
    const next = RANK[newStatus] ?? 0;
    if (next < cur) continue; // schwaecheres Event nicht ueberschreiben
    await supabase
      .from("platform_events")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return new Response(JSON.stringify({ ok: true, status: newStatus, matched: (rows ?? []).length }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
