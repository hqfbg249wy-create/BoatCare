// PDF-Rechnung fuer den Shop-Kauf (Provider = Verkaeufer, Skipily = Vermittler).
// Rendert Kopf, Positionen, Summen und haengt Widerrufsbelehrung +
// Muster-Widerrufsformular an. Nutzt pdf-lib (laeuft in Deno).
//
// Bewusst textbasiertes, robustes Layout mit Seitenumbruch. KEINE Gedankenstriche.

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";
import {
  type SellerContact,
  sellerAddressLine,
  widerrufsbelehrungDE,
  widerrufsformularDE,
} from "./widerruf.ts";

export interface InvoiceItem {
  name: string;
  manufacturer?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number; // brutto pro Stueck
  lineTotal: number; // brutto Position
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  currency: string;
  seller: SellerContact & { taxNumber?: string | null; vatVerified?: boolean | null };
  buyerName: string;
  shipTo: string[]; // Anschriftzeilen
  items: InvoiceItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  orderNumber?: string | null;
}

const EUR = (n: number, cur: string) =>
  n.toFixed(2).replace(".", ",") + " " + (cur || "EUR").toUpperCase();

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4 = { w: 595.28, h: 841.89 };
  const M = 56; // Rand
  const dark = rgb(0.1, 0.12, 0.16);
  const gray = rgb(0.42, 0.45, 0.5);

  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - M;
  };
  const need = (h: number) => {
    if (y - h < M) newPage();
  };
  const text = (
    s: string,
    opts: { size?: number; font?: typeof font; color?: typeof dark; x?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.font ?? font;
    need(size + 4);
    page.drawText(s, { x: opts.x ?? M, y, size, font: f, color: opts.color ?? dark });
    y -= size + 4;
  };
  // Text, der lange Zeilen am Wort umbricht (fuer die Belehrung).
  const paragraph = (s: string, size = 9) => {
    const maxWidth = A4.w - 2 * M;
    for (const rawLine of s.split("\n")) {
      if (rawLine.trim() === "") { y -= size; continue; }
      const words = rawLine.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (font.widthOfTextAtSize(test, size) > maxWidth) {
          text(line, { size });
          line = w;
        } else {
          line = test;
        }
      }
      if (line) text(line, { size });
    }
  };

  // ── Kopf: Verkaeufer ──
  text("RECHNUNG", { size: 18, font: bold });
  y -= 4;
  text(data.seller.name, { size: 11, font: bold });
  if (data.seller.street) text(data.seller.street, { color: gray });
  const plzOrt = [data.seller.postalCode, data.seller.city].filter(Boolean).join(" ");
  if (plzOrt) text(plzOrt, { color: gray });
  if (data.seller.country) text(data.seller.country, { color: gray });
  if (data.seller.email) text("E-Mail: " + data.seller.email, { color: gray });
  if (data.seller.phone) text("Telefon: " + data.seller.phone, { color: gray });
  if (data.seller.taxNumber) text("USt-IdNr./Steuernr.: " + data.seller.taxNumber, { color: gray });

  y -= 8;
  // ── Rechnungs-Metadaten ──
  const dstr = data.invoiceDate.toLocaleDateString("de-DE");
  text("Rechnungsnummer: " + data.invoiceNumber, { font: bold });
  text("Rechnungsdatum: " + dstr);
  if (data.orderNumber) text("Bestellnummer: " + data.orderNumber, { color: gray });

  y -= 6;
  // ── Rechnungs-/Lieferanschrift ──
  text("Rechnungs- und Lieferanschrift", { font: bold });
  text(data.buyerName);
  for (const line of data.shipTo) if (line && line.trim()) text(line);

  y -= 10;
  // ── Positionen ──
  text("Positionen", { size: 12, font: bold });
  y -= 2;
  // Spaltenkopf
  need(16);
  page.drawText("Bezeichnung", { x: M, y, size: 9, font: bold, color: gray });
  page.drawText("Menge", { x: M + 300, y, size: 9, font: bold, color: gray });
  page.drawText("Einzel", { x: M + 355, y, size: 9, font: bold, color: gray });
  page.drawText("Summe", { x: M + 435, y, size: 9, font: bold, color: gray });
  y -= 14;

  for (const it of data.items) {
    need(26);
    const label = it.name + (it.manufacturer ? " (" + it.manufacturer + ")" : "");
    // Bezeichnung ggf. kuerzen, damit sie nicht in die Zahlen laeuft
    let shown = label;
    while (font.widthOfTextAtSize(shown, 9) > 280 && shown.length > 4) {
      shown = shown.slice(0, -2);
    }
    if (shown !== label) shown = shown.replace(/.$/, "…");
    page.drawText(shown, { x: M, y, size: 9, font, color: dark });
    page.drawText(String(it.quantity), { x: M + 300, y, size: 9, font, color: dark });
    page.drawText(EUR(it.unitPrice, data.currency), { x: M + 355, y, size: 9, font, color: dark });
    page.drawText(EUR(it.lineTotal, data.currency), { x: M + 435, y, size: 9, font, color: dark });
    y -= 16;
    if (it.sku) { text("Art.-Nr.: " + it.sku, { size: 7, color: gray, x: M + 6 }); }
  }

  y -= 6;
  const sumLine = (label: string, val: number, b = false) => {
    need(16);
    page.drawText(label, { x: M + 300, y, size: 10, font: b ? bold : font, color: dark });
    page.drawText(EUR(val, data.currency), { x: M + 435, y, size: 10, font: b ? bold : font, color: dark });
    y -= 16;
  };
  sumLine("Zwischensumme", data.subtotal);
  sumLine("Versand", data.shippingCost);
  sumLine("Gesamtbetrag", data.total, true);

  y -= 6;
  paragraph(
    "Alle Betraege in " + (data.currency || "EUR").toUpperCase() +
      ", brutto inkl. gesetzlicher Umsatzsteuer, sofern der Verkaeufer umsatzsteuerpflichtig ist. " +
      "Verkaeufer und Vertragspartner ist der oben genannte Betrieb. Die SKIPILY GmbH vermittelt lediglich den Vertrag.",
    8,
  );

  // ── Widerrufsbelehrung (neue Seite) ──
  newPage();
  text("Widerrufsbelehrung", { size: 14, font: bold });
  y -= 6;
  paragraph(widerrufsbelehrungDE(data.seller), 9);
  y -= 10;
  need(60);
  text("Muster-Widerrufsformular", { size: 12, font: bold });
  y -= 4;
  paragraph(widerrufsformularDE(data.seller), 9);

  return await pdf.save();
}

export { sellerAddressLine };
