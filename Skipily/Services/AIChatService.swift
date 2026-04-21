//
//  AIChatService.swift
//  Skipily
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

// MARK: - Persistence Models

/// Kurz-Info einer gespeicherten Chat-Session (fuer Historien-Liste).
struct ChatSessionSummary: Identifiable, Hashable {
    let id: UUID
    let title: String
    let updatedAt: Date
    let preview: String?
}

/// Eine aus der DB geladene Nachricht inkl. Feedback (falls vorhanden).
struct PersistedChatMessage: Identifiable, Hashable {
    let id: UUID
    let role: String        // "user" | "assistant"
    let content: String
    let createdAt: Date
    var feedback: ChatFeedback?
}

/// Nutzer-Feedback zu einer Assistentenantwort.
struct ChatFeedback: Codable, Hashable {
    let rating: String          // "thumbs_up" | "thumbs_down"
    let outcome: String?        // "solved" | "partial" | "not_solved" | nil
    let comment: String?
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

    /// Fragt Claude nach alternativen Suchbegriffen, wenn die direkte Produkt-
    /// Suche im Shop leer bleibt. Gibt eine Liste von bis zu 5 kurzen
    /// deutschen Keywords/Kategorien zurück (z.B. "Impeller", "Seewasserpumpe",
    /// "Kühlkreislauf"), mit denen der Aufrufer erneut suchen kann.
    func suggestSearchAlternatives(
        originalQuery: String,
        equipmentContext: String? = nil
    ) async throws -> [String] {
        let contextLine = equipmentContext.map { "\nDetails: \($0)" } ?? ""
        let userPrompt = """
        Ein Nutzer sucht im Bootsshop nach Ersatzteilen/Zubehör für dieses Gerät:
        "\(originalQuery)"\(contextLine)

        Die direkte Suche lieferte keine Treffer. Gib mir genau 5 kurze, deutsche
        Alternativ-Suchbegriffe, mit denen ich nochmal suchen soll. Wähle:
        - Generische Oberbegriffe (z.B. "Impeller" statt "Volvo Penta Impeller")
        - Typische Verschleißteile / Zubehör dieses Geräts
        - Branchenübliche Synonyme

        Antworte AUSSCHLIESSLICH mit einer durch Kommas getrennten Liste, ohne
        Einleitung, ohne Nummerierung, ohne Erklärungen.
        Beispiel: Impeller, Seewasserpumpe, Zinkanode, Kühlwasserfilter, Thermostat
        """

        let messages = [AIChatMessage(role: "user", content: userPrompt)]
        let reply = try await sendMessage(messages: messages, boatContext: nil)

        // Parse: Komma-separiert, trimmen, auf 2–40 Zeichen pro Token beschränken.
        let tokens = reply
            .replacingOccurrences(of: "\n", with: ",")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.count >= 2 && $0.count <= 40 }
            .prefix(5)

