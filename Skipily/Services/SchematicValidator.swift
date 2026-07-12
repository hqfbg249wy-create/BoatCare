//
//  SchematicValidator.swift
//  Skipily
//
//  Deterministische Regel-Checks für Schaltpläne (ABYC/ISO-10133-Anlehnung).
//  Bewusst NICHT von der KI gemacht — Regeln müssen verlässlich sein.
//

import Foundation

enum SchematicIssueSeverity: String, Codable {
    case error    // verstößt klar gegen Sicherheitsregel
    case warning  // riskant / nicht best practice
    case info     // Hinweis

    var displayName: String {
        switch self {
        case .error: return "Fehler"
        case .warning: return "Warnung"
        case .info: return "Hinweis"
        }
    }
}

struct SchematicIssue: Identifiable, Codable {
    var id = UUID()
    let severity: SchematicIssueSeverity
    let message: String
    /// Betroffene Node-IDs (für UI-Highlighting).
    let nodeIDs: [String]
    /// Betroffene Edge-IDs.
    let edgeIDs: [String]
}

enum SchematicValidator {

    /// Maximal zulässige Stromstärke (Ampacity) für übliche Kabelquerschnitte
    /// bei Marineverlegung, vereinfacht nach ABYC E-11, 30°C-Bündel.
    private static let ampacityByGauge: [(mm2: Double, ampacity: Double)] = [
        (1.0,  16),
        (1.5,  20),
        (2.5,  28),
        (4.0,  38),
        (6.0,  50),
        (10.0, 70),
        (16.0, 95),
        (25.0, 125),
        (35.0, 160),
        (50.0, 200),
        (70.0, 250),
        (95.0, 305),
        (120.0, 350)
    ]

    static func ampacity(forMM2 mm2: Double) -> Double? {
        ampacityByGauge.first(where: { $0.mm2 >= mm2 })?.ampacity
    }

    static func validate(_ schematic: Schematic) -> [SchematicIssue] {
        var issues: [SchematicIssue] = []
        let byID = Dictionary(uniqueKeysWithValues: schematic.nodes.map { ($0.id, $0) })

        // 1) Edges müssen auf existierende Nodes zeigen
        for edge in schematic.edges {
            if byID[edge.fromNodeID] == nil || byID[edge.toNodeID] == nil {
                issues.append(.init(severity: .error,
                                    message: "Verbindung zeigt auf unbekannten Knoten.",
                                    nodeIDs: [],
                                    edgeIDs: [edge.id]))
            }
        }

        // 2) Domain-spezifische Regeln
        if schematic.domain.isElectrical {
            issues.append(contentsOf: electricalRules(schematic: schematic, byID: byID))
        }
        if schematic.domain == .bilge {
            issues.append(contentsOf: bilgeRules(schematic: schematic, byID: byID))
        }

        // 3) Allgemein: isolierte Knoten?
        let connected = Set(schematic.edges.flatMap { [$0.fromNodeID, $0.toNodeID] })
        for node in schematic.nodes where !connected.contains(node.id) {
            issues.append(.init(severity: .warning,
                                message: "\(node.label) ist nicht verbunden.",
                                nodeIDs: [node.id],
                                edgeIDs: []))
        }

        return issues
    }

    // MARK: - Electrical

