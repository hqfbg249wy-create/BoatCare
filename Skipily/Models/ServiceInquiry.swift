//
//  ServiceInquiry.swift
//  Skipily
//
//  Model für service_inquiries — Anfragen von Bootseignern an Service-Provider.
//

import Foundation
import SwiftUI

struct ServiceInquiry: Identifiable, Codable, Sendable {
    let id: UUID
    let ownerId: UUID
    let providerId: UUID
    let boatId: UUID?
    let subject: String
    let message: String
    let status: InquiryStatus
    let ownerNotes: String?
    let createdAt: String?
    let updatedAt: String?
    let sentAt: String?
    let repliedAt: String?
    let providerReply: String?

    // Joined
    let provider: InquiryProvider?
    let boat: InquiryBoat?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerId      = "owner_id"
        case providerId   = "provider_id"
        case boatId       = "boat_id"
        case subject
        case message
        case status
        case ownerNotes   = "owner_notes"
        case createdAt    = "created_at"
        case updatedAt    = "updated_at"
        case sentAt       = "sent_at"
        case repliedAt    = "replied_at"
        case providerReply = "provider_reply"
        case provider     = "service_providers"
        case boat         = "boats"
    }

    var displayDate: String {
        let src = updatedAt ?? createdAt ?? ""
        return Self.formatRelative(src)
    }

    var sentDate: String? {
        guard let sentAt else { return nil }
        return Self.formatRelative(sentAt)
    }

    static func formatRelative(_ iso: String) -> String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fmt.date(from: iso) else { return iso }
        let diff = Date().timeIntervalSince(date)
        if diff < 60 { return "gerade eben" }
        if diff < 3600 { return "vor \(Int(diff / 60)) Min." }
        if diff < 86400 { return "vor \(Int(diff / 3600)) Std." }
        if diff < 7 * 86400 { return "vor \(Int(diff / 86400)) Tagen" }
        let df = DateFormatter()
        df.dateStyle = .short
        df.timeStyle = .none
        df.locale = Locale(identifier: "de_DE")
        return df.string(from: date)
    }
}

// MARK: - Status

enum InquiryStatus: String, Codable, Sendable {
    case draft    = "draft"
    case sent     = "sent"
    case read     = "read"
    case replied  = "replied"
    case closed   = "closed"

    var label: String {
        switch self {
        case .draft:   return "Entwurf"
        case .sent:    return "Gesendet"
        case .read:    return "Gelesen"
        case .replied: return "Beantwortet"
        case .closed:  return "Geschlossen"
        }
    }

    var systemImage: String {
        switch self {
        case .draft:   return "pencil.circle"
        case .sent:    return "paperplane.fill"
        case .read:    return "envelope.open.fill"
        case .replied: return "checkmark.bubble.fill"
        case .closed:  return "xmark.circle.fill"
        }
    }

    var color: SwiftUI.Color {
        switch self {
        case .draft:   return .secondary
        case .sent:    return AppColors.info
        case .read:    return .purple
        case .replied: return AppColors.success
        case .closed:  return .gray
        }
    }
}

// MARK: - Joined structs

struct InquiryProvider: Codable, Sendable {
    let id: UUID
    let name: String
    let logoUrl: String?
    let category: String?
    let email: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case logoUrl  = "logo_url"
        case category
        case email
    }
}

struct InquiryBoat: Codable, Sendable {
    let id: UUID
    let name: String
}

// MARK: - Insert / Update payloads

struct InquiryInsert: Encodable {
    let ownerId: UUID
    let providerId: UUID
    let boatId: UUID?
    let subject: String
    let message: String
    let ownerNotes: String?
    let status: String

    enum CodingKeys: String, CodingKey {
        case ownerId    = "owner_id"
        case providerId = "provider_id"
        case boatId     = "boat_id"
        case subject
        case message
        case ownerNotes = "owner_notes"
        case status
    }
}

struct InquiryUpdate: Encodable {
    let subject: String?
    let message: String?
    let boatId: UUID?
    let ownerNotes: String?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case subject
        case message
        case boatId     = "boat_id"
        case ownerNotes = "owner_notes"
        case status
    }
}
