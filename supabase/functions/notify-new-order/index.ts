// Edge Function: notify-new-order
//
// Wird per DB-Trigger (AFTER INSERT ON orders, via pg_net) aufgerufen und
// verschickt die Neue-Bestellung-Benachrichtigungen (Anbieter-Mail mit
// Bestelldetails + Kaeufer-Bestellbestaetigung). Shopify/WooCommerce-Standard.
//
// Auth: interner Shared-Secret-Header (kein User-JWT). Deploy mit
//   --no-verify-jwt, damit der Trigger sie ohne User-Token aufrufen kann.
//
// Body: { order_id: string }
// Header: x-internal-secret: <ORDER_NOTIFY_SECRET>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyNewOrder } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const secret = Deno.env.get("ORDER_NOTIFY_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Interner Aufruf: Shared-Secret pruefen.
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id fehlt" }, 400);

    const svc = createClient(supabaseUrl, serviceKey);
    await notifyNewOrder(svc, order_id);
    return json({ ok: true });
  } catch (err) {
    console.error("notify-new-order FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
