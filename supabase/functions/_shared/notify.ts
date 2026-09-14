// Gemeinsame Benachrichtigungs-Helfer fuer den Bestell-Lebenszyklus.
// Push ueber die bestehende send-push-Function (x-internal-secret), E-Mail ueber
// Resend. Alle Aufrufe sind BEST-EFFORT: Fehler werden geloggt, aber nie
// weitergeworfen, damit eine fehlgeschlagene Benachrichtigung nie den
// Zahlungs-/Versand-/Refund-Ablauf abbricht.

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const pushSecret = Deno.env.get("PUSH_INTERNAL_SECRET") ?? "";
const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Skipily <noreply@skipily.app>";

// deno-lint-ignore no-explicit-any
type Svc = any;

/** Push an einen Nutzer (best-effort). */
export async function pushToUser(userId: string, title: string, body: string): Promise<void> {
  if (!userId || !pushSecret) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: { "x-internal-secret": pushSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, title, body }),
    });
  } catch (e) {
    console.error("pushToUser failed:", (e as Error).message);
  }
}

/** E-Mail via Resend (best-effort). */
export async function emailTo(to: string, subject: string, text: string): Promise<void> {
  if (!to || !resendKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text }),
    });
  } catch (e) {
    console.error("emailTo failed:", (e as Error).message);
  }
}

/**
 * Neue-Bestellung-Benachrichtigung (Shopify/WooCommerce-Standard):
 * - Anbieter erhaelt eine E-Mail mit den Bestelldetails (wichtig fuer Betriebe,
 *   deren Shop-System nicht angebunden ist, z.B. CSV/Excel-Upload).
 * - Kaeufer erhaelt eine Bestellbestaetigung.
 * Best-effort.
 */
export async function notifyNewOrder(svc: Svc, orderId: string): Promise<void> {
  try {
    const { data: order } = await svc
      .from("orders")
      .select(`
        id, order_number, buyer_id, provider_id, payment_flow, currency,
        subtotal, shipping_cost, total,
        shipping_name, shipping_street, shipping_postal_code, shipping_city, shipping_country,
        buyer_note,
        order_items ( product_name, product_manufacturer, product_sku, quantity, unit_price, total )
      `)
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    const { data: buyer } = await svc
      .from("profiles").select("email, full_name").eq("id", order.buyer_id).maybeSingle();
    const { data: provider } = await svc
      .from("service_providers").select("name, email").eq("id", order.provider_id).maybeSingle();

    const cur = (order.currency || "EUR").toUpperCase();
    const money = (n: number) => Number(n || 0).toFixed(2).replace(".", ",") + " " + cur;
    const ref = order.order_number ? `#${order.order_number}` : "";
    const items = (order.order_items || []) as Array<{
      product_name: string; product_manufacturer?: string | null; product_sku?: string | null;
      quantity: number; unit_price: number; total: number;
    }>;
    const itemLines = items.map((it) =>
      `- ${it.quantity} x ${it.product_name}` +
      `${it.product_sku ? " (Art. " + it.product_sku + ")" : ""}` +
      ` je ${money(it.unit_price)} = ${money(it.total)}`
    ).join("\n");
    const shipTo = [
      order.shipping_name,
      order.shipping_street,
      [order.shipping_postal_code, order.shipping_city].filter(Boolean).join(" "),
      order.shipping_country,
    ].filter((z) => z && String(z).trim()).join("\n");
    const deferred = order.payment_flow === "deferred";

    // ── Anbieter: Neue Bestellung ──
    if (provider?.email) {
      await emailTo(
        provider.email,
        `Neue Bestellung ${ref}`,
        `Du hast eine neue Bestellung erhalten.\n\n` +
          `Bestellnummer: ${order.order_number ?? order.id}\n\n` +
          `Artikel:\n${itemLines || "(keine Positionen)"}\n\n` +
          `Zwischensumme: ${money(order.subtotal)}\n` +
          `Versand: ${money(order.shipping_cost)}\n` +
          `Gesamt: ${money(order.total)}\n\n` +
          `Lieferadresse:\n${shipTo}\n\n` +
          `${order.buyer_note ? "Hinweis des Kunden: " + order.buyer_note + "\n\n" : ""}` +
          (deferred
            ? `Bitte bestaetige die Bestellung im Anbieter-Portal und dann den Versand. ` +
              `Die Zahlung wird bei deiner Versandbestaetigung automatisch abgebucht, ` +
              `Rechnung und Widerrufsbelehrung werden dabei erzeugt.\n\n`
            : `Bitte bearbeite die Bestellung im Anbieter-Portal.\n\n`) +
          `Zum Anbieter-Portal: https://portal.skipily.app\n\nDein Skipily-Team`,
      );
    }

    // ── Kaeufer: Bestellbestaetigung ──
    if (buyer?.email) {
      await emailTo(
        buyer.email,
        `Bestellbestaetigung ${ref}`,
        `Hallo${buyer.full_name ? " " + buyer.full_name : ""},\n\n` +
          `vielen Dank fuer deine Bestellung ${ref}.\n\n` +
          `Artikel:\n${itemLines}\n\n` +
          `Gesamt: ${money(order.total)}\n\n` +
          (deferred
            ? `Deine Zahlungsdaten sind hinterlegt. Abgebucht wird erst, wenn ${provider?.name ?? "der Anbieter"} ` +
              `den Versand bestaetigt. Danach erhaeltst du deine Rechnung inkl. Widerrufsbelehrung.\n\n`
            : `Der Anbieter bereitet deine Bestellung vor.\n\n`) +
          `Du kannst deine Bestellung jederzeit in der App unter Bestellungen einsehen.\n\nDein Skipily-Team`,
      );
    }
  } catch (e) {
    console.error("notifyNewOrder failed:", (e as Error).message);
  }
}

