//
//  SchematicService.swift
//  Skipily
//
//  Verwaltet Schaltpläne und Montagepläne pro Boot.
//  - Lokale Persistenz via JSON-File (Documents-Directory) bis ein Supabase-
//    Schema steht. Hooks für späteren Backend-Sync sind vorbereitet.
//  - KI-Generierung via existierender ai-chat Edge Function mit speziellem
//    System-Prompt + JSON-Output-Constraint.
//

import Foundation
import Combine

@MainActor
final class SchematicService: ObservableObject {
    static let shared = SchematicService()

    @Published private(set) var schematics: [Schematic] = []
    @Published private(set) var installationPlans: [InstallationPlan] = []
    @Published private(set) var isGenerating = false
    @Published var lastError: String?
    /// Roh-Antwort der KI vom letzten Aufruf — fürs Debugging im UI.
    @Published private(set) var lastRawResponse: String?

    private let fileManager = FileManager.default

    private init() {
        load()
    }

    // MARK: - Persistenz

    private var schematicsURL: URL {
        let dir = try? fileManager.url(for: .documentDirectory, in: .userDomainMask,
                                       appropriateFor: nil, create: true)
        return (dir ?? URL(fileURLWithPath: NSTemporaryDirectory()))
            .appendingPathComponent("schematics.json")
    }

    private var plansURL: URL {
        let dir = try? fileManager.url(for: .documentDirectory, in: .userDomainMask,
                                       appropriateFor: nil, create: true)
        return (dir ?? URL(fileURLWithPath: NSTemporaryDirectory()))
            .appendingPathComponent("installation_plans.json")
    }

    private func load() {
        if let data = try? Data(contentsOf: schematicsURL),
           let decoded = try? JSONDecoder.iso8601().decode([Schematic].self, from: data) {
            schematics = decoded
        }
        if let data = try? Data(contentsOf: plansURL),
           let decoded = try? JSONDecoder.iso8601().decode([InstallationPlan].self, from: data) {
            installationPlans = decoded
        }
    }

    private func persist() {
        if let data = try? JSONEncoder.iso8601().encode(schematics) {
            try? data.write(to: schematicsURL, options: .atomic)
        }
        if let data = try? JSONEncoder.iso8601().encode(installationPlans) {
            try? data.write(to: plansURL, options: .atomic)
        }
    }

    // MARK: - CRUD

