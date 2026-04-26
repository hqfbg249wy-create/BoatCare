//
//  EquipmentSuggestionsSheet.swift
//  Skipily
//
//  Bottom-Sheet mit KI-generierten Equipment-Vorschlägen für ein Boot.
//  User kann einzelne Vorschläge per Tap zum Equipment-Bestand hinzufügen.
//

import SwiftUI
import Supabase

struct EquipmentSuggestionsSheet: View {
    let boatId: UUID
    let boatName: String
    /// Wird aufgerufen wenn der User einen Vorschlag akzeptiert hat —
    /// Parent kann dann seine Equipment-Liste neu laden.
    let onAdded: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var suggestions: [EquipmentSuggestionService.Suggestion] = []
    @State private var addingIds: Set<String> = []
    @State private var addedIds: Set<String> = []

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("equipment.suggestions_loading".loc)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let err = errorMessage {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle)
                            .foregroundStyle(.orange)
                        Text(err)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                        Button("general.retry".loc) {
                            Task { await load() }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        Section {
                            Text("equipment.suggestions_intro".loc)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        ForEach(suggestions) { sug in
                            row(sug)
                        }
                    }
                }
            }
            .navigationTitle("equipment.suggestions_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.done".loc) { dismiss() }
                }
            }
            .task { await load() }
            .onDisappear {
                // Auch bei Swipe-Down-Dismiss lädt der Parent neu, falls
                // mindestens ein Vorschlag akzeptiert wurde.
                if !addedIds.isEmpty { onAdded() }
            }
        }
    }

    @ViewBuilder
    private func row(_ sug: EquipmentSuggestionService.Suggestion) -> some View {
        let isAdding = addingIds.contains(sug.id)
        let isAdded  = addedIds.contains(sug.id)

        HStack(alignment: .top, spacing: 12) {
            // Kategorie-Icon
            Image(systemName: iconFor(sug.category))
                .font(.title3)
                .foregroundStyle(colorFor(sug.category))
                .frame(width: 32, height: 32)
                .background(colorFor(sug.category).opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(sug.name)
                    .font(.headline)
                    .foregroundStyle(.primary)

                HStack(spacing: 6) {
                    Text("equipment.cat.\(sug.category)".loc)
                        .font(.caption)
                        .foregroundStyle(colorFor(sug.category))
                    if let cy = sug.maintenance_cycle_years {
                        Text("· \(cy)\("equipment.years_short".loc)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if !sug.why.isEmpty {
                    Text(sug.why)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                if !sug.manufacturer_hint.isEmpty {
                    Text(sug.manufacturer_hint)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            // Add-Button
            Button {
                Task { await add(sug) }
            } label: {
                if isAdding {
                    ProgressView()
                        .frame(width: 28, height: 28)
                } else if isAdded {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.green)
                } else {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                        .foregroundStyle(AppColors.primary)
                }
            }
            .buttonStyle(.plain)
            .disabled(isAdding || isAdded)
        }
        .padding(.vertical, 4)
    }

    // MARK: - Loading

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            // Boot + bisheriges Equipment laden
            struct BoatRow: Codable {
                let id: UUID; let name: String; let boatType: String
                let manufacturer: String; let model: String
                let year: Int?; let lengthMeters: Double?
                let engine: String
                enum CodingKeys: String, CodingKey {
                    case id; case name
                    case boatType = "boat_type"
                    case manufacturer; case model; case year
                    case lengthMeters = "length_meters"
                    case engine
                }
            }
            let boats: [BoatRow] = try await SupabaseManager.shared.client
                .from("boats")
                .select("id, name, boat_type, manufacturer, model, year, length_meters, engine")
                .eq("id", value: boatId.uuidString)
                .limit(1)
                .execute()
                .value
            guard let b = boats.first else {
                errorMessage = "equipment.suggestions_no_boat".loc
                return
            }

            struct EqRow: Codable {
                let name: String; let category: String
            }
            let eq: [EqRow] = try await SupabaseManager.shared.client
                .from("equipment")
                .select("name, category")
                .eq("boat_id", value: boatId.uuidString)
                .execute()
                .value

            let boat = Boat(
                id: b.id, ownerId: nil, name: b.name,
                boatType: b.boatType, manufacturer: b.manufacturer,
                model: b.model, year: b.year, yearBuilt: nil,
                lengthMeters: b.lengthMeters, width: nil, draft: nil,
                engine: b.engine, homePort: "", registrationNumber: "",
                hin: "", imageUrl: nil
            )
            // EquipmentItem nur in dem Maße bauen, wie das Service-Interface es braucht
            let items = eq.map { row in
                EquipmentItem(boatId: boatId, name: row.name, category: row.category)
            }

            let result = try await EquipmentSuggestionService.shared.fetchSuggestions(
                boat: boat, existing: items
            )
            suggestions = result
        } catch {
            AppLog.error("EquipmentSuggestionsSheet.load: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Add

    private struct EquipmentInsertRow: Encodable {
        let boat_id: String
        let name: String
        let category: String
        let manufacturer: String
        let maintenance_cycle_years: Int?
        let item_description: String
        let last_maintenance_date: String?
        let next_maintenance_date: String?
    }

    private func add(_ sug: EquipmentSuggestionService.Suggestion) async {
        addingIds.insert(sug.id)
        defer { addingIds.remove(sug.id) }

        // Wenn Wartungszyklus bekannt, fiktives "letzte Wartung = heute"
        // setzen, damit next_maintenance_date sofort im Wartungs-Tab steht
        // — User kann das im Equipment-Detail anpassen.
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let today = df.string(from: Date())
        var nextMD: String? = nil
        if let cy = sug.maintenance_cycle_years,
           let next = Calendar.current.date(byAdding: .year, value: cy, to: Date()) {
            nextMD = df.string(from: next)
        }

        let row = EquipmentInsertRow(
            boat_id: boatId.uuidString,
            name: sug.name,
            category: sug.category,                  // Kategorie aus KI-Vorschlag
            manufacturer: sug.manufacturer_hint,
            maintenance_cycle_years: sug.maintenance_cycle_years,
            item_description: sug.why,
            last_maintenance_date: sug.maintenance_cycle_years != nil ? today : nil,
            next_maintenance_date: nextMD
        )

        do {
            try await SupabaseManager.shared.client
                .from("equipment")
                .insert(row)
                .execute()
            addedIds.insert(sug.id)
            AppLog.debug("Suggestion added: \(sug.name) [\(sug.category)] for boat \(boatId)")
        } catch {
            AppLog.error("EquipmentSuggestionsSheet.add: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    private func iconFor(_ cat: String) -> String {
        switch cat {
        case "engine": return "engine.combustion.fill"
        case "sails": return "wind"
        case "rigging": return "arrow.up.and.down"
        case "navigation": return "location.north.line.fill"
        case "communication": return "antenna.radiowaves.left.and.right"
        case "electrical": return "bolt.fill"
        case "safety": return "shield.fill"
        case "anchor": return "anchor.circle.fill"
        case "hvac": return "thermometer.sun.fill"
        case "paint": return "paintbrush.fill"
        case "rope": return "scribble.variable"
        default: return "shippingbox.fill"
        }
    }

    private func colorFor(_ cat: String) -> Color {
        switch cat {
        case "engine": return .orange
        case "sails": return .cyan
        case "rigging": return .indigo
        case "navigation": return .blue
        case "communication": return .teal
        case "electrical": return .yellow
        case "safety": return .red
        case "anchor": return .gray
        case "hvac": return .pink
        case "paint": return .purple
        case "rope": return .brown
        default: return .secondary
        }
    }
}
