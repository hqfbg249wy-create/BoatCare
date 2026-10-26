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
import { pushToProvider } from "../_shared/providerPush.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { emailTo, emailShell } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROVIDER_PORTAL_BASE = Deno.env.get("PROVIDER_PORTAL_URL") ?? "https://provider.skipily.app";

// deno-lint-ignore no-explicit-any
type Svc = any;

// Ein Betrieb ist "plattformbereit", wenn er registriert ist (user_id) UND
// Zahlungsdaten hinterlegt hat (Stripe-Connect aktiv). Nur dann laeuft die
// Abrechnung ueber Skipily -> Onboarding-Hinweis entfaellt.
function isPlatformReady(p: { user_id?: string | null; stripe_charges_enabled?: boolean | null }): boolean {
  return !!p.user_id && p.stripe_charges_enabled === true;
}

// Persoenlichen Claim-Link holen/erzeugen (Token liegt in provider_secrets).
async function claimUrlFor(svc: Svc, providerId: string): Promise<string | null> {
  try {
    const { data: sec } = await svc.from("provider_secrets")
      .select("claim_token").eq("provider_id", providerId).maybeSingle();
    let token: string | null = sec?.claim_token ?? null;
    if (!token) {
      const { data: created } = await svc.from("provider_secrets")
        .upsert({ provider_id: providerId, claim_token: crypto.randomUUID() }, { onConflict: "provider_id" })
        .select("claim_token").single();
      token = created?.claim_token ?? null;
    }
    return token ? `${PROVIDER_PORTAL_BASE}/claim/${token}` : null;
  } catch (_e) {
    return null;
  }
}

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

    const { provider_ids, boat_id, subject, message, request_type } = await req.json();
    const ids: string[] = Array.isArray(provider_ids)
      ? provider_ids.map((x) => String(x)).filter(Boolean) : [];
    if (ids.length === 0 || !subject || !message) {
      return json({ error: "provider_ids, subject und message erforderlich" }, 400);
    }
    // 'quote' = Bitte um ein (bepreistes) Angebot, 'inquiry' = unverbindliche Anfrage.
    const reqType = request_type === "inquiry" ? "inquiry" : "quote";
    const isQuote = reqType === "quote";
    if (ids.length > 500) return json({ error: "Zu viele Betriebe auf einmal (max 500)" }, 400);

    let safeBoatId: string | null = null;
    if (boat_id) {
      const { data: boat } = await svc
        .from("boats").select("id, owner_id").eq("id", boat_id).maybeSingle();
      if (boat && boat.owner_id === user.id) safeBoatId = boat.id;
    }

    const { data: providers } = await svc
      .from("service_providers")
      .select("id, name, email, user_id, stripe_charges_enabled").in("id", ids);

    const buyerName = (await svc.from("profiles").select("full_name").eq("id", user.id).maybeSingle())
      .data?.full_name ?? "";

    const subj = String(subject).slice(0, 200);
    const msg = String(message).slice(0, 4000);

    let count = 0;
    for (const p of providers || []) {
      try {
        const { data: insIq } = await svc.from("service_inquiries").insert({
          owner_id: user.id,
          provider_id: p.id,
          boat_id: safeBoatId,
          subject: subj,
          message: msg,
          request_type: reqType,
          status: "sent",
          sent_at: new Date().toISOString(),
        }).select("id").single();
        const inqId = insIq?.id;
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
          const ready = isPlatformReady(p);
          const kind = isQuote ? "eine Bitte um ein Angebot" : "eine unverbindliche Anfrage";
          const claimUrl = ready ? null : await claimUrlFor(svc, p.id);
          // Direkt zur konkreten Anfrage im Portal (Deep-Link), sonst Claim-Link.
          const ctaUrl = ready
            ? `${PROVIDER_PORTAL_BASE}/inquiries${inqId ? `?id=${inqId}` : ""}`
            : (claimUrl ?? PROVIDER_PORTAL_BASE);
          const ctaLabel = ready ? "Im Anbieter-Portal antworten" : "Jetzt registrieren & antworten";

          const intro = `${buyerName ? buyerName + " " : "Ein Kunde "}sendet dir ueber Skipily ${kind}` +
            `${safeBoatId ? " (mit Bootsbezug)" : ""}.`;
          const actionText = ready
            ? (isQuote
              ? `Bitte antworte im Anbieter-Portal (Bereich Anfragen) und gib ein Angebot mit Preis ab. ` +
                `Nimmt der Kunde an, wird die Zahlung sicher ueber Skipily (Stripe) abgewickelt.`
              : `Bitte antworte im Anbieter-Portal (Bereich Anfragen).`)
            : `Diese Anfrage kommt ueber die Skipily-App. Wenn du teilnehmen moechtest, ` +
              `registriere dich ueber deinen persoenlichen Link und hinterlege in den ` +
              `Stammdaten deine Unternehmens- und Zahlungsdaten. Danach kannst du direkt ` +
              `ein Angebot abgeben, das der Kunde sicher ueber Skipily (Stripe) bezahlt.`;

          const bodyText = `${intro}\n\nBetreff: ${subj}\n\n${msg}\n\n${actionText}` +
            (ready ? "" : `\n\nDein persoenlicher Link:\n${ctaUrl}`);
          await emailTo(
            p.email,
            (isQuote ? "Angebotsanfrage: " : "Anfrage: ") + subj + (buyerName ? " von " + buyerName : ""),
            `${bodyText}\n\nDein Skipily-Team`,
            emailShell({
              heading: isQuote ? "Neue Angebotsanfrage" : "Neue Anfrage",
              bodyText,
              ctaLabel,
              ctaUrl,
              footnote: ready ? undefined
                : "Du erhaeltst diese Nachricht, weil ein Skipily-Nutzer einen Betrieb wie deinen sucht.",
            }),
          );
        }
        // Zusaetzlich Web-Push, falls der Provider Push aktiviert hat.
        if (inqId) {
          await pushToProvider(svc, p.id, {
            title: isQuote ? "Neue Angebotsanfrage" : "Neue Anfrage",
            body: `${buyerName ? buyerName + ": " : ""}${subj}`.slice(0, 140),
            url: `${PROVIDER_PORTAL_BASE}/inquiries?id=${inqId}`,
          });
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
