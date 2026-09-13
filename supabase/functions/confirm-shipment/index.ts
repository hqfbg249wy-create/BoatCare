// Edge Function: confirm-shipment
//
// Neuer Shop-Ablauf (deferred payment): Der Provider bestaetigt den Versand.
// Diese Function bucht DANN erst off-session ab (Karte wurde bei Bestellung nur
// hinterlegt), erzeugt Rechnung + Widerrufsbelehrung und setzt die Bestellung
// auf "versandt". Die Provision fliesst per Connect-Transfer an Skipily.
//
// WICHTIG: Es wird ZUERST abgebucht. Schlaegt die Abbuchung fehl, wird NICHT
// auf "versandt" gesetzt und KEINE Rechnungsnummer verbraucht (keine Luecken),
// damit der Provider nicht unbezahlt versendet.
//
// Body: { order_id: string, tracking_number?: string, tracking_url?: string }
// Auth: Bearer <user-jwt> eines Mitglieds/Owners des Provider-Betriebs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { buildInvoicePdf, type InvoiceItem } from "../_shared/invoice.ts";
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
    // User-scoped Client, damit provider_is_member() mit auth.uid() greift.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { order_id, tracking_number, tracking_url } = await req.json();
    if (!order_id) return json({ error: "order_id fehlt" }, 400);

    // ── Bestellung + Positionen + Verkaeufer + Kaeufer laden ──
    const { data: order, error: oErr } = await svc
      .from("orders")
      .select(`
        id, order_number, provider_id, buyer_id, status, payment_status, payment_flow,
        subtotal, shipping_cost, commission_amount, total, currency,
        shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_country,
        stripe_payment_method_id, invoice_number,
        order_items ( product_name, product_manufacturer, product_sku, quantity, unit_price, total )
      `)
      .eq("id", order_id)
      .maybeSingle();

    if (oErr || !order) return json({ error: "Bestellung nicht gefunden" }, 404);

    // ── Autorisierung: ist der User Mitglied/Owner dieses Betriebs? ──
    const { data: isMember, error: mErr } = await userClient.rpc("provider_is_member", {
      pid: order.provider_id,
    });
    if (mErr) return json({ error: "Berechtigungspruefung fehlgeschlagen" }, 500);
    if (isMember !== true) return json({ error: "Keine Berechtigung fuer diese Bestellung" }, 403);

    // ── Nur der neue Flow bucht bei Versand ab ──
    if (order.payment_flow !== "deferred") {
      return json({
        error: "Diese Bestellung nutzt den Sofort-Zahlungs-Flow. Versand bitte wie bisher setzen.",
        code: "not_deferred",
      }, 409);
    }
    if (order.status === "cancelled") return json({ error: "Bestellung ist storniert" }, 409);
    if (order.status === "shipped" || order.status === "delivered" || order.payment_status === "paid") {
      return json({ error: "Bestellung wurde bereits versandt/bezahlt", code: "already_done" }, 409);
    }
    if (order.status !== "confirmed") {
      return json({
        error: "Bitte zuerst die Bestellung bestaetigen, dann den Versand.",
        code: "confirm_first",
      }, 409);
    }
    if (!order.stripe_payment_method_id) {
      return json({ error: "Keine hinterlegte Zahlungsmethode zur Bestellung", code: "no_pm" }, 409);
    }

    // ── Kaeufer (Stripe-Customer) + Verkaeufer-Stammdaten ──
    const { data: buyer } = await svc
      .from("profiles")
      .select("stripe_customer_id, email, full_name")
      .eq("id", order.buyer_id)
      .maybeSingle();
    if (!buyer?.stripe_customer_id) {
      return json({ error: "Kein Stripe-Kunde fuer den Kaeufer hinterlegt", code: "no_customer" }, 409);
    }

    const { data: seller } = await svc
      .from("service_providers")
      .select("id, name, street, postal_code, city, country, email, phone, tax_number, stripe_account_id, commission_rate")
      .eq("id", order.provider_id)
      .maybeSingle();
    if (!seller) return json({ error: "Verkaeufer nicht gefunden" }, 404);

    // ── 1) ZUERST off-session abbuchen ──
    const amountCents = Math.round(Number(order.total) * 100);
    const currency = (order.currency || "eur").toLowerCase();
    const commissionCents = Math.round(Number(order.commission_amount || 0) * 100);

    // Destination-Charge-Modell: Plattform bucht die hinterlegte Karte ab und
    // ueberweist (total - Provision) an den Connect-Account des Providers; die
    // Provision bleibt bei Skipily. Connect-Account defensiv pruefen.
    const piParams: Record<string, unknown> = {
      amount: amountCents,
      currency,
      customer: buyer.stripe_customer_id,
      payment_method: order.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: {
        order_id: order.id,
        order_number: order.order_number ?? "",
        buyer_id: order.buyer_id,
        provider_id: order.provider_id,
      },
    };

    if (seller.stripe_account_id) {
      let valid = false;
      try {
        const acct = await stripe.accounts.retrieve(seller.stripe_account_id);
        valid = (acct as { charges_enabled?: boolean }).charges_enabled === true;
      } catch (_e) {
        valid = false;
      }
      if (valid) {
        const transferAmount = Math.max(0, amountCents - commissionCents);
        piParams.transfer_data = { destination: seller.stripe_account_id, amount: transferAmount };
      }
    }

    let paymentIntentId = "";
    try {
      const pi = await stripe.paymentIntents.create(piParams as any);
      if (pi.status !== "succeeded") {
        // z.B. requires_action (SCA) -> als Fehlschlag behandeln, Kaeufer muss handeln
        await svc.from("orders").update({
          payment_status: "failed",
          charge_error: "requires_action:" + pi.status,
        }).eq("id", order.id);
        return json({
          error: "Zahlung konnte nicht automatisch abgebucht werden (Kundenbestaetigung noetig). Der Kaeufer wurde/wird informiert.",
          code: "requires_action",
        }, 402);
      }
      paymentIntentId = pi.id;
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Abbuchung fehlgeschlagen";
      const code = (e as { code?: string })?.code ?? "charge_failed";
      await svc.from("orders").update({ payment_status: "failed", charge_error: `${code}: ${msg}` }).eq("id", order.id);
      return json({ error: "Abbuchung fehlgeschlagen: " + msg, code }, 402);
    }

    // ── 2) Erst nach erfolgreicher Zahlung: Rechnungsnummer + PDF ──
    const { data: invNo, error: invErr } = await svc.rpc("next_invoice_number", {
      p_provider: order.provider_id,
    });
    if (invErr || !invNo) {
      // Zahlung ist durch, aber Nummernvergabe scheiterte -> als bezahlt markieren,
      // Rechnung kann nachgezogen werden. Nicht die ganze Aktion scheitern lassen.
      await svc.from("orders").update({
        status: "shipped",
        payment_status: "paid",
        charged_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId,
        shipped_at: new Date().toISOString(),
        tracking_number: tracking_number ?? null,
        tracking_url: tracking_url ?? null,
        charge_error: null,
      }).eq("id", order.id);
      return json({ ok: true, warning: "Bezahlt und versandt, Rechnung wird nachgezogen." });
    }

    const items: InvoiceItem[] = (order.order_items || []).map((it: any) => ({
      name: it.product_name,
      manufacturer: it.product_manufacturer,
      sku: it.product_sku,
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
      lineTotal: Number(it.total),
    }));

    const pdfBytes = await buildInvoicePdf({
      invoiceNumber: invNo as string,
      invoiceDate: new Date(),
      currency: order.currency || "EUR",
      seller: {
        name: seller.name,
        street: seller.street,
        postalCode: seller.postal_code,
        city: seller.city,
        country: seller.country,
        email: seller.email,
        phone: seller.phone,
        taxNumber: seller.tax_number,
      },
      buyerName: order.shipping_name || buyer.full_name || "",
      shipTo: [
        order.shipping_street,
        [order.shipping_postal_code, order.shipping_city].filter(Boolean).join(" "),
        order.shipping_country,
      ].filter(Boolean) as string[],
      items,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shipping_cost || 0),
      total: Number(order.total),
      orderNumber: order.order_number,
    });

    // ── 3) PDF in privaten Storage-Bucket, signierte URL ──
    let invoiceUrl: string | null = null;
    try {
      // Bucket idempotent anlegen (privat).
      await svc.storage.createBucket("invoices", { public: false }).catch(() => {});
      const path = `${order.id}/${invNo}.pdf`;
      await svc.storage.from("invoices").upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      const { data: signed } = await svc.storage.from("invoices").createSignedUrl(
        path,
        60 * 60 * 24 * 365, // 1 Jahr
      );
      invoiceUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.error("Invoice upload failed:", (e as Error).message);
      // Zahlung + Versand trotzdem finalisieren; Rechnung ist erzeugt, URL fehlt.
    }

    // ── 4) Bestellung finalisieren ──
    const nowIso = new Date().toISOString();
    const { error: updErr } = await svc.from("orders").update({
      status: "shipped",
      payment_status: "paid",
      charged_at: nowIso,
      stripe_payment_intent_id: paymentIntentId,
      shipped_at: nowIso,
      tracking_number: tracking_number ?? null,
      tracking_url: tracking_url ?? null,
      invoice_number: invNo,
      invoice_url: invoiceUrl,
      invoice_issued_at: nowIso,
      // Provisorische Widerrufsfrist ab Versand (14 Tage + ~2 Tage Transit).
      // Wird bei Zustellung auf delivered_at + 14 Tage praezisiert.
      withdrawal_until: new Date(Date.now() + 16 * 24 * 3600 * 1000).toISOString(),
      charge_error: null,
    }).eq("id", order.id);
    if (updErr) console.error("Order finalize update failed:", updErr.message);

    // Kaeufer benachrichtigen (best-effort, blockiert nie).
    await notifyOrderEvent(svc, order.id, "shipped");

    return json({
      ok: true,
      invoice_number: invNo,
      invoice_url: invoiceUrl,
      payment_intent: paymentIntentId,
    });
  } catch (err) {
    console.error("confirm-shipment FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
