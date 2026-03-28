//
//  Conversation.swift
//  Skipily
//
//  Chat models matching conversations and messages tables
//

import Foundation

struct Conversation: Codable, Identifiable, Sendable {
    let id: UUID
    let userId: UUID
    let providerId: UUID
    let lastMessageAt: String?
    let createdAt: String?

    // Joined data
    let provider: ServiceProviderBasic?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case providerId = "provider_id"
        case lastMessageAt = "last_message_at"
        case createdAt = "created_at"
        case provider = "service_providers"
    }

    var displayDate: String {
        guard let lastMessageAt else { return "" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: lastMessageAt) else { return "" }
        let display = DateFormatter()
        display.dateStyle = .short
        display.timeStyle = .short
        display.locale = Locale(identifier: "de_DE")
        return display.string(from: date)
    }
}

struct ChatMessage: Codable, Identifiable, Sendable {
    let id: UUID
    let conversationId: UUID
    let senderId: UUID
    let senderType: String
    let content: String
    let isRead: Bool
    let relatedOrderId: UUID?
    let relatedProductId: UUID?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case conversationId = "conversation_id"
        case senderId = "sender_id"
        case senderType = "sender_type"
        case content
        case isRead = "is_read"
        case relatedOrderId = "related_order_id"
        case relatedProductId = "related_product_id"
        case createdAt = "created_at"
    }

    var isSent: Bool {
        senderType == "user"
    }

    var displayTime: String {
        guard let createdAt else { return "" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: createdAt) else { return "" }
        let display = DateFormatter()
        display.timeStyle = .short
        display.locale = Locale(identifier: "de_DE")
        return display.string(from: date)
    }
}
