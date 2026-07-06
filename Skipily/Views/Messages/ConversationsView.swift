//
//  ConversationsView.swift
//  Skipily
//
//  List of all chat conversations for the current user.
//  ConversationsContent ist ohne eigenen NavigationStack, damit es in POIScreen
//  (Tab "Kontakte") als Segment eingebettet werden kann.
//

import SwiftUI

struct ConversationsContent: View {
    @EnvironmentObject var authService: AuthService

    @State private var conversations: [Conversation] = []
    @State private var isLoading = true
    @State private var showArchived = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $showArchived) {
                Text("msg.active".loc).tag(false)
                Text("msg.archived".loc).tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Group {
                if isLoading {
                    ProgressView("messages.loading".loc)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if conversations.isEmpty {
                    emptyView
                } else {
                    conversationList
                }
            }
        }
        .task { await loadConversations() }
        .refreshable { await loadConversations() }
        .onChange(of: showArchived) { _, _ in
            Task { await loadConversations() }
        }
    }

    private var conversationList: some View {
        List(conversations) { conv in
            NavigationLink(value: conv.id) {
                conversationRow(conv)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                    Task { await deleteConversation(conv.id) }
                } label: {
                    Label("msg.deleteConv".loc, systemImage: "trash")
                }
                Button {
                    Task { await archiveConversation(conv.id, archived: !showArchived) }
                } label: {
                    Label(showArchived ? "msg.unarchive".loc : "msg.archive".loc,
                          systemImage: showArchived ? "tray.and.arrow.up" : "archivebox")
                }
                .tint(.orange)
            }
        }
        .listStyle(.plain)
        .navigationDestination(for: UUID.self) { convId in
            if let conv = conversations.first(where: { $0.id == convId }) {
                ChatView(conversation: conv)
            }
        }
    }

    private func archiveConversation(_ id: UUID, archived: Bool) async {
        do {
            try await MessagingService.shared.archiveConversation(id: id, archived: archived)
            await loadConversations()
        } catch {
            AppLog.error("Archive conversation: \(error)")
        }
    }

    private func deleteConversation(_ id: UUID) async {
        do {
            try await MessagingService.shared.deleteConversation(id: id)
            await loadConversations()
        } catch {
            AppLog.error("Delete conversation: \(error)")
        }
    }

    private func conversationRow(_ conv: Conversation) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(AppColors.primary.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: "building.2")
                    .font(.system(size: 18))
                    .foregroundStyle(AppColors.primary)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(conv.provider?.companyName ?? "Anbieter")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                if let city = conv.provider?.city {
                    Text(city)
                        .font(.caption)
                        .foregroundStyle(AppColors.gray500)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(conv.displayDate)
                    .font(.caption2)
                    .foregroundStyle(AppColors.gray400)
            }
        }
        .padding(.vertical, 4)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundStyle(AppColors.gray300)
            Text("messages.empty_title".loc)
                .font(.title3)
                .fontWeight(.semibold)
            Text("messages.empty_hint".loc)
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func loadConversations() async {
        guard let userId = authService.currentUser?.id else {
            isLoading = false
            return
        }
        await MessagingService.shared.loadConversations(userId: userId, archived: showArchived)
        conversations = MessagingService.shared.conversations
        isLoading = false
    }
}

/// Eigenständige Variante (mit NavigationStack) — für ggf. separate Nutzung.
struct ConversationsView: View {
    @EnvironmentObject var authService: AuthService

    var body: some View {
        NavigationStack {
            ConversationsContent()
                .navigationTitle("messages.title".loc)
        }
    }
}
