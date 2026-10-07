//
//  InquiryService.swift
//  Skipily
//
//  CRUD-Service für service_inquiries.
//

import Foundation
import Supabase
import Observation
import UIKit

@Observable
@MainActor
final class InquiryService {
    static let shared = InquiryService()

    var inquiries: [ServiceInquiry] = []
    var isLoading = false
    var errorMessage: String?

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    /// Findet Betriebe zur Auswahl: primaere Kategorie (category_allow) ODER
    /// Service-Tag (service_terms), optional nach Land gefiltert.
    func findProviders(query: ProviderQuery, countries: [String]) async throws
        -> (providers: [QuoteProvider], countries: [QuoteCountry], total: Int) {
        struct Body: Encodable {
            let domain: String?
            let category_allow: [String]; let service_terms: [String]
            let name_terms: [String]; let name_exclude: [String]; let countries: [String]
        }
        struct Resp: Decodable {
            let ok: Bool?; let total: Int?
            let countries: [QuoteCountry]?; let providers: [QuoteProvider]?; let error: String?
        }
        let resp: Resp = try await client.functions.invoke(
            "find-service-providers",
            options: .init(body: Body(
                domain: query.domain,
                category_allow: query.categoryAllow, service_terms: query.serviceTerms,
                name_terms: query.nameTerms, name_exclude: query.nameExclude, countries: countries))
        )
        guard resp.ok == true else {
            throw NSError(domain: "Skipily.Quote", code: 500,
                          userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Suche fehlgeschlagen"])
        }
        return (resp.providers ?? [], resp.countries ?? [], resp.total ?? 0)
    }

    /// Sendet eine Anfrage an die AUSGEWÄHLTEN Betriebe. Liefert die Anzahl.
    func requestQuote(providerIds: [UUID], boatId: UUID?, subject: String, message: String,
                      requestType: String = "quote") async throws -> Int {
        struct Body: Encodable {
            let provider_ids: [String]; let boat_id: String?; let subject: String; let message: String
            let request_type: String
        }
        struct Resp: Decodable { let ok: Bool?; let count: Int?; let error: String? }
        let resp: Resp = try await client.functions.invoke(
            "request-quote",
            options: .init(body: Body(
                provider_ids: providerIds.map { $0.uuidString }, boat_id: boatId?.uuidString,
                subject: subject, message: message, request_type: requestType))
        )
        guard resp.ok == true else {
            throw NSError(domain: "Skipily.Quote", code: 500,
                          userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Anfrage fehlgeschlagen"])
        }
        return resp.count ?? 0
    }

    /// Kunde lehnt ein Angebot ab.
    func declineOffer(inquiryId: UUID) async throws {
        struct Body: Encodable { let inquiry_id: String; let action: String }
        struct Resp: Decodable { let ok: Bool?; let error: String? }
        let resp: Resp = try await client.functions.invoke(
            "respond-offer", options: .init(body: Body(inquiry_id: inquiryId.uuidString, action: "decline"))
        )
        if resp.ok != true {
            throw NSError(domain: "Skipily.Offer", code: 500,
                          userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Ablehnen fehlgeschlagen"])
        }
    }

    /// Kunde sendet eine Rückfrage zum Angebot an den Anbieter.
    func askOfferQuestion(inquiryId: UUID, text: String) async throws {
        struct Body: Encodable { let inquiry_id: String; let action: String; let text: String }
        struct Resp: Decodable { let ok: Bool?; let error: String? }
        let resp: Resp = try await client.functions.invoke(
            "respond-offer",
            options: .init(body: Body(inquiry_id: inquiryId.uuidString, action: "question", text: text))
        )
        if resp.ok != true {
            throw NSError(domain: "Skipily.Offer", code: 500,
                          userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Senden fehlgeschlagen"])
        }
    }

    /// Loescht eine Anfrage. Ohne vorheriges Ablehnen wird der Anbieter wie bei
    /// einer Ablehnung benachrichtigt; nach dem Ablehnen ist das Loeschen intern.
    func deleteInquiryWithNotify(inquiryId: UUID) async throws {
        struct Body: Encodable { let inquiry_id: String; let action: String }
        struct Resp: Decodable { let ok: Bool?; let error: String? }
        let resp: Resp = try await client.functions.invoke(
            "respond-offer", options: .init(body: Body(inquiry_id: inquiryId.uuidString, action: "delete"))
        )
        if resp.ok != true {
            throw NSError(domain: "Skipily.Offer", code: 500,
                          userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Loeschen fehlgeschlagen"])
        }
    }

    /// Kompletter Rückfragen-Thread einer Anfrage (zentral aus der DB).
    func inquiryThread(inquiryId: UUID) async throws -> [InquiryThreadMessage] {
        struct P: Encodable { let p_inquiry_id: String }
        return try await client
            .rpc("get_inquiry_thread", params: P(p_inquiry_id: inquiryId.uuidString))
            .execute()
            .value
    }

    /// Thread als gelesen markieren (setzt den Badge zurück).
    func markInquiryRead(inquiryId: UUID) async throws {
        struct P: Encodable { let p_inquiry_id: String }
        try await client
            .rpc("mark_inquiry_read", params: P(p_inquiry_id: inquiryId.uuidString))
            .execute()
    }

    /// Ungelesene Rückfragen gesamt (für Tab-Badge).
    func inquiryUnreadTotal() async throws -> Int {
        let n: Int = try await client.rpc("inquiry_unread_total").execute().value
        return n
    }

    /// Nimmt das Angebot eines Anbieters an → erzeugt eine Deferred-Bestellung
    /// (Zahlung via Stripe) und liefert deren Order-ID.
    func acceptOffer(inquiryId: UUID, variantId: UUID? = nil) async throws -> UUID {
        struct Body: Encodable { let inquiry_id: String; let variant_id: String? }
        struct Resp: Decodable { let ok: Bool?; let order_id: UUID?; let error: String? }
        let resp: Resp = try await client.functions.invoke(
            "accept-offer",
            options: .init(body: Body(inquiry_id: inquiryId.uuidString, variant_id: variantId?.uuidString))
        )
        guard resp.ok == true, let oid = resp.order_id else {
            throw NSError(domain: "Skipily.Offer", code: 500,
                          userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Annahme fehlgeschlagen"])
        }
        return oid
    }

    /// Laedt das strukturierte Tauwerk-Angebot (bis zu 3 Varianten) via RPC.
    func fetchInquiryOffer(inquiryId: UUID) async -> InquiryOffer? {
        struct P: Encodable { let p_inquiry_id: String }
        do {
            let offer: InquiryOffer = try await client
                .rpc("get_inquiry_offer", params: P(p_inquiry_id: inquiryId.uuidString))
                .execute().value
            return offer
        } catch {
            AppLog.warning("get_inquiry_offer fehlgeschlagen: \(error)")
            return nil
        }
    }

    /// Tauwerk-Angebotsanfrage an ALLE Tauwerk-Anbieter (je Anbieter eine
    /// Anfrage + E-Mail). Liefert die Anzahl kontaktierter Anbieter.
    func requestRopeQuote(boatId: UUID?, subject: String, message: String) async throws -> Int {
        struct Body: Encodable { let boat_id: String?; let subject: String; let message: String }
        struct Resp: Decodable { let ok: Bool?; let count: Int?; let error: String? }
        let resp: Resp = try await client.functions.invoke(
            "request-rope-quote",
            options: .init(body: Body(boat_id: boatId?.uuidString, subject: subject, message: message))
        )
        if resp.ok != true {
            throw NSError(domain: "Skipily.Rope", code: 500,
                          userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Anfrage fehlgeschlagen"])
        }
        return resp.count ?? 0
    }

    // MARK: - Load

    func loadInquiries(ownerId: UUID) async {
        isLoading = true
        errorMessage = nil
        do {
            let data: [ServiceInquiry] = try await client
                .from("service_inquiries")
                .select("*, service_providers(id, name, logo_url, category, email), boats(id, name)")
                .eq("owner_id", value: ownerId.uuidString)
                .order("updated_at", ascending: false)
                .execute()
                .value
            inquiries = data
        } catch {
            AppLog.error("InquiryService.loadInquiries: \(error)")
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Create (draft or sent)

    func createInquiry(
        ownerId: UUID,
        providerId: UUID,
        boatId: UUID?,
        subject: String,
        message: String,
        notes: String?,
        send: Bool,
        ropeConfig: RopeConfigPayload? = nil
    ) async throws {
        let payload = InquiryInsert(
            ownerId: ownerId,
            providerId: providerId,
            boatId: boatId,
            subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
            message: message.trimmingCharacters(in: .whitespacesAndNewlines),
            ownerNotes: notes?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty(),
            status: send ? "sent" : "draft",
            ropeConfig: ropeConfig
        )
        try await client
            .from("service_inquiries")
            .insert(payload)
            .execute()
    }

    /// Neueste Tauwerk-Konfiguration eines Equipments als rope_config-Payload
    /// (fuer den Angebots-Builder des Anbieters). nil, wenn keine vorhanden.
    func fetchRopeConfig(equipmentId: UUID) async -> RopeConfigPayload? {
        struct Row: Decodable {
            let length_m: Double?; let diameter_mm: Double?; let material: String?
            let end1: String?; let end2: String?
            let end1_eye_length_cm: Double?; let end2_eye_length_cm: Double?
            let article_number: String?; let matched_product_id: String?
        }
        do {
            let rows: [Row] = try await client
                .from("rope_configurations")
                .select("length_m, diameter_mm, material, end1, end2, end1_eye_length_cm, end2_eye_length_cm, article_number, matched_product_id")
                .eq("equipment_id", value: equipmentId.uuidString)
                .order("updated_at", ascending: false)
                .limit(1)
                .execute().value
            guard let r = rows.first else { return nil }
            return RopeConfigPayload(
                length_m: r.length_m, diameter_mm: r.diameter_mm, material: r.material,
                end1: r.end1, end2: r.end2,
                end1_eye_length_cm: r.end1_eye_length_cm, end2_eye_length_cm: r.end2_eye_length_cm,
                article_number: r.article_number, matched_product_id: r.matched_product_id)
        } catch {
            AppLog.warning("fetchRopeConfig fehlgeschlagen: \(error)")
            return nil
        }
    }

    // MARK: - Update (draft editing)

    func updateInquiry(id: UUID, subject: String, message: String, boatId: UUID?, notes: String?) async throws {
        let payload = InquiryUpdate(
            subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
            message: message.trimmingCharacters(in: .whitespacesAndNewlines),
            boatId: boatId,
            ownerNotes: notes?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty(),
            status: nil
        )
        try await client
            .from("service_inquiries")
            .update(payload)
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Send existing draft

    func sendInquiry(id: UUID) async throws {
        try await client
            .from("service_inquiries")
            .update(["status": "sent"])
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Spiegeln in Konversation (damit der Provider die Anfrage im
    // Nachrichten-Bereich des Portals sieht — das Portal liest NUR
    // conversations/messages, nicht service_inquiries).

    func mirrorInquiryToConversation(ownerId: UUID, providerId: UUID, subject: String, message: String, imageUrls: [String] = []) async throws {
        let body = subject.isEmpty ? message : "\(subject)\n\n\(message)"
        let conv = try await MessagingService.shared.getOrCreateConversation(userId: ownerId, providerId: providerId)
        try await MessagingService.shared.sendMessage(conversationId: conv.id, senderId: ownerId, content: body, attachmentUrls: imageUrls)
    }

    /// Lädt Anfrage-Fotos in den Bucket user-photos und liefert die öffentlichen URLs.
    func uploadInquiryPhotos(_ images: [UIImage], ownerId: UUID) async -> [String] {
        var urls: [String] = []
        let stamp = Int(Date().timeIntervalSince1970)
        for (idx, image) in images.enumerated() {
            guard let jpeg = image.jpegData(compressionQuality: 0.7) else { continue }
            let path = "inquiries/\(ownerId.uuidString)/\(stamp)_\(idx).jpg"
            do {
                try await client.storage.from("user-photos")
                    .upload(path, data: jpeg, options: .init(contentType: "image/jpeg", upsert: true))
                let url = try client.storage.from("user-photos").getPublicURL(path: path)
                urls.append(url.absoluteString)
            } catch {
                AppLog.error("Inquiry photo upload: \(error)")
            }
        }
        return urls
    }

    /// Lädt ein kurzes Problem-Video in den Bucket user-photos und liefert die
    /// öffentliche URL. `fileExtension` z. B. "mov" oder "mp4".
    func uploadInquiryVideo(_ data: Data, fileExtension: String, ownerId: UUID) async -> String? {
        let stamp = Int(Date().timeIntervalSince1970)
        let ext = fileExtension.lowercased().isEmpty ? "mov" : fileExtension.lowercased()
        let mime = (ext == "mp4") ? "video/mp4" : "video/quicktime"
        let path = "inquiries/\(ownerId.uuidString)/\(stamp)_video.\(ext)"
        do {
            try await client.storage.from("user-photos")
                .upload(path, data: data, options: .init(contentType: mime, upsert: true))
            let url = try client.storage.from("user-photos").getPublicURL(path: path)
            return url.absoluteString
        } catch {
            AppLog.error("Inquiry video upload: \(error)")
            return nil
        }
    }

    // MARK: - Archivieren (Eigner-Seite)

    func setArchived(id: UUID, archived: Bool) async throws {
        try await client
            .from("service_inquiries")
            .update(["owner_archived": archived])
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Delete

    func deleteInquiry(id: UUID) async throws {
        try await client
            .from("service_inquiries")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Gelesen markieren (Anbieter-Antwort gesehen)

    /// Markiert eine beantwortete Anfrage als gelesen, sobald der Eigner sie
    /// oeffnet. Aktualisiert sofort lokal (Badge geht runter) und persistiert
    /// best-effort. Antwortet der Anbieter erneut (-> replied), erscheint der
    /// Hinweis wieder.
    func markReplyRead(id: UUID) async {
        guard let idx = inquiries.firstIndex(where: { $0.id == id }),
              inquiries[idx].status == .replied else { return }
        inquiries[idx].status = .read
        do {
            try await client
                .from("service_inquiries")
                .update(["status": "read"])
                .eq("id", value: id.uuidString)
                .execute()
        } catch {
            AppLog.error("InquiryService.markReplyRead: \(error)")
        }
    }

    // MARK: - Badge: neue Antworten UND offene Angebote (die auf eine
    // Entscheidung warten). Ein offenes Angebot bleibt gezaehlt, bis es
    // angenommen (order_id) oder abgelehnt wurde – auch nachdem die Nachricht
    // gelesen wurde. Archivierte zaehlen nicht.

    var unreadCount: Int {
        inquiries.filter {
            !$0.isArchived &&
            (($0.offerStatus == "offered" && $0.orderId == nil) || $0.status == .replied)
        }.count
    }

    var draftCount: Int {
        inquiries.filter { $0.status == .draft }.count
    }
}

// MARK: - Helper

private extension String {
    func nilIfEmpty() -> String? {
        isEmpty ? nil : self
    }
}

/// Eine Nachricht im Rückfragen-Thread (aus get_inquiry_thread).
struct InquiryThreadMessage: Decodable, Identifiable, Hashable {
    let id: UUID
    let sender_type: String
    let content: String
    let created_at: String?
    let is_mine: Bool
}
