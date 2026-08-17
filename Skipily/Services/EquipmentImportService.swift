//
//  EquipmentImportService.swift
//  Skipily
//
//  Lädt eine Excel-/CSV-Datei (Ausrüstung + Segelmessblatt + Tauwerk) zur
//  Edge Function `import-equipment-xlsx` hoch. Diese ist die gemeinsame
//  Parser-Quelle (Dedupe, Beispielzeilen-Filter, Kategorie-/Segel-/Tauwerk-
//  Mapping) für iOS und Web — die App zeigt nur Vorschau & Ergebnis.
//
//  Ablauf: preview(file, boat) → Nutzer bestätigt → commit(file, boat).
//

import Foundation
import Supabase

@MainActor
final class EquipmentImportService {
    static let shared = EquipmentImportService()
    private init() {}
    private var client: SupabaseClient { SupabaseManager.shared.client }

    // MARK: - Response-Modelle

    struct Summary: Decodable {
        let equipmentNew: Int
        let equipmentSkipped: Int
        let sails: Int
        let ropes: Int
        let unlinked: Int
    }

    struct EqPreview: Decodable, Identifiable {
        var id: String { name + (serialNumber ?? "") }
        let name: String
        let serialNumber: String?
        let category: String
        let dup: Bool
        let reason: String?
        let matchedName: String?
        enum CodingKeys: String, CodingKey {
            case name, category, dup, reason, matchedName
            case serialNumber = "serial_number"
        }
    }
    struct SailPreview: Decodable, Identifiable {
        var id: String { equipment + sailType }
        let equipment: String
        let sailType: String
        let linked: Bool
        enum CodingKeys: String, CodingKey {
            case equipment, linked
            case sailType = "sail_type"
        }
    }
    struct RopePreview: Decodable, Identifiable {
        var id: String { equipment + (articleNumber ?? "") }
        let equipment: String
        let articleNumber: String?
        let linked: Bool
        enum CodingKeys: String, CodingKey {
            case equipment, linked
            case articleNumber = "article_number"
        }
    }

    struct PreviewResponse: Decodable {
        let equipment: [EqPreview]
        let sails: [SailPreview]
        let ropes: [RopePreview]
        let summary: Summary
    }
    struct CommitResponse: Decodable {
        let summary: Summary
    }

    // Fehlermodell der Function (z. B. requires_plus).
    struct FnError: Decodable { let error: String?; let requires_plus: Bool? }

    private struct RequestBody: Encodable {
        let file_base64: String
        let boat_id: String
        let mode: String
    }

    enum ImportError: LocalizedError {
        case fileUnreadable
        case requiresPlus
        case server(String)
        var errorDescription: String? {
            switch self {
            case .fileUnreadable: return "Datei konnte nicht gelesen werden."
            case .requiresPlus:   return "Skipily Plus erforderlich."
            case .server(let m):  return m
            }
        }
    }

    /// Liest die Datei als Base64 (Security-Scoped-URL vom Document-Picker).
    static func base64(from url: URL) throws -> String {
        let needsAccess = url.startAccessingSecurityScopedResource()
        defer { if needsAccess { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url)
        return data.base64EncodedString()
    }

    func preview(fileBase64: String, boatId: UUID) async throws -> PreviewResponse {
        try await invoke(fileBase64: fileBase64, boatId: boatId, mode: "preview")
    }

    func commit(fileBase64: String, boatId: UUID) async throws -> CommitResponse {
        try await invoke(fileBase64: fileBase64, boatId: boatId, mode: "commit")
    }

    private func invoke<T: Decodable>(fileBase64: String, boatId: UUID, mode: String) async throws -> T {
        let body = RequestBody(file_base64: fileBase64, boat_id: boatId.uuidString, mode: mode)
        do {
            return try await client.functions.invoke("import-equipment-xlsx", options: .init(body: body))
        } catch let fnError as FunctionsError {
            // Function hat non-2xx geliefert; strukturierte Meldung auswerten.
            if case let .httpError(code, data) = fnError {
                let fn = try? JSONDecoder().decode(FnError.self, from: data)
                if code == 402 || fn?.requires_plus == true { throw ImportError.requiresPlus }
                throw ImportError.server(fn?.error ?? "Serverfehler (\(code)).")
            }
            throw fnError
        }
    }
}
