//
//  EditSuggestionService.swift
//  BoatCare
//

import Foundation
import Supabase
import Combine

/// Daten fuer INSERT in provider_edit_suggestions
struct EditSuggestionInsert: @preconcurrency Encodable, Sendable {
    let provider_id: String
    let suggested_by: String
    let suggested_name: String?
    let suggested_category: String?
    let suggested_category2: String?
    let suggested_category3: String?
    let suggested_street: String?
    let suggested_city: String?
    let suggested_postal_code: String?
    let suggested_country: String?
    let suggested_phone: String?
    let suggested_email: String?
    let suggested_website: String?
    let suggested_description: String?
    let suggested_services: [String]?
    let suggested_brands: [String]?
    let suggested_opening_hours: String?
}

/// Zentraler Service fuer Aenderungsvorschlaege
@MainActor
class EditSuggestionService: ObservableObject {
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var hasPendingSuggestion = false

    private let supabase = SupabaseManager.shared.client

    /// Pruefen ob User bereits einen ausstehenden Vorschlag fuer diesen Provider hat
    func checkPending(for providerId: UUID, userId: UUID) async {
        do {
            let response = try await supabase
                .from("provider_edit_suggestions")
                .select("id", head: false)
                .eq("provider_id", value: providerId.uuidString)
                .eq("suggested_by", value: userId.uuidString)
                .eq("status", value: "pending")
                .execute()
            // Decode as array to check if empty
            struct IdRow: Codable { let id: UUID }
            let rows = try JSONDecoder().decode([IdRow].self, from: response.data)
            hasPendingSuggestion = !rows.isEmpty
        } catch {
            hasPendingSuggestion = false
        }
    }

    /// Vorschlag einreichen
    func submitSuggestion(_ insert: EditSuggestionInsert) async -> Bool {
        isLoading = true
        errorMessage = nil

        do {
            try await supabase
                .from("provider_edit_suggestions")
                .insert(insert)
                .execute()

            isLoading = false
            hasPendingSuggestion = true
            return true
        } catch {
            print("EditSuggestionService: Fehler beim Einreichen: \(error)")
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }
}
