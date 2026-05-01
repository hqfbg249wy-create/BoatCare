//
//  ProviderBriefingView.swift
//  Skipily
//
//  Erlaubt dem Eigner, einem Service-Provider direkt aus der Detail-Ansicht
//  ein Briefing für mehrere ausgewählte Ausrüstungsgegenstände zu schicken.
//
//  Flow:
//    1) Boote + Equipment des Users laden
//    2) User hakt die Items an, die für die Anfrage relevant sind
//    3) Markdown-Briefing generieren (mehrere Items, ggf. über mehrere Boote)
//    4) ShareLink → E-Mail / WhatsApp / Nachrichten
//

import SwiftUI

struct ProviderBriefingView: View {
    let provider: ServiceProvider
    @Environment(\.dismiss) private var dismiss

    @EnvironmentObject private var authService: AuthService

    @State private var boats: [BoatLite] = []
    @State private var equipmentByBoat: [UUID: [EquipmentLite]] = [:]
    @State private var selected: Set<UUID> = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var generatedBriefing: String?
    @State private var isGenerating = false

    private struct BoatLite: Identifiable, Codable {
        let id: UUID
        let name: String?
    }
    private struct EquipmentLite: Identifiable, Codable {
        let id: UUID
        let boat_id: UUID
        let name: String?
        let category: String?
        let manufacturer: String?
        let model: String?
    }

    var body: some View {
        NavigationStack {
            Group {
                if let briefing = generatedBriefing {
                    briefingPreview(briefing)
                } else if isLoading {
                    ProgressView("briefing.loading".loc)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let err = errorMessage {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle)
                            .foregroundStyle(.orange)
                        Text(err).foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if boats.isEmpty {
                    emptyState
                } else {
                    selectionList
                }
            }
            .navigationTitle("provider.briefing_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
                if generatedBriefing == nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("provider.briefing_generate".loc) {
                            Task { await generate() }
                        }
                        .disabled(selected.isEmpty || isGenerating)
                        .fontWeight(.semibold)
                    }
                }
            }
            .task { await load() }
        }
    }

    // MARK: - States

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("provider.briefing_empty".loc)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var selectionList: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    Image(systemName: "paperplane.fill")
                        .foregroundStyle(AppColors.primary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(provider.name).font(.headline)
                        Text("provider.briefing_intro".loc)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            ForEach(boats) { boat in
                Section(header: Text(boat.name ?? "boats.boat".loc)) {
                    ForEach(equipmentByBoat[boat.id] ?? []) { eq in
                        Button {
                            if selected.contains(eq.id) { selected.remove(eq.id) }
                            else { selected.insert(eq.id) }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: selected.contains(eq.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(selected.contains(eq.id) ? AppColors.primary : .secondary)
                                    .imageScale(.large)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(eq.name ?? "—").foregroundStyle(.primary)
                                    HStack(spacing: 6) {
                                        if let cat = eq.category, !cat.isEmpty {
                                            Text("equipment.cat.\(cat)".loc)
                                        }
                                        if let mfr = eq.manufacturer, !mfr.isEmpty {
                                            Text("· \(mfr)\(eq.model.map { $0.isEmpty ? "" : " \($0)" } ?? "")")
                                        }
                                    }
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if !selected.isEmpty {
                Section {
                    Text(String(format: "provider.briefing_selected_count".loc, selected.count))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func briefingPreview(_ text: String) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane.fill").foregroundStyle(AppColors.primary)
                    Text(String(format: "provider.briefing_for".loc, provider.name))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Text(text)
                    .font(.callout)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                HStack(spacing: 12) {
                    ShareLink(item: text,
                              subject: Text(String(format: "briefing.subject_format".loc, provider.name)),
                              message: Text("briefing.share_message".loc)) {
                        Label("briefing.share".loc, systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(AppColors.primary)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    if let email = provider.email, let url = URL(string: "mailto:\(email)?subject=\(escapeMail(provider.name))&body=\(escapeMail(text))") {
                        Link(destination: url) {
                            Label("provider.email".loc, systemImage: "envelope.fill")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.blue.opacity(0.12))
                                .foregroundStyle(.blue)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }

                Button {
                    generatedBriefing = nil
                } label: {
                    Label("general.back".loc, systemImage: "chevron.left")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
            }
            .padding(16)
        }
    }

    private func escapeMail(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s
    }

    // MARK: - Loading

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            guard let userId = authService.currentUser?.id else { return }
            let loaded: [BoatLite] = try await authService.supabase
                .from("boats")
                .select("id, name")
                .eq("owner_id", value: userId.uuidString)
                .order("name")
                .execute().value
            boats = loaded

            if boats.isEmpty { return }

            let allEq: [EquipmentLite] = try await authService.supabase
                .from("equipment")
                .select("id, boat_id, name, category, manufacturer, model")
                .in("boat_id", values: boats.map { $0.id.uuidString })
                .order("name")
                .execute().value
            equipmentByBoat = Dictionary(grouping: allEq, by: { $0.boat_id })
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func generate() async {
        isGenerating = true; defer { isGenerating = false }
        do {
            let lang = LanguageManager.shared.currentLanguage.code
            let text = try await EquipmentBriefingBuilder.buildMulti(
                equipmentIds: Array(selected),
                providerName: provider.name,
                lang: lang
            )
            generatedBriefing = text
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
