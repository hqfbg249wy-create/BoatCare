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
