// Edge Function: apple-server-notification
//
// Empfängt App Store Server Notifications V2 von Apple. Apple sendet hier
// bei Renewal, Cancellation, Refund, Failed-Payment usw. einen signed JWS.
//
// In App Store Connect → App-Information → "App Store Server Notifications"
// → URL eintragen: https://<project>.supabase.co/functions/v1/apple-server-notification
//
// Im Gegensatz zu verify-apple-receipt brauchen wir KEINE User-Auth — Apple
// ruft uns direkt auf. Die User-Zuordnung läuft über apple_original_tx_id,
// die wir bei verify-apple-receipt schon gespeichert haben.
//
// Notification-Types die wir verarbeiten:
//   DID_RENEW                → Abo wurde verlängert
//   EXPIRED                  → Abo abgelaufen, keine Verlängerung
//   GRACE_PERIOD_EXPIRED     → Grace-Period vorbei
//   DID_FAIL_TO_RENEW        → Zahlung fehlgeschlagen
//   REVOKE                   → Apple hat das Abo widerrufen (z.B. Refund + Family Cancel)
//   REFUND                   → Refund erteilt
//   CONSUMPTION_REQUEST      → wir ignorieren
//   PRICE_INCREASE           → wir ignorieren

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STATUS_MAP: Record<string, string> = {
  DID_RENEW:              "active",
  DID_RECOVER:            "active",
  SUBSCRIBED:             "active",
  GRACE_PERIOD_EXPIRED:   "expired",
  EXPIRED:                "expired",
  DID_FAIL_TO_RENEW:      "in_billing_retry",
  DID_CHANGE_RENEWAL_STATUS: null, // depends on auto_renew_status
  REVOKE:                 "revoked",
  REFUND:                 "revoked",
  PRICE_INCREASE:         null,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json();
    const signedPayload: string = body?.signedPayload;
    if (!signedPayload || typeof signedPayload !== "string") {
      return new Response("missing signedPayload", { status: 400 });
    }

    // Outer JWS dekodieren
    const outer = decodeJws(signedPayload);
    if (!outer) return new Response("bad outer JWS", { status: 400 });

    const notificationType: string = outer.notificationType ?? "";
    const subtype:          string = outer.subtype ?? "";
    const signedTransactionInfo: string | undefined = outer?.data?.signedTransactionInfo;
    const signedRenewalInfo:     string | undefined = outer?.data?.signedRenewalInfo;

    if (!signedTransactionInfo) {
      console.log("notification without signedTransactionInfo:", notificationType);
      return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });
    }

    const tx = decodeJws(signedTransactionInfo);
    const renewal = signedRenewalInfo ? decodeJws(signedRenewalInfo) : null;

    if (!tx) return new Response("bad transaction JWS", { status: 400 });

    const originalTxId = String(tx.originalTransactionId ?? "");
    const transactionId = String(tx.transactionId ?? "");
    const expiresMs     = Number(tx.expiresDate ?? 0);
    const productId     = String(tx.productId ?? "");

    if (!originalTxId) return new Response("no original tx id", { status: 400 });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Status-Mapping
    let newStatus = STATUS_MAP[notificationType] ?? null;
    // Sonderfall: DID_CHANGE_RENEWAL_STATUS — wenn auto_renew=false und subtype=AUTO_RENEW_DISABLED → cancelled
    if (notificationType === "DID_CHANGE_RENEWAL_STATUS") {
      const autoRenew = Number(renewal?.autoRenewStatus ?? 0);
      newStatus = autoRenew === 1 ? "active" : "cancelled";
    }

    // Update
    const updateFields: Record<string, unknown> = {
      last_verified_at: new Date().toISOString(),
      apple_latest_tx_id: transactionId,
      product_id: productId,
      raw_apple_payload: { tx, renewal, notificationType, subtype },
    };
    if (expiresMs)  updateFields.expires_at = new Date(expiresMs).toISOString();
    if (newStatus)  updateFields.status = newStatus;

    const { data, error } = await admin
      .from("user_subscriptions")
      .update(updateFields)
      .eq("apple_original_tx_id", originalTxId)
      .select("owner_user_id, plan, status");

    if (error) {
      console.error("DB update error:", error);
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }
    if (!data || data.length === 0) {
      console.warn(`No subscription found for original tx ${originalTxId} — notification ${notificationType}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      notificationType,
      subtype,
      originalTxId,
      newStatus,
      affected: data?.length ?? 0,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("apple-server-notification error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

/** Dekodiert ein 3-Teile-JWS und gibt den Payload als JSON-Objekt zurück. */
function decodeJws(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return null;
    const decoded = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
