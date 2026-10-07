//
//  ServiceInquiry.swift
//  Skipily
//
//  Model für service_inquiries — Anfragen von Bootseignern an Service-Provider.
//

import Foundation
import SwiftUI

/// Betrieb als Auswahl-Kandidat fuer eine Angebots-/Service-Anfrage.
struct QuoteProvider: Identifiable, Decodable, Sendable, Hashable {
    let id: UUID
    let name: String
    let city: String?
    let country: String?
    let category: String?
    let hasEmail: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, city, country, category
        case hasEmail = "has_email"
    }
}

/// Land + Trefferanzahl fuer den Länder-Filter.
struct QuoteCountry: Decodable, Sendable, Hashable {
    let country: String
    let count: Int
}

struct ServiceInquiry: Identifiable, Codable, Sendable {
    let id: UUID
    let ownerId: UUID
    let providerId: UUID
    let boatId: UUID?
    let subject: String
    let message: String
    var status: InquiryStatus
    let ownerNotes: String?
    let createdAt: String?
    let updatedAt: String?
    let sentAt: String?
    let repliedAt: String?
    let providerReply: String?

    // Angebot (Bruecke Anfrage -> bezahlte Bestellung via Stripe)
    let offerAmount: Double?
    let offerShipping: Double?
    let offerCurrency: String?
    let offerDescription: String?
    let offerStatus: String?
    let orderId: UUID?
    let ownerArchived: Bool?

    // Joined
    let provider: InquiryProvider?
    let boat: InquiryBoat?

    var isArchived: Bool { ownerArchived == true }

    /// Es liegt ein annehmbares Angebot vor (noch keine Bestellung erzeugt).
    var hasOpenOffer: Bool {
        (offerStatus == "offered") && ((offerAmount ?? 0) > 0) && orderId == nil
    }
    var offerTotal: Double { (offerAmount ?? 0) + (offerShipping ?? 0) }

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
        case offerAmount      = "offer_amount"
        case offerShipping    = "offer_shipping"
        case offerCurrency    = "offer_currency"
        case offerDescription = "offer_description"
        case offerStatus      = "offer_status"
        case orderId          = "order_id"
        case ownerArchived    = "owner_archived"
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
        case .draft:   return "inq.status.draft".loc
        case .sent:    return "inq.status.sent".loc
        case .read:    return "inq.status.read".loc
        case .replied: return "inq.status.replied".loc
        case .closed:  return "inq.status.closed".loc
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

// Strukturierte Tauwerk-Kriterien an der Anfrage (fuer den Angebots-Builder
// des Anbieters). Entspricht service_inquiries.rope_config (jsonb).
struct RopeConfigPayload: Encodable {
    let length_m: Double?
    let diameter_mm: Double?
    let material: String?
    let end1: String?
    let end2: String?
    let end1_eye_length_cm: Double?
    let end2_eye_length_cm: Double?
    let article_number: String?
    let matched_product_id: String?
}

struct InquiryInsert: Encodable {
    let ownerId: UUID
    let providerId: UUID
    let boatId: UUID?
    let subject: String
    let message: String
    let ownerNotes: String?
    let status: String
    var ropeConfig: RopeConfigPayload? = nil

    enum CodingKeys: String, CodingKey {
        case ownerId    = "owner_id"
        case providerId = "provider_id"
        case boatId     = "boat_id"
        case subject
        case message
        case ownerNotes = "owner_notes"
        case status
        case ropeConfig = "rope_config"
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
