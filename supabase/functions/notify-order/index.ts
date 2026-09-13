// Edge Function: notify-order
//
// Verschickt Bestell-Benachrichtigungen fuer Uebergaenge, die das Provider-
// Portal direkt in der DB setzt (v.a. 'confirmed'). Fuer 'shipped'/'refunded'
// benachrichtigen die jeweiligen Functions (confirm-shipment/refund-order)
// bereits selbst.
//
// Body: { order_id: string, event: "confirmed" }
// Auth: Bearer <user-jwt> eines Mitglieds/Owners des Betriebs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyOrderEvent, type OrderEvent } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ALLOWED: OrderEvent[] = ["confirmed", "shipped", "refunded"];

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

    const { order_id, event } = await req.json();
    if (!order_id || !ALLOWED.includes(event)) {
      return json({ error: "order_id und gueltiges event erforderlich" }, 400);
    }

    const { data: order } = await svc
      .from("orders").select("provider_id").eq("id", order_id).maybeSingle();
    if (!order) return json({ error: "Bestellung nicht gefunden" }, 404);

    const { data: isMember } = await userClient.rpc("provider_is_member", { pid: order.provider_id });
    if (isMember !== true) return json({ error: "Keine Berechtigung" }, 403);

    await notifyOrderEvent(svc, order_id, event as OrderEvent);
    return json({ ok: true });
  } catch (err) {
    console.error("notify-order FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
