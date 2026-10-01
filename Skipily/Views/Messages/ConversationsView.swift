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
    @ObservedObject private var announcements = AnnouncementStore.shared

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

            // Plattform-Ankuendigungen ("Skipily") – farbig, oberhalb der Chats.
            if !showArchived && !announcements.items.isEmpty {
                NavigationLink { AnnouncementsView() } label: { announcementContactRow }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)
            }

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
        .task { await loadConversations(); await announcements.refresh() }
        .refreshable { await loadConversations(); await announcements.refresh() }
        .onChange(of: showArchived) { _, _ in
            Task { await loadConversations() }
        }
    }

    /// Farbig gekennzeichneter "Skipily"-Eintrag (unterscheidet sich von
    /// Provider-Nachrichten durch Akzentfarbe + Megafon-Symbol).
    private var announcementContactRow: some View {
        let accent = announcements.items.first?.accentColor ?? AppColors.primary
        let unread = announcements.unreadCount
        return HStack(spacing: 12) {
            SkipilyLogoIcon(size: 44)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(accent.opacity(0.4), lineWidth: 1.5))
            VStack(alignment: .leading, spacing: 2) {
                Text("announcement.contact".loc)
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(AppColors.gray900)
                Text(announcements.items.first?.displayTitle ?? "")
                    .font(.caption).foregroundStyle(AppColors.gray500).lineLimit(1)
            }
            Spacer()
            if unread > 0 {
                Text("\(unread)")
                    .font(.caption2).fontWeight(.bold).foregroundStyle(.white)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(accent).clipShape(Capsule())
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(AppColors.gray400)
        }
        .padding(12)
        .background(accent.opacity(0.06))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(accent.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