        return Array(tokens)
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
            AppLog.warning("Boot-Kontext konnte nicht geladen werden: \(error)")
            return nil
        }
    }

    // MARK: - Persistence (Historie + Feedback-Loop)

    /// Legt eine neue Chat-Session an und gibt deren ID zurueck.
    /// Der Boots-Kontext wird als Snapshot mitgespeichert (JSONB), damit die
    /// Session spaeter reproduzierbar bleibt, auch wenn sich die Bootsdaten aendern.
    func createSession(title: String, boatContext: AIChatContext?) async throws -> UUID {
        guard let userId = SupabaseManager.shared.client.auth.currentUser?.id else {
            throw AIChatError.notAuthenticated
        }

        struct InsertRow: Encodable {
            let user_id: UUID
            let title: String
            let boat_context_snapshot: AIChatContext?
        }

        struct ReturnedRow: Decodable { let id: UUID }

        let row = InsertRow(
            user_id: userId,
            title: title.isEmpty ? "Neues Gespraech" : String(title.prefix(120)),
            boat_context_snapshot: boatContext
        )

        let result: [ReturnedRow] = try await SupabaseManager.shared.client
            .from("ai_chat_sessions")
            .insert(row, returning: .representation)
            .select("id")
            .execute()
            .value

        guard let id = result.first?.id else {
            throw AIChatError.emptyResponse
        }
        return id
    }

    /// Speichert eine Message und gibt die neu vergebene ID zurueck.
    /// `role` muss "user" oder "assistant" sein.
    @discardableResult
    func saveMessage(sessionId: UUID, role: String, content: String) async throws -> UUID {
        guard let userId = SupabaseManager.shared.client.auth.currentUser?.id else {
            throw AIChatError.notAuthenticated
        }

        struct InsertRow: Encodable {
            let session_id: UUID
            let user_id: UUID
            let role: String
            let content: String
        }
        struct ReturnedRow: Decodable { let id: UUID }

        let row = InsertRow(session_id: sessionId, user_id: userId, role: role, content: content)

        let result: [ReturnedRow] = try await SupabaseManager.shared.client
            .from("ai_chat_messages")
            .insert(row, returning: .representation)
            .select("id")
            .execute()
            .value

        guard let id = result.first?.id else {
            throw AIChatError.emptyResponse
        }
        return id
    }

    /// Aktualisiert den Session-Titel (z.B. aus erster User-Frage abgeleitet).
    func updateSessionTitle(id: UUID, title: String) async throws {
        struct UpdateRow: Encodable { let title: String }
        let trimmed = String(title.prefix(120))
        try await SupabaseManager.shared.client
            .from("ai_chat_sessions")
            .update(UpdateRow(title: trimmed))
            .eq("id", value: id)
            .execute()
    }

    /// Loescht eine komplette Session inklusive aller Messages (Cascade).
    func deleteSession(id: UUID) async throws {
        try await SupabaseManager.shared.client
            .from("ai_chat_sessions")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    /// Listet alle Sessions des aktuellen Users, neueste zuerst.
    func listSessions() async throws -> [ChatSessionSummary] {
        struct Row: Decodable {
            let id: UUID
            let title: String
            let updated_at: Date
        }

        let rows: [Row] = try await SupabaseManager.shared.client
            .from("ai_chat_sessions")
            .select("id, title, updated_at")
            .order("updated_at", ascending: false)
            .limit(100)
            .execute()
            .value

        // Preview aus letzter User-Nachricht ziehen (1 Query pro Session - OK bei <=100)
        var summaries: [ChatSessionSummary] = []
        for row in rows {
            let preview = (try? await lastUserPreview(sessionId: row.id)) ?? nil
            summaries.append(ChatSessionSummary(
                id: row.id,
                title: row.title,
                updatedAt: row.updated_at,
                preview: preview
            ))
        }
        return summaries
    }

    private func lastUserPreview(sessionId: UUID) async throws -> String? {
        struct Row: Decodable { let content: String }
        let rows: [Row] = try await SupabaseManager.shared.client
            .from("ai_chat_messages")
            .select("content")
            .eq("session_id", value: sessionId)
            .eq("role", value: "user")
            .order("created_at", ascending: false)
            .limit(1)
            .execute()
            .value
        return rows.first.map { String($0.content.prefix(140)) }
    }

    /// Laedt alle Nachrichten einer Session chronologisch, inkl. Feedback.
    func loadMessages(sessionId: UUID) async throws -> [PersistedChatMessage] {
        struct MsgRow: Decodable {
            let id: UUID
            let role: String
            let content: String
            let created_at: Date
        }
        let msgs: [MsgRow] = try await SupabaseManager.shared.client
            .from("ai_chat_messages")
            .select("id, role, content, created_at")
            .eq("session_id", value: sessionId)
            .order("created_at", ascending: true)
            .execute()
            .value

        let assistantIds = msgs.filter { $0.role == "assistant" }.map { $0.id }
        let feedbackMap = assistantIds.isEmpty
            ? [:]
            : (try? await loadFeedback(messageIds: assistantIds)) ?? [:]

        return msgs.map { row in
            PersistedChatMessage(
                id: row.id,
                role: row.role,
                content: row.content,
                createdAt: row.created_at,
                feedback: feedbackMap[row.id]
            )
        }
    }

    /// Laedt Feedback fuer eine Menge von Message-IDs.
    func loadFeedback(messageIds: [UUID]) async throws -> [UUID: ChatFeedback] {
        guard !messageIds.isEmpty else { return [:] }
        struct Row: Decodable {
            let message_id: UUID
            let rating: String
            let outcome: String?
            let comment: String?
        }
        let rows: [Row] = try await SupabaseManager.shared.client
            .from("ai_chat_feedback")
            .select("message_id, rating, outcome, comment")
            .in("message_id", values: messageIds.map { $0.uuidString })
            .execute()
            .value

        var map: [UUID: ChatFeedback] = [:]
        for r in rows {
            map[r.message_id] = ChatFeedback(rating: r.rating, outcome: r.outcome, comment: r.comment)
        }
        return map
    }

    /// Legt Feedback an oder aktualisiert vorhandenes (UNIQUE(message_id, user_id)).
    func submitFeedback(
        messageId: UUID,
        rating: String,
        outcome: String? = nil,
        comment: String? = nil
    ) async throws {
        guard let userId = SupabaseManager.shared.client.auth.currentUser?.id else {
            throw AIChatError.notAuthenticated
        }

        struct UpsertRow: Encodable {
            let message_id: UUID
            let user_id: UUID
            let rating: String
            let outcome: String?
            let comment: String?
        }

        let row = UpsertRow(
            message_id: messageId,
            user_id: userId,
            rating: rating,
            outcome: outcome,
            comment: comment?.isEmpty == true ? nil : comment
        )

        try await SupabaseManager.shared.client
            .from("ai_chat_feedback")
            .upsert(row, onConflict: "message_id,user_id")
            .execute()
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
