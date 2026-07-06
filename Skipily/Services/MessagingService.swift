//
//  MessagingService.swift
//  Skipily
//
//  Service for managing conversations and messages with Supabase Realtime
//

import Foundation
import Supabase
import Observation

@Observable
@MainActor
final class MessagingService {
    static let shared = MessagingService()

    var conversations: [Conversation] = []
    var unreadCount = 0
    var isLoading = false

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    private var realtimeChannel: RealtimeChannelV2?

    // MARK: - Conversations

    func loadConversations(userId: UUID) async {
        isLoading = true
        do {
            let data: [Conversation] = try await client
                .from("conversations")
                .select("*, service_providers(id, name, city)")
                .eq("user_id", value: userId.uuidString)
                .order("last_message_at", ascending: false)
                .execute()
                .value

            conversations = data
            await loadUnreadCount(userId: userId)
        } catch {
            AppLog.error("Load conversations error: \(error)")
        }
        isLoading = false
    }

    func loadUnreadCount(userId: UUID) async {
        do {
            // Count unread messages across all conversations where user is participant
            let response = try await client
                .from("messages")
                .select("id", head: true, count: .exact)
                .eq("sender_type", value: "provider")
                .eq("is_read", value: false)
                .in("conversation_id", values: conversations.map { $0.id.uuidString })
                .execute()

            unreadCount = response.count ?? 0
        } catch {
            AppLog.error("Unread count error: \(error)")
        }
    }

    // MARK: - Messages

    func loadMessages(conversationId: UUID) async throws -> [ChatMessage] {
        let messages: [ChatMessage] = try await client
            .from("messages")
            .select()
            .eq("conversation_id", value: conversationId.uuidString)
            .order("created_at", ascending: true)
            .execute()
            .value

        // Mark provider messages as read
        try await client
            .from("messages")
            .update(["is_read": true])
            .eq("conversation_id", value: conversationId.uuidString)
            .eq("sender_type", value: "provider")
            .eq("is_read", value: false)
            .execute()

        return messages
    }

    func sendMessage(conversationId: UUID, senderId: UUID, content: String, relatedOrderId: UUID? = nil, attachmentUrls: [String] = []) async throws {
        struct MessageInsert: Codable {
            let conversationId: String
            let senderId: String
            let senderType: String
            let content: String
            let relatedOrderId: String?
            let attachmentUrls: [String]

            enum CodingKeys: String, CodingKey {
                case conversationId = "conversation_id"
                case senderId = "sender_id"
                case senderType = "sender_type"
                case content
                case relatedOrderId = "related_order_id"
                case attachmentUrls = "attachment_urls"
            }
        }

        let insert = MessageInsert(
            conversationId: conversationId.uuidString,
            senderId: senderId.uuidString,
            senderType: "user",
            content: content,
            relatedOrderId: relatedOrderId?.uuidString,
            attachmentUrls: attachmentUrls
        )

        struct InsertedRow: Decodable { let id: UUID }
        let inserted: InsertedRow = try await client
            .from("messages")
            .insert(insert)
            .select("id")
            .single()
            .execute()
            .value

        // Update conversation timestamp
        try await client
            .from("conversations")
            .update(["last_message_at": ISO8601DateFormatter().string(from: Date())])
            .eq("id", value: conversationId.uuidString)
            .execute()

        // Provider per E-Mail benachrichtigen (best-effort). Fehler ignorieren —
        // die Nachricht ist bereits gespeichert und in-app sichtbar.
        struct NotifyBody: Encodable { let message_id: String }
        struct NotifyResp: Decodable {}
        do {
            let _: NotifyResp = try await client.functions.invoke(
                "notify-message",
                options: .init(body: NotifyBody(message_id: inserted.id.uuidString))
            )
        } catch {
            AppLog.error("notify-message failed: \(error)")
        }
    }

    // MARK: - Create or Get Conversation

    func getOrCreateConversation(userId: UUID, providerId: UUID) async throws -> Conversation {
        // Try to find existing
        let existing: [Conversation] = try await client
            .from("conversations")
            .select("*, service_providers(id, name, city)")
            .eq("user_id", value: userId.uuidString)
            .eq("provider_id", value: providerId.uuidString)
            .execute()
            .value

        if let conv = existing.first {
            return conv
        }

        // Create new
        struct ConvInsert: Codable {
            let userId: String
            let providerId: String

            enum CodingKeys: String, CodingKey {
                case userId = "user_id"
                case providerId = "provider_id"
            }
        }

        let conv: Conversation = try await client
            .from("conversations")
            .insert(ConvInsert(userId: userId.uuidString, providerId: providerId.uuidString))
            .select("*, service_providers(id, name, city)")
            .single()
            .execute()
            .value

        return conv
    }

    // MARK: - Realtime

    func subscribeToMessages(conversationId: UUID, onNewMessage: @escaping (
        ChatMessage) -> Void) async {
        let channel = client.realtimeV2.channel("chat-\(conversationId.uuidString)")

        let changes = channel.postgresChange(
            InsertAction.self,
            table: "messages",
            filter: .eq("conversation_id", value: conversationId.uuidString)
        )

        do {
            try await channel.subscribeWithError()
        } catch {
            AppLog.error("Realtime subscribe error: \(error)")
        }

        Task {
            for await change in changes {
                if let message = try? change.decodeRecord(as: ChatMessage.self, decoder: JSONDecoder()) {
                    await MainActor.run {
                        onNewMessage(message)
                    }
                }
            }
        }

        realtimeChannel = channel
    }

    func unsubscribeFromMessages() async {
        if let channel = realtimeChannel {
            await client.realtimeV2.removeChannel(channel)
            realtimeChannel = nil
        }
    }
}
