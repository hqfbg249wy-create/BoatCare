// Edge Function: make-offer
//
// Ein Anbieter gibt auf eine Anfrage ein strukturiertes Angebot (Preis) ab.
// Der Kunde kann es danach in der App annehmen und via Stripe bezahlen
// (accept-offer -> Deferred-Order). Aufruf aus dem Anbieter-Portal.
//
// Body: { inquiry_id, amount, shipping?, currency?, description, reply? }
// Auth: Bearer <user-jwt> eines Mitglieds/Owners des Betriebs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { pushToUser, emailTo } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

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
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { inquiry_id, amount, shipping, currency, description, reply } = await req.json();
    const amt = Number(amount);
    if (!inquiry_id || !(amt > 0) || !description) {
      return json({ error: "inquiry_id, amount (>0) und description erforderlich" }, 400);
    }

    const { data: inq } = await svc
      .from("service_inquiries").select("id, provider_id, owner_id, subject")
      .eq("id", inquiry_id).maybeSingle();
    if (!inq) return json({ error: "Anfrage nicht gefunden" }, 404);

    const { data: isMember } = await userClient.rpc("provider_is_member", { pid: inq.provider_id });
    if (isMember !== true) return json({ error: "Keine Berechtigung fuer diese Anfrage" }, 403);

    const nowIso = new Date().toISOString();
    await svc.from("service_inquiries").update({
      offer_amount: amt,
      offer_shipping: Number(shipping) || 0,
      offer_currency: (currency || "EUR").toUpperCase(),
      offer_description: String(description).slice(0, 2000),
      offer_status: "offered",
      offer_created_at: nowIso,
      provider_reply: reply ? String(reply).slice(0, 2000) : null,
      status: "replied",
      replied_at: nowIso,
    }).eq("id", inquiry_id);

    // Kunde benachrichtigen (best-effort).
    const total = (amt + (Number(shipping) || 0)).toFixed(2).replace(".", ",") +
      " " + (currency || "EUR").toUpperCase();
    await pushToUser(inq.owner_id, "Neues Angebot erhalten",
      `Du hast ein Angebot ueber ${total} erhalten. Jetzt in der App ansehen und annehmen.`);
    const { data: buyer } = await svc.from("profiles").select("email, full_name").eq("id", inq.owner_id).maybeSingle();
    if (buyer?.email) {
      await emailTo(buyer.email, "Neues Angebot zu deiner Anfrage",
        `Hallo${buyer.full_name ? " " + buyer.full_name : ""},\n\n` +
          `du hast ein Angebot ueber ${total} erhalten:\n\n${description}\n\n` +
          `Oeffne die App (Bereich Anfragen), um das Angebot anzunehmen und sicher ueber Skipily zu bezahlen.\n\nDein Skipily-Team`);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("make-offer FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
