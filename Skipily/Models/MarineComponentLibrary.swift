//
//  MarineComponentLibrary.swift
//  Skipily
//
//  Kuratierte Liste typischer Marine-Komponenten als Ground Truth für die KI.
//  Die KI soll bevorzugt aus diesem Katalog auswählen, statt Bauteile zu erfinden.
//

import Foundation

struct MarineComponent: Identifiable, Codable, Hashable {
    var id: String { "\(manufacturer)::\(model)" }
    let manufacturer: String
    let model: String
    let displayName: String
    let kind: SchematicNodeKind
    let voltage: Double?
    let currentAmps: Double?
    let powerWatts: Double?
    let capacity: Double?
    /// Stichworte zum Auffinden via Volltext.
    let tags: [String]
}

enum MarineComponentLibrary {

    static let all: [MarineComponent] = [
        // MARK: Batterien
        .init(manufacturer: "Victron", model: "LiFePO4 12.8/100",
              displayName: "Victron LiFePO4 12,8V / 100Ah",
              kind: .battery, voltage: 12.8, currentAmps: nil, powerWatts: nil,
              capacity: 100, tags: ["lithium", "lifepo4", "12v"]),
        .init(manufacturer: "Victron", model: "LiFePO4 12.8/200",
              displayName: "Victron LiFePO4 12,8V / 200Ah",
              kind: .battery, voltage: 12.8, currentAmps: nil, powerWatts: nil,
              capacity: 200, tags: ["lithium", "lifepo4", "12v"]),
        .init(manufacturer: "Mastervolt", model: "MLI Ultra 12/2500",
              displayName: "Mastervolt MLI Ultra 12V / 200Ah",
              kind: .battery, voltage: 12.0, currentAmps: nil, powerWatts: nil,
              capacity: 200, tags: ["lithium", "12v"]),
        .init(manufacturer: "Exide", model: "ES900",
              displayName: "Exide AGM 12V / 85Ah",
              kind: .battery, voltage: 12.0, currentAmps: nil, powerWatts: nil,
              capacity: 85, tags: ["agm", "starter", "12v"]),

        // MARK: Lader / Wechselrichter
        .init(manufacturer: "Victron", model: "MultiPlus II 12/3000/120",
              displayName: "Victron MultiPlus II 12V / 3000VA",
              kind: .inverter, voltage: 12.0, currentAmps: 120, powerWatts: 3000,
              capacity: nil, tags: ["inverter", "charger", "wechselrichter"]),
        .init(manufacturer: "Victron", model: "Phoenix Smart IP43 12/30",
              displayName: "Victron Phoenix Smart 12V / 30A",
              kind: .charger, voltage: 12.0, currentAmps: 30, powerWatts: nil,
              capacity: nil, tags: ["charger", "landlader"]),
        .init(manufacturer: "Victron", model: "Orion-Tr Smart 12/12-30",
              displayName: "Victron Orion-Tr DC/DC 12/12 30A",
              kind: .dcdcConverter, voltage: 12.0, currentAmps: 30, powerWatts: nil,
              capacity: nil, tags: ["dcdc", "ladewandler"]),

        // MARK: Solar
        .init(manufacturer: "Victron", model: "BlueSolar MPPT 100/30",
              displayName: "Victron MPPT 100/30",
              kind: .charger, voltage: 12.0, currentAmps: 30, powerWatts: nil,
              capacity: nil, tags: ["solar", "mppt"]),
        .init(manufacturer: "Solara", model: "M-Series 150W",
              displayName: "Solara 150W Solarpanel",
              kind: .solarPanel, voltage: 18.0, currentAmps: 8.3, powerWatts: 150,
              capacity: nil, tags: ["solar"]),

        // MARK: Schutz / Schaltung
        .init(manufacturer: "Blue Sea", model: "5511e m-Series Battery Switch",
              displayName: "Blue Sea m-Series Hauptschalter 300A",
              kind: .mainSwitch, voltage: nil, currentAmps: 300, powerWatts: nil,
              capacity: nil, tags: ["hauptschalter", "300a"]),
        .init(manufacturer: "Blue Sea", model: "ST Blade ATO/ATC 5025",
              displayName: "Blue Sea ST Blade Sicherungsblock 12er",
              kind: .busbar, voltage: nil, currentAmps: 100, powerWatts: nil,
              capacity: nil, tags: ["sicherungsblock", "ato"]),
        .init(manufacturer: "Mega", model: "Mega Fuse 200A",
              displayName: "Mega-Sicherung 200A",
              kind: .fuse, voltage: nil, currentAmps: 200, powerWatts: nil,
              capacity: nil, tags: ["mega", "fuse"]),
        .init(manufacturer: "Bep", model: "Busbar 250A",
              displayName: "BEP Busbar 250A",
              kind: .busbar, voltage: nil, currentAmps: 250, powerWatts: nil,
              capacity: nil, tags: ["busbar"]),
        .init(manufacturer: "Victron", model: "SmartShunt 500A",
              displayName: "Victron SmartShunt 500A",
              kind: .shunt, voltage: nil, currentAmps: 500, powerWatts: nil,
              capacity: nil, tags: ["shunt", "bms", "monitoring"]),

        // MARK: Verbraucher
        .init(manufacturer: "Rule", model: "Mate 1100",
              displayName: "Rule Mate 1100 Bilgepumpe",
              kind: .pump, voltage: 12.0, currentAmps: 3.5, powerWatts: 42,
              capacity: nil, tags: ["bilge", "automatik"]),
        .init(manufacturer: "Whale", model: "Gulper IC",
              displayName: "Whale Gulper IC Grauwasserpumpe",
              kind: .pump, voltage: 12.0, currentAmps: 4.0, powerWatts: 48,
              capacity: nil, tags: ["grauwasser", "pumpe"]),
        .init(manufacturer: "Jabsco", model: "Par-Max 4",
              displayName: "Jabsco Par-Max 4 Druckwasserpumpe",
              kind: .pump, voltage: 12.0, currentAmps: 9.0, powerWatts: 108,
              capacity: nil, tags: ["druckwasser", "pumpe"]),
        .init(manufacturer: "Webasto", model: "Air Top 2000 STC",
              displayName: "Webasto Air Top 2000 STC Heizung",
              kind: .heater, voltage: 12.0, currentAmps: 2.5, powerWatts: 30,
              capacity: nil, tags: ["heizung", "diesel", "webasto"]),
        .init(manufacturer: "Isotherm", model: "CR65",
              displayName: "Isotherm CR65 Kühlschrank",
              kind: .fridge, voltage: 12.0, currentAmps: 3.5, powerWatts: 42,
              capacity: nil, tags: ["kuehlschrank", "fridge"]),
        .init(manufacturer: "Lewmar", model: "Pro-Fish 700",
              displayName: "Lewmar Pro-Fish 700 Ankerwinde",
              kind: .windlass, voltage: 12.0, currentAmps: 80, powerWatts: 960,
              capacity: nil, tags: ["ankerwinde", "windlass"]),
        .init(manufacturer: "Lopolight", model: "Tri-Color 200-024",
              displayName: "Lopolight LED Dreifarbenlaterne",
              kind: .light, voltage: 12.0, currentAmps: 0.4, powerWatts: 5,
              capacity: nil, tags: ["positionslicht", "led"]),

        // MARK: Elektronik
        .init(manufacturer: "Raymarine", model: "Axiom 9",
              displayName: "Raymarine Axiom 9 Plotter",
              kind: .chartplotter, voltage: 12.0, currentAmps: 1.5, powerWatts: 18,
              capacity: nil, tags: ["plotter", "mfd"]),
        .init(manufacturer: "B&G", model: "Zeus3 9",
              displayName: "B&G Zeus3 9 Plotter",
              kind: .chartplotter, voltage: 12.0, currentAmps: 1.5, powerWatts: 18,
              capacity: nil, tags: ["plotter", "mfd"]),

        // MARK: Tanks / Wasser
        .init(manufacturer: "Vetus", model: "WTANK 80",
              displayName: "Vetus Wassertank 80L",
              kind: .tank, voltage: nil, currentAmps: nil, powerWatts: nil,
              capacity: 80, tags: ["wassertank"]),
        .init(manufacturer: "Vetus", model: "FTANK 120",
              displayName: "Vetus Dieseltank 120L",
              kind: .tank, voltage: nil, currentAmps: nil, powerWatts: nil,
              capacity: 120, tags: ["dieseltank", "kraftstoff"]),

        // MARK: Landstrom
        .init(manufacturer: "Marinco", model: "301EL-B",
              displayName: "Marinco 30A Landanschluss",
              kind: .shorePower, voltage: 230, currentAmps: 16, powerWatts: nil,
              capacity: nil, tags: ["landstrom", "shore", "230v"])
    ]

    /// Volltext-Suche über Hersteller, Modell, Displayname und Tags.
    static func search(_ query: String) -> [MarineComponent] {
        let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return all }
        return all.filter {
            $0.manufacturer.lowercased().contains(q)
            || $0.model.lowercased().contains(q)
            || $0.displayName.lowercased().contains(q)
            || $0.tags.contains { $0.contains(q) }
        }
    }

    static func components(of kind: SchematicNodeKind) -> [MarineComponent] {
        all.filter { $0.kind == kind }
    }

    /// Liefert eine kompakte Text-Repräsentation als KI-System-Prompt-Anhang.
    /// Reduziert Halluzinationen, weil die KI weiß, welche Bauteile real existieren.
    static func systemPromptCatalog() -> String {
        let lines = all.map { comp -> String in
            var parts: [String] = ["- \(comp.displayName) [\(comp.kind.rawValue)"]
            if let v = comp.voltage { parts.append("\(v) V") }
            if let a = comp.currentAmps { parts.append("\(a) A") }
            if let w = comp.powerWatts { parts.append("\(w) W") }
            if let c = comp.capacity { parts.append("Kap \(c)") }
            return parts.joined(separator: " · ") + "]"
        }
        return lines.joined(separator: "\n")
    }
}
