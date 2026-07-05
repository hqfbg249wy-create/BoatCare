//
//  InstallationPlan.swift
//  Skipily
//
//  Montage-/Einbauplan für Bootstechnik. Komplementär zum Schaltplan:
//  während der Schaltplan WAS-mit-WAS verbindet, beschreibt der Montageplan
//  WIE und WO eingebaut wird (Schritte, Werkzeug, Material, Position an Bord).
//

import Foundation

enum InstallationDifficulty: String, Codable, CaseIterable {
    case beginner
    case intermediate
    case advanced
    case professional

    var displayName: String {
        switch self {
        case .beginner: return "Einfach"
        case .intermediate: return "Mittel"
        case .advanced: return "Fortgeschritten"
        case .professional: return "Fachbetrieb"
        }
    }

    var systemImage: String {
        switch self {
        case .beginner: return "1.circle"
        case .intermediate: return "2.circle"
        case .advanced: return "3.circle"
        case .professional: return "exclamationmark.shield"
        }
    }
}

struct InstallationMaterial: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var quantity: String?   // "2 m", "4 Stück"
    var note: String?       // "M6 Edelstahl A4"
}

struct InstallationTool: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var optional: Bool = false
}

struct InstallationStep: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var order: Int
    var title: String
    var detail: String
    /// Hinweis-Stufe: "warning" → rote Box im UI.
    var warning: String?
    /// Bezug zu einer Komponente aus dem zugehörigen Schaltplan (Node-ID).
    var schematicNodeID: String?
    /// Optionaler Bezug zu einer Position an Bord (Freitext).
    var location: String?
    /// Erwartete Dauer in Minuten.
    var durationMinutes: Int?
}

struct InstallationPlan: Identifiable, Codable {
    var id: UUID
    var boatID: UUID?
    /// Verknüpfter Schaltplan (optional — eine Montage kann auch standalone sein).
    var schematicID: UUID?
    var title: String
    var summary: String
    var difficulty: InstallationDifficulty
    var safetyNotes: [String]
    var materials: [InstallationMaterial]
    var tools: [InstallationTool]
    var steps: [InstallationStep]
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID = UUID(),
         boatID: UUID? = nil,
         schematicID: UUID? = nil,
         title: String,
         summary: String = "",
         difficulty: InstallationDifficulty = .intermediate,
         safetyNotes: [String] = [],
         materials: [InstallationMaterial] = [],
         tools: [InstallationTool] = [],
         steps: [InstallationStep] = [],
         createdAt: Date = Date(),
         updatedAt: Date = Date()) {
        self.id = id; self.boatID = boatID; self.schematicID = schematicID
        self.title = title; self.summary = summary
        self.difficulty = difficulty
        self.safetyNotes = safetyNotes
        self.materials = materials; self.tools = tools
        self.steps = steps
        self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    var totalDurationMinutes: Int {
        steps.compactMap { $0.durationMinutes }.reduce(0, +)
    }

    enum CodingKeys: String, CodingKey {
        case id, boatID, schematicID, title, summary, difficulty
        case safetyNotes, materials, tools, steps, createdAt, updatedAt
    }

    /// Toleranter Decoder analog Schematic.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let s = try? c.decode(String.self, forKey: .id), let u = UUID(uuidString: s) {
            self.id = u
        } else {
            self.id = UUID()
        }
        self.boatID = try? c.decode(UUID.self, forKey: .boatID)
        self.schematicID = try? c.decode(UUID.self, forKey: .schematicID)
        self.title = (try? c.decode(String.self, forKey: .title)) ?? "Montageplan"
        self.summary = (try? c.decode(String.self, forKey: .summary)) ?? ""
        self.difficulty = (try? c.decode(InstallationDifficulty.self, forKey: .difficulty)) ?? .intermediate
        self.safetyNotes = (try? c.decode([String].self, forKey: .safetyNotes)) ?? []
        self.materials = (try? c.decode([InstallationMaterial].self, forKey: .materials)) ?? []
        self.tools = (try? c.decode([InstallationTool].self, forKey: .tools)) ?? []
        self.steps = (try? c.decode([InstallationStep].self, forKey: .steps)) ?? []
        self.createdAt = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()
        self.updatedAt = (try? c.decode(Date.self, forKey: .updatedAt)) ?? Date()
    }
}
