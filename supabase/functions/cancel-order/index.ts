// Edge Function: cancel-order
//
// Stornieren einer Bestellung NACH dem Absenden, solange noch nichts abgebucht
// und nichts versandt wurde (Status pending/confirmed, payment_status != paid).
// Beim deferred-Flow wurde nur die Karte hinterlegt -> kein Refund noetig.
// Nach dem Storno wird der Anbieter benachrichtigt (nicht mehr versenden).
//
// Body: { order_id: string }
// Auth: Bearer <user-jwt> des Kaeufers ODER eines Provider-Mitglieds.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyOrderEvent } from "../_shared/notify.ts";

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

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id fehlt" }, 400);

    const { data: order, error: oErr } = await svc
      .from("orders")
      .select("id, buyer_id, provider_id, status, payment_status")
      .eq("id", order_id)
      .maybeSingle();
    if (oErr || !order) return json({ error: "Bestellung nicht gefunden" }, 404);

    // Autorisierung: Kaeufer selbst ODER Provider-Mitglied.
    let allowed = order.buyer_id === user.id;
    if (!allowed) {
      const { data: isMember } = await userClient.rpc("provider_is_member", { pid: order.provider_id });
      allowed = isMember === true;
    }
    if (!allowed) return json({ error: "Keine Berechtigung fuer diese Bestellung" }, 403);

    // Guard: nur solange nicht bezahlt und nicht versandt.
    if ((order.payment_status ?? "").toLowerCase() === "paid") {
      return json({ error: "Bestellung ist bereits bezahlt. Bitte Widerruf/Erstattung nutzen.", code: "already_paid" }, 409);
    }
    if (order.status !== "pending" && order.status !== "confirmed") {
      return json({ error: "Bestellung kann in diesem Status nicht mehr storniert werden", code: "not_cancelable" }, 409);
    }

    const { error: updErr } = await svc
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    if (updErr) return json({ error: updErr.message }, 500);

    // Anbieter informieren (best-effort).
    await notifyOrderEvent(svc, order.id, "cancelled");

    return json({ ok: true });
  } catch (err) {
    console.error("cancel-order FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
