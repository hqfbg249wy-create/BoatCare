//
//  SuggestEditView.swift
//  BoatCare
//

import SwiftUI

struct SuggestEditView: View {
    let provider: ServiceProvider
    @ObservedObject var suggestionService: EditSuggestionService

    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss

    // Editierbare Felder (vorausgefuellt mit aktuellen Werten)
    @State private var name: String = ""
    @State private var category: String = ""
    @State private var category2: String = ""
    @State private var category3: String = ""
    @State private var street: String = ""
    @State private var city: String = ""
    @State private var postalCode: String = ""
    @State private var country: String = ""
    @State private var phone: String = ""
    @State private var email: String = ""
    @State private var website: String = ""
    @State private var descriptionText: String = ""
    @State private var servicesText: String = ""
    @State private var brandsText: String = ""
    @State private var openingHoursText: String = ""

    @State private var showSuccess = false
    @State private var showError = false
    @State private var errorText = ""

    private let categories = [
        "werkstatt", "motorservice", "segelmacher", "instrumente",
        "zubehör", "werft", "tankstelle", "rigg", "gutachter",
        "kran", "lackierung", "marina", "winterlager", "heizung/klima"
    ]

    private var hasChanges: Bool {
        let trimmed = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        if trimmed(name) != (provider.name) { return true }
        if category != provider.category { return true }
        if category2 != (provider.category2 ?? "") { return true }
        if category3 != (provider.category3 ?? "") { return true }
        if trimmed(street) != (provider.street ?? "") { return true }
        if trimmed(city) != (provider.city ?? "") { return true }
        if trimmed(postalCode) != (provider.postalCode ?? "") { return true }
        if trimmed(country) != (provider.country ?? "") { return true }
        if trimmed(phone) != (provider.phone ?? "") { return true }
        if trimmed(email) != (provider.email ?? "") { return true }
        if trimmed(website) != (provider.website ?? "") { return true }
        if trimmed(descriptionText) != (provider.description ?? "") { return true }
        if trimmed(openingHoursText) != (provider.openingHours ?? "") { return true }
        let currentServices = provider.services?.joined(separator: ", ") ?? ""
        if trimmed(servicesText) != currentServices { return true }
        let currentBrands = provider.brands?.joined(separator: ", ") ?? ""
        if trimmed(brandsText) != currentBrands { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                // Grunddaten
                Section("suggest_edit.section_basic".loc) {
                    TextField("map.company_name".loc, text: $name)

                    // Primaere Kategorie (bestimmt Pin-Icon)
                    Picker("map.category".loc, selection: $category) {
                        ForEach(categories, id: \.self) { cat in
                            Text(LanguageManager.shared.localizedCategory(cat))
                                .tag(cat)
                        }
                    }

                    // Zweite Kategorie (optional)
                    Picker("map.category2".loc, selection: $category2) {
                        Text("—").tag("")
                        ForEach(categories, id: \.self) { cat in
                            Text(LanguageManager.shared.localizedCategory(cat))
                                .tag(cat)
                        }
                    }

                    // Dritte Kategorie (optional)
                    Picker("map.category3".loc, selection: $category3) {
                        Text("—").tag("")
                        ForEach(categories, id: \.self) { cat in
                            Text(LanguageManager.shared.localizedCategory(cat))
                                .tag(cat)
                        }
                    }
                }

                // Adresse
                Section("suggest_edit.section_address".loc) {
                    TextField("map.street".loc, text: $street)
                    TextField("map.postal_code".loc, text: $postalCode)
                    TextField("profile.city".loc, text: $city)
                    TextField("profile.country".loc, text: $country)
                }

                // Kontakt
                Section("suggest_edit.section_contact".loc) {
                    TextField("provider.phone".loc, text: $phone)
                        .keyboardType(.phonePad)
                    TextField("provider.email".loc, text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("provider.website".loc, text: $website)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                }

                // Leistungen & Marken
                Section("suggest_edit.section_services".loc) {
                    TextField("suggest_edit.services_hint".loc, text: $servicesText, axis: .vertical)
                        .lineLimit(2...5)
                    TextField("suggest_edit.brands_hint".loc, text: $brandsText, axis: .vertical)
                        .lineLimit(2...5)
                }

                // Oeffnungszeiten
                Section("suggest_edit.section_hours".loc) {
                    TextField("suggest_edit.opening_hours_hint".loc, text: $openingHoursText, axis: .vertical)
                        .lineLimit(3...8)
                }

                // Beschreibung
                Section("suggest_edit.section_description".loc) {
                    TextField("suggest_edit.description_hint".loc, text: $descriptionText, axis: .vertical)
                        .lineLimit(3...8)
                }

                // Info-Hinweis
                Section {
                    Label("suggest_edit.info_hint".loc, systemImage: "info.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if suggestionService.hasPendingSuggestion {
                    Section {
                        Label("suggest_edit.pending_hint".loc, systemImage: "clock.badge.checkmark")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("suggest_edit.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("suggest_edit.submit".loc) {
                        Task { await submit() }
                    }
                    .disabled(!hasChanges || suggestionService.isLoading)
                    .fontWeight(.semibold)
                }
            }
            .alert("suggest_edit.success".loc, isPresented: $showSuccess) {
                Button("general.ok".loc) { dismiss() }
            } message: {
                Text("suggest_edit.success_hint".loc)
            }
            .alert("general.error".loc, isPresented: $showError) {
                Button("general.ok".loc) { }
            } message: {
                Text(errorText)
            }
            .onAppear { prefill() }
        }
    }

    private func prefill() {
        name = provider.name
        category = provider.category
        category2 = provider.category2 ?? ""
        category3 = provider.category3 ?? ""
        street = provider.street ?? ""
        city = provider.city ?? ""
        postalCode = provider.postalCode ?? ""
        country = provider.country ?? ""
        phone = provider.phone ?? ""
        email = provider.email ?? ""
        website = provider.website ?? ""
        descriptionText = provider.description ?? ""
        servicesText = provider.services?.joined(separator: ", ") ?? ""
        brandsText = provider.brands?.joined(separator: ", ") ?? ""
        openingHoursText = provider.openingHours ?? ""
    }

    private func submit() async {
        guard let userId = authService.currentUser?.id else {
            errorText = "suggest_edit.login_required".loc
            showError = true
            return
        }

        let trimmed = { (s: String) -> String? in
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }

        let csvToArray = { (s: String) -> [String]? in
            let arr = s.components(separatedBy: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return arr.isEmpty ? nil : arr
        }

        // Nur geaenderte Felder senden
        let sugName = trimmed(name) != provider.name ? trimmed(name) : nil
        let sugCategory = category != provider.category ? category : nil
        let sugCategory2 = category2 != (provider.category2 ?? "") ? (category2.isEmpty ? nil : category2) : nil
        let sugCategory3 = category3 != (provider.category3 ?? "") ? (category3.isEmpty ? nil : category3) : nil
        let sugStreet = trimmed(street) != (provider.street ?? "") ? trimmed(street) : nil
        let sugCity = trimmed(city) != (provider.city ?? "") ? trimmed(city) : nil
        let sugPostal = trimmed(postalCode) != (provider.postalCode ?? "") ? trimmed(postalCode) : nil
        let sugCountry = trimmed(country) != (provider.country ?? "") ? trimmed(country) : nil
        let sugPhone = trimmed(phone) != (provider.phone ?? "") ? trimmed(phone) : nil
        let sugEmail = trimmed(email) != (provider.email ?? "") ? trimmed(email) : nil
        let sugWebsite = trimmed(website) != (provider.website ?? "") ? trimmed(website) : nil
        let sugDesc = trimmed(descriptionText) != (provider.description ?? "") ? trimmed(descriptionText) : nil
        let sugHours = trimmed(openingHoursText) != (provider.openingHours ?? "") ? trimmed(openingHoursText) : nil

        let currentServices = provider.services?.joined(separator: ", ") ?? ""
        let sugServices = trimmed(servicesText) != currentServices ? csvToArray(servicesText) : nil

        let currentBrands = provider.brands?.joined(separator: ", ") ?? ""
        let sugBrands = trimmed(brandsText) != currentBrands ? csvToArray(brandsText) : nil

        let insert = EditSuggestionInsert(
            provider_id: provider.id.uuidString,
            suggested_by: userId.uuidString,
            suggested_name: sugName,
            suggested_category: sugCategory,
            suggested_category2: sugCategory2,
            suggested_category3: sugCategory3,
            suggested_street: sugStreet,
            suggested_city: sugCity,
            suggested_postal_code: sugPostal,
            suggested_country: sugCountry,
            suggested_phone: sugPhone,
            suggested_email: sugEmail,
            suggested_website: sugWebsite,
            suggested_description: sugDesc,
            suggested_services: sugServices,
            suggested_brands: sugBrands,
            suggested_opening_hours: sugHours
        )

        let success = await suggestionService.submitSuggestion(insert)

        if success {
            showSuccess = true
        } else {
            errorText = suggestionService.errorMessage ?? "suggest_edit.login_required".loc
            showError = true
        }
    }
}
