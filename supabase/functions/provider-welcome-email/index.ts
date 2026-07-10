// Edge Function: provider-welcome-email
//
// Verschickt die Willkommens-/AGB-Bestätigungsmail an einen ServiceProvider,
// sobald dieser die AGB akzeptiert hat (Signup oder spätere Annahme).
// Die Mail enthält den AGB-Link sowie die akzeptierte Version + den Zeitpunkt
// (rechtlicher Nachweis / Audit-Trail).
//
// Aufruf NUR serverseitig durch den DB-Trigger (Migration 105) mit
// Shared-Secret-Header — kein Client-Zugriff.
//
//   POST /functions/v1/provider-welcome-email
//   Header: x-welcome-secret: <WELCOME_EMAIL_SECRET>
//   Body:   { "provider_id": "<uuid>" }
//
// ENV (Supabase → Edge Functions → Secrets):
//   WELCOME_EMAIL_SECRET   → identisch zum Vault-Secret 'welcome_email_secret'
//   RESEND_API_KEY         → bestehender Resend-Key (noreply@skipily.app)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL     = "Skipily <noreply@skipily.app>";
const AGB_URL        = "https://skipily.app/agb";
const PORTAL_URL     = "https://provider.skipily.app/profile";

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Shared-Secret-Gate: nur der DB-Trigger darf aufrufen.
  const expected = Deno.env.get("WELCOME_EMAIL_SECRET") ?? "";
  const provided = req.headers.get("x-welcome-secret") ?? "";
  if (!expected || provided !== expected) return json({ error: "Forbidden" }, 403);

  try {
    const { provider_id } = await req.json();
    if (!provider_id) return json({ error: "provider_id fehlt" }, 400);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: p, error } = await supabase
      .from("service_providers")
      .select("id, name, email, agb_accepted_version, agb_accepted_at, welcome_email_sent_at")
      .eq("id", provider_id)
      .single();

    if (error || !p) return json({ error: "Provider nicht gefunden" }, 404);
    if (!p.email)      return json({ error: "Provider ohne E-Mail" }, 400);
    if (p.welcome_email_sent_at) return json({ status: "already_sent" }, 200); // Idempotenz

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY nicht gesetzt");

    const name    = (p.name && p.name.trim()) ? p.name.trim() : "Anbieter";
    const version = p.agb_accepted_version || "aktuelle Fassung";
    const accAt   = p.agb_accepted_at
      ? new Date(p.agb_accepted_at).toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" })
      : "—";

    const subject = "Willkommen bei Skipily – dein Anbieter-Konto ist aktiv";

    const text =
`Hallo ${name},

willkommen bei Skipily! Dein Anbieter-Konto ist eingerichtet.

Vertragsbedingungen (AGB)
Du hast unsere AGB akzeptiert.
  Version: ${version}
  Zeitpunkt: ${accAt}
Die vollständigen AGB kannst du jederzeit einsehen und speichern:
${AGB_URL}

Nächste Schritte
Vervollständige dein Profil und deine Leistungen im Anbieter-Portal:
${PORTAL_URL}

Fragen? Antworte einfach auf diese E-Mail.

Immer · Sicher · Seeklar
Dein Skipily-Team`;

    const html =
`<!doctype html><html><body style="margin:0;background:#eef2f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f2033">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#04101d;border-radius:16px 16px 0 0;padding:26px 28px;text-align:center">
      <div style="font-size:22px;font-weight:800;letter-spacing:.06em;color:#fff">SKIPILY</div>
      <div style="height:3px;width:120px;background:#f2911e;border-radius:2px;margin:10px auto 8px"></div>
      <div style="font-size:11px;letter-spacing:.28em;color:#93a8bd">IMMER · SICHER · SEEKLAR</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:28px;border:1px solid #e2e8f0;border-top:none">
      <h1 style="margin:0 0 6px;font-size:20px">Willkommen, ${esc(name)}! 👋</h1>
      <p style="margin:0 0 18px;color:#475569;line-height:1.55">Dein Anbieter-Konto bei Skipily ist eingerichtet. Schön, dass du dabei bist.</p>

      <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 18px">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:8px">Vertragsbedingungen (AGB)</div>
        <table style="width:100%;font-size:14px;color:#0f2033;border-collapse:collapse">
          <tr><td style="padding:3px 0;color:#64748b">Akzeptierte Version</td><td style="padding:3px 0;text-align:right;font-weight:600">${esc(version)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b">Zeitpunkt</td><td style="padding:3px 0;text-align:right;font-weight:600">${esc(accAt)}</td></tr>
        </table>
        <a href="${AGB_URL}" style="display:inline-block;margin-top:12px;color:#f2911e;font-weight:700;text-decoration:none;font-size:14px">AGB ansehen &amp; speichern →</a>
      </div>

      <p style="margin:0 0 8px;font-weight:700">Nächste Schritte</p>
      <p style="margin:0 0 18px;color:#475569;line-height:1.55">Vervollständige dein Profil und deine Leistungen, damit Bootseigner dich finden.</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#f2911e;color:#211200;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px">Zum Anbieter-Portal</a>

      <p style="margin:22px 0 0;color:#94a3b8;font-size:13px;line-height:1.5">Fragen? Antworte einfach auf diese E-Mail — wir helfen gern.</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin:16px 0 0">© Skipily · Service &amp; Produkte für dich und dein Boot</p>
  </div>
</body></html>`;

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [p.email], subject, text, html }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Resend-Fehler: ${JSON.stringify(data)}`);

    // Idempotenz-Flag setzen (verhindert Doppelversand bei erneutem Trigger).
    await supabase
      .from("service_providers")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", p.id);

    return json({ success: true, email_id: data.id }, 200);
  } catch (err) {
    console.error("provider-welcome-email error:", err);
    return json({ error: (err as Error)?.message ?? String(err) }, 500);
  }
});
