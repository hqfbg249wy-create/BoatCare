//
//  ChatActionSheets.swift
//  Skipily
//
//  Zwei Sheets, die direkt aus dem AI-Chat heraus aufgerufen werden:
//
//  1) ChatToProviderShareSheet — schickt die letzte Q+A samt Boots-/
//     Equipment-Kontext als Briefing an einen ausgewählten Service-Provider.
//
//  2) EquipmentFromPhotoSheet — legt Equipment direkt an mit den Fotos,
//     die der User dem KI-Assistenten zur Diagnose geschickt hat.
//

import SwiftUI

// MARK: - 1) Chat → Provider weiterleiten

struct ChatToProviderShareSheet: View {
    let messages: [LocalChatMessage]
    let boatContext: AIChatContext?
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authService: AuthService

    @State private var providers: [ServiceProvider] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var searchText = ""
    @State private var generatedBriefing: String?
    @State private var generatingFor: ServiceProvider?

    var body: some View {
        NavigationStack {
            Group {
                if let briefing = generatedBriefing, let provider = generatingFor {
                    briefingPreview(briefing, provider: provider)
                } else if isLoading {
                    ProgressView("general.loading".loc).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let err = errorMessage {
                    Text(err).foregroundStyle(.red).padding()
                } else if providers.isEmpty {
                    emptyState
                } else {
                    providerList
                }
            }
            .navigationTitle("chat.share_provider_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
            }
            .task { await loadProviders() }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.2.slash").font(.largeTitle).foregroundStyle(.secondary)
            Text("chat.share_no_providers".loc).foregroundStyle(.secondary).multilineTextAlignment(.center).padding()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var providerList: some View {
        List {
            Section {
                TextField("chat.share_search".loc, text: $searchText)
            }
            Section(header: Text("chat.share_pick".loc)) {
                ForEach(filtered) { p in
                    Button {
                        Task { await generate(for: p) }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "building.2.fill")
                                .foregroundStyle(.blue)
                                .frame(width: 36, height: 36)
                                .background(Color.blue.opacity(0.1))
                                .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                if let city = p.city, !city.isEmpty {
                                    Text(city).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.tertiary).font(.caption)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var filtered: [ServiceProvider] {
        guard !searchText.isEmpty else { return providers }
        let q = searchText.lowercased()
        return providers.filter {
            $0.name.lowercased().contains(q) ||
            ($0.city?.lowercased().contains(q) ?? false) ||
            $0.category.lowercased().contains(q)
        }
    }

    private func briefingPreview(_ text: String, provider: ServiceProvider) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane.fill").foregroundStyle(.blue)
                    Text(String(format: "provider.briefing_for".loc, provider.name))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Text(text)
                    .font(.callout).textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14).background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                HStack(spacing: 12) {
                    ShareLink(item: text,
                              subject: Text(String(format: "briefing.subject_format".loc, provider.name)),
                              message: Text("briefing.share_message".loc)) {
                        Label("briefing.share".loc, systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Color.blue).foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    if let email = provider.email,
                       let subject = String(format: "briefing.subject_format".loc, provider.name)
                            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                       let body = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                       let url = URL(string: "mailto:\(email)?subject=\(subject)&body=\(body)") {
                        Link(destination: url) {
                            Label("provider.email".loc, systemImage: "envelope.fill")
                                .frame(maxWidth: .infinity).padding(.vertical, 12)
                                .background(Color.blue.opacity(0.12)).foregroundStyle(.blue)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }

                Button {
                    generatedBriefing = nil
                    generatingFor = nil
                } label: {
                    Label("general.back".loc, systemImage: "chevron.left").frame(maxWidth: .infinity).padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
            }
            .padding(16)
        }
    }

    private func loadProviders() async {
        isLoading = true; defer { isLoading = false }
        do {
            // Aktuell: nur Favoriten als Vorauswahl. Reicht für 90 % der Fälle —
            // erweitert sich später ggf. um eine Volltext-Suche.
            let favIds = (UserDefaults.standard.array(forKey: "favoriteProviders") as? [String]) ?? []
            if favIds.isEmpty {
                let result: [ServiceProvider] = try await authService.supabase
                    .from("service_providers")
                    .select("*")
                    .order("name")
                    .limit(50)
                    .execute().value
                providers = result
            } else {
                let result: [ServiceProvider] = try await authService.supabase
                    .from("service_providers")
                    .select("*")
                    .in("id", values: favIds)
                    .execute().value
                providers = result
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Baut ein Markdown-Briefing aus dem letzten User-Turn + Assistant-Antwort
    /// + Boots-Kontext. So sieht der Provider sofort, worum es geht.
    private func generate(for provider: ServiceProvider) async {
        let lang = LanguageManager.shared.currentLanguage.code
        var lines: [String] = []
        lines.append("# \("briefing.title".loc)")
        lines.append("")
        lines.append(String(format: "briefing.greeting_provider".loc, provider.name))
        lines.append("")

        // Konkrete Anfrage = letzte User-Frage
        if let lastUser = messages.reversed().first(where: { $0.isUser }) {
            lines.append("## \("chat.share_question".loc)")
            lines.append(lastUser.text)
            if !lastUser.attachmentUrls.isEmpty {
                lines.append("")
                lines.append("**\("briefing.section_photos".loc):**")
                for (i, u) in lastUser.attachmentUrls.enumerated() {
                    lines.append("\(i + 1). \(u)")
                }
            }
            lines.append("")
        }

        // KI-Diagnose als Vorab-Einschätzung (transparent als KI gekennzeichnet)
        if let lastAssistant = messages.reversed().first(where: { !$0.isUser }) {
            lines.append("## \("chat.share_ai_diagnosis".loc)")
            lines.append("_\("chat.share_ai_disclaimer".loc)_")
            lines.append("")
            lines.append(lastAssistant.text)
            lines.append("")
        }

        // Boots-/Equipment-Kontext (Kurzfassung)
        if let ctx = boatContext, !ctx.boats.isEmpty {
            lines.append("## \("briefing.section_boat".loc)")
            for boat in ctx.boats {
                if !boat.name.isEmpty { lines.append("- **\("briefing.boat_name".loc):** \(boat.name)") }
                if let t = boat.type, !t.isEmpty { lines.append("- **\("briefing.boat_type".loc):** \(t)") }
                if let m = boat.manufacturer, !m.isEmpty {
                    let model = boat.model.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
                    lines.append("- **\("briefing.boat_model".loc):** \(m)\(model)")
                }
                if let y = boat.year { lines.append("- **\("briefing.boat_year".loc):** \(y)") }
                if let p = boat.homePort, !p.isEmpty { lines.append("- **\("briefing.boat_home_port".loc):** \(p)") }
            }
            lines.append("")
        }

        lines.append("---")
        lines.append("briefing.closing".loc)
        _ = lang // reserviert für künftige Sprach-spezifische Anpassungen

        generatingFor = provider
        generatedBriefing = lines.joined(separator: "\n")
    }
}

// MARK: - 2) Equipment aus Foto-Diagnose anlegen

struct EquipmentFromPhotoSheet: View {
    let photoUrls: [String]
    let suggestedName: String?    // optional aus Chat-Kontext extrahiert
    let suggestedCategory: String? // optional
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authService: AuthService

    @State private var boats: [BoatLite] = []
    @State private var selectedBoatId: UUID?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private struct BoatLite: Identifiable, Codable {
        let id: UUID
        let name: String?
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("general.loading".loc).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let err = errorMessage {
                    Text(err).foregroundStyle(.red).padding()
                } else if let boatId = selectedBoatId {
                    AddEditEquipmentView(
                        boatId: boatId,
                        item: nil,
                        initialCategory: suggestedCategory,
                        initialPhotoUrls: photoUrls
                    ) { _ in
                        dismiss()
                    }
                } else {
                    boatPicker
                }
            }
            .navigationTitle("chat.equipment_from_photo_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
            }
            .task { await loadBoats() }
        }
    }

    private var boatPicker: some View {
        List {
            Section(header: Text("chat.equipment_pick_boat".loc),
                    footer: Text("chat.equipment_from_photo_hint".loc)) {
                if boats.isEmpty {
                    Text("provider.briefing_empty".loc).foregroundStyle(.secondary)
                }
                ForEach(boats) { boat in
                    Button {
                        selectedBoatId = boat.id
                    } label: {
                        HStack {
                            Image(systemName: "sailboat.fill").foregroundStyle(.blue)
                            Text(boat.name ?? "boats.boat".loc)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.tertiary).font(.caption)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func loadBoats() async {
        isLoading = true; defer { isLoading = false }
        do {
            guard let userId = authService.currentUser?.id else { return }
            let loaded: [BoatLite] = try await authService.supabase
                .from("boats")
                .select("id, name")
                .eq("owner_id", value: userId.uuidString)
                .order("name")
                .execute().value
            boats = loaded
            if loaded.count == 1 {
                // Nur ein Boot? Direkt vorauswählen, spart einen Klick.
                selectedBoatId = loaded[0].id
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Identifiable wrappers (für sheet(item:))

struct ShareTargetWrapper: Identifiable {
    let id = UUID()
    let messages: [LocalChatMessage]
}

struct PhotoBundle: Identifiable {
    let id = UUID()
    let urls: [String]
}
