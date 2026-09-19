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
        send: Bool
    ) async throws {
        let payload = InquiryInsert(
            ownerId: ownerId,
            providerId: providerId,
            boatId: boatId,
            subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
            message: message.trimmingCharacters(in: .whitespacesAndNewlines),
            ownerNotes: notes?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty(),
            status: send ? "sent" : "draft"
        )
        try await client
            .from("service_inquiries")
            .insert(payload)
            .execute()
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

    // MARK: - Delete

    func deleteInquiry(id: UUID) async throws {
        try await client
            .from("service_inquiries")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Unread count (replied inquiries)

    var unreadCount: Int {
        inquiries.filter { $0.status == .replied }.count
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
