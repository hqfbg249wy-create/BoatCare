//
//  Schematic.swift
//  Skipily
//
//  Strukturiertes Schaltplan-Modell für Bootstechnik (Elektrik, Wasser, Gas, …).
//  Bewusst als typisierter Graph (Nodes/Edges) modelliert, damit die KI
//  validierbar arbeitet und der Renderer deterministisch zeichnen kann.
//

import Foundation
import SwiftUI

// MARK: - Domain

enum SchematicDomain: String, Codable, CaseIterable, Identifiable {
    case electrical12V = "electrical_12v"
    case electrical24V = "electrical_24v"
    case electricalAC = "electrical_ac"
    case freshWater = "fresh_water"
    case bilge = "bilge"
    case fuel = "fuel"
    case gas = "gas"
    case hydraulics = "hydraulics"
    case electronics = "electronics"   // NMEA2000, Antennen, Plotter
    case other = "other"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .electrical12V: return "Elektrik 12 V DC"
        case .electrical24V: return "Elektrik 24 V DC"
        case .electricalAC:  return "Elektrik 230 V AC"
        case .freshWater:    return "Frischwasser"
        case .bilge:         return "Bilge / Lenzpumpe"
        case .fuel:          return "Kraftstoff"
        case .gas:           return "Gas"
        case .hydraulics:    return "Hydraulik"
        case .electronics:   return "Elektronik / NMEA"
        case .other:         return "Sonstiges"
        }
    }

    var systemImage: String {
        switch self {
        case .electrical12V, .electrical24V, .electricalAC: return "bolt.fill"
        case .freshWater: return "drop.fill"
        case .bilge:      return "water.waves"
        case .fuel:       return "fuelpump.fill"
        case .gas:        return "flame.fill"
        case .hydraulics: return "wrench.and.screwdriver.fill"
        case .electronics:return "antenna.radiowaves.left.and.right"
        case .other:      return "circle.dashed"
        }
    }

    var isElectrical: Bool {
        switch self {
        case .electrical12V, .electrical24V, .electricalAC: return true
        default: return false
        }
    }
}

// MARK: - Node

enum SchematicNodeKind: String, Codable {
    // Stromversorgung
    case battery
    case shorePower
    case alternator
    case solarPanel
    case charger
    case inverter
    case dcdcConverter
    // Schutz / Schaltung
    case fuse
    case breaker
    case mainSwitch
    case busbar
    case shunt
    // Verbraucher
    case load
    case pump
    case light
    case fridge
    case heater
    case windlass
    case chartplotter
    // Wasser / Tank
    case tank
    case valve
    case filter
    case waterMaker
    // Allgemein
    case junction
    case sensor
    case other

    var displayName: String {
        switch self {
        case .battery: return "Batterie"
        case .shorePower: return "Landanschluss"
        case .alternator: return "Lichtmaschine"
        case .solarPanel: return "Solarpanel"
        case .charger: return "Ladegerät"
        case .inverter: return "Wechselrichter"
        case .dcdcConverter: return "DC/DC-Wandler"
        case .fuse: return "Sicherung"
        case .breaker: return "Sicherungsautomat"
        case .mainSwitch: return "Hauptschalter"
        case .busbar: return "Sammelschiene"
        case .shunt: return "Shunt / BMS"
        case .load: return "Verbraucher"
        case .pump: return "Pumpe"
        case .light: return "Beleuchtung"
        case .fridge: return "Kühlschrank"
        case .heater: return "Heizung"
        case .windlass: return "Ankerwinde"
        case .chartplotter: return "Plotter"
        case .tank: return "Tank"
        case .valve: return "Ventil"
        case .filter: return "Filter"
        case .waterMaker: return "Watermaker"
        case .junction: return "Verteiler"
        case .sensor: return "Sensor"
        case .other: return "Bauteil"
        }
    }

    var systemImage: String {
        switch self {
        case .battery: return "minus.plus.batteryblock"
        case .shorePower: return "powerplug"
        case .alternator: return "engine.combustion"
        case .solarPanel: return "sun.max"
        case .charger, .dcdcConverter: return "bolt.batteryblock"
        case .inverter: return "bolt.horizontal"
        case .fuse, .breaker: return "shield.lefthalf.filled"
        case .mainSwitch: return "switch.2"
        case .busbar: return "rectangle.grid.1x2"
        case .shunt: return "gauge.medium"
        case .load, .other: return "circle"
        case .pump: return "drop.circle"
        case .light: return "lightbulb"
        case .fridge: return "refrigerator"
        case .heater: return "flame"
        case .windlass: return "anchor"
        case .chartplotter: return "map"
        case .tank: return "cylinder"
        case .valve: return "arrow.triangle.branch"
        case .filter: return "line.3.horizontal.decrease.circle"
        case .waterMaker: return "drop.degreesign"
        case .junction: return "point.3.connected.trianglepath.dotted"
        case .sensor: return "sensor"
        }
    }
}