export type OrderEvent = "confirmed" | "shipped" | "refunded" | "cancelled";

/**
 * Laedt die Bestellung samt Kaeufer/Verkaeufer und verschickt die zum Event
 * passenden Benachrichtigungen. Komplett best-effort.
 */
export async function notifyOrderEvent(svc: Svc, orderId: string, event: OrderEvent): Promise<void> {
  try {
    const { data: order } = await svc
      .from("orders")
      .select("id, order_number, buyer_id, provider_id, total, currency, invoice_url")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    const { data: buyer } = await svc
      .from("profiles").select("email, full_name").eq("id", order.buyer_id).maybeSingle();
    const { data: provider } = await svc
      .from("service_providers").select("name, email").eq("id", order.provider_id).maybeSingle();

    const orderRef = order.order_number ? `#${order.order_number}` : "";
    const amount = `${Number(order.total).toFixed(2).replace(".", ",")} ${(order.currency || "EUR").toUpperCase()}`;
    const sellerName = provider?.name ?? "dem Anbieter";

    if (event === "confirmed") {
      await pushToUser(
        order.buyer_id,
        "Bestellung bestätigt",
        `${sellerName} hat deine Bestellung ${orderRef} bestätigt.`,
      );
      if (buyer?.email) {
        await emailTo(
          buyer.email,
          `Deine Bestellung ${orderRef} wurde bestätigt`,
          `Hallo${buyer.full_name ? " " + buyer.full_name : ""},\n\n` +
            `${sellerName} hat deine Bestellung ${orderRef} bestätigt. Sobald die Ware versandt wird, ` +
            `erhältst du die Rechnung und der Betrag von ${amount} wird abgebucht.\n\nDein Skipily-Team`,
        );
      }
    } else if (event === "shipped") {
      await pushToUser(
        order.buyer_id,
        "Bestellung versandt",
        `Deine Bestellung ${orderRef} ist unterwegs. Der Betrag von ${amount} wurde abgebucht.`,
      );
      if (buyer?.email) {
        await emailTo(
          buyer.email,
          `Deine Bestellung ${orderRef} wurde versandt`,
          `Hallo${buyer.full_name ? " " + buyer.full_name : ""},\n\n` +
            `${sellerName} hat deine Bestellung ${orderRef} versandt und den Betrag von ${amount} abgebucht.\n\n` +
            `${order.invoice_url ? "Deine Rechnung inkl. Widerrufsbelehrung: " + order.invoice_url + "\n\n" : ""}` +
            `Du findest die Rechnung auch jederzeit in der App unter Bestellungen.\n\nDein Skipily-Team`,
        );
      }
    } else if (event === "refunded") {
      await pushToUser(
        order.buyer_id,
        "Rückerstattung veranlasst",
        `Für deine Bestellung ${orderRef} wurden ${amount} zurückerstattet.`,
      );
      if (buyer?.email) {
        await emailTo(
          buyer.email,
          `Rückerstattung für deine Bestellung ${orderRef}`,
          `Hallo${buyer.full_name ? " " + buyer.full_name : ""},\n\n` +
            `Für deine Bestellung ${orderRef} wurden ${amount} zurückerstattet. ` +
            `Die Gutschrift erscheint je nach Bank in einigen Tagen.\n\nDein Skipily-Team`,
        );
      }
      if (provider?.email) {
        await emailTo(
          provider.email,
          `Bestellung ${orderRef} wurde erstattet`,
          `Die Bestellung ${orderRef} wurde storniert und dem Kunden erstattet ` +
            `(${amount}). Der an dich ausgezahlte Betrag wurde zurückgebucht.\n\nDein Skipily-Team`,
        );
      }
    } else if (event === "cancelled") {
      // Vom Kaeufer storniert, BEVOR abgebucht/versandt wurde -> Anbieter
      // informieren, damit er nicht mehr versendet. Kaeufer bekommt eine kurze
      // Bestaetigung.
      if (provider?.email) {
        await emailTo(
          provider.email,
          `Bestellung ${orderRef} wurde storniert`,
          `Die Bestellung ${orderRef} wurde vom Kunden storniert, bevor sie ` +
            `abgebucht/versandt wurde. Bitte nicht mehr versenden.\n\nDein Skipily-Team`,
        );
      }
      await pushToUser(
        order.buyer_id,
        "Bestellung storniert",
        `Deine Bestellung ${orderRef} wurde storniert. Es wurde nichts abgebucht.`,
      );
    }
  } catch (e) {
    console.error("notifyOrderEvent failed:", (e as Error).message);
  }
}
