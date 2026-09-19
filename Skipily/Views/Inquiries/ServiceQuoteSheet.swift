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

struct ServiceQuoteSheet: View {
    let keywords: [String]
    let boatId: UUID?

    @State private var subject: String
    @State private var message: String
    @Environment(\.dismiss) private var dismiss

    @State private var allProviders: [QuoteProvider] = []
    @State private var countries: [QuoteCountry] = []
    @State private var selectedCountries: Set<String> = []
    @State private var selected: Set<UUID> = []
    @State private var isLoading = true
    @State private var isSending = false
    @State private var loadError: String?
    @State private var resultMessage: String?

    init(keywords: [String], subject: String, message: String, boatId: UUID?) {
        self.keywords = keywords
        self.boatId = boatId
        _subject = State(initialValue: subject)
        _message = State(initialValue: message)
    }

    private var visibleProviders: [QuoteProvider] {
        guard !selectedCountries.isEmpty else { return allProviders }
        return allProviders.filter { selectedCountries.contains($0.country ?? "") }
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
                        Text("quote.footer_hint".loc)
                    }
                }
            }
            .navigationTitle("quote.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("general.cancel".loc) { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await send() }
                    } label: {
                        if isSending { ProgressView() }
                        else { Text(String(format: "quote.send_n".loc, selected.count)).fontWeight(.semibold) }
                    }
                    .disabled(isSending || selected.isEmpty || subject.isEmpty || message.isEmpty)
                }
            }
        }
        .task { await load() }
    }

    @MainActor
    private func load() async {
        isLoading = true
        loadError = nil
        do {
            let res = try await InquiryService.shared.findProviders(keywords: keywords, countries: [])
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
                providerIds: Array(selected), boatId: boatId, subject: subject, message: message)
            resultMessage = String(format: "quote.sent".loc, n)
            try? await Task.sleep(nanoseconds: 900_000_000)
            dismiss()
        } catch {
            resultMessage = "\("general.error".loc): \(error.localizedDescription)"
        }
    }
}

/// Ableitung passender Provider-Stichworte aus einer Ausruestungs-Kategorie/-Name.
/// Leeres Ergebnis -> alle Betriebe werden gezeigt (Nutzer filtert/waehlt selbst).
enum ServiceKeywords {
    static func forEquipment(category: String, name: String = "") -> [String] {
        let c = (category + " " + name).lowercased()
        func any(_ ks: [String]) -> Bool { ks.contains { c.contains($0) } }
        if any(["sail", "segel", "rigg", "genua", "gennaker", "spinnaker", "fock", "code 0"]) {
            return ["segelmacher", "segel", "großsegel", "genua", "laufendes gut", "takelage", "rigg", "sailmaker"]
        }
        if any(["rope", "tauwerk", "leine", "festmacher", "schot", "fall"]) {
            return ["tauwerk", "laufendes gut", "takelage", "rigg", "spleiss", "spleiß", "leine", "festmacher"]
        }
        if any(["engine", "motor", "diesel", "propeller", "welle", "getriebe", "außenborder", "innenborder"]) {
            return ["motorservice", "motor", "diesel", "außenborder", "innenborder", "mechanik", "propeller", "welle"]
        }
        if any(["electr", "elektr", "instrument", "navigation", "vhf", "radar", "battery", "batterie", "solar"]) {
            return ["instrumente", "elektronik", "elektrik", "navigation"]
        }
        if any(["hull", "rumpf", "gelcoat", "osmose", "antifouling", "lack", "paint"]) {
            return ["lackier", "osmose", "antifouling", "gelcoat", "bootsbau"]
        }
        if any(["heiz", "klima", "heating"]) { return ["heizung", "klima"] }
        return []   // keine spezifische Zuordnung -> alle Betriebe
    }
}