struct SchematicNode: Identifiable, Codable, Hashable {
    var id: String
    var kind: SchematicNodeKind
    var label: String
    var manufacturer: String?
    var model: String?
    var voltage: Double?
    var currentAmps: Double?
    var powerWatts: Double?
    var capacity: Double?
    var location: String?
    var x: Double
    var y: Double

    init(id: String = UUID().uuidString,
         kind: SchematicNodeKind,
         label: String,
         manufacturer: String? = nil,
         model: String? = nil,
         voltage: Double? = nil,
         currentAmps: Double? = nil,
         powerWatts: Double? = nil,
         capacity: Double? = nil,
         location: String? = nil,
         x: Double = 0.5,
         y: Double = 0.5) {
        self.id = id; self.kind = kind; self.label = label
        self.manufacturer = manufacturer; self.model = model
        self.voltage = voltage; self.currentAmps = currentAmps
        self.powerWatts = powerWatts; self.capacity = capacity
        self.location = location
        self.x = x; self.y = y
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, label, manufacturer, model
        case voltage, currentAmps, powerWatts, capacity, location, x, y
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        self.kind = (try? c.decode(SchematicNodeKind.self, forKey: .kind)) ?? .other
        self.label = (try? c.decode(String.self, forKey: .label)) ?? "Bauteil"
        self.manufacturer = try? c.decode(String.self, forKey: .manufacturer)
        self.model = try? c.decode(String.self, forKey: .model)
        self.voltage = Self.flexDouble(c, .voltage)
        self.currentAmps = Self.flexDouble(c, .currentAmps)
        self.powerWatts = Self.flexDouble(c, .powerWatts)
        self.capacity = Self.flexDouble(c, .capacity)
        self.location = try? c.decode(String.self, forKey: .location)
        self.x = Self.flexDouble(c, .x) ?? 0.5
        self.y = Self.flexDouble(c, .y) ?? 0.5
    }

    private static func flexDouble(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double? {
        if let d = try? c.decode(Double.self, forKey: key) { return d }
        if let i = try? c.decode(Int.self, forKey: key) { return Double(i) }
        if let s = try? c.decode(String.self, forKey: key), let d = Double(s) { return d }
        return nil
    }
}

// MARK: - Edge

enum SchematicEdgeKind: String, Codable {
    case dcPositive       // + Leitung
    case dcNegative       // − Leitung / Masse
    case acLive
    case acNeutral
    case acGround
    case dataBus          // NMEA2000, CAN
    case pipe             // Wasser-/Gas-/Treibstoff-Schlauch
    case mechanical       // Welle, Kupplung
    case signal           // generisches Signal

    var displayName: String {
        switch self {
        case .dcPositive: return "DC +"
        case .dcNegative: return "DC −"
        case .acLive: return "AC L"
        case .acNeutral: return "AC N"
        case .acGround: return "AC PE"
        case .dataBus: return "Datenbus"
        case .pipe: return "Leitung"
        case .mechanical: return "Mechanisch"
        case .signal: return "Signal"
        }
    }

    var color: Color {
        switch self {
        case .dcPositive: return .red
        case .dcNegative: return .black
        case .acLive: return .brown
        case .acNeutral: return .blue
        case .acGround: return .green
        case .dataBus: return .purple
        case .pipe: return .cyan
        case .mechanical: return .gray
        case .signal: return .orange
        }
    }
}

struct SchematicEdge: Identifiable, Codable, Hashable {
    var id: String
    var fromNodeID: String
    var toNodeID: String
    var kind: SchematicEdgeKind
    var gaugeMM2: Double?
    var lengthMeters: Double?
    var protectedByNodeID: String?
    var fuseAmps: Double?
    var label: String?

    init(id: String = UUID().uuidString,
         from: String,
         to: String,
         kind: SchematicEdgeKind,
         gaugeMM2: Double? = nil,
         lengthMeters: Double? = nil,
         protectedByNodeID: String? = nil,
         fuseAmps: Double? = nil,
         label: String? = nil) {
        self.id = id; self.fromNodeID = from; self.toNodeID = to
        self.kind = kind; self.gaugeMM2 = gaugeMM2; self.lengthMeters = lengthMeters
        self.protectedByNodeID = protectedByNodeID; self.fuseAmps = fuseAmps
        self.label = label
    }

