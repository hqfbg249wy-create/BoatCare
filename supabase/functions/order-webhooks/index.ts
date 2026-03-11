// Order Status Webhook - Notifies providers and buyers of order changes
//
// Triggered by database changes via Supabase Realtime or called directly
//
// POST /order-webhooks
//   body: { order_id, event_type }
//   event_type: order_created | order_confirmed | order_shipped | order_delivered | order_cancelled
//
// Also supports provider webhook URLs for external order management systems

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface WebhookPayload {
  event_type: string;
  order_id: string;
  order: {
    order_number: string;
    status: string;
    payment_status: string;
    total: number;
    currency: string;
    items_count: number;
    buyer_name: string;
    shipping_city: string;
    tracking_number?: string;
    tracking_url?: string;
  };
  timestamp: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { order_id, event_type } = await req.json();

    if (!order_id || !event_type) {
      return jsonResponse({ error: "order_id and event_type required" }, 400);
    }

    // Load order with relations
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(`
        *,
        service_providers(id, company_name, webhook_url, email),
        order_items(id)
      `)
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return jsonResponse({ error: "Order not found" }, 404);
    }

    // Build webhook payload
    const payload: WebhookPayload = {
      event_type,
      order_id: order.id,
      order: {
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status || "pending",
        total: order.total,
        currency: "EUR",
        items_count: order.order_items?.length || 0,
        buyer_name: order.shipping_name || "Unknown",
        shipping_city: order.shipping_city || "",
        tracking_number: order.tracking_number,
        tracking_url: order.tracking_url,
      },
      timestamp: new Date().toISOString(),
    };

    const results: { target: string; success: boolean; error?: string }[] = [];

    // 1. Send to provider's webhook URL (if configured)
    const provider = order.service_providers;
    if (provider?.webhook_url) {
      try {
        const resp = await fetch(provider.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BoatCare-Event": event_type,
            "X-BoatCare-Signature": await generateSignature(
              JSON.stringify(payload),
              order_id
            ),
          },
          body: JSON.stringify(payload),
        });

        results.push({
          target: "provider_webhook",
          success: resp.ok,
          error: resp.ok ? undefined : `HTTP ${resp.status}`,
        });
      } catch (err) {
        results.push({
          target: "provider_webhook",
          success: false,
          error: String(err),
        });
      }
    }

    // 2. Log the webhook event
    await supabase.from("webhook_events").insert({
      order_id,
      event_type,
      payload,
      provider_id: order.provider_id,
      results,
      created_at: new Date().toISOString(),
    });

    // 3. Create in-app notification for provider
    if (
      event_type === "order_created" ||
      event_type === "order_cancelled"
    ) {
      await supabase.from("notifications").insert({
        recipient_id: order.provider_id,
        recipient_type: "provider",
        type: event_type,
        title: getNotificationTitle(event_type, order.order_number),
        body: getNotificationBody(event_type, order),
        data: { order_id, order_number: order.order_number },
        is_read: false,
      });
    }

    // 4. Create in-app notification for buyer
    if (
      event_type === "order_shipped" ||
      event_type === "order_delivered"
    ) {
      await supabase.from("notifications").insert({
        recipient_id: order.buyer_id,
        recipient_type: "user",
        type: event_type,
        title: getNotificationTitle(event_type, order.order_number),
        body: getNotificationBody(event_type, order),
        data: { order_id, order_number: order.order_number },
        is_read: false,
      });
    }

    return jsonResponse({
      success: true,
      event_type,
      order_id,
      results,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ── Helpers ──

function getNotificationTitle(event: string, orderNumber: string): string {
  switch (event) {
    case "order_created":
      return `Neue Bestellung ${orderNumber}`;
    case "order_confirmed":
      return `Bestellung ${orderNumber} bestätigt`;
    case "order_shipped":
      return `Bestellung ${orderNumber} versendet`;
    case "order_delivered":
      return `Bestellung ${orderNumber} zugestellt`;
    case "order_cancelled":
      return `Bestellung ${orderNumber} storniert`;
    default:
      return `Bestellung ${orderNumber} aktualisiert`;
  }
}

function getNotificationBody(event: string, order: any): string {
  const amount = `${order.total?.toFixed(2)} €`.replace(".", ",");
  switch (event) {
    case "order_created":
      return `Neue Bestellung über ${amount} von ${order.shipping_name || "einem Kunden"}.`;
    case "order_shipped":
      return order.tracking_number
        ? `Sendungsverfolgung: ${order.tracking_number}`
        : "Deine Bestellung ist auf dem Weg!";
    case "order_delivered":
      return "Deine Bestellung wurde zugestellt.";
    case "order_cancelled":
      return `Bestellung über ${amount} wurde storniert.`;
    default:
      return `Status: ${order.status}`;
  }
}

async function generateSignature(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
