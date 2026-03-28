//
//  ChatView.swift
//  Skipily
//
//  Chat interface for a single conversation
//

import SwiftUI
struct ChatView: View {
    let conversation: Conversation

    @EnvironmentObject var authService: AuthService

    @State private var messages: [ChatMessage] = []
    @State private var newMessage = ""
    @State private var isLoading = true
    @State private var isSending = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            // Messages
            messagesScrollView

            // Input bar
            inputBar
        }
        .navigationTitle(conversation.provider?.companyName ?? "Chat")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadMessages()
            await subscribeToRealtime()
        }
        .onDisappear {
            Task {
                await MessagingService.shared.unsubscribeFromMessages()
            }
        }
    }

    // MARK: - Messages List

    private var messagesScrollView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    if isLoading {
                        ProgressView()
                            .padding(.top, 40)
                    } else if messages.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "bubble.left.and.bubble.right")
                                .font(.system(size: 32))
                                .foregroundStyle(AppColors.gray300)
                            Text("Noch keine Nachrichten")
                                .font(.callout)
                                .foregroundStyle(AppColors.gray400)
                        }
                        .padding(.top, 60)
                    } else {
                        ForEach(messages) { msg in
                            messageBubble(msg)
                                .id(msg.id)
                        }
                    }
                }
                .padding(16)
            }
            .onChange(of: messages.count) {
                if let lastMsg = messages.last {
                    withAnimation {
                        proxy.scrollTo(lastMsg.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private func messageBubble(_ msg: ChatMessage) -> some View {
        HStack {
            if msg.isSent { Spacer(minLength: 60) }

            VStack(alignment: msg.isSent ? .trailing : .leading, spacing: 4) {
                Text(msg.content)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(msg.isSent ? AppColors.primary : AppColors.gray100)
                    .foregroundStyle(msg.isSent ? .white : AppColors.gray900)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                Text(msg.displayTime)
                    .font(.caption2)
                    .foregroundStyle(AppColors.gray400)
            }

            if !msg.isSent { Spacer(minLength: 60) }
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Nachricht...", text: $newMessage, axis: .vertical)
                .textFieldStyle(.plain)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(AppColors.gray100)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .lineLimit(1...5)

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(newMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? AppColors.gray300 : AppColors.primary)
            }
            .disabled(newMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(.systemBackground))
        .overlay(alignment: .top) {
            Divider()
        }
    }

    // MARK: - Data

    private func loadMessages() async {
        do {
            messages = try await MessagingService.shared.loadMessages(conversationId: conversation.id)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func sendMessage() async {
        let content = newMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, let userId = authService.currentUser?.id else { return }

        isSending = true
        newMessage = ""

        do {
            try await MessagingService.shared.sendMessage(
                conversationId: conversation.id,
                senderId: userId,
                content: content
            )
            // Reload to get the sent message
            messages = try await MessagingService.shared.loadMessages(conversationId: conversation.id)
        } catch {
            errorMessage = error.localizedDescription
            newMessage = content // Restore on failure
        }
        isSending = false
    }

    private func subscribeToRealtime() async {
        await MessagingService.shared.subscribeToMessages(conversationId: conversation.id) { newMsg in
            // Only add if not already in the list
            if !messages.contains(where: { $0.id == newMsg.id }) {
                messages.append(newMsg)
            }
        }
    }
}
