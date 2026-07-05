// Edge Function: notify-message
//
// Benachrichtigt die jeweils ANDERE Partei per E-Mail (Resend), wenn in einer
// Konversation (conversations/messages) eine neue Nachricht eingeht.
//   - Eigner schreibt (sender_type 'user')     → Provider bekommt Mail
//   - Provider schreibt (sender_type 'provider')→ Eigner bekommt Mail
//
// Aufruf: POST { message_id } aus Owner- bzw. Provider-Portal nach dem Insert.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "noreply@skipily.app";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string) {
  return (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { message_id } = await req.json();
    if (!message_id) return json({ error: "message_id fehlt" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_type, content")
      .eq("id", message_id)
      .single();
    if (msgErr || !msg) return json({ error: "Nachricht nicht gefunden" }, 404);

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, user_id, provider_id")
      .eq("id", msg.conversation_id)
      .single();
    if (!conv) return json({ error: "Konversation nicht gefunden" }, 404);

    const [{ data: provider }, { data: owner }] = await Promise.all([
      supabase.from("service_providers").select("name, email").eq("id", conv.provider_id).single(),
      supabase.from("profiles").select("full_name, email").eq("id", conv.user_id).single(),
    ]);

    // Empfänger = die andere Partei
    const ownerSent = msg.sender_type === "user";
    const toEmail = ownerSent ? provider?.email : owner?.email;
    const senderName = ownerSent
      ? (owner?.full_name || "Ein Bootseigner")
      : (provider?.name || "Ein Anbieter");
    const portalUrl = ownerSent ? "https://provider.skipily.app/" : "https://app.skipily.app/messages";
    const portalLabel = ownerSent ? "Im Provider-Portal antworten" : "In der App antworten";

    if (!toEmail) return json({ status: "no_recipient_email" });

    const subject = `Neue Nachricht von ${senderName} · Skipily`;
    const textBody =
      `Du hast eine neue Nachricht auf Skipily:\n\nVon: ${senderName}\n\n${msg.content}\n\n${portalLabel}: ${portalUrl}`;
    const htmlBody = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="background:#0b1929;color:#fff;padding:16px 20px;font-weight:700">Skipily · Neue Nachricht</div>
        <div style="padding:20px">
          <p style="margin:0 0 6px;color:#64748b;font-size:13px">Von ${esc(senderName)}</p>
          <div style="white-space:pre-wrap;font-size:15px;color:#0f172a;line-height:1.5;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">${esc(msg.content)}</div>
          <a href="${portalUrl}" style="display:inline-block;margin-top:16px;background:#f97316;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${portalLabel}</a>
        </div>
      </div></body></html>`;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "RESEND_API_KEY nicht gesetzt" }, 500);

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [toEmail], subject, text: textBody, html: htmlBody }),
    });
    const resData = await res.json();
    if (!res.ok) return json({ error: `Resend: ${JSON.stringify(resData)}` }, 502);

    return json({ status: "sent", email_id: resData.id });
  } catch (err) {
    console.error("notify-message error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
