//
//  ChatScreen.swift
//  Skipily
//
//  AI-Chat mit Claude als kompetentem Boots-Serviceberater.
//  Speichert Gespraeche persistent in Supabase und bittet den Nutzer um
//  Feedback nach jeder Assistenten-Antwort (Lernschleife fuer kuenftige
//  Antworten).
//

import SwiftUI

/// Chat-Nachricht (lokal im UI).
/// `remoteId` ist die Datenbank-ID, sobald die Nachricht persistiert wurde -
/// ohne remoteId erscheinen keine Feedback-Buttons (z.B. bei der Willkommens-
/// Nachricht, die nicht gespeichert wird).
struct LocalChatMessage: Identifiable, Equatable {
    let id: UUID
    var remoteId: UUID?
    let text: String
    let isUser: Bool
    let timestamp: Date
    var feedback: ChatFeedback?

    init(
        id: UUID = UUID(),
        remoteId: UUID? = nil,
        text: String,
        isUser: Bool,
        timestamp: Date = Date(),
        feedback: ChatFeedback? = nil
    ) {
        self.id = id
        self.remoteId = remoteId
        self.text = text
        self.isUser = isUser
        self.timestamp = timestamp
        self.feedback = feedback
    }
}

struct ChatScreen: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager

    /// Optional: Beim Start eine Frage automatisch absenden.
    var initialQuestion: String? = nil
    /// Optional: Bestehende Session laden statt neue anzulegen.
    var existingSessionId: UUID? = nil

    @State private var messages: [LocalChatMessage] = []
    @State private var inputText = ""
    @State private var isTyping = false
    @State private var boatContext: AIChatContext?
    @State private var hasLoadedContext = false

    @State private var sessionId: UUID?

    // Feedback-Sheet
    @State private var feedbackTarget: LocalChatMessage?
    @State private var feedbackInitialRating: String = "thumbs_up"

    // Historie
    @State private var showHistory = false

    private let chatService = AIChatService.shared

    var body: some View {
        VStack(spacing: 0) {
            // Nachrichten
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(messages) { msg in
                            VStack(alignment: msg.isUser ? .trailing : .leading, spacing: 4) {
                                MessageBubble(message: msg)
                                    .id(msg.id)

                                if !msg.isUser, msg.remoteId != nil {
                                    FeedbackBar(
                                        message: msg,
                                        onTap: { rating in
                                            feedbackInitialRating = rating
                                            feedbackTarget = msg
                                        }
                                    )
                                    .padding(.leading, 40)
                                }
                            }
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
                HStack(spacing: 12) {
                    Button {
                        showHistory = true
                    } label: {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("chat.history.title".loc)

                    Button {
                        startNewChat()
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("chat.new_chat".loc)
                }
            }
        }
        .sheet(item: $feedbackTarget) { target in
            FeedbackSheet(
                message: target,
                initialRating: feedbackInitialRating,
                onSubmit: { rating, outcome, comment in
                    Task { await submitFeedback(for: target, rating: rating, outcome: outcome, comment: comment) }
                }
            )
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showHistory) {
            NavigationStack {
                ChatHistoryView(
                    onOpen: { sessionId in
                        showHistory = false
                        Task { await loadSession(id: sessionId) }
                    }
                )
            }
        }
        .task {
            if !hasLoadedContext {
                hasLoadedContext = true
                boatContext = await chatService.loadBoatContext()

                if let existing = existingSessionId {
                    await loadSession(id: existing)
                } else {
                    addWelcomeMessage()
                    if let question = initialQuestion, !question.isEmpty {
                        inputText = question
                        sendMessage()
                    }
                }
            }
        }
    }

    // MARK: - Computed

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isTyping
    }

    // MARK: - Session lifecycle

    private func addWelcomeMessage() {
        var welcome = "chat.welcome_ai".loc
        if let ctx = boatContext, !ctx.boats.isEmpty {
            let names = ctx.boats.map { $0.name }.filter { !$0.isEmpty }
            if !names.isEmpty {
                welcome += "\n\n" + String(format: "chat.boat_context".loc, names.joined(separator: ", "))
            }
        }
        // Welcome-Nachricht wird NICHT persistiert (kein remoteId) -> kein Feedback.
        messages.append(LocalChatMessage(text: welcome, isUser: false))
    }

    private func startNewChat() {
        sessionId = nil
        messages.removeAll()
        addWelcomeMessage()
    }

    private func loadSession(id: UUID) async {
        do {
            let persisted = try await chatService.loadMessages(sessionId: id)
            sessionId = id
            messages = persisted.map { p in
                LocalChatMessage(
                    remoteId: p.id,
                    text: p.content,
                    isUser: p.role == "user",
                    timestamp: p.createdAt,
                    feedback: p.feedback
                )
            }
            if messages.isEmpty { addWelcomeMessage() }
        } catch {
            AppLog.warning("Session-Load fehlgeschlagen: \(error)")
            addWelcomeMessage()
        }
    }

    // MARK: - Send

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isTyping else { return }

        let userMsg = LocalChatMessage(text: text, isUser: true)
        messages.append(userMsg)
        inputText = ""
        isTyping = true

        Task {
            // 1) Session sicherstellen (bei erster Nachricht anlegen, Titel aus Frage ableiten)
            if sessionId == nil {
                do {
                    let title = String(text.prefix(60))
                    sessionId = try await chatService.createSession(title: title, boatContext: boatContext)
                } catch {
                    AppLog.warning("Session-Create fehlgeschlagen: \(error)")
                }
            }

            // 2) User-Message persistieren
            if let sid = sessionId {
                do {
                    let remoteId = try await chatService.saveMessage(sessionId: sid, role: "user", content: text)
                    if let idx = messages.firstIndex(where: { $0.id == userMsg.id }) {
                        messages[idx].remoteId = remoteId
                    }
                } catch {
                    AppLog.warning("User-Message speichern fehlgeschlagen: \(error)")
                }
            }

            // 3) Assistenten-Antwort holen
            do {
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

                var assistantMsg = LocalChatMessage(text: reply, isUser: false)
                // 4) Assistant-Message persistieren, damit Feedback moeglich wird
                if let sid = sessionId {
                    do {
                        let remoteId = try await chatService.saveMessage(sessionId: sid, role: "assistant", content: reply)
                        assistantMsg.remoteId = remoteId
                    } catch {
                        AppLog.warning("Assistant-Message speichern fehlgeschlagen: \(error)")
                    }
                }
                messages.append(assistantMsg)
            } catch {
                let errorMsg = "chat.error_prefix".loc + (error.localizedDescription)
                messages.append(LocalChatMessage(text: errorMsg, isUser: false))
            }

            isTyping = false
        }
    }

    // MARK: - Feedback

    private func submitFeedback(
        for message: LocalChatMessage,
        rating: String,
        outcome: String?,
        comment: String?
    ) async {
        guard let remoteId = message.remoteId else { return }
        do {
            try await chatService.submitFeedback(
                messageId: remoteId,
                rating: rating,
                outcome: outcome,
                comment: comment
            )
            if let idx = messages.firstIndex(where: { $0.id == message.id }) {
                messages[idx].feedback = ChatFeedback(rating: rating, outcome: outcome, comment: comment)
            }
        } catch {
            AppLog.warning("Feedback speichern fehlgeschlagen: \(error)")
        }
    }

    // MARK: - Helpers

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

