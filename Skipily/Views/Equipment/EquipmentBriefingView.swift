//
//  EquipmentBriefingView.swift
//  Skipily
//
//  Generiert ein Service-Briefing für ein Equipment-Item, das an einen
//  Dienstleister geschickt werden kann (E-Mail / WhatsApp / SMS / etc.).
//
//  Inhalt:
//    - Boot-Daten (Name, Typ, Baujahr, Hafen)
//    - Equipment-Daten (Name, Kategorie, Hersteller, Modell, Seriennummer,
//      Position an Bord, Maße, letzte/nächste Wartung)
//    - Beschreibung / Notizen
//    - Foto-URLs falls vorhanden
//    - Sail-Maßblatt-Werte falls vorhanden
//
//  Format: Markdown — funktioniert in jedem E-Mail-Client + WhatsApp.
//

import SwiftUI
import Supabase

struct EquipmentBriefingView: View {
    let equipmentId: UUID
    let boatId: UUID
    @Environment(\.dismiss) private var dismiss

    @State private var briefing: String = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("briefing.loading".loc)
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
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 8) {
                                Image(systemName: "paperplane.fill")
                                    .foregroundStyle(AppColors.primary)
                                Text("briefing.intro".loc)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.bottom, 4)

                            Text(briefing)
                                .font(.callout)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(Color(.secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("briefing.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
                if !briefing.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: briefing,
                                  subject: Text(shareSubject),
                                  message: Text("briefing.share_message".loc)) {
                            Label("briefing.share".loc, systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
            .task { await load() }
        }
    }

    private var shareSubject: String {
        String(format: "briefing.subject_format".loc, equipmentName)
    }

    @State private var equipmentName: String = ""

    // MARK: - Loading

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            briefing = try await EquipmentBriefingBuilder.build(
                equipmentId: equipmentId,
                boatId: boatId,
                lang: LanguageManager.shared.currentLanguage.code
            ) { name in
                equipmentName = name
            }
        } catch {
            AppLog.error("EquipmentBriefingView.load: \(error)")
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Builder

enum EquipmentBriefingBuilder {

    struct BoatRow: Codable {
        let name: String?
        let boat_type: String?
        let manufacturer: String?
        let model: String?
        let year: Int?
        let length_meters: Double?
        let home_port: String?
        let engine: String?
    }

    struct EquipmentRow: Codable {
        let name: String?
        let category: String?
        let manufacturer: String?
        let model: String?
        let serial_number: String?
        let part_number: String?
        let dimensions: String?
        let location_on_boat: String?
        let item_description: String?
        let notes: String?
        let installation_date: String?
        let last_maintenance_date: String?
        let next_maintenance_date: String?
        let maintenance_cycle_years: Int?
        let photo_url: String?
    }

    static func build(
        equipmentId: UUID,
        boatId: UUID,
        lang: String,
        onResolveName: @escaping (String) -> Void
    ) async throws -> String {
        let client = SupabaseManager.shared.client

        async let boatTask: [BoatRow] = client
            .from("boats")
            .select("name, boat_type, manufacturer, model, year, length_meters, home_port, engine")
            .eq("id", value: boatId.uuidString)
            .limit(1)
            .execute()
            .value

        async let eqTask: [EquipmentRow] = client
            .from("equipment")
            .select("name, category, manufacturer, model, serial_number, part_number, dimensions, location_on_boat, item_description, notes, installation_date, last_maintenance_date, next_maintenance_date, maintenance_cycle_years, photo_url")
            .eq("id", value: equipmentId.uuidString)
            .limit(1)
            .execute()
            .value

        let (boats, eqs) = try await (boatTask, eqTask)
        guard let boat = boats.first, let eq = eqs.first else {
            throw NSError(domain: "EquipmentBriefingBuilder", code: 404,
                          userInfo: [NSLocalizedDescriptionKey: "briefing.not_found".loc])
        }

        if let name = eq.name { await MainActor.run { onResolveName(name) } }

        return formatBriefing(boat: boat, eq: eq, lang: lang)
    }

    private static func formatBriefing(boat: BoatRow, eq: EquipmentRow, lang: String) -> String {
        var lines: [String] = []

        // Header
        lines.append("# \("briefing.title".loc)")
        lines.append("")
        lines.append("\("briefing.greeting".loc)")
        lines.append("")

        // Boat
        lines.append("## \("briefing.section_boat".loc)")
        if let n = boat.name, !n.isEmpty { lines.append("- **\("briefing.boat_name".loc):** \(n)") }
        if let t = boat.boat_type, !t.isEmpty { lines.append("- **\("briefing.boat_type".loc):** \(t)") }
        if let m = boat.manufacturer, !m.isEmpty {
            let model = boat.model.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
            lines.append("- **\("briefing.boat_model".loc):** \(m)\(model)")
        }
        if let y = boat.year { lines.append("- **\("briefing.boat_year".loc):** \(y)") }
        if let l = boat.length_meters {
            let s = l.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(l)) : String(format: "%.1f", l)
            lines.append("- **\("briefing.boat_length".loc):** \(s) m")
        }
        if let p = boat.home_port, !p.isEmpty { lines.append("- **\("briefing.boat_home_port".loc):** \(p)") }
        if let e = boat.engine, !e.isEmpty { lines.append("- **\("briefing.boat_engine".loc):** \(e)") }
        lines.append("")

        // Equipment
        lines.append("## \("briefing.section_equipment".loc)")
        if let n = eq.name, !n.isEmpty { lines.append("- **\("briefing.eq_name".loc):** \(n)") }
        if let c = eq.category, !c.isEmpty {
            let catLoc = "equipment.cat.\(c)".loc
            lines.append("- **\("briefing.eq_category".loc):** \(catLoc)")
        }
        if let m = eq.manufacturer, !m.isEmpty {
            let model = eq.model.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
            lines.append("- **\("briefing.eq_brand".loc):** \(m)\(model)")
        }
        if let s = eq.serial_number, !s.isEmpty { lines.append("- **\("briefing.eq_serial".loc):** \(s)") }
        if let p = eq.part_number, !p.isEmpty { lines.append("- **\("briefing.eq_part".loc):** \(p)") }
        if let d = eq.dimensions, !d.isEmpty { lines.append("- **\("briefing.eq_dimensions".loc):** \(d)") }
        if let l = eq.location_on_boat, !l.isEmpty { lines.append("- **\("briefing.eq_location".loc):** \(l)") }
        if let i = eq.installation_date, !i.isEmpty { lines.append("- **\("briefing.eq_installed".loc):** \(i)") }
        if let lmd = eq.last_maintenance_date, !lmd.isEmpty { lines.append("- **\("briefing.eq_last_maint".loc):** \(lmd)") }
        if let nmd = eq.next_maintenance_date, !nmd.isEmpty { lines.append("- **\("briefing.eq_next_maint".loc):** \(nmd)") }
        if let cy = eq.maintenance_cycle_years { lines.append("- **\("briefing.eq_cycle".loc):** \(cy) \("briefing.years".loc)") }
        lines.append("")

        // Description / notes
        if let desc = eq.item_description, !desc.isEmpty {
            lines.append("## \("briefing.section_description".loc)")
            lines.append(desc)
            lines.append("")
        }
        if let notes = eq.notes, !notes.isEmpty {
            lines.append("## \("briefing.section_notes".loc)")
            lines.append(notes)
            lines.append("")
        }

        // Photos
        if let photoStr = eq.photo_url, !photoStr.isEmpty {
            let urls = photoStr.components(separatedBy: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            if !urls.isEmpty {
                lines.append("## \("briefing.section_photos".loc)")
                for (i, u) in urls.enumerated() {
                    lines.append("\(i + 1). \(u)")
                }
                lines.append("")
            }
        }

        // Closing
        lines.append("---")
        lines.append("\("briefing.closing".loc)")

        return lines.joined(separator: "\n")
    }
}
