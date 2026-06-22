// Orders REST API — für Provider-Integrationen (Shopify, Odoo, ERP)
//
// Ermöglicht Service-Betrieben, ihre Bestellungen per API abzurufen und
// Fulfillment (Status + Tracking) zurückzuschreiben — ohne ein zweites
// Tool manuell pflegen zu müssen.
//
// Auth: Header  x-api-key: <provider api_key>   (nur Pro/Enterprise/Grant)
//       Jeder Provider sieht AUSSCHLIESSLICH seine eigenen Bestellungen.
//
// Endpoints:
//   GET /orders-api                         → Liste (paginiert, filterbar)
//   GET /orders-api?id=<uuid>               → einzelne Bestellung
//   GET /orders-api?order_number=<nr>       → einzelne Bestellung per Nummer
//   PUT /orders-api?id=<uuid>               → Status/Tracking aktualisieren
//
// Query-Parameter (GET Liste):
//   status          - pending|confirmed|shipped|delivered|cancelled
//   payment_status  - pending|paid|refunded|failed
//   updated_since   - ISO-Timestamp → nur seither geänderte (Inkrement-Sync!)
//   created_since   - ISO-Timestamp → nur seither erstellte
//   limit           - Seitengröße (default 50, max 200)
//   offset          - Pagination-Offset
//   sort            - created_at|updated_at|total (default created_at)
//   order           - asc|desc (default desc)
//
// PUT-Body (Fulfillment zurückschreiben):
//   { "status": "shipped", "tracking_number": "...", "tracking_url": "..." }
//   Erlaubte Status: confirmed|shipped|delivered|cancelled
//
// Antwort enthält pro Bestellung die Positionen (items[]).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORDER_WEBHOOKS_URL = `${supabaseUrl}/functions/v1/order-webhooks`;

const ORDER_SELECT = `
  id, order_number, status, payment_status,
  subtotal, shipping_cost, commission_rate, commission_amount, total, currency,
  shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_country,
  tracking_number, tracking_url, buyer_note, provider_note,
  created_at, updated_at,
  order_items ( id, product_id, product_name, product_sku, product_manufacturer, quantity, unit_price, total )
`;

const ALLOWED_STATUS = ["confirmed", "shipped", "delivered", "cancelled"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const url = new URL(req.url);

  try {
    // ── Auth: API-Key → Provider (Pro+) ──
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return json({ error: "API key required (header x-api-key)" }, 401);
    }

    // API-Key liegt in der streng abgesicherten Tabelle provider_secrets
    // (nicht mehr in service_providers — sonst öffentlich lesbar).
    const { data: secret, error: secretErr } = await supabase
      .from("provider_secrets")
      .select("provider_id")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (secretErr || !secret) {
      return json({ error: "Invalid API key" }, 401);
    }

    const { data: provider, error: keyErr } = await supabase
      .from("service_providers")
      .select("id, subscription_tier, subscription_status, free_until")
      .eq("id", secret.provider_id)
      .eq("is_shop_active", true)
      .single();

    if (keyErr || !provider) {
      return json({ error: "Invalid API key" }, 401);
    }

    const tier = provider.subscription_tier;
    const grantActive = tier === "admin_grant"
      && (provider.free_until === null || new Date(provider.free_until) > new Date());
    const paidActive = tier === "professional" && provider.subscription_status === "active";
    if (!grantActive && !paidActive) {
      return json({
        error: "API-Zugang ist nur im Pro-/Enterprise-Tarif verfügbar.",
        upgrade_required: true,
      }, 403);
    }
    const providerId = provider.id as string;

    // ── Routing ──
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      const orderNumber = url.searchParams.get("order_number");
      if (id || orderNumber) {
        return await getSingle(supabase, providerId, { id, orderNumber });
      }
      return await getList(supabase, providerId, url);
    }
    if (req.method === "PUT") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id query param required for PUT" }, 400);
      return await updateOrder(supabase, providerId, id, await req.json().catch(() => ({})));
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

// ── GET Liste ──
async function getList(supabase: any, providerId: string, url: URL) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const sortField = ["created_at", "updated_at", "total"].includes(url.searchParams.get("sort") || "")
    ? url.searchParams.get("sort")! : "created_at";
  const asc = (url.searchParams.get("order") || "desc") === "asc";

  let q = supabase
    .from("orders")
    .select(ORDER_SELECT, { count: "exact" })
    .eq("provider_id", providerId);          // ← Scoping: nur eigene Bestellungen

  const status = url.searchParams.get("status");
  const paymentStatus = url.searchParams.get("payment_status");
  const updatedSince = url.searchParams.get("updated_since");
  const createdSince = url.searchParams.get("created_since");
  if (status) q = q.eq("status", status);
  if (paymentStatus) q = q.eq("payment_status", paymentStatus);
  if (updatedSince) q = q.gte("updated_at", updatedSince);
  if (createdSince) q = q.gte("created_at", createdSince);

  q = q.order(sortField, { ascending: asc }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) return json({ error: error.message }, 500);

  return json({
    orders: (data || []).map(shape),
    pagination: { limit, offset, total: count ?? null, returned: data?.length ?? 0 },
  });
}

// ── GET Einzel ──
async function getSingle(supabase: any, providerId: string, sel: { id?: string | null; orderNumber?: string | null }) {
  let q = supabase.from("orders").select(ORDER_SELECT).eq("provider_id", providerId);
  q = sel.id ? q.eq("id", sel.id) : q.eq("order_number", sel.orderNumber);
  const { data, error } = await q.maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Order not found" }, 404);
  return json({ order: shape(data) });
}

// ── PUT: Fulfillment zurückschreiben ──
async function updateOrder(supabase: any, providerId: string, id: string, body: any) {
  // Sicherstellen, dass die Bestellung diesem Provider gehört
  const { data: existing, error: exErr } = await supabase
    .from("orders").select("id, status").eq("id", id).eq("provider_id", providerId).maybeSingle();
  if (exErr) return json({ error: exErr.message }, 500);
  if (!existing) return json({ error: "Order not found" }, 404);

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return json({ error: `status muss eines von: ${ALLOWED_STATUS.join(", ")}` }, 400);
    }
    patch.status = body.status;
  }
  if (body.tracking_number !== undefined) patch.tracking_number = body.tracking_number;
  if (body.tracking_url !== undefined) patch.tracking_url = body.tracking_url;
  if (body.provider_note !== undefined) patch.provider_note = body.provider_note;

  if (Object.keys(patch).length === 0) {
    return json({ error: "Nichts zu aktualisieren (status, tracking_number, tracking_url, provider_note)" }, 400);
  }

  const { data: updated, error: upErr } = await supabase
    .from("orders").update(patch).eq("id", id).eq("provider_id", providerId)
    .select(ORDER_SELECT).single();
  if (upErr) return json({ error: upErr.message }, 500);

  // Käufer-Benachrichtigung über bestehende order-webhooks anstoßen (best effort)
  if (patch.status) {
    const evt = `order_${patch.status}`;
    fetch(ORDER_WEBHOOKS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ order_id: id, event_type: evt }),
    }).catch(() => {});
  }

  return json({ order: shape(updated), updated: Object.keys(patch) });
}

// Antwort-Form: items[] flach + Provisions-/Versanddaten
function shape(o: any) {
  const { order_items, ...rest } = o;
  return { ...rest, items: order_items || [] };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