    enum CodingKeys: String, CodingKey {
        case id, fromNodeID, toNodeID, kind, gaugeMM2, lengthMeters
        case protectedByNodeID, fuseAmps, label
        // KI verwendet oft "from"/"to" oder "source"/"target" — Aliase
        case from, to, source, target
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        self.fromNodeID = (try? c.decode(String.self, forKey: .fromNodeID))
            ?? (try? c.decode(String.self, forKey: .from))
            ?? (try? c.decode(String.self, forKey: .source)) ?? ""
        self.toNodeID = (try? c.decode(String.self, forKey: .toNodeID))
            ?? (try? c.decode(String.self, forKey: .to))
            ?? (try? c.decode(String.self, forKey: .target)) ?? ""
        self.kind = (try? c.decode(SchematicEdgeKind.self, forKey: .kind)) ?? .signal
        self.gaugeMM2 = Self.flexDouble(c, .gaugeMM2)
        self.lengthMeters = Self.flexDouble(c, .lengthMeters)
        self.protectedByNodeID = try? c.decode(String.self, forKey: .protectedByNodeID)
        self.fuseAmps = Self.flexDouble(c, .fuseAmps)
        self.label = try? c.decode(String.self, forKey: .label)
    }

    private static func flexDouble(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double? {
        if let d = try? c.decode(Double.self, forKey: key) { return d }
        if let i = try? c.decode(Int.self, forKey: key) { return Double(i) }
        if let s = try? c.decode(String.self, forKey: key), let d = Double(s) { return d }
        return nil
    }

    /// Expliziter Encoder — wegen Decode-Aliasen (from/to/source/target) kann
    /// Swift den Encoder nicht automatisch synthetisieren.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(fromNodeID, forKey: .fromNodeID)
        try c.encode(toNodeID, forKey: .toNodeID)
        try c.encode(kind, forKey: .kind)
        try c.encodeIfPresent(gaugeMM2, forKey: .gaugeMM2)
        try c.encodeIfPresent(lengthMeters, forKey: .lengthMeters)
        try c.encodeIfPresent(protectedByNodeID, forKey: .protectedByNodeID)
        try c.encodeIfPresent(fuseAmps, forKey: .fuseAmps)
        try c.encodeIfPresent(label, forKey: .label)
    }
}

// MARK: - Schematic

struct Schematic: Identifiable, Codable {
    var id: UUID
    var boatID: UUID?
    var title: String
    var domain: SchematicDomain
    var notes: String?
    var nodes: [SchematicNode]
    var edges: [SchematicEdge]
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID = UUID(),
         boatID: UUID? = nil,
         title: String,
         domain: SchematicDomain,
         notes: String? = nil,
         nodes: [SchematicNode] = [],
         edges: [SchematicEdge] = [],
         createdAt: Date = Date(),
         updatedAt: Date = Date()) {
        self.id = id; self.boatID = boatID; self.title = title
        self.domain = domain; self.notes = notes
        self.nodes = nodes; self.edges = edges
        self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    func node(id: String) -> SchematicNode? { nodes.first(where: { $0.id == id }) }

    enum CodingKeys: String, CodingKey {
        case id, boatID, title, domain, notes, nodes, edges, createdAt, updatedAt
    }

    /// Toleranter Decoder: akzeptiert beliebige id-Strings (KI liefert oft
    /// "REPLACE" oder Slugs). Falls keine gültige UUID, wird eine neue erzeugt.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let s = try? c.decode(String.self, forKey: .id), let u = UUID(uuidString: s) {
            self.id = u
        } else {
            self.id = UUID()
        }
        self.boatID = try? c.decode(UUID.self, forKey: .boatID)
        self.title = (try? c.decode(String.self, forKey: .title)) ?? "Schaltplan"
        self.domain = (try? c.decode(SchematicDomain.self, forKey: .domain)) ?? .other
        self.notes = try? c.decode(String.self, forKey: .notes)
        self.nodes = (try? c.decode([SchematicNode].self, forKey: .nodes)) ?? []
        self.edges = (try? c.decode([SchematicEdge].self, forKey: .edges)) ?? []
        self.createdAt = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()
        self.updatedAt = (try? c.decode(Date.self, forKey: .updatedAt)) ?? Date()
    }
}
