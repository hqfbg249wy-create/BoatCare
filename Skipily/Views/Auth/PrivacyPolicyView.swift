//
//  PrivacyPolicyView.swift
//  Skipily
//
//  DSGVO-compliant privacy policy display
//

import SwiftUI

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    section(
                        title: "1. Verantwortlicher",
                        content: """
                        Skipily App
                        E-Mail: info@skipily.app

                        F\u{00FC}r die Verarbeitung personenbezogener Daten im Rahmen \
                        der Skipily-App ist der oben genannte Verantwortliche zust\u{00E4}ndig.
                        """
                    )

                    section(
                        title: "2. Welche Daten wir erheben",
                        content: """
                        Bei der Nutzung von Skipily erheben wir folgende Daten:

                        \u{2022} **Kontodaten:** Name, E-Mail-Adresse, Passwort (verschl\u{00FC}sselt)
                        \u{2022} **Kontaktdaten:** Telefonnummer, Lieferadresse
                        \u{2022} **Bootsdaten:** Bootstyp, Hersteller, Modell, Ausr\u{00FC}stung
                        \u{2022} **Nutzungsdaten:** Suchverlauf, Favoritenliste, Bestellhistorie
                        \u{2022} **Zahlungsdaten:** Werden ausschlie\u{00DF}lich \u{00FC}ber unseren \
                        Zahlungsdienstleister Stripe verarbeitet und nicht auf unseren Servern gespeichert
                        \u{2022} **Standortdaten:** Nur bei aktiver Nutzung der Kartenansicht
                        """
                    )

                    section(
                        title: "3. Zweck der Datenverarbeitung",
                        content: """
                        Wir verarbeiten Ihre Daten f\u{00FC}r folgende Zwecke:

                        \u{2022} **Boot-Services:** Anzeige relevanter Dienstleister in Ihrer N\u{00E4}he
                        \u{2022} **Shop:** Bestellabwicklung, Lieferung, Produktempfehlungen
                        \u{2022} **Kommunikation:** Chat mit Dienstleistern zu Bestellungen
                        \u{2022} **Wartung:** Erinnerungen f\u{00FC}r Wartungsintervalle Ihrer Ausr\u{00FC}stung
                        \u{2022} **Personalisierung:** Empfehlungen basierend auf Ihrem Bootstyp

                        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserf\u{00FC}llung) \
                        sowie Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).
                        """
                    )

                    section(
                        title: "4. Zahlungsdienstleister",
                        content: """
                        F\u{00FC}r die Zahlungsabwicklung nutzen wir **Stripe, Inc.** \
                        (510 Townsend Street, San Francisco, CA 94103, USA).

                        Stripe verarbeitet Ihre Zahlungsdaten gem\u{00E4}\u{00DF} den PCI-DSS-Standards. \
                        Ihre Kreditkarten- oder Kontodaten werden direkt von Stripe verarbeitet \
                        und niemals auf unseren eigenen Servern gespeichert.

                        Datenschutzerkl\u{00E4}rung von Stripe: https://stripe.com/privacy
                        """
                    )

                    section(
                        title: "5. Datenweitergabe",
                        content: """
                        Ihre Daten werden nur weitergegeben an:

                        \u{2022} **Dienstleister auf der Plattform:** Name und Lieferadresse \
                        bei Bestellungen
                        \u{2022} **Stripe:** Zahlungsdaten zur Transaktionsabwicklung
                        \u{2022} **Supabase (Hosting):** Technischer Betrieb der Datenbank \
                        (Server in der EU)

                        Eine Weitergabe an sonstige Dritte erfolgt nicht.
                        """
                    )

                    section(
                        title: "6. Speicherdauer",
                        content: """
                        Ihre Daten werden gespeichert, solange Ihr Konto aktiv ist. \
                        Nach L\u{00F6}schung Ihres Kontos werden personenbezogene Daten \
                        innerhalb von 30 Tagen gel\u{00F6}scht, sofern keine gesetzlichen \
                        Aufbewahrungspflichten bestehen.

                        Bestelldaten werden gem\u{00E4}\u{00DF} handelsrechtlicher Vorschriften \
                        f\u{00FC}r 10 Jahre aufbewahrt.
                        """
                    )

                    section(
                        title: "7. Ihre Rechte",
                        content: """
                        Sie haben jederzeit folgende Rechte:

                        \u{2022} **Auskunft** (Art. 15 DSGVO): Welche Daten wir \u{00FC}ber Sie speichern
                        \u{2022} **Berichtigung** (Art. 16 DSGVO): Korrektur falscher Daten
                        \u{2022} **L\u{00F6}schung** (Art. 17 DSGVO): L\u{00F6}schung Ihrer Daten
                        \u{2022} **Einschr\u{00E4}nkung** (Art. 18 DSGVO): Einschr\u{00E4}nkung der Verarbeitung
                        \u{2022} **Daten\u{00FC}bertragbarkeit** (Art. 20 DSGVO): Export Ihrer Daten
                        \u{2022} **Widerspruch** (Art. 21 DSGVO): Widerspruch gegen die Verarbeitung
                        \u{2022} **Widerruf** der Einwilligung jederzeit m\u{00F6}glich

                        Kontakt: info@skipily.app

                        Sie haben zudem das Recht, sich bei einer Datenschutz-Aufsichtsbeh\u{00F6}rde \
                        zu beschweren.
                        """
                    )

                    Divider()

                    VStack(alignment: .leading, spacing: 4) {
                        Text("auth.privacy_full_link".loc)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Link("https://skipily.app/datenschutz",
                             destination: URL(string: "https://skipily.app/datenschutz")!)
                            .font(.caption)
                    }

                    Text("auth.privacy_date".loc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)
                }
                .padding(24)
            }
            .navigationTitle("auth.privacy_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("auth.privacy_close".loc) {
                        dismiss()
                    }
                }
            }
        }
    }

    private func section(title: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            Text(.init(content))  // .init enables Markdown rendering
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineSpacing(4)
        }
    }
}