    private static func electricalRules(
        schematic: Schematic,
        byID: [String: SchematicNode]
    ) -> [SchematicIssue] {
        var issues: [SchematicIssue] = []

        // a) Jeder Verbraucher muss einen Schutz haben (Fuse / Breaker irgendwo
        //    auf dem Pfad von der Batterie). Vereinfacht: an der eingehenden
        //    DC+-Edge muss protectedByNodeID oder fuseAmps gesetzt sein,
        //    ODER auf dem direkten Pfad liegt eine fuse/breaker-Node.
        let loadKinds: Set<SchematicNodeKind> = [
            .load, .pump, .light, .fridge, .heater, .windlass, .chartplotter,
            .inverter, .charger
        ]
        let fuseKinds: Set<SchematicNodeKind> = [.fuse, .breaker, .mainSwitch]

        for node in schematic.nodes where loadKinds.contains(node.kind) {
            let incoming = schematic.edges.filter {
                $0.toNodeID == node.id
                && ($0.kind == .dcPositive || $0.kind == .acLive)
            }
            guard !incoming.isEmpty else { continue }

            let hasProtection = incoming.contains { edge in
                if edge.protectedByNodeID != nil { return true }
                if (edge.fuseAmps ?? 0) > 0 { return true }
                if let fromNode = byID[edge.fromNodeID], fuseKinds.contains(fromNode.kind) {
                    return true
                }
                return false
            }
            if !hasProtection {
                issues.append(.init(
                    severity: .error,
                    message: "\(node.label) hat keinen erkennbaren Sicherungsschutz.",
                    nodeIDs: [node.id],
                    edgeIDs: incoming.map { $0.id }
                ))
            }
        }

        // b) Kabelquerschnitt vs. Last
        for edge in schematic.edges where edge.kind == .dcPositive {
            guard let mm2 = edge.gaugeMM2, let amp = ampacity(forMM2: mm2) else { continue }
            let load = byID[edge.toNodeID]
            let amps = load?.currentAmps
                ?? (load?.powerWatts.flatMap { p in load?.voltage.map { v in v > 0 ? p / v : 0 } } ?? nil)
                ?? edge.fuseAmps
            if let a = amps, a > amp {
                issues.append(.init(
                    severity: .error,
                    message: "Kabelquerschnitt \(mm2) mm² ist zu klein für \(Int(a)) A (max \(Int(amp)) A).",
                    nodeIDs: [],
                    edgeIDs: [edge.id]
                ))
            }
        }

        // c) Sicherungsgröße darf Kabel-Ampacity nicht überschreiten
        for edge in schematic.edges where edge.kind == .dcPositive {
            guard let mm2 = edge.gaugeMM2, let amp = ampacity(forMM2: mm2) else { continue }
            let fuse = edge.fuseAmps
                ?? edge.protectedByNodeID.flatMap { byID[$0]?.currentAmps }
            if let f = fuse, f > amp {
                issues.append(.init(
                    severity: .error,
                    message: "Sicherung \(Int(f)) A schützt Kabel mit nur \(Int(amp)) A Belastbarkeit.",
                    nodeIDs: [],
                    edgeIDs: [edge.id]
                ))
            }
        }

        // d) Spannungsfall (vereinfacht) > 3 % bei kritischen Pfaden → Warnung
        for edge in schematic.edges where edge.kind == .dcPositive {
            guard let mm2 = edge.gaugeMM2,
                  let length = edge.lengthMeters,
                  let load = byID[edge.toNodeID],
                  let v = load.voltage, v > 0 else { continue }
            let amps = load.currentAmps
                ?? load.powerWatts.map { $0 / v }
                ?? 0
            // U_drop ≈ 2 · I · L · ρ / A,  ρ_cu ≈ 0.0175 Ω·mm²/m
            let drop = 2.0 * amps * length * 0.0175 / mm2
            let dropPct = (drop / v) * 100.0
            if dropPct > 3 {
                issues.append(.init(
                    severity: .warning,
                    message: "Spannungsfall \(String(format: "%.1f", dropPct)) % zu \(load.label) — empfohlen ≤ 3 %.",
                    nodeIDs: [load.id],
                    edgeIDs: [edge.id]
                ))
            }
        }

        return issues
    }

    // MARK: - Bilge

    private static func bilgeRules(
        schematic: Schematic,
        byID: [String: SchematicNode]
    ) -> [SchematicIssue] {
        var issues: [SchematicIssue] = []
        // Bilgepumpe sollte direkt an Batterie, nicht über Hauptschalter
        let pumps = schematic.nodes.filter { $0.kind == .pump }
        for pump in pumps {
            let incoming = schematic.edges.filter { $0.toNodeID == pump.id && $0.kind == .dcPositive }
            for edge in incoming {
                if let from = byID[edge.fromNodeID], from.kind == .mainSwitch {
                    issues.append(.init(
                        severity: .warning,
                        message: "Bilgepumpe '\(pump.label)' hängt am Hauptschalter — sollte direkt an Batterie geführt werden.",
                        nodeIDs: [pump.id],
                        edgeIDs: [edge.id]
                    ))
                }
            }
        }
        return issues
    }
}
