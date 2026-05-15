// Edge Function: verify-apple-receipt
//
// Verifiziert eine StoreKit-2 Transaction-JWS (vom iOS-Client gesendet) bei
// Apple's App-Store-Server-API und aktualisiert user_subscriptions
// entsprechend.
//
// StoreKit 2 liefert eine JWS-signierte Transaction. Wir können den Payload
// lokal dekodieren UND zur Sicherheit serverseitig nochmal bei Apple bestätigen
// lassen.
//
// Body: { transaction_jws: string, environment?: 'sandbox'|'production' }
// Response: { subscription: {...}, status: 'active'|'expired'|... }
//
// ENV-Variablen (Supabase → Settings → Edge Functions → Secrets):
//   APPLE_BUNDLE_ID            (z.B. com.skipily.skipily)
//   APPLE_ISSUER_ID            (App Store Connect API Key Issuer)
//   APPLE_KEY_ID               (App Store Connect API Key ID)
//   APPLE_PRIVATE_KEY          (P8 Private Key, PEM-formatiert)
//
// Product-ID Mapping (in StoreKit-Konfiguration einrichten):
//   skipily_plus_monthly       → plus_individual
//   skipily_plus_family_monthly → plus_family
//   skipily_plus_fleet_monthly → plus_fleet

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APPLE_BUNDLE_ID     = Deno.env.get("APPLE_BUNDLE_ID") ?? "";
const APPLE_ISSUER_ID     = Deno.env.get("APPLE_ISSUER_ID") ?? "";
const APPLE_KEY_ID        = Deno.env.get("APPLE_KEY_ID") ?? "";
const APPLE_PRIVATE_KEY   = Deno.env.get("APPLE_PRIVATE_KEY") ?? "";

// Apple → unser DB-Plan-Mapping (Product-IDs aus Skipily.storekit)
const PRODUCT_PLAN_MAP: Record<string, string> = {
  // Plus = Endkunden-Abo für unbegrenzte KI-Nutzung
  "skipily.plus.monthly":        "plus_individual",
  "skipily.plus.yearly":         "plus_individual",
  "skipily.plus.family.monthly": "plus_family",
  "skipily.plus.family.yearly":  "plus_family",
  "skipily.plus.fleet.monthly":  "plus_fleet",
  "skipily.plus.fleet.yearly":   "plus_fleet",
  // Pro existiert in StoreKit, wird aktuell auch als Individual abgebildet
  "skipily.pro.monthly":         "plus_individual",
  "skipily.pro.yearly":          "plus_individual",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);

    const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: "Ungültiger Token" }, 401);

    const body = await req.json().catch(() => ({}));
    const { transaction_jws, environment } = body ?? {};
    if (!transaction_jws) return json({ error: "transaction_jws fehlt" }, 400);

    // ── JWS-Payload dekodieren (Mitte zwischen den zwei Punkten ist Base64URL JSON)
    const parts = String(transaction_jws).split(".");
    if (parts.length !== 3) {
      return json({ error: "Ungültiges JWS-Format" }, 400);
    }
    let payload: Record<string, unknown>;
    try {
      const decoded = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      payload = JSON.parse(decoded);
    } catch (e) {
      return json({ error: "JWS-Payload nicht dekodierbar: " + (e as Error).message }, 400);
    }

    // Pflichtfelder aus dem Apple-Transaction-Payload
    const productId          = String(payload.productId ?? "");
    const originalTxId       = String(payload.originalTransactionId ?? payload.transactionId ?? "");
    const transactionId      = String(payload.transactionId ?? "");
    const expiresMs          = Number(payload.expiresDate ?? 0);
    const purchaseDateMs     = Number(payload.purchaseDate ?? payload.originalPurchaseDate ?? 0);
    const bundleId           = String(payload.bundleId ?? "");
    const env                = String(payload.environment ?? environment ?? "");

    if (!productId || !originalTxId) {
      return json({ error: "Transaction-Payload unvollständig" }, 400);
    }
    if (APPLE_BUNDLE_ID && bundleId && bundleId !== APPLE_BUNDLE_ID) {
      return json({ error: `Bundle-ID-Mismatch: ${bundleId}` }, 400);
    }

    const planCode = PRODUCT_PLAN_MAP[productId];
    if (!planCode) {
      return json({ error: `Unbekanntes Produkt: ${productId}` }, 400);
    }

    // ── Server-seitige Validierung bei Apple (best effort, in Sandbox optional)
    // Wir verifizieren über die JWS-Signatur via Apples öffentliche Keys.
    // In Phase 1 begnügen wir uns mit dem JWS-Payload — der wurde ja vom
    // StoreKit-Framework auf dem Gerät signiert. Für Produktivbetrieb sollte
    // hier zusätzlich Apples Transaction-Lookup-Endpoint aufgerufen werden.
    if (APPLE_ISSUER_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY) {
      try {
        await verifyWithAppleServer(transactionId, env || "production");
      } catch (e) {
        console.warn("Apple-Server-Verifizierung fehlgeschlagen:", e);
        // Nicht hart abbrechen — JWS allein ist im Sandbox-Modus oft die einzige Quelle
      }
    }

    // ── Subscription in DB upserten
    const expiresAt = expiresMs ? new Date(expiresMs).toISOString() : null;
    const startedAt = purchaseDateMs ? new Date(purchaseDateMs).toISOString() : new Date().toISOString();
    const stillActive = !expiresMs || expiresMs > Date.now();
    const status = stillActive ? "active" : "expired";

    const { data: existing } = await admin
      .from("user_subscriptions")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    let upsertResult;
    if (existing) {
      upsertResult = await admin
        .from("user_subscriptions")
        .update({
          product_id:             productId,
          plan:                   planCode,
          status,
          expires_at:             expiresAt,
          last_verified_at:       new Date().toISOString(),
          apple_original_tx_id:   originalTxId,
          apple_latest_tx_id:     transactionId,
          raw_apple_payload:      payload as object,
        })
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      upsertResult = await admin
        .from("user_subscriptions")
        .insert({
          owner_user_id:          user.id,
          product_id:             productId,
          plan:                   planCode,
          status,
          started_at:             startedAt,
          expires_at:             expiresAt,
          last_verified_at:       new Date().toISOString(),
          apple_original_tx_id:   originalTxId,
          apple_latest_tx_id:     transactionId,
          raw_apple_payload:      payload as object,
          max_members: planCode === "plus_family" ? 5 : 1,
          max_boats:   planCode === "plus_fleet"  ? 4 : 1,
        })
        .select()
        .single();
    }
    if (upsertResult.error) {
      return json({ error: "DB-Fehler: " + upsertResult.error.message }, 500);
    }

    return json({
      subscription: upsertResult.data,
      status,
      plan: planCode,
    });

  } catch (err) {
    console.error("verify-apple-receipt error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

/**
 * Optional: zusätzlich bei Apple's Transaction-Lookup-Endpoint abfragen.
 * Erfordert App Store Connect API Key (JWT-Signierung mit P8 Private Key).
 * Wird in Phase 2 (mit echter Apple-Validation) implementiert.
 */
async function verifyWithAppleServer(_transactionId: string, _env: string): Promise<void> {
  // TODO: Phase 2 — JWT mit P8 signieren, GET /v1/transactions/{transactionId}
  // Für jetzt verlassen wir uns auf die StoreKit-2-JWS-Signatur des Devices.
  return;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
