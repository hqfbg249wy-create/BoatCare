//
//  ServiceQuoteSheet.swift
//  Skipily
//
//  Wiederverwendbares Sheet zum Anfragen eines Angebots/Service bei Betrieben:
//  zeigt passende Kandidaten (nach Stichworten zur Ausruestung), erlaubt Filtern
//  nach Laendern und die Auswahl einzelner oder aller Betriebe, dann senden.
//  Aus jeder Ausruestung heraus nutzbar (fuer alle Services).
//

import SwiftUI

/// Zwei Anfrage-Arten: unverbindliche Anfrage (nur Rueckfrage/Kontakt) oder
/// explizite Bitte um ein (verbindliches, bepreistes) Angebot.
enum QuoteMode: String {
    case inquiry   // Unverbindliche Anfrage
    case quote     // Bitte um ein Angebot
}

struct ServiceQuoteSheet: View {
    let query: ProviderQuery
    let boatId: UUID?
    let mode: QuoteMode

    @State private var subject: String
    @State private var message: String
    @Environment(\.dismiss) private var dismiss

    @State private var allProviders: [QuoteProvider] = []
    @State private var countries: [QuoteCountry] = []
    @State private var selectedCountries: Set<String> = []
    @State private var locationFilter: String = ""   // Ort/Name eingrenzen
    @State private var selected: Set<UUID> = []
    @State private var isLoading = true
    @State private var isSending = false
    @State private var showSendConfirm = false
    @State private var loadError: String?
    @State private var resultMessage: String?

    init(query: ProviderQuery, subject: String, message: String, boatId: UUID?, mode: QuoteMode = .quote) {
        self.query = query
        self.boatId = boatId
        self.mode = mode
        _subject = State(initialValue: subject)
        _message = State(initialValue: message)
    }

