//
//  EquipmentSuggestionService.swift
//  Skipily
//
//  Holt KI-generierte Equipment-Vorschläge für ein Boot anhand des
//  bisherigen Equipment-Bestands. Ruft die suggest-equipment Edge
//  Function auf.
//

import Foundation
import Supabase

@MainActor
final class EquipmentSuggestionService {
    static let shared = EquipmentSuggestionService()

    struct Suggestion: Codable, Identifiable, Hashable {
        var id: String { name + category }
        let name: String
        let category: String
        let manufacturer_hint: String
        let why: String
        let maintenance_cycle_years: Int?
    }

    private struct RequestBody: Encodable {
        struct BoatPart: Encodable {
            let type: String?
            let manufacturer: String?
            let model: String?
            let year: Int?
            let length: Double?
            let engine: String?
        }
        struct EquipmentPart: Encodable {
            let name: String
            let category: String
        }
        let boat: BoatPart
        let existing_equipment: [EquipmentPart]
        let lang: String
    }

    private struct ResponseBody: Decodable {
        let suggestions: [Suggestion]
    }

    private init() {}

    private var client: SupabaseClient { SupabaseManager.shared.client }

    /// Fragt Vorschläge für ein konkretes Boot + dessen Equipment-Bestand an.
    func fetchSuggestions(
        boat: Boat,
        existing: [EquipmentItem]
    ) async throws -> [Suggestion] {
        let body = RequestBody(
            boat: .init(
                type: boat.boatType.isEmpty ? nil : boat.boatType,
                manufacturer: boat.manufacturer.isEmpty ? nil : boat.manufacturer,
                model: boat.model.isEmpty ? nil : boat.model,
                year: boat.year,
                length: boat.lengthMeters,
                engine: boat.engine.isEmpty ? nil : boat.engine
            ),
            existing_equipment: existing.map {
                .init(name: $0.name, category: $0.category)
            },
            lang: LanguageManager.shared.currentLanguage.code
        )

        let response: ResponseBody = try await client.functions.invoke(
            "suggest-equipment",
            options: .init(body: body)
        )
        return response.suggestions
    }
}
