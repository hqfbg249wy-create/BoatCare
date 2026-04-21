//
//  ConversationsView.swift
//  Skipily
//
//  List of all chat conversations for the current user
//

import SwiftUI
struct ConversationsView: View {
    @EnvironmentObject var authService: AuthService

    @State private var conversations: [Conversation] = []
    @State private var isLoading = true
    @State private var searchText = ""

    private var filteredConversations: [Conversation] {
        guard !searchText.isEmpty else { return conversations }
        return conversations.filter { conv in
            let name = conv.provider?.companyName ?? ""
            return name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("messages.loading".loc)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredConversations.isEmpty {
                    emptyView
                } else {
                    conversationList
                }
            }
            .navigationTitle("messages.title".loc)
            .searchable(text: $searchText, prompt: "messages.search_prompt".loc)
            .task {
                await loadConversations()
            }
            .refreshable {
                await loadConversations()
            }
        }
    }

    private var conversationList: some View {
        List(filteredConversations) { conv in
            NavigationLink(value: conv.id) {
                conversationRow(conv)
            }
        }
        .listStyle(.plain)
        .navigationDestination(for: UUID.self) { convId in
            if let conv = conversations.first(where: { $0.id == convId }) {
                ChatView(conversation: conv)
            }
        }
    }

    private func conversationRow(_ conv: Conversation) -> some View {
        HStack(spacing: 12) {
            // Provider avatar
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

        await MessagingService.shared.loadConversations(userId: userId)
        conversations = MessagingService.shared.conversations
        isLoading = false
    }
}