    private var visibleProviders: [QuoteProvider] {
        var list = allProviders
        if !selectedCountries.isEmpty {
            list = list.filter { selectedCountries.contains($0.country ?? "") }
        }
        let q = locationFilter.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            list = list.filter {
                ($0.city ?? "").lowercased().contains(q) || $0.name.lowercased().contains(q)
            }
        }
        return list
    }
    private var allVisibleSelected: Bool {
        !visibleProviders.isEmpty && visibleProviders.allSatisfy { selected.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("quote.message_section".loc) {
                    TextField("quote.subject".loc, text: $subject)
                    TextField("quote.message".loc, text: $message, axis: .vertical).lineLimit(3...8)
                }

                if !countries.isEmpty {
                    Section("quote.countries".loc) {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(countries, id: \.country) { c in
                                    let on = selectedCountries.contains(c.country)
                                    Button {
                                        if on { selectedCountries.remove(c.country) } else { selectedCountries.insert(c.country) }
                                    } label: {
                                        Text("\(c.country) (\(c.count))")
                                            .font(.caption)
                                            .padding(.horizontal, 10).padding(.vertical, 6)
                                            .background(on ? AppColors.primary.opacity(0.15) : Color(.systemGray6))
                                            .foregroundStyle(on ? AppColors.primary : .secondary)
                                            .clipShape(Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 8))
                    }
                }

                // Ort/Name eingrenzen (zusaetzlich zum Land), um einen passenden
                // lokalen Betrieb zu finden.
                if !allProviders.isEmpty {
                    Section {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                            TextField("quote.location_filter".loc, text: $locationFilter)
                                .autocorrectionDisabled()
                            if !locationFilter.isEmpty {
                                Button { locationFilter = "" } label: {
                                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                Section {
                    if isLoading {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else if visibleProviders.isEmpty {
                        Text(loadError ?? "quote.no_providers".loc)
                            .font(.callout).foregroundStyle(.secondary)
                    } else {
                        ForEach(visibleProviders) { p in
                            Button {
                                if selected.contains(p.id) { selected.remove(p.id) } else { selected.insert(p.id) }
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: selected.contains(p.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selected.contains(p.id) ? AppColors.success : .secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.name).foregroundStyle(.primary)
                                        let loc = [p.city, p.country].compactMap { $0 }.joined(separator: ", ")
                                        if !loc.isEmpty {
                                            Text(loc).font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } header: {
                    HStack {
                        Text(String(format: "quote.providers_count".loc, visibleProviders.count))
                        Spacer()
                        if !visibleProviders.isEmpty {
                            Button(allVisibleSelected ? "quote.deselect_all".loc : "quote.select_all".loc) {
                                if allVisibleSelected {
                                    for p in visibleProviders { selected.remove(p.id) }
                                } else {
                                    for p in visibleProviders { selected.insert(p.id) }
                                }
                            }
                            .font(.caption)
                        }
                    }
                } footer: {
                    if let resultMessage {
                        Text(resultMessage).foregroundStyle(AppColors.success)
                    } else {
                        Text(mode == .inquiry ? "quote.footer_hint_inquiry".loc : "quote.footer_hint".loc)
                    }
                }
            }
            .navigationTitle(mode == .inquiry ? "quote.mode_inquiry".loc : "quote.mode_quote".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("general.cancel".loc) { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSendConfirm = true
                    } label: {
                        if isSending { ProgressView() }
                        else { Text(String(format: "quote.send_n".loc, selected.count)).fontWeight(.semibold) }
                    }
                    .disabled(isSending || selected.isEmpty || subject.isEmpty || message.isEmpty)
                }
            }
            // Sicherheits-Rueckfrage vor dem Senden – verhindert versehentliches
            // Massen-Versenden an viele (oder alle) Betriebe.
            .confirmationDialog(
                String(format: "quote.confirm_title".loc, selected.count),
                isPresented: $showSendConfirm,
                titleVisibility: .visible
            ) {
                Button(String(format: "quote.confirm_send".loc, selected.count)) {
                    Task { await send() }
                }
                Button("general.cancel".loc, role: .cancel) {}
            } message: {
                Text(selected.count >= 10
                     ? String(format: "quote.confirm_many".loc, selected.count)
                     : "quote.confirm_msg".loc)
            }
        }
        .task { await load() }
    }

    @MainActor
    private func load() async {
        isLoading = true
        loadError = nil
        do {
            let res = try await InquiryService.shared.findProviders(query: query, countries: [])
            allProviders = res.providers
            countries = res.countries
        } catch {
            loadError = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    private func send() async {
        isSending = true
        resultMessage = nil
        defer { isSending = false }
        do {
            let n = try await InquiryService.shared.requestQuote(
                providerIds: Array(selected), boatId: boatId, subject: subject, message: message,
                requestType: mode.rawValue)
            resultMessage = String(format: "quote.sent".loc, n)
            try? await Task.sleep(nanoseconds: 900_000_000)
            dismiss()
        } catch {
            resultMessage = "\("general.error".loc): \(error.localizedDescription)"
        }
    }
}

/// Passende Betriebe zu einer Ausruestung: primaere Geschaefts-Kategorie
/// (category_allow, exakt) ODER kuratierter Service-Tag (service_terms,
/// Teilstring). So werden fuer Tauwerk Rigger, Segelmacher UND Zubehoerhaendler
/// (Chandler) getroffen, ohne die verunreinigte Kategorie greedy zu matchen.
struct ProviderQuery: Sendable {
    let categoryAllow: [String]
    let serviceTerms: [String]
}

/// Ableitung der Domaene aus Kategorie/Name. Bewusst MEHRSPRACHIG in der
/// Erkennung (Tauwerk = rope = cordage = touw ...), damit die Zuordnung
/// unabhaengig von der Sprache des Nutzers/Namens funktioniert.
enum ServiceKeywords {
    static func forEquipment(category: String, name: String = "") -> ProviderQuery {
        let c = (category + " " + name).lowercased()
        func any(_ ks: [String]) -> Bool { ks.contains { c.contains($0) } }

        // Tauwerk / laufendes Gut (ZUERST, da "genua..." sonst Segel triggert)
        if any(["rope", "tauwerk", "tauw", "leine", "festmacher", "schot", "fall",
                "spleiß", "spleiss", "cordage", "cordame", "cabo", "touw", "gréement", "line"]) {
            return ProviderQuery(
                categoryAllow: ["rigg", "rigger", "segelmacher", "sailmaker", "zubehör", "takelage"],
                serviceTerms: ["laufendes gut", "tauwerk", "takelage", "rigg"])
        }
        // Segel
        if any(["sail", "segel", "voile", "vela", "zeil", "genua", "gennaker", "spinnaker", "fock", "code 0"]) {
            return ProviderQuery(
                categoryAllow: ["segelmacher", "sailmaker", "zubehör"],
                serviceTerms: ["segel", "großsegel", "genua", "fock", "persenning"])
        }
        // Rigg / Mast / stehendes Gut
        if any(["rigg", "rigging", "mast", "spar", "stag", "want", "shroud", "takel"]) {
            return ProviderQuery(
                categoryAllow: ["rigg", "rigger", "segelmacher", "takelage"],
                serviceTerms: ["laufendes gut", "takelage", "bäume & masten", "rigg"])
        }
        // Motor / Antrieb
        if any(["engine", "motor", "moteur", "motore", "diesel", "propeller", "welle",
                "getriebe", "außenborder", "innenborder", "outboard", "inboard", "antrieb"]) {
            return ProviderQuery(
                categoryAllow: ["motorservice", "werkstatt", "zubehör"],
                serviceTerms: ["motor", "diesel", "antrieb", "getriebe", "welle", "propeller",
                               "außenbord", "innenbord", "e-antrieb"])
        }
        // Elektronik / Navigation / Elektrik
        if any(["electr", "elektr", "instrument", "navigation", "vhf", "radar", "gps",
                "battery", "batterie", "solar", "electronic", "plotter"]) {
            return ProviderQuery(
                categoryAllow: ["instrumente", "elektronik", "elektrik", "zubehör"],
                serviceTerms: ["elektr", "navigation", "instrument", "chartplotter", "bordnetz", "radar"])
        }
        // Rumpf / Unterwasser / Taucher / Lack
        if any(["hull", "rumpf", "gelcoat", "osmose", "antifouling", "lack", "paint",
                "unterwasser", "taucher", "reinig", "diver", "cleaning"]) {
            return ProviderQuery(
                categoryAllow: ["lackiererei", "bootsbauer", "werft"],
                serviceTerms: ["osmose", "antifouling", "gelcoat", "lack", "gfk", "teak",
                               "rumpf", "taucher", "unterwasser"])
        }
        // Anker / Kette
        if any(["anchor", "anker", "kette", "chain"]) {
            return ProviderQuery(categoryAllow: ["zubehör"], serviceTerms: ["anker", "kette"])
        }
        // Heizung / Klima
        if any(["heiz", "klima", "heating"]) {
            return ProviderQuery(categoryAllow: ["heizung/klima", "zubehör"], serviceTerms: ["heizung", "klima"])
        }
        // Fallback: Zubehoerhandel / Chandler statt ALLER Betriebe.
        return ProviderQuery(
            categoryAllow: ["zubehör"],
            serviceTerms: ["schiffszubehör", "decksausrüstung"])
    }
}
