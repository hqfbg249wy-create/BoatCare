// Edge Function: request-quote
//
// Sendet eine Angebots-/Service-Anfrage an AUSGEWAEHLTE Betriebe (der Nutzer hat
// sie zuvor via find-service-providers ausgewaehlt). Je Betrieb eine
// service_inquiries-Anfrage + E-Mail. Der Anbieter kann darauf ein Angebot
// abgeben (make-offer), das der Kunde ueber Stripe bezahlt (accept-offer).
//
// Body: { provider_ids: string[], boat_id?: string, subject: string, message: string }
// Auth: Bearer <user-jwt> des Kaeufers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { emailTo } from "../_shared/notify.ts";

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

    const { provider_ids, boat_id, subject, message } = await req.json();
    const ids: string[] = Array.isArray(provider_ids)
      ? provider_ids.map((x) => String(x)).filter(Boolean) : [];
    if (ids.length === 0 || !subject || !message) {
      return json({ error: "provider_ids, subject und message erforderlich" }, 400);
    }
    if (ids.length > 500) return json({ error: "Zu viele Betriebe auf einmal (max 500)" }, 400);

    let safeBoatId: string | null = null;
    if (boat_id) {
      const { data: boat } = await svc
        .from("boats").select("id, owner_id").eq("id", boat_id).maybeSingle();
      if (boat && boat.owner_id === user.id) safeBoatId = boat.id;
    }

    const { data: providers } = await svc
      .from("service_providers").select("id, name, email").in("id", ids);

    const buyerName = (await svc.from("profiles").select("full_name").eq("id", user.id).maybeSingle())
      .data?.full_name ?? "";

    const subj = String(subject).slice(0, 200);
    const msg = String(message).slice(0, 4000);

    let count = 0;
    for (const p of providers || []) {
      try {
        await svc.from("service_inquiries").insert({
          owner_id: user.id,
          provider_id: p.id,
          boat_id: safeBoatId,
          subject: subj,
          message: msg,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        count++;

        // Zusaetzlich in Nachrichten spiegeln, damit der Anbieter die Anfrage
        // auch im gewohnten Nachrichten-Bereich (mit Badge) sieht.
        try {
          const { data: convRows } = await svc.from("conversations")
            .select("id").eq("user_id", user.id).eq("provider_id", p.id).limit(1);
          let convId = convRows?.[0]?.id as string | undefined;
          if (!convId) {
            const { data: newConv } = await svc.from("conversations")
              .insert({ user_id: user.id, provider_id: p.id }).select("id").single();
            convId = newConv?.id;
          }
          if (convId) {
            await svc.from("messages").insert({
              conversation_id: convId,
              sender_id: user.id,
              sender_type: "user",
              content: subj + "\n\n" + msg,
            });
          }
        } catch (mErr) {
          console.error("mirror to conversation failed for", p.id, (mErr as Error).message);
        }
        if (p.email) {
          await emailTo(
            p.email,
            subj + (buyerName ? " von " + buyerName : ""),
            `${msg}\n\nBitte antworte direkt auf diese Anfrage in deinem Anbieter-Portal ` +
              `(Bereich Anfragen) und gib bei Bedarf ein Angebot mit Preis ab.\n\nDein Skipily-Team`,
          );
        }
      } catch (e) {
        console.error("request-quote insert failed for", p.id, (e as Error).message);
      }
    }

    return json({ ok: true, count });
  } catch (err) {
    console.error("request-quote FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
