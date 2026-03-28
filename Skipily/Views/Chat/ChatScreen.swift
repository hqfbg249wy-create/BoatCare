//
//  ChatScreen.swift
//  Skipily
//
//  AI-Chat mit Claude als kompetentem Boots-Serviceberater
//

import SwiftUI

/// Chat-Nachricht (lokal im Speicher)
struct LocalChatMessage: Identifiable {
    let id = UUID()
    let text: String
    let isUser: Bool
    let timestamp = Date()
}

struct ChatScreen: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager

    var initialQuestion: String? = nil

    @State private var messages: [LocalChatMessage] = []
    @State private var inputText = ""
    @State private var isTyping = false
    @State private var boatContext: AIChatContext?
    @State private var hasLoadedContext = false

    private let chatService = AIChatService.shared

    var body: some View {
        VStack(spacing: 0) {
            // Nachrichten
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(messages) { msg in
                            MessageBubble(message: msg)
                                .id(msg.id)
                        }

                        if isTyping {
                            TypingIndicator()
                                .id("typing")
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _, _ in
                    scrollToBottom(proxy)
                }
                .onChange(of: isTyping) { _, _ in
                    scrollToBottom(proxy)
                }
            }

            Divider()

            // Eingabefeld
            HStack(spacing: 10) {
                TextField("chat.input_hint".loc, text: $inputText)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit { sendMessage() }

                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(canSend ? .orange : .gray)
                }
                .disabled(!canSend)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
        }
        .navigationTitle("chat.title".loc)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    clearChat()
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .task {
            if !hasLoadedContext {
                hasLoadedContext = true
                boatContext = await chatService.loadBoatContext()
                addWelcomeMessage()
                // Auto-send initial question if provided
                if let question = initialQuestion, !question.isEmpty {
                    inputText = question
                    sendMessage()
                }
            }
        }
    }

    // MARK: - Computed

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isTyping
    }

    // MARK: - Actions

    private func addWelcomeMessage() {
        var welcome = "chat.welcome_ai".loc
        if let ctx = boatContext, !ctx.boats.isEmpty {
            let names = ctx.boats.map { $0.name }.filter { !$0.isEmpty }
            if !names.isEmpty {
                welcome += "\n\n" + String(format: "chat.boat_context".loc, names.joined(separator: ", "))
            }
        }
        messages.append(LocalChatMessage(text: welcome, isUser: false))
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isTyping else { return }

        messages.append(LocalChatMessage(text: text, isUser: true))
        inputText = ""
        isTyping = true

        Task {
            do {
                // Konversationshistorie aufbauen
                let chatHistory = messages.map { msg in
                    AIChatMessage(
                        role: msg.isUser ? "user" : "assistant",
                        content: msg.text
                    )
                }

                let reply = try await chatService.sendMessage(
                    messages: chatHistory,
                    boatContext: boatContext
                )

                messages.append(LocalChatMessage(text: reply, isUser: false))
            } catch {
                let errorMsg = "chat.error_prefix".loc + (error.localizedDescription)
                messages.append(LocalChatMessage(text: errorMsg, isUser: false))
            }

            isTyping = false
        }
    }

    private func clearChat() {
        messages.removeAll()
        addWelcomeMessage()
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.2)) {
                if isTyping {
                    proxy.scrollTo("typing", anchor: .bottom)
                } else if let last = messages.last {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }
}

// MARK: - Message Bubble

struct MessageBubble: View {
    let message: LocalChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.isUser {
                Spacer(minLength: 50)
            } else {
                // Bot-Avatar
                Image(systemName: "wrench.and.screwdriver.fill")
                    .font(.caption)
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(Color.orange)
                    .clipShape(Circle())
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                Text(.init(message.text)) // Supports basic Markdown
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(message.isUser ? Color.blue : Color(.systemGray5))
                    .foregroundStyle(message.isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .textSelection(.enabled)

                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if !message.isUser {
                Spacer(minLength: 50)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isUser ? .trailing : .leading)
    }
}

// MARK: - Typing Indicator

struct TypingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.caption)
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(Color.orange)
                .clipShape(Circle())

            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.gray)
                        .frame(width: 8, height: 8)
                        .scaleEffect(animating ? 1.0 : 0.5)
                        .opacity(animating ? 1.0 : 0.3)
                        .animation(
                            .easeInOut(duration: 0.6)
                                .repeatForever()
                                .delay(Double(i) * 0.2),
                            value: animating
                        )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color(.systemGray5))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            Spacer(minLength: 50)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear { animating = true }
    }
}
