//
//  ChatHistoryView.swift
//  Skipily
//
//  Liste aller gespeicherten AI-Chat-Gespraeche des aktuellen Users.
//

import SwiftUI

struct ChatHistoryView: View {
    /// Callback beim Antippen einer Session (z.B. Sheet schliessen + laden).
    var onOpen: (UUID) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var sessions: [ChatSessionSummary] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let chatService = AIChatService.shared

    var body: some View {
        Group {
            if isLoading && sessions.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if sessions.isEmpty {
                ContentUnavailableView(
                    "chat.history.empty_title".loc,
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text("chat.history.empty_hint".loc)
                )
            } else {
                List {
                    ForEach(sessions) { session in
                        Button {
                            onOpen(session.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(session.title)
                                    .font(.body)
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                if let preview = session.preview, !preview.isEmpty {
                                    Text(preview)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                                Text(session.updatedAt, style: .relative)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .onDelete(perform: delete)
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("chat.history.title".loc)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("general.close".loc) { dismiss() }
            }
        }
        .alert(
            "general.error".loc,
            isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            ),
            actions: { Button("general.ok".loc, role: .cancel) {} },
            message: { Text(errorMessage ?? "") }
        )
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: - Load / Delete

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            sessions = try await chatService.listSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func delete(at offsets: IndexSet) {
        let targets = offsets.map { sessions[$0] }
        sessions.remove(atOffsets: offsets)
        Task {
            for target in targets {
                do {
                    try await chatService.deleteSession(id: target.id)
                } catch {
                    AppLog.warning("Session-Delete fehlgeschlagen: \(error)")
                    // Bei Fehler neu laden, damit der UI-State stimmt
                    await load()
                    return
                }
            }
        }
    }
}