// MARK: - Feedback Bar (unter Assistant-Bubble)

struct FeedbackBar: View {
    let message: LocalChatMessage
    let onTap: (_ rating: String) -> Void

    var body: some View {
        HStack(spacing: 12) {
            if let fb = message.feedback {
                // Schon bewertet - kompakte Anzeige, Nutzer darf aendern
                Label(
                    fb.rating == "thumbs_up" ? "chat.feedback.thanks".loc : "chat.feedback.thanks_negative".loc,
                    systemImage: fb.rating == "thumbs_up" ? "hand.thumbsup.fill" : "hand.thumbsdown.fill"
                )
                .font(.caption2)
                .foregroundStyle(fb.rating == "thumbs_up" ? .green : .orange)

                Button("chat.feedback.edit".loc) {
                    onTap(fb.rating)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            } else {
                Text("chat.feedback.helpful_question".loc)
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Button {
                    onTap("thumbs_up")
                } label: {
                    Image(systemName: "hand.thumbsup")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("chat.feedback.thumbs_up".loc)

                Button {
                    onTap("thumbs_down")
                } label: {
                    Image(systemName: "hand.thumbsdown")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("chat.feedback.thumbs_down".loc)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Feedback Sheet

struct FeedbackSheet: View {
    let message: LocalChatMessage
    let initialRating: String
    let onSubmit: (_ rating: String, _ outcome: String?, _ comment: String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var rating: String = "thumbs_up"
    @State private var outcome: String? = nil
    @State private var comment: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 20) {
                        FeedbackRatingButton(
                            icon: "hand.thumbsup.fill",
                            title: "chat.feedback.thumbs_up".loc,
                            tint: .green,
                            isSelected: rating == "thumbs_up",
                            action: { rating = "thumbs_up" }
                        )
                        FeedbackRatingButton(
                            icon: "hand.thumbsdown.fill",
                            title: "chat.feedback.thumbs_down".loc,
                            tint: .orange,
                            isSelected: rating == "thumbs_down",
                            action: { rating = "thumbs_down" }
                        )
                    }
                    .frame(maxWidth: .infinity)
                } header: {
                    Text("chat.feedback.helpful_question".loc)
                }

                Section {
                    Picker("chat.feedback.outcome_question".loc, selection: Binding(
                        get: { outcome ?? "" },
                        set: { outcome = $0.isEmpty ? nil : $0 }
                    )) {
                        Text("chat.feedback.outcome_skip".loc).tag("")
                        Text("chat.feedback.outcome_solved".loc).tag("solved")
                        Text("chat.feedback.outcome_partial".loc).tag("partial")
                        Text("chat.feedback.outcome_not_solved".loc).tag("not_solved")
                    }
                } header: {
                    Text("chat.feedback.outcome_question".loc)
                }

                Section {
                    TextField(
                        "chat.feedback.comment_placeholder".loc,
                        text: $comment,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                } header: {
                    Text("chat.feedback.comment_header".loc)
                }
            }
            .navigationTitle("chat.feedback.sheet_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("general.cancel".loc) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("chat.feedback.submit".loc) {
                        onSubmit(rating, outcome, comment.isEmpty ? nil : comment)
                        dismiss()
                    }
                    .bold()
                }
            }
            .onAppear {
                rating = initialRating
                if let fb = message.feedback {
                    rating = fb.rating
                    outcome = fb.outcome
                    comment = fb.comment ?? ""
                }
            }
        }
    }
}

private struct FeedbackRatingButton: View {
    let icon: String
    let title: String
    let tint: Color
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title2)
                Text(title)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? tint.opacity(0.15) : Color(.systemGray6))
            )
            .foregroundStyle(isSelected ? tint : .secondary)
        }
        .buttonStyle(.plain)
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
                        .fill(Color(.systemGray))
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
