// Widerrufsbelehrung + Muster-Widerrufsformular fuer den Shop-Kauf.
//
// Rechtlicher Hintergrund: Beim Fernabsatzkauf von Waren durch einen
// Verbraucher besteht ein 14-taegiges Widerrufsrecht (§§ 355, 356, 312g BGB).
// Die Belehrung folgt inhaltlich dem gesetzlichen Muster (Anlage 1 zu
// Art. 246a § 1 Abs. 2 EGBGB). VERKAEUFER ist der jeweilige Provider (nicht
// die SKIPILY GmbH, die nur Vermittlerin ist) -> seine Kontaktdaten stehen in
// der Belehrung, denn ihm gegenueber wird der Widerruf erklaert.
//
// Hinweis: KEINE Gedankenstriche (Stilregel), Doppelpunkt/Komma/Punkt je Kontext.

export interface SellerContact {
  name: string;            // Firmenname des Providers (Verkaeufer)
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Baut die Anschriftzeile des Verkaeufers aus den vorhandenen Feldern. */
export function sellerAddressLine(s: SellerContact): string {
  const parts = [
    s.name,
    s.street || undefined,
    [s.postalCode, s.city].filter(Boolean).join(" ") || undefined,
    s.country || undefined,
  ].filter((p) => p && String(p).trim().length > 0);
  return parts.join(", ");
}

/**
 * Deutsche Widerrufsbelehrung. Die Frist laeuft ab Erhalt der Ware; erst mit
 * Versand kann sie also belehrt werden (passt zum neuen Ablauf: Rechnung +
 * Belehrung bei Versandbestaetigung).
 */
export function widerrufsbelehrungDE(seller: SellerContact): string {
  const kontakt = [
    seller.name,
    seller.street || "",
    [seller.postalCode, seller.city].filter(Boolean).join(" "),
    seller.country || "",
    seller.email ? "E-Mail: " + seller.email : "",
    seller.phone ? "Telefon: " + seller.phone : "",
  ].filter((z) => z && z.trim().length > 0).join("\n");

  return `Widerrufsbelehrung

Widerrufsrecht
Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gruenden diesen Vertrag zu widerrufen. Die Widerrufsfrist betraegt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Befoerderer ist, die Waren in Besitz genommen haben bzw. hat.

Um Ihr Widerrufsrecht auszuueben, muessen Sie uns

${kontakt}

mittels einer eindeutigen Erklaerung (z. B. ein mit der Post versandter Brief oder eine E-Mail) ueber Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie koennen dafuer das beigefuegte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.

Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung ueber die Ausuebung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.

Folgen des Widerrufs
Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschliesslich der Lieferkosten (mit Ausnahme der zusaetzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, guenstigste Standardlieferung gewaehlt haben), unverzueglich und spaetestens binnen vierzehn Tagen ab dem Tag zurueckzuzahlen, an dem die Mitteilung ueber Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Fuer diese Rueckzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der urspruenglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdruecklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rueckzahlung Entgelte berechnet.

Wir koennen die Rueckzahlung verweigern, bis wir die Waren wieder zurueckerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurueckgesandt haben, je nachdem, welches der fruehere Zeitpunkt ist.

Sie haben die Waren unverzueglich und in jedem Fall spaetestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns ueber den Widerruf dieses Vertrags unterrichten, an uns zurueckzusenden oder zu uebergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden. Sie tragen die unmittelbaren Kosten der Ruecksendung der Waren. Sie muessen fuer einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Pruefung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurueckzufuehren ist.`;
}

/** Muster-Widerrufsformular (Anlage 2 zu Art. 246a EGBGB), verkaeuferbezogen. */
export function widerrufsformularDE(seller: SellerContact): string {
  return `Muster-Widerrufsformular

(Wenn Sie den Vertrag widerrufen wollen, dann fuellen Sie bitte dieses Formular aus und senden Sie es zurueck.)

An:
${sellerAddressLine(seller)}${seller.email ? "\nE-Mail: " + seller.email : ""}

Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag ueber den Kauf der folgenden Waren (*):

Bestellt am (*) / erhalten am (*):
Name des/der Verbraucher(s):
Anschrift des/der Verbraucher(s):
Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):
Datum:

(*) Unzutreffendes streichen.`;
}
