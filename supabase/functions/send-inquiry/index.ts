// send-inquiry — Skipily Service-Anfragen
// Wird aufgerufen wenn der Eigner eine Anfrage absendet (status → 'sent').
// Sendet eine E-Mail-Benachrichtigung an den Service-Provider.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "noreply@skipily.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { inquiry_id } = await req.json();
    if (!inquiry_id) {
      return new Response(JSON.stringify({ error: "inquiry_id fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Anfrage laden inkl. Provider und Eigner-Profil
    const { data: inquiry, error: inqErr } = await supabase
      .from("service_inquiries")
      .select(`
        *,
        provider:service_providers(id, name, email),
        boat:boats(id, name),
        owner:profiles(id, full_name, email)
      `)
      .eq("id", inquiry_id)
      .single();

    if (inqErr || !inquiry) {
      return new Response(JSON.stringify({ error: "Anfrage nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nur bei Status 'sent' versenden
    if (inquiry.status !== "sent") {
      return new Response(JSON.stringify({ skipped: true, reason: "Status ist nicht 'sent'" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const providerEmail = inquiry.provider?.email;
    if (!providerEmail) {
      return new Response(JSON.stringify({ skipped: true, reason: "Provider hat keine E-Mail-Adresse" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerName  = inquiry.owner?.full_name || "Ein Bootseigner";
    const ownerEmail = inquiry.owner?.email || "";
    const boatInfo   = inquiry.boat?.name ? `\nBoot: ${inquiry.boat.name}` : "";
    const notesInfo  = inquiry.owner_notes ? `\n\n--- Hinweis ---\n${inquiry.owner_notes}` : "";

    const subject = `Neue Anfrage via Skipily: ${inquiry.subject}`;
    const textBody = `Hallo ${inquiry.provider?.name},

Sie haben eine neue Anfrage über die Skipily-Plattform erhalten.

Von: ${ownerName} (${ownerEmail})${boatInfo}
Betreff: ${inquiry.subject}
Datum: ${new Date(inquiry.sent_at || inquiry.updated_at).toLocaleString("de-DE")}

──────────────────────────────
${inquiry.message}${notesInfo}
──────────────────────────────

Sie können direkt auf diese E-Mail antworten, um mit dem Bootseigner in Kontakt zu treten.

Freundliche Grüße
Das Skipily-Team

──────────────────────────────
Diese Nachricht wurde automatisch über app.skipily.app versendet.
`;

    const htmlBody = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f1f5f9;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 28px 24px">
      <img src="https://app.skipily.app/favicon-32.png" alt="Skipily" style="width:36px;height:36px;border-radius:8px;margin-bottom:10px;display:block">
      <h1 style="color:white;margin:0;font-size:1.3rem">Neue Anfrage über Skipily</h1>
      <p style="color:#bfdbfe;margin:6px 0 0;font-size:0.9rem">Sie haben eine neue Kundenanfrage erhalten</p>
    </div>
    <div style="padding:24px 28px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:0.9rem">
        <tr><td style="padding:6px 0;color:#64748b;width:90px">Von</td><td style="padding:6px 0;font-weight:600">${ownerName}</td></tr>
        ${ownerEmail ? `<tr><td style="padding:6px 0;color:#64748b">E-Mail</td><td style="padding:6px 0"><a href="mailto:${ownerEmail}" style="color:#3b82f6">${ownerEmail}</a></td></tr>` : ""}
        ${inquiry.boat?.name ? `<tr><td style="padding:6px 0;color:#64748b">Boot</td><td style="padding:6px 0">${inquiry.boat.name}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#64748b">Betreff</td><td style="padding:6px 0;font-weight:600">${inquiry.subject}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Datum</td><td style="padding:6px 0">${new Date(inquiry.sent_at || inquiry.updated_at).toLocaleString("de-DE")}</td></tr>
      </table>

      <div style="background:#f8fafc;border-radius:10px;padding:16px;border-left:4px solid #3b82f6;margin-bottom:20px">
        <p style="margin:0;font-size:0.95rem;line-height:1.7;color:#334155;white-space:pre-wrap">${inquiry.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </div>

      <a href="mailto:${ownerEmail}?subject=Re: ${encodeURIComponent(inquiry.subject)}" style="display:inline-block;background:#3b82f6;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:0.95rem">
        Jetzt antworten
      </a>
    </div>
    <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:0.78rem;color:#94a3b8">Diese E-Mail wurde automatisch über <a href="https://app.skipily.app" style="color:#3b82f6">app.skipily.app</a> versendet.</p>
    </div>
  </div>
</body>
</html>
`;

    // E-Mail via Resend senden
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY nicht gesetzt");

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [providerEmail],
        reply_to: ownerEmail || undefined,
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    const resData = await res.json();
    if (!res.ok) throw new Error(`Resend-Fehler: ${JSON.stringify(resData)}`);

    return new Response(JSON.stringify({ success: true, email_id: resData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-inquiry error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
