// Shared Helper: Sendcloud Parcel/Label-Erzeugung (Fulfillment).
//
// WICHTIG zur Versandkostenengine: Diese Funktion erzeugt NUR das Versandlabel
// (was der Betrieb bezahlt/druckt). Der KUNDENPREIS kommt unveraendert aus der
// Skipily-Engine (calculate-shipping) und bleibt davon unberuehrt.

const SENDCLOUD_API = "https://panel.sendcloud.sc/api/v2";

// Land -> ISO-2 (Skipily speichert teils volle Namen).
function iso2(c: unknown): string {
  if (!c) return "DE";
  const s = String(c).trim();
  if (s.length === 2) return s.toUpperCase();
  const m: Record<string, string> = {
    deutschland: "DE", germany: "DE", "österreich": "AT", oesterreich: "AT", austria: "AT",
    schweiz: "CH", switzerland: "CH", frankreich: "FR", france: "FR", italien: "IT", italy: "IT",
    spanien: "ES", spain: "ES", niederlande: "NL", netherlands: "NL", nederland: "NL",
    belgien: "BE", belgium: "BE", luxemburg: "LU", luxembourg: "LU", daenemark: "DK", "dänemark": "DK",
  };
  return m[s.toLowerCase()] || s.substring(0, 2).toUpperCase();
}

// Strasse in Strasse + Hausnummer trennen (best effort; Sendcloud v2 will beides).
function splitStreet(street: string): { address: string; house: string } {
  const s = (street || "").trim();
  const m = s.match(/^(.*?)[\s,]+(\d+\s*[a-zA-Z]?)$/);
  if (m) return { address: m[1].trim(), house: m[2].replace(/\s+/g, "") };
  return { address: s, house: "-" };
}

export interface SendcloudOrder {
  order_number: string;
  name: string;
  street: string;
  city: string;
  postal_code: string;
  country: string;
  email?: string | null;
  telephone?: string | null;
  weight_kg?: number | null;   // Gesamtgewicht in kg (geschaetzt, wenn unbekannt)
}

export interface SendcloudResult {
  ok: boolean;
  parcel_id?: number | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  label_url?: string | null;
  error?: string;
}

/**
 * Legt in Sendcloud ein Paket an und laesst (per Versandregeln des Betriebs)
 * automatisch ein Label erzeugen. Nicht-blockierend gedacht: bei Fehlern gibt
 * es { ok:false, error } zurueck, der Aufrufer bricht den Versand NICHT ab.
 */
export async function createSendcloudParcel(
  publicKey: string,
  secretKey: string,
  order: SendcloudOrder,
): Promise<SendcloudResult> {
  try {
    const auth = btoa(`${publicKey}:${secretKey}`);
    const { address, house } = splitStreet(order.street);
    const weight = Math.max(0.1, Number(order.weight_kg ?? 1)).toFixed(3);

    const body = {
      parcel: {
        name: order.name || "",
        address,
        house_number: house,
        city: order.city || "",
        postal_code: order.postal_code || "",
        country: iso2(order.country),
        email: order.email || "",
        telephone: order.telephone || "",
        order_number: order.order_number,
        weight,
        quantity: 1,
        request_label: true,
        apply_shipping_rules: true,
      },
    };

    const res = await fetch(`${SENDCLOUD_API}/parcels`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data?.error?.message || data?.error || `HTTP ${res.status}`) as string;
      return { ok: false, error: String(msg).slice(0, 300) };
    }

    const p = data?.parcel ?? {};
    const labelUrl = p?.label?.label_printer
      || (Array.isArray(p?.label?.normal_printer) ? p.label.normal_printer[0] : null)
      || null;
    return {
      ok: true,
      parcel_id: p?.id ?? null,
      tracking_number: p?.tracking_number ?? null,
      tracking_url: p?.tracking_url ?? null,
      label_url: labelUrl,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
