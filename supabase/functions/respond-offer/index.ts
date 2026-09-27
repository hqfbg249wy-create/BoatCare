// Edge Function: respond-offer
//
// Kunden-Aktionen auf ein Angebot: 'decline' (ablehnen), 'question'
// (Nachfrage/Rueckfrage an den Anbieter, z.B. zu Varianten) oder 'delete'
// (Anfrage entfernen). Annehmen laeuft ueber accept-offer.
//
// Loesch-Regel: Loeschen OHNE vorheriges Ablehnen benachrichtigt den Anbieter
// ("Angebot abgelehnt"), genau wie das Ablehnen. Wurde bereits abgelehnt, ist
// das Loeschen nur intern (keine erneute Nachricht).
//
// Body: { inquiry_id, action: 'decline' | 'question' | 'delete', text? }
// Auth: Bearer <user-jwt> des Kaeufers (Eigner der Anfrage).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { emailTo, pushToUser } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const svc = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { inquiry_id, action, text } = await req.json();
    if (!inquiry_id || !["decline", "question", "delete"].includes(action)) {
      return json({ error: "inquiry_id und action ('decline'|'question'|'delete') erforderlich" }, 400);
    }

    const { data: inq } = await svc
      .from("service_inquiries")
      .select("id, owner_id, provider_id, subject, status, offer_status, order_id")
      .eq("id", inquiry_id).maybeSingle();
    if (!inq) return json({ error: "Anfrage nicht gefunden" }, 404);
    if (inq.owner_id !== user.id) return json({ error: "Keine Berechtigung" }, 403);
    if (inq.order_id) return json({ error: "Angebot wurde bereits angenommen", code: "already_ordered" }, 409);

    const { data: buyer } = await svc.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const { data: provider } = await svc.from("service_providers").select("name, email, user_id").eq("id", inq.provider_id).maybeSingle();
    const buyerName = buyer?.full_name ?? "Ein Kunde";
    const ref = inq.subject ? `„${inq.subject}"` : "deine Anfrage";

    const notifyDeclined = async () => {
      if (provider?.email) {
        await emailTo(provider.email, "Angebot abgelehnt",
          `${buyerName} hat dein Angebot zu ${ref} abgelehnt.\n\nDein Skipily-Team`);
      }
    };

    if (action === "decline") {
      await svc.from("service_inquiries").update({ offer_status: "declined" }).eq("id", inquiry_id);
      await notifyDeclined();
      return json({ ok: true });
    }

    if (action === "delete") {
      // Loeschen OHNE vorheriges Ablehnen -> Anbieter wie bei Ablehnung
      // benachrichtigen. Nach bereits erfolgtem Ablehnen: nur intern loeschen.
      // Entwuerfe (nie gesendet) NIE melden -> der Anbieter kennt sie nicht.
      if (inq.status !== "draft" && inq.offer_status !== "declined") {
        await notifyDeclined();
      }
      await svc.from("service_inquiries").delete().eq("id", inquiry_id);
      return json({ ok: true });
    }

    // question -> Nachricht an den Anbieter (Konversation + Mail)
    const q = String(text ?? "").trim();
    if (!q) return json({ error: "Bitte eine Nachricht eingeben", code: "empty" }, 400);

    try {
      const { data: convRows } = await svc.from("conversations")
        .select("id").eq("user_id", user.id).eq("provider_id", inq.provider_id).limit(1);
      let convId = convRows?.[0]?.id as string | undefined;
      if (!convId) {
        const { data: newConv } = await svc.from("conversations")
          .insert({ user_id: user.id, provider_id: inq.provider_id }).select("id").single();
        convId = newConv?.id;
      }
      if (convId) {
        await svc.from("messages").insert({
          conversation_id: convId, sender_id: user.id, sender_type: "user",
          content: `Rueckfrage zu ${ref}:\n\n${q}`,
          // Thread an die Anfrage koppeln -> erscheint im Bestell-/Angebots-
          // ablauf (Trigger verknuepft zusaetzlich die spaetere Order).
          related_inquiry_id: inquiry_id,
        });
      }
    } catch (e) {
      console.error("respond-offer question mirror failed:", (e as Error).message);
    }

    if (provider?.email) {
      await emailTo(provider.email, "Rueckfrage zu deinem Angebot",
        `${buyerName} hat eine Rueckfrage zu ${ref}:\n\n${q}\n\n` +
          `Bitte antworte im Anbieter-Portal (Nachrichten) und passe bei Bedarf dein Angebot an.\n\nDein Skipily-Team`);
    }

    // Push an den Anbieter (falls er ein Konto + Gerät registriert hat).
    // Best-effort: ohne Geraetetoken/APNs passiert nichts.
    if (provider?.user_id) {
      await pushToUser(
        provider.user_id,
        "Neue Rueckfrage zu deinem Angebot",
        `${buyerName}: ${q.slice(0, 120)}`,
      );
    }

    return json({ ok: true });
  } catch (err) {
    console.error("respond-offer FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