    func schematics(forBoat boatID: UUID?) -> [Schematic] {
        schematics
            .filter { boatID == nil || $0.boatID == boatID }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func plans(forBoat boatID: UUID?) -> [InstallationPlan] {
        installationPlans
            .filter { boatID == nil || $0.boatID == boatID }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func save(_ schematic: Schematic) {
        var updated = schematic
        updated.updatedAt = Date()
        if let idx = schematics.firstIndex(where: { $0.id == schematic.id }) {
            schematics[idx] = updated
        } else {
            schematics.append(updated)
        }
        persist()
    }

    func save(_ plan: InstallationPlan) {
        var updated = plan
        updated.updatedAt = Date()
        if let idx = installationPlans.firstIndex(where: { $0.id == plan.id }) {
            installationPlans[idx] = updated
        } else {
            installationPlans.append(updated)
        }
        persist()
    }

    func delete(schematic id: UUID) {
        schematics.removeAll { $0.id == id }
        // Verknüpfte Pläne lösen (nicht löschen, nur Bezug kappen).
        for i in installationPlans.indices where installationPlans[i].schematicID == id {
            installationPlans[i].schematicID = nil
        }
        persist()
    }

    func delete(plan id: UUID) {
        installationPlans.removeAll { $0.id == id }
        persist()
    }

    // MARK: - AI Generierung

    /// Ein KI-vorgeschlagenes Equipment, das typischerweise zur Domäne gehört
    /// aber im Boot noch nicht erfasst ist.
    struct SuggestedMissingEquipment: Codable, Hashable, Identifiable {
        var id: String { name }
        let name: String
        let reason: String
    }

    /// Ergebnis der ersten Stufe: was passt aus dem vorhandenen Equipment,
    /// was fehlt typischerweise.
    struct EquipmentSuggestion: Codable {
        var relevantExistingNames: [String]
        var suggestedMissing: [SuggestedMissingEquipment]
    }

    /// Fragt die KI, welche der vorhandenen Equipment-Items zum Plan-Bereich
    /// passen UND welche typischen Komponenten in dem Bereich noch fehlen.
    func suggestEquipment(
        for domain: SchematicDomain,
        task: String,
        boat: AIChatBoat?
    ) async throws -> EquipmentSuggestion {
        isGenerating = true
        defer { isGenerating = false }

        let equipmentList: String
        if let items = boat?.equipment, !items.isEmpty {
            var lines: [String] = []
            for (idx, e) in items.enumerated() {
                var line = "  \(idx + 1). \(e.name)"
                if let m = e.manufacturer, !m.isEmpty { line += " — \(m)" }
                if let mo = e.model, !mo.isEmpty { line += " \(mo)" }
                line += " [\(e.category)]"
                lines.append(line)
            }
            equipmentList = lines.joined(separator: "\n")
        } else {
            equipmentList = "(kein Equipment hinterlegt)"
        }

        let prompt = """
        Du bist Marine-Techniker. Wähle aus der folgenden Equipment-Liste alle
        Geräte aus, die zu einem Plan für "\(domain.displayName)" gehören —
        Aufgabe: "\(task.isEmpty ? "Übersichtsplan" : task)".

        Zusätzlich: schlage typische Komponenten vor, die für diesen Bereich
        üblich sind aber in der Liste FEHLEN (z. B. fehlende Sicherung,
        fehlender Hauptschalter, fehlender Wassertank etc.).

        VORHANDENES EQUIPMENT:
        \(equipmentList)

        Antworte STRENG als JSON, kein Prosa-Text:
        {
          "relevantExistingNames": ["genau die Namen aus der Liste oben, die zur Domäne passen"],
          "suggestedMissing": [
            {"name": "Bezeichnung", "reason": "Wozu wird das gebraucht"}
          ]
        }
        """

        let reply = try await AIChatService.shared.sendMessage(
            messages: [AIChatMessage(role: "user", content: prompt)],
            boatContext: nil
        )
        lastRawResponse = reply

        let json = Self.extractJSON(from: reply)
        guard let data = json.data(using: .utf8) else {
            throw SchematicError.invalidResponse(raw: reply)
        }
        do {
            return try Self.lenientDecoder().decode(EquipmentSuggestion.self, from: data)
        } catch {
            AppLog.error("suggestEquipment decode failed: \(error)\nRaw: \(json.prefix(600))")
            throw SchematicError.invalidResponse(raw: reply)
        }
    }

    /// Erzeugt einen Schaltplan via KI. Nutzt die existierende `ai-chat`-Edge-Function
    /// mit einem speziellen System-Prompt, der JSON-Output erzwingt.
    func generateSchematic(
        domain: SchematicDomain,
        boat: AIChatBoat?,
        userPrompt: String,
        selectedExistingNames: [String] = [],
        selectedMissingNames: [String] = []
    ) async throws -> Schematic {
        isGenerating = true
        defer { isGenerating = false }

        let prompt = Self.buildSchematicPrompt(
            domain: domain,
            boat: boat,
            userPrompt: userPrompt,
            selectedExistingNames: selectedExistingNames,
            selectedMissingNames: selectedMissingNames
        )

        let reply = try await AIChatService.shared.sendMessage(
            messages: [AIChatMessage(role: "user", content: prompt)],
            boatContext: nil
        )
        lastRawResponse = reply

        let json = Self.extractJSON(from: reply)
        guard let data = json.data(using: .utf8) else {
            throw SchematicError.invalidResponse(raw: reply)
        }
        do {
            var schematic = try Self.lenientDecoder().decode(Schematic.self, from: data)
            schematic.id = UUID()
            schematic.domain = domain
            schematic.createdAt = Date()
            schematic.updatedAt = Date()
            return schematic
        } catch {
            AppLog.error("SchematicService decode failed: \(error)\nRaw (first 800): \(json.prefix(800))")
            throw SchematicError.invalidResponse(raw: reply)
        }
    }

    /// Erzeugt einen Montage-/Einbauplan zu einer Komponente/Aufgabe.
    func generateInstallationPlan(
        task: String,
        boat: AIChatBoat?,
        relatedSchematic: Schematic? = nil
    ) async throws -> InstallationPlan {
        isGenerating = true
        defer { isGenerating = false }

        let prompt = Self.buildInstallationPrompt(
            task: task,
            boat: boat,
            schematic: relatedSchematic
        )

        let reply = try await AIChatService.shared.sendMessage(
            messages: [AIChatMessage(role: "user", content: prompt)],
            boatContext: nil
        )
        lastRawResponse = reply

        let json = Self.extractJSON(from: reply)
        guard let data = json.data(using: .utf8) else {
            throw SchematicError.invalidResponse(raw: reply)
        }
        do {
            var plan = try Self.lenientDecoder().decode(InstallationPlan.self, from: data)
            plan.id = UUID()
            plan.schematicID = relatedSchematic?.id
            plan.createdAt = Date()
            plan.updatedAt = Date()
            return plan
        } catch {
            AppLog.error("InstallationPlan decode failed: \(error)\nRaw (first 800): \(json.prefix(800))")
            throw SchematicError.invalidResponse(raw: reply)
        }
    }

    /// Decoder mit toleranter Date-Strategie — KI liefert oft "2026-06-03" oder
    /// epoch-Sekunden statt strikt ISO8601 mit Uhrzeit/TZ.
    private static func lenientDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        let isoFull = ISO8601DateFormatter()
        isoFull.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoBasic = ISO8601DateFormatter()
        isoBasic.formatOptions = [.withInternetDateTime]
        let dateOnly = DateFormatter()
        dateOnly.dateFormat = "yyyy-MM-dd"
        dateOnly.timeZone = TimeZone(secondsFromGMT: 0)

        d.dateDecodingStrategy = .custom { dec in
            let c = try dec.singleValueContainer()
            if let s = try? c.decode(String.self) {
                if let d = isoFull.date(from: s) { return d }
                if let d = isoBasic.date(from: s) { return d }
                if let d = dateOnly.date(from: s) { return d }
            }
            if let ts = try? c.decode(Double.self) {
                return Date(timeIntervalSince1970: ts)
            }
            return Date()
        }
        return d
    }

    // MARK: - Prompts

    private static func buildSchematicPrompt(
        domain: SchematicDomain,
        boat: AIChatBoat?,
        userPrompt: String,
        selectedExistingNames: [String] = [],
        selectedMissingNames: [String] = []
    ) -> String {
        let boatBlock = boat.map { b -> String in
            let equipmentList: String
            if b.equipment.isEmpty {
                equipmentList = "  (kein Equipment hinterlegt)"
            } else {
                equipmentList = b.equipment.map { e in
                    var parts = ["  - \(e.name)"]
                    if let m = e.manufacturer, !m.isEmpty { parts.append(m) }
                    if let mo = e.model, !mo.isEmpty { parts.append(mo) }
                    if !e.category.isEmpty { parts.append("[\(e.category)]") }
                    if let loc = e.location, !loc.isEmpty { parts.append("Position: \(loc)") }
                    return parts.joined(separator: " · ")
                }.joined(separator: "\n")
            }
            return """
            Boot:
            - Typ: \(b.type ?? "n/a")
            - Hersteller/Modell: \(b.manufacturer ?? "n/a") \(b.model ?? "")
            - Länge: \(b.length.map { "\($0) m" } ?? "n/a")
            - Motor: \(b.engine ?? "n/a")

            VERBAUTES EQUIPMENT (diese Geräte gibt es am Boot wirklich — nutze
            sie bevorzugt im Plan und erfinde keine zusätzlichen Komponenten,
            wenn sie für die Aufgabe nicht nötig sind):
            \(equipmentList)
            """
        } ?? "Boot: nicht angegeben"

        let selectionBlock: String = {
            var parts: [String] = []
            if !selectedExistingNames.isEmpty {
                parts.append("""
                Diese vorhandenen Geräte SOLLEN im Plan vorkommen
                (Eigner-Auswahl, nutze exakt diese Namen):
                \(selectedExistingNames.map { "  - \($0)" }.joined(separator: "\n"))
                """)
            }
            if !selectedMissingNames.isEmpty {
                parts.append("""
                Diese typischen Komponenten ergänzen
                (Eigner-Wunsch — noch nicht im Equipment-Inventar):
                \(selectedMissingNames.map { "  - \($0)" }.joined(separator: "\n"))
                """)
            }
            return parts.joined(separator: "\n\n")
        }()

        return """
        Du bist Marine-Elektrik-/Technik-Fachmann. Erstelle einen Schaltplan
        als STRENG VALIDES JSON, KEIN Prosa-Text außerhalb des JSON.

        WICHTIG: Der generierte Plan ist EIN VORSCHLAG für eine mögliche
        Variante. Die tatsächliche Installation MUSS von einem qualifizierten
        Fachbetrieb ausgeführt und abgenommen werden. Plane konservativ.

        Domäne: \(domain.displayName)
        Nutzer-Anforderung: \(userPrompt)

        \(boatBlock)

        \(selectionBlock)

        Vorzugsweise verwendete Bauteile (echter Marine-Katalog):
        \(MarineComponentLibrary.systemPromptCatalog())

        Regeln:
        - Jeder Verbraucher muss eine Sicherung haben (entweder als eigene Node
          vom Typ "fuse" oder via edge.fuseAmps).
        - Kabelquerschnitt (gaugeMM2) wählen, der die Last sicher trägt
          (ABYC E-11). Lieber großzügiger.
        - Bilgepumpe immer direkt an Batterie (NICHT über Hauptschalter).
        - Layout: x/y zwischen 0 und 1, Batterie links (x ≈ 0.1), Verbraucher
          rechts (x ≈ 0.85), Sicherungen mittig.
        - IDs als kurze Slugs ("bat_main", "fuse_bilge"), nicht UUIDs.

        Antwort-Format (genau dieses Schema):
        {
          "id": "REPLACE",
          "title": "kurzer Titel",
          "domain": "\(domain.rawValue)",
          "notes": "optionaler Hinweis",
          "nodes": [
            {"id": "...", "kind": "battery|fuse|mainSwitch|busbar|load|pump|light|...",
             "label": "...", "manufacturer": "...", "model": "...",
             "voltage": 12, "currentAmps": 0, "powerWatts": 0,
             "capacity": 0, "location": "...", "x": 0.1, "y": 0.5}
          ],
          "edges": [
            {"id": "...", "fromNodeID": "...", "toNodeID": "...",
             "kind": "dcPositive|dcNegative|acLive|...",
             "gaugeMM2": 6, "lengthMeters": 2, "protectedByNodeID": "...",
             "fuseAmps": 0, "label": "..."}
          ],
          "createdAt": "2026-01-01T00:00:00Z",
          "updatedAt": "2026-01-01T00:00:00Z"
        }

        Antworte AUSSCHLIESSLICH mit dem JSON-Objekt. Kein ```-Block, keine
        Kommentare, kein Fließtext.
        """
    }

    private static func buildInstallationPrompt(
        task: String,
        boat: AIChatBoat?,
        schematic: Schematic?
    ) -> String {
        let boatBlock = boat.map { b -> String in
            let equipmentList: String
            if b.equipment.isEmpty {
                equipmentList = "  (kein Equipment hinterlegt)"
            } else {
                equipmentList = b.equipment.prefix(40).map { e in
                    let mfr = [e.manufacturer, e.model].compactMap { $0 }.joined(separator: " ")
                    return "  - \(e.name)\(mfr.isEmpty ? "" : " (\(mfr))")"
                }.joined(separator: "\n")
            }
            return """
            Boot: \(b.manufacturer ?? "n/a") \(b.model ?? "") \(b.length.map { "\($0) m" } ?? "")

            Verbautes Equipment:
            \(equipmentList)
            """
        } ?? "Boot: nicht angegeben"

        let schematicBlock = schematic.map { s in
            "Zugehöriger Schaltplan: \(s.title) (\(s.domain.displayName)), \(s.nodes.count) Komponenten"
        } ?? ""

        return """
        Du bist Marine-Techniker. Erstelle einen Montage-/Einbauplan als
        STRENG VALIDES JSON, KEIN Prosa-Text außerhalb.

        Aufgabe: \(task)
        \(boatBlock)
        \(schematicBlock)

        Erwartetes Schema:
        {
          "id": "REPLACE",
          "title": "...",
          "summary": "1-2 Sätze worum es geht",
          "difficulty": "beginner|intermediate|advanced|professional",
          "safetyNotes": ["Hauptschalter aus!", "Batterie vorher trennen"],
          "materials": [
            {"id": "m1", "name": "Kabel 6mm² rot", "quantity": "3 m", "note": "Marine-Litze"}
          ],
          "tools": [
            {"id": "t1", "name": "Crimpzange", "optional": false}
          ],
          "steps": [
            {"id": "s1", "order": 1, "title": "Batterie trennen",
             "detail": "Hauptschalter aus, Pluspol abklemmen.",
             "warning": "Kein Schmuck tragen!",
             "schematicNodeID": null, "location": "Maschinenraum",
             "durationMinutes": 5}
          ],
          "createdAt": "2026-01-01T00:00:00Z",
          "updatedAt": "2026-01-01T00:00:00Z"
        }

        Antworte AUSSCHLIESSLICH mit dem JSON-Objekt.
        """
    }

    /// Extrahiert das erste JSON-Objekt aus der KI-Antwort (robust gegen
    /// ```json-Wrapper oder umliegenden Text).
    static func extractJSON(from text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Code-Fence entfernen
        if let range = trimmed.range(of: "```json") ?? trimmed.range(of: "```") {
            let afterFence = trimmed[range.upperBound...]
            if let endFence = afterFence.range(of: "```") {
                return String(afterFence[..<endFence.lowerBound])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return String(afterFence).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Erstes "{ … }" extrahieren
        if let start = trimmed.firstIndex(of: "{"),
           let end = trimmed.lastIndex(of: "}"), start <= end {
            return String(trimmed[start...end])
        }
        return trimmed
    }
}

enum SchematicError: LocalizedError {
    case invalidResponse(raw: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Die KI-Antwort konnte nicht als gültiger Plan gelesen werden."
        }
    }

    var rawResponse: String? {
        switch self {
        case .invalidResponse(let raw): return raw
        }
    }
}

private extension JSONDecoder {
    static func iso8601() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }
}

private extension JSONEncoder {
    static func iso8601() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }
}
