//
//  AIChatService.swift
//  BoatCare
//
//  Service für den AI-Chat mit Claude via Supabase Edge Function
//

import Foundation
import Supabase

// MARK: - Chat Models

struct AIChatMessage: Codable {
    let role: String  // "user" or "assistant"
    let content: String
}

/// Vollständiger Kontext für den AI-Chat – Boote + Equipment
struct AIChatContext: Codable {
    let boats: [AIChatBoat]
}

struct AIChatBoat: Codable {
    let name: String
    let type: String?
    let manufacturer: String?
    let model: String?
    let year: Int?
    let length: Double?
    let engine: String?
    let homePort: String?
    let equipment: [AIChatEquipment]

    enum CodingKeys: String, CodingKey {
        case name, type, manufacturer, model, year, length, engine
        case homePort = "home_port"
        case equipment
    }
}

struct AIChatEquipment: Codable {
    let name: String
    let category: String
    let manufacturer: String?
    let model: String?
    let installationDate: String?
    let lastMaintenanceDate: String?
    let nextMaintenanceDate: String?
    let maintenanceCycleYears: Int?
    let serialNumber: String?
    let location: String?

    enum CodingKeys: String, CodingKey {
        case name, category, manufacturer, model
        case installationDate = "installation_date"
        case lastMaintenanceDate = "last_maintenance_date"
        case nextMaintenanceDate = "next_maintenance_date"
        case maintenanceCycleYears = "maintenance_cycle_years"
        case serialNumber = "serial_number"
        case location
    }
}

// MARK: - Service

@MainActor
class AIChatService {
    static let shared = AIChatService()

    private let endpoint = "\(SupabaseConfig.url)/functions/v1/ai-chat"
    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 45
        session = URLSession(configuration: config)
    }

    /// Sendet Nachrichten an Claude und gibt die Antwort zurück
    func sendMessage(
        messages: [AIChatMessage],
        boatContext: AIChatContext? = nil
    ) async throws -> String {
        guard let url = URL(string: endpoint) else {
            throw AIChatError.invalidURL
        }

        // Auth Token holen
        guard let accessToken = try? await SupabaseManager.shared.client.auth.session.accessToken else {
            throw AIChatError.notAuthenticated
        }

        // Request bauen
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")

        // Body
        struct RequestBody: Codable {
            let messages: [AIChatMessage]
            let boatContext: AIChatContext?
        }

        let body = RequestBody(messages: messages, boatContext: boatContext)
        request.httpBody = try JSONEncoder().encode(body)

        // Request senden
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AIChatError.networkError
        }

        // Response parsen
        struct APIResponse: Codable {
            let reply: String?
            let error: String?
        }

        let apiResponse = try JSONDecoder().decode(APIResponse.self, from: data)

        switch httpResponse.statusCode {
        case 200:
            guard let reply = apiResponse.reply else {
                throw AIChatError.emptyResponse
            }
            return reply
        case 401:
            throw AIChatError.notAuthenticated
        case 502:
            throw AIChatError.aiServiceError(apiResponse.error ?? "AI-Service nicht erreichbar")
        default:
            throw AIChatError.serverError(httpResponse.statusCode, apiResponse.error ?? "Unbekannter Fehler")
        }
    }

    /// Lädt vollständigen Boot- und Equipment-Kontext des eingeloggten Users
    func loadBoatContext() async -> AIChatContext? {
        do {
            // 1. Alle Boote laden
            struct BoatRow: Codable {
                let id: UUID
                let name: String
                let boat_type: String?
                let manufacturer: String?
                let model: String?
                let year_built: Int?
                let length_meters: Double?
                let engine: String?
                let home_port: String?
            }

            let boats: [BoatRow] = try await SupabaseManager.shared.client
                .from("boats")
                .select("id, name, boat_type, manufacturer, model, year_built, length_meters, engine, home_port")
                .order("length_meters", ascending: false)
                .execute()
                .value

            guard !boats.isEmpty else { return nil }

            // 2. Equipment für alle Boote laden
            struct EquipmentRow: Codable {
                let boat_id: UUID
                let name: String
                let category: String
                let manufacturer: String?
                let model: String?
                let installation_date: String?
                let last_maintenance_date: String?
                let next_maintenance_date: String?
                let maintenance_cycle_years: Int?
                let serial_number: String?
                let location_on_boat: String?
            }

            let boatIds = boats.map { $0.id.uuidString }
            let equipment: [EquipmentRow] = try await SupabaseManager.shared.client
                .from("equipment")
                .select("boat_id, name, category, manufacturer, model, installation_date, last_maintenance_date, next_maintenance_date, maintenance_cycle_years, serial_number, location_on_boat")
                .in("boat_id", values: boatIds)
                .execute()
                .value

            // 3. Equipment nach boot_id gruppieren
            var equipmentByBoat: [UUID: [AIChatEquipment]] = [:]
            for eq in equipment {
                let item = AIChatEquipment(
                    name: eq.name,
                    category: eq.category,
                    manufacturer: eq.manufacturer,
                    model: eq.model,
                    installationDate: eq.installation_date,
                    lastMaintenanceDate: eq.last_maintenance_date,
                    nextMaintenanceDate: eq.next_maintenance_date,
                    maintenanceCycleYears: eq.maintenance_cycle_years,
                    serialNumber: eq.serial_number,
                    location: eq.location_on_boat
                )
                equipmentByBoat[eq.boat_id, default: []].append(item)
            }

            // 4. Alles zusammenbauen
            let chatBoats = boats.map { boat in
                AIChatBoat(
                    name: boat.name,
                    type: boat.boat_type,
                    manufacturer: boat.manufacturer,
                    model: boat.model,
                    year: boat.year_built,
                    length: boat.length_meters,
                    engine: boat.engine,
                    homePort: boat.home_port,
                    equipment: equipmentByBoat[boat.id] ?? []
                )
            }

            return AIChatContext(boats: chatBoats)
        } catch {
            print("⚠️ Boot-Kontext konnte nicht geladen werden: \(error)")
            return nil
        }
    }
}

// MARK: - Errors

enum AIChatError: LocalizedError {
    case invalidURL
    case notAuthenticated
    case networkError
    case emptyResponse
    case aiServiceError(String)
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Ungültige Server-URL"
        case .notAuthenticated:
            return "Bitte melde dich erneut an"
        case .networkError:
            return "Keine Internetverbindung"
        case .emptyResponse:
            return "Keine Antwort erhalten"
        case .aiServiceError(let msg):
            return msg
        case .serverError(_, let msg):
            return msg
        }
    }
}
