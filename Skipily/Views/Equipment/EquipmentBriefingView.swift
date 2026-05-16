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

/// Zweistufiger Flow: 1) Provider auswählen → 2) Briefing für dieses
/// Equipment-Item angezeigt bekommen (mit Provider-Gruss + E-Mail-Link).
struct EquipmentBriefingView: View {
    let equipmentId: UUID
    let boatId: UUID
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authService: AuthService

    // MARK: - State
    @State private var providers: [ServiceProvider] = []
    @State private var searchText = ""
    @State private var loadingProviders = true
    @State private var selectedProvider: ServiceProvider?

    @State private var briefing: String = ""
    @State private var equipmentName: String = ""
    @State private var generatingBriefing = false
    @State private var errorMessage: String?

    // Neu: Compose-Sheet öffnen, sobald ein Provider ausgewählt wurde
    @State private var showingInquiryCompose = false

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Group {
                if let provider = selectedProvider {
                    if generatingBriefing {
                        VStack(spacing: 16) {
                            ProgressView()
                            Text("briefing.loading".loc)
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if let err = errorMessage {
                        errorView(err)
                    } else {
                        briefingView(briefing, provider: provider)
                    }
                } else if loadingProviders {
                    ProgressView("general.loading".loc)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    providerPickerView
                }
            }
            .navigationTitle(selectedProvider == nil
                ? "briefing.pick_provider".loc
                : "briefing.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if selectedProvider != nil {
                        Button("general.back".loc) {
                            selectedProvider = nil
                            briefing = ""
                            errorMessage = nil
                        }
                    } else {
                        Button("general.cancel".loc) { dismiss() }
                    }
                }
                if selectedProvider != nil, !briefing.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(
                            item: briefing,
                            subject: Text(String(format: "briefing.subject_format".loc,
                                                 selectedProvider?.name ?? "")),
                            message: Text("briefing.share_message".loc)
                        ) {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                }
            }
            .task { await loadProviders() }
            .sheet(isPresented: $showingInquiryCompose, onDismiss: {
                // Wenn der User in der Compose-View „Abbrechen" gedrückt hat,
                // bleibt der Provider-Picker offen, damit er einen anderen
                // Anbieter wählen kann.
                selectedProvider = nil
            }) {
                if let p = selectedProvider {
                    InquiryComposeView(
                        editing: nil,
                        providerId: p.id,
                        providerName: p.name,
                        providerEmail: p.email,
                        preselectedEquipmentId: equipmentId,
                        onSave: {
                            // Nach erfolgreichem Speichern/Senden den ganzen Flow schließen.
                            await MainActor.run {
                                showingInquiryCompose = false
                                dismiss()
                            }
                        }
                    )
                    .environmentObject(authService)
                }
            }
        }
    }

    // MARK: - Provider-Picker

    private var providerPickerView: some View {
        List {
            Section {
                TextField("chat.share_search".loc, text: $searchText)
            }
            Section(header: Text("chat.share_pick".loc)) {
                if filteredProviders.isEmpty {
                    Text("chat.share_no_providers".loc)
                        .font(.callout).foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(filteredProviders) { p in
                        Button { selectProvider(p) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "building.2.fill")
                                    .foregroundStyle(.blue)
                                    .frame(width: 36, height: 36)
                                    .background(Color.blue.opacity(0.1))
                                    .clipShape(Circle())
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name).font(.subheadline.weight(.semibold))
                                    if let city = p.city, !city.isEmpty {
                                        Text(city).font(.caption).foregroundStyle(.secondary)
                                    }
                                    if let cat = p.category as String?, !cat.isEmpty {
                                        Text(cat).font(.caption2).foregroundStyle(.tertiary)
                                    }
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundStyle(.tertiary).font(.caption)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var filteredProviders: [ServiceProvider] {
        guard !searchText.isEmpty else { return providers }
        let q = searchText.lowercased()
        return providers.filter {
            $0.name.lowercased().contains(q) ||
            ($0.city?.lowercased().contains(q) ?? false) ||
            $0.category.lowercased().contains(q)
        }
    }

    // MARK: - Briefing-Preview

    private func briefingView(_ text: String, provider: ServiceProvider) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Empfänger-Badge
                HStack(spacing: 8) {
                    Image(systemName: "paperplane.fill").foregroundStyle(.blue)
                    Text(String(format: "provider.briefing_for".loc, provider.name))
                        .font(.subheadline).foregroundStyle(.secondary)
                }

                // Briefing-Text
                Text(text)
                    .font(.callout).textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                // Aktions-Buttons
                VStack(spacing: 10) {
                    // Teilen (generisch)
                    ShareLink(
                        item: text,
                        subject: Text(String(format: "briefing.subject_format".loc, provider.name)),
                        message: Text("briefing.share_message".loc)
                    ) {
                        Label("briefing.share".loc, systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity).padding(.vertical, 13)
                            .background(Color.blue).foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    // E-Mail direkt an Provider (nur wenn E-Mail bekannt)
                    if let email = provider.email,
                       let subject = String(format: "briefing.subject_format".loc, provider.name)
                                .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                       let body = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                       let url = URL(string: "mailto:\(email)?subject=\(subject)&body=\(body)") {
                        Link(destination: url) {
                            Label("provider.email".loc, systemImage: "envelope.fill")
                                .frame(maxWidth: .infinity).padding(.vertical, 13)
                                .background(Color.blue.opacity(0.1)).foregroundStyle(.blue)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle).foregroundStyle(.orange)
            Text(msg).font(.callout).foregroundStyle(.secondary)
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button("general.retry".loc) { selectProvider(selectedProvider!) }
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Actions

    private func selectProvider(_ p: ServiceProvider) {
        selectedProvider = p
        // Statt inline-Briefing → in den Anfrage-Compose-Flow wechseln,
        // mit diesem Equipment vorausgewählt.
        showingInquiryCompose = true
    }

    private func generateBriefing(for provider: ServiceProvider) async {
        generatingBriefing = true
        errorMessage = nil
        defer { generatingBriefing = false }
        do {
            briefing = try await EquipmentBriefingBuilder.build(
                equipmentId: equipmentId,
                boatId: boatId,
                providerName: provider.name,
                lang: LanguageManager.shared.currentLanguage.code
            ) { name in equipmentName = name }
        } catch {
            AppLog.error("EquipmentBriefingView: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    private func loadProviders() async {
        loadingProviders = true; defer { loadingProviders = false }
        do {
            let favIds = (UserDefaults.standard.array(forKey: "favoriteProviders") as? [String]) ?? []
            if favIds.isEmpty {
                providers = try await authService.supabase
                    .from("service_providers").select("*").order("name").limit(50).execute().value
            } else {
                providers = try await authService.supabase
                    .from("service_providers").select("*").in("id", values: favIds).execute().value
            }
        } catch {
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

    /// Multi-Equipment-Variante: Erzeugt ein zusammengefasstes Briefing für
    /// ausgewählte Ausrüstung über mehrere Boote, optional an einen konkreten
    /// Provider adressiert.
    struct EqWithBoat: Codable {
        let id: UUID
        let boat_id: UUID
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

    struct BoatWithId: Codable {
        let id: UUID
        let name: String?
        let boat_type: String?
        let manufacturer: String?
        let model: String?
        let year: Int?
        let length_meters: Double?
        let home_port: String?
        let engine: String?
    }

    static func buildMulti(
        equipmentIds: [UUID],
        providerName: String?,
        lang: String
    ) async throws -> String {
        let client = SupabaseManager.shared.client
        guard !equipmentIds.isEmpty else {
            throw NSError(domain: "EquipmentBriefingBuilder", code: 400,
                          userInfo: [NSLocalizedDescriptionKey: "briefing.no_items".loc])
        }

        let eqs: [EqWithBoat] = try await client
            .from("equipment")
            .select("id, boat_id, name, category, manufacturer, model, serial_number, part_number, dimensions, location_on_boat, item_description, notes, installation_date, last_maintenance_date, next_maintenance_date, maintenance_cycle_years, photo_url")
            .in("id", values: equipmentIds.map { $0.uuidString })
            .execute()
            .value

        let boatIds = Array(Set(eqs.map { $0.boat_id }))
        var boatMap: [UUID: BoatWithId] = [:]
        if !boatIds.isEmpty {
            let raw: [BoatWithId] = try await client
                .from("boats")
                .select("id, name, boat_type, manufacturer, model, year, length_meters, home_port, engine")
                .in("id", values: boatIds.map { $0.uuidString })
                .execute()
                .value
            for b in raw { boatMap[b.id] = b }
        }

        return formatMulti(eqs: eqs, boats: boatMap, providerName: providerName, lang: lang)
    }

    private static func formatMulti(
        eqs: [EqWithBoat],
        boats: [UUID: BoatWithId],
        providerName: String?,
        lang: String
    ) -> String {
        var lines: [String] = []
        lines.append("# \("briefing.title".loc)")
        lines.append("")
        if let name = providerName, !name.isEmpty {
            lines.append(String(format: "briefing.greeting_provider".loc, name))
        } else {
            lines.append("briefing.greeting".loc)
        }
        lines.append("")

        // Gruppieren nach Boot
        let grouped = Dictionary(grouping: eqs, by: { $0.boat_id })
        let sortedBoatIds = grouped.keys.sorted { (a, b) in
            (boats[a]?.name ?? "") < (boats[b]?.name ?? "")
        }

        for boatId in sortedBoatIds {
            let boat = boats[boatId]
            // Boot-Header mit ALLEN verfügbaren Bootsdaten
            lines.append("## \(boat?.name ?? "briefing.section_boat".loc)")
            if let t = boat?.boat_type, !t.isEmpty { lines.append("- \("briefing.boat_type".loc): \(t)") }
            if let m = boat?.manufacturer, !m.isEmpty {
                let model = (boat?.model.flatMap { $0.isEmpty ? nil : " \($0)" }) ?? ""
                lines.append("- \("briefing.boat_model".loc): \(m)\(model)")
            }
            if let y = boat?.year { lines.append("- \("briefing.boat_year".loc): \(y)") }
            if let l = boat?.length_meters {
                let s = l.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(l)) : String(format: "%.1f", l)
                lines.append("- \("briefing.boat_length".loc): \(s) m")
            }
            if let p = boat?.home_port, !p.isEmpty { lines.append("- \("briefing.boat_home_port".loc): \(p)") }
            if let e = boat?.engine, !e.isEmpty { lines.append("- Motor: \(e)") }
            lines.append("")

            // Equipment-Einträge dieses Bootes — vollständige Datenausgabe.
            // Der Provider braucht für eine fundierte Antwort alle vorhandenen
            // Felder. Der User kann später Infos löschen, aber das Hinzufügen
            // aus der Mail ist nicht möglich, daher: lieber zu viel als zu wenig.
            for eq in (grouped[boatId] ?? []) {
                lines.append("### \(eq.name ?? "–")")

                if let c = eq.category, !c.isEmpty {
                    lines.append("- \("briefing.eq_category".loc): \("equipment.cat.\(c)".loc)")
                }
                if let m = eq.manufacturer, !m.isEmpty {
                    let model = eq.model.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
                    lines.append("- \("briefing.eq_brand".loc): \(m)\(model)")
                }
                if let s = eq.serial_number, !s.isEmpty {
                    lines.append("- \("briefing.eq_serial".loc): \(s)")
                }
                if let p = eq.part_number, !p.isEmpty {
                    lines.append("- \("briefing.eq_part".loc): \(p)")
                }
                if let d = eq.dimensions, !d.isEmpty {
                    lines.append("- \("briefing.eq_dimensions".loc): \(d)")
                }
                if let l = eq.location_on_boat, !l.isEmpty {
                    lines.append("- \("briefing.eq_location".loc): \(l)")
                }
                if let inst = eq.installation_date, !inst.isEmpty {
                    lines.append("- Installationsdatum: \(inst)")
                }
                if let lmd = eq.last_maintenance_date, !lmd.isEmpty {
                    lines.append("- \("briefing.eq_last_maint".loc): \(lmd)")
                }
                if let nmd = eq.next_maintenance_date, !nmd.isEmpty {
                    lines.append("- \("briefing.eq_next_maint".loc): \(nmd)")
                }
                if let cy = eq.maintenance_cycle_years {
                    lines.append("- \("briefing.eq_cycle".loc): \(cy) \("briefing.years".loc)")
                }

                if let desc = eq.item_description, !desc.isEmpty {
                    lines.append("")
                    lines.append("**Beschreibung:**")
                    lines.append(desc)
                }
                if let notes = eq.notes, !notes.isEmpty {
                    lines.append("")
                    lines.append("**\("briefing.section_notes".loc):** \(notes)")
                }
                if let photoStr = eq.photo_url, !photoStr.isEmpty {
                    let urls = photoStr.components(separatedBy: ",")
                        .map { $0.trimmingCharacters(in: .whitespaces) }
                        .filter { !$0.isEmpty }
                    if !urls.isEmpty {
                        lines.append("")
                        lines.append("\("briefing.section_photos".loc):")
                        for (i, u) in urls.enumerated() { lines.append("\(i + 1). \(u)") }
                    }
                }
                lines.append("")
            }
        }

        lines.append("---")
        lines.append("briefing.closing".loc)
        return lines.joined(separator: "\n")
    }

    // Single-item-Version — jetzt mit optionalem providerName für gezielten Gruss
    static func build(
        equipmentId: UUID,
        boatId: UUID,
        providerName: String? = nil,
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

        return formatBriefing(boat: boat, eq: eq, providerName: providerName, lang: lang)
    }

    private static func formatBriefing(boat: BoatRow, eq: EquipmentRow,
                                       providerName: String? = nil, lang: String) -> String {
        var lines: [String] = []

        // Header + Anrede
        lines.append("# \("briefing.title".loc)")
        lines.append("")
        if let name = providerName, !name.isEmpty {
            lines.append(String(format: "briefing.greeting_provider".loc, name))
        } else {
            lines.append("briefing.greeting".loc)
        }
        lines.append("")

        // Boat
        lines.append("## \("briefing.section_boat".loc)")
        if let n = boat.name, !n.isEmpty { lines.append("- \("briefing.boat_name".loc): \(n)") }
        if let t = boat.boat_type, !t.isEmpty { lines.append("- \("briefing.boat_type".loc): \(t)") }
        if let m = boat.manufacturer, !m.isEmpty {
            let model = boat.model.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
            lines.append("- \("briefing.boat_model".loc): \(m)\(model)")
        }
        if let y = boat.year { lines.append("- \("briefing.boat_year".loc): \(y)") }
        if let l = boat.length_meters {
            let s = l.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(l)) : String(format: "%.1f", l)
            lines.append("- \("briefing.boat_length".loc): \(s) m")
        }
        if let p = boat.home_port, !p.isEmpty { lines.append("- \("briefing.boat_home_port".loc): \(p)") }
        if let e = boat.engine, !e.isEmpty { lines.append("- \("briefing.boat_engine".loc): \(e)") }
        lines.append("")

        // Equipment
        lines.append("## \("briefing.section_equipment".loc)")
        if let n = eq.name, !n.isEmpty { lines.append("- \("briefing.eq_name".loc): \(n)") }
        if let c = eq.category, !c.isEmpty {
            let catLoc = "equipment.cat.\(c)".loc
            lines.append("- \("briefing.eq_category".loc): \(catLoc)")
        }
        if let m = eq.manufacturer, !m.isEmpty {
            let model = eq.model.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
            lines.append("- \("briefing.eq_brand".loc): \(m)\(model)")
        }
        if let s = eq.serial_number, !s.isEmpty { lines.append("- \("briefing.eq_serial".loc): \(s)") }
        if let p = eq.part_number, !p.isEmpty { lines.append("- \("briefing.eq_part".loc): \(p)") }
        if let d = eq.dimensions, !d.isEmpty { lines.append("- \("briefing.eq_dimensions".loc): \(d)") }
        if let l = eq.location_on_boat, !l.isEmpty { lines.append("- \("briefing.eq_location".loc): \(l)") }
        if let i = eq.installation_date, !i.isEmpty { lines.append("- \("briefing.eq_installed".loc): \(i)") }
        if let lmd = eq.last_maintenance_date, !lmd.isEmpty { lines.append("- \("briefing.eq_last_maint".loc): \(lmd)") }
        if let nmd = eq.next_maintenance_date, !nmd.isEmpty { lines.append("- \("briefing.eq_next_maint".loc): \(nmd)") }
        if let cy = eq.maintenance_cycle_years { lines.append("- \("briefing.eq_cycle".loc): \(cy) \("briefing.years".loc)") }
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
