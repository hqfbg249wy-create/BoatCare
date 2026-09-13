// Edge Function: refund-order
//
// Widerruf / Rueckerstattung. Der Kaeufer (oder ein Provider-Mitglied/Admin)
// loest die Erstattung aus. Stripe erstattet den Kaeufer voll zurueck und holt
// per reverse_transfer den an den Provider ueberwiesenen Betrag zurueck; die
// Plattform-Provision wird ebenfalls zurueckgegeben (Vollerstattung).
//
// Body: { order_id: string, reason?: string }
// Auth: Bearer <user-jwt> (Kaeufer der Bestellung ODER Mitglied des Betriebs).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
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

    const { order_id, reason } = await req.json();
    if (!order_id) return json({ error: "order_id fehlt" }, 400);

    const { data: order, error: oErr } = await svc
      .from("orders")
      .select("id, buyer_id, provider_id, status, payment_status, total, stripe_payment_intent_id")
      .eq("id", order_id)
      .maybeSingle();
    if (oErr || !order) return json({ error: "Bestellung nicht gefunden" }, 404);

    // ── Autorisierung: Kaeufer selbst ODER Mitglied des Betriebs ──
    let allowed = order.buyer_id === user.id;
    if (!allowed) {
      const { data: isMember } = await userClient.rpc("provider_is_member", { pid: order.provider_id });
      allowed = isMember === true;
    }
    if (!allowed) return json({ error: "Keine Berechtigung fuer diese Bestellung" }, 403);

    // ── Guards ──
    if ((order.payment_status ?? "").toLowerCase() === "refunded") {
      return json({ error: "Bestellung wurde bereits erstattet", code: "already_refunded" }, 409);
    }
    if ((order.payment_status ?? "").toLowerCase() !== "paid" || !order.stripe_payment_intent_id) {
      return json({ error: "Bestellung ist nicht bezahlt, keine Erstattung moeglich", code: "not_paid" }, 409);
    }

    // ── Ermitteln, ob ein Transfer zurueckzuholen ist ──
    let reverseTransfer = false;
    try {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge as { transfer?: string | null } | null;
      reverseTransfer = !!(charge && charge.transfer);
    } catch (_e) {
      reverseTransfer = false;
    }

    // ── Refund (voll) ──
    let refundId = "";
    try {
      const refund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        reverse_transfer: reverseTransfer,
        metadata: { order_id: order.id, initiated_by: user.id },
      } as any);
      refundId = refund.id;
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Erstattung fehlgeschlagen";
      return json({ error: "Erstattung fehlgeschlagen: " + msg }, 402);
    }

    // ── Bestellung aktualisieren ──
    const nowIso = new Date().toISOString();
    const isBuyer = order.buyer_id === user.id;
    await svc.from("orders").update({
      payment_status: "refunded",
      status: "refunded",
      refunded_at: nowIso,
      refund_amount: order.total,
      stripe_refund_id: refundId,
      refund_reason: reason ?? (isBuyer ? "Widerruf durch Kaeufer" : "Erstattung durch Anbieter"),
      withdrawal_requested_at: isBuyer ? nowIso : null,
    }).eq("id", order.id);

    // Kaeufer + Anbieter benachrichtigen (best-effort).
    await notifyOrderEvent(svc, order.id, "refunded");

    return json({ ok: true, refund_id: refundId, reversed_transfer: reverseTransfer });
  } catch (err) {
    console.error("refund-order FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
