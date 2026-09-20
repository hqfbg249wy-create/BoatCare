// E-Rechnung (elektronische Rechnung) im Format Cross Industry Invoice (CII)
// nach EN 16931 — das ist der XML-Kern von ZUGFeRD/Factur-X und XRechnung.
// Wird zusaetzlich zur PDF-Rechnung erzeugt und gespeichert.
//
// Steuerbehandlung (aus den vorhandenen Daten abgeleitet):
//  - Hat der Verkaeufer eine USt-IdNr./Steuernr. hinterlegt, gehen wir von
//    Regelbesteuerung aus: Bruttobetraege inkl. 19 % USt (Standardsatz DE).
//  - Ohne Steuernummer: Kleinunternehmer (§ 19 UStG), Steuerkategorie "E"
//    (steuerbefreit), Steuersatz 0.
// Der tatsaechliche Steuersatz/-status muss vom Betrieb bestaetigt werden; die
// Struktur ist EN-16931-konform, die Werte hier sind eine sichere Vorbelegung.

import type { InvoiceData } from "./invoice.ts";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const dt102 = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

// Laendername -> ISO-3166-alpha-2 (nur die im Bestand ueblichen; Fallback DE).
function countryCode(name?: string | null): string {
  const c = (name || "").trim().toLowerCase();
  const map: Record<string, string> = {
    "deutschland": "DE", "germany": "DE",
    "österreich": "AT", "oesterreich": "AT", "austria": "AT",
    "schweiz": "CH", "switzerland": "CH",
    "frankreich": "FR", "france": "FR",
    "niederlande": "NL", "netherlands": "NL",
    "italien": "IT", "italy": "IT",
    "spanien": "ES", "spain": "ES",
    "belgien": "BE", "belgium": "BE",
    "dänemark": "DK", "daenemark": "DK", "denmark": "DK",
    "schweden": "SE", "sweden": "SE",
    "kroatien": "HR", "croatia": "HR",
  };
  if (map[c]) return map[c];
  if (/^[a-z]{2}$/i.test(c)) return c.toUpperCase();
  return "DE";
}

export function buildEInvoiceXml(data: InvoiceData): string {
  const cur = (data.currency || "EUR").toUpperCase();
  const standardRated = !!data.seller.taxNumber;
  const rate = standardRated ? 19 : 0;
  const catCode = standardRated ? "S" : "E"; // S=Standard, E=Steuerbefreit
  const factor = 1 + rate / 100;

  // Positionen (Versand als eigene Position). Betraege liegen brutto vor ->
  // Netto je Position ableiten.
  const gross = data.items.map((it) => ({
    name: it.name + (it.manufacturer ? " (" + it.manufacturer + ")" : ""),
    sku: it.sku,
    qty: it.quantity,
    unitNet: it.unitPrice / factor,
    lineGross: it.lineTotal,
  }));
  if ((data.shippingCost || 0) > 0) {
    gross.push({
      name: "Versand", sku: null, qty: 1,
      unitNet: data.shippingCost / factor, lineGross: data.shippingCost,
    });
  }

  let netTotal = 0;
  const lines = gross.map((g, i) => {
    const lineNet = Math.round((g.lineGross / factor) * 100) / 100;
    netTotal += lineNet;
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        ${g.sku ? `<ram:SellerAssignedID>${esc(g.sku)}</ram:SellerAssignedID>` : ""}
        <ram:Name>${esc(g.name)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${num(g.unitNet)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${num(g.qty)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${catCode}</ram:CategoryCode>
          <ram:RateApplicablePercent>${num(rate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${num(lineNet)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
  }).join("");

  netTotal = Math.round(netTotal * 100) / 100;
  const grand = Math.round(data.total * 100) / 100;
  const taxAmount = Math.round((grand - netTotal) * 100) / 100;

  const sellerCC = countryCode(data.seller.country);
  const buyerCC = countryCode(data.shipTo[data.shipTo.length - 1]);
  const exemptReason = standardRated ? "" :
    `<ram:ExemptionReason>Kleinunternehmer gemaess § 19 UStG</ram:ExemptionReason>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(data.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${dt102(data.invoiceDate)}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      ${data.orderNumber ? `<ram:BuyerReference>${esc(data.orderNumber)}</ram:BuyerReference>` : ""}
      <ram:SellerTradeParty>
        <ram:Name>${esc(data.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(data.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(data.seller.street)}</ram:LineOne>
          <ram:CityName>${esc(data.seller.city)}</ram:CityName>
          <ram:CountryID>${sellerCC}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${data.seller.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(data.seller.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
        ${data.seller.taxNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(data.seller.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(data.buyerName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:CountryID>${buyerCC}</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${cur}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${num(taxAmount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${exemptReason}
        <ram:BasisAmount>${num(netTotal)}</ram:BasisAmount>
        <ram:CategoryCode>${catCode}</ram:CategoryCode>
        <ram:RateApplicablePercent>${num(rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${num(netTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${num(netTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${cur}">${num(taxAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${num(grand)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${num(grand)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
