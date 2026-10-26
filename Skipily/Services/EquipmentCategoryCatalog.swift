//
//  EquipmentCategoryCatalog.swift
//  Skipily
//
//  Serverseitige Quelle der Ausruestungs-Kategorien (Tabelle
//  equipment_categories, Migration 192) mit OFFLINE-sicherem Fallback:#imageLiteral(resourceName: "Skipily One-Pager - Back.jpg")#imageLiteral(resourceName: "Skipily One-Pager - Front.jpg")
//    1. Sofort: fest eingebaute Liste bzw. letzter UserDefaults-Cache.
//    2. Im Hintergrund: Aktualisierung aus der DB (wenn online).
//  So funktioniert die Kategorie-Auswahl auch ohne Empfang; neue Kategorien,
//  Farben, Icons oder Labels lassen sich per DB-Update ohne App-Build ausrollen.
//

import SwiftUI
import Combine
import Supabase

struct EquipmentCategoryDef: Codable, Identifiable {
    let key: String
    let sort_order: Int
    let color: String          // Hex, z. B. "#f97316"
    let icon_ios: String       // SF-Symbol-Name
    let labels: [String: String]
    var id: String { key }
}

@MainActor
final class EquipmentCategoryCatalog: ObservableObject {
    static let shared = EquipmentCategoryCatalog()

    @Published private(set) var defs: [EquipmentCategoryDef]

    private let cacheKey = "equipment_categories_cache_v1"
    private var client: SupabaseClient { SupabaseManager.shared.client }

    private init() {
        // Cache -> sonst eingebauter Fallback (beides offline verfuegbar).
        if let data = UserDefaults.standard.data(forKey: cacheKey),
           let cached = try? JSONDecoder().decode([EquipmentCategoryDef].self, from: data),
           !cached.isEmpty {
            defs = cached
        } else {
            defs = EquipmentCategoryCatalog.fallback
        }
    }

    /// Aus der DB aktualisieren. Bei Fehler (offline) bleibt Cache/Fallback.
    func refresh() async {
        do {
            let rows: [EquipmentCategoryDef] = try await client
                .from("equipment_categories")
                .select("key, sort_order, color, icon_ios, labels, active")
                .eq("active", value: true)
                .order("sort_order", ascending: true)
                .execute().value
            guard !rows.isEmpty else { return }
            defs = rows
            if let data = try? JSONEncoder().encode(rows) {
                UserDefaults.standard.set(data, forKey: cacheKey)
            }
        } catch {
            AppLog.error("equipment_categories refresh: \(error)")
        }
    }

    // MARK: - Lookups

    var keys: [String] { defs.map { $0.key } }

    private func def(_ key: String) -> EquipmentCategoryDef? {
        defs.first { $0.key == key.lowercased() }
    }

    /// Label in der gewuenschten Sprache: DB[lang] -> DB[de] -> Localizable
    /// "equipment.cat.<key>" -> key.
    func label(_ key: String, lang: String) -> String {
        if let d = def(key) {
            if let l = d.labels[lang], !l.isEmpty { return l }
            if let de = d.labels["de"], !de.isEmpty { return de }
        }
        let loc = "equipment.cat.\(key.lowercased())".loc
        return loc == "equipment.cat.\(key.lowercased())" ? key : loc
    }

    func color(_ key: String) -> Color {
        if let d = def(key), let c = Color(hexString: d.color) { return c }
        return .gray
    }

    func iconIOS(_ key: String) -> String {
        def(key)?.icon_ios ?? "shippingbox.fill"
    }

    // MARK: - Eingebauter Fallback (identisch zum DB-Seed, Migration 192)

    static let fallback: [EquipmentCategoryDef] = [
        .init(key: "engine",         sort_order: 10,  color: "#f97316", icon_ios: "engine.combustion.fill",            labels: ["de": "Motor & Antrieb", "en": "Engine & drive"]),
        .init(key: "electrical",     sort_order: 20,  color: "#eab308", icon_ios: "bolt.fill",                         labels: ["de": "Elektrik & Batterie", "en": "Electrical & battery"]),
        .init(key: "electrical_12v", sort_order: 21,  color: "#eab308", icon_ios: "minus.plus.batteryblock.fill",      labels: ["de": "Elektrik 12V", "en": "Electrical 12V"]),
        .init(key: "electrical_230v",sort_order: 22,  color: "#f59e0b", icon_ios: "powerplug.fill",                    labels: ["de": "Elektrik 230V", "en": "Electrical 230V"]),
        .init(key: "navigation",     sort_order: 30,  color: "#3b82f6", icon_ios: "location.north.line.fill",          labels: ["de": "Navigation & Elektronik", "en": "Navigation & electronics"]),
        .init(key: "communication",  sort_order: 40,  color: "#14b8a6", icon_ios: "antenna.radiowaves.left.and.right", labels: ["de": "Kommunikation", "en": "Communication"]),
        .init(key: "safety",         sort_order: 50,  color: "#ef4444", icon_ios: "shield.fill",                       labels: ["de": "Sicherheit", "en": "Safety"]),
        .init(key: "rigging",        sort_order: 60,  color: "#a855f7", icon_ios: "arrow.up.and.down",                 labels: ["de": "Rigg & Takelage", "en": "Rig & rigging"]),
        .init(key: "sails",          sort_order: 70,  color: "#06b6d4", icon_ios: "wind",                              labels: ["de": "Segel", "en": "Sails"]),
        .init(key: "rope",           sort_order: 80,  color: "#10b981", icon_ios: "scribble.variable",                 labels: ["de": "Tauwerk", "en": "Rope"]),
        .init(key: "deck",           sort_order: 90,  color: "#0ea5e9", icon_ios: "square.grid.2x2.fill",              labels: ["de": "Deck & Beschläge", "en": "Deck & fittings"]),
        .init(key: "hull",           sort_order: 100, color: "#64748b", icon_ios: "sailboat.fill",                     labels: ["de": "Rumpf & Unterwasser", "en": "Hull & underwater"]),
        .init(key: "anchor",         sort_order: 110, color: "#92400e", icon_ios: "anchor.circle.fill",                labels: ["de": "Anker & Kette", "en": "Anchor & chain"]),
        .init(key: "hvac",           sort_order: 120, color: "#ec4899", icon_ios: "thermometer.sun.fill",              labels: ["de": "Heizung & Klima", "en": "Heating & AC"]),
        .init(key: "plumbing",       sort_order: 130, color: "#0891b2", icon_ios: "drop.fill",                         labels: ["de": "Sanitär & Wasser", "en": "Plumbing & water"]),
        .init(key: "galley",         sort_order: 140, color: "#d97706", icon_ios: "fork.knife",                        labels: ["de": "Küche & Pantry", "en": "Galley & kitchen"]),
        .init(key: "paint",          sort_order: 150, color: "#8b5cf6", icon_ios: "paintbrush.fill",                   labels: ["de": "Farben & Pflege", "en": "Paint & care"]),
        .init(key: "other",          sort_order: 999, color: "#94a3b8", icon_ios: "shippingbox.fill",                  labels: ["de": "Sonstiges", "en": "Other"]),
    ]
}
