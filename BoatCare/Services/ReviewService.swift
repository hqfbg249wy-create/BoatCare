//
//  ReviewService.swift
//  BoatCare
//

import Foundation
import Supabase
import Combine

/// Datenmodell fuer eine einzelne Review (aus der reviews-Tabelle)
struct Reviews: Identifiable, Codable {
    let id: UUID
    let service_provider_id: UUID
    let user_id: UUID
    let rating: Int
    let comment: String
    let createdAt: Date?
    let updatedAt: Date?

    // Profil-Daten (via Join)
    let userName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case service_provider_id = "service_provider_id"
        case user_id = "user_id"
        case rating
        case comment
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case userName = "user_name"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        service_provider_id = try c.decode(UUID.self, forKey: .service_provider_id)
        user_id = try c.decode(UUID.self, forKey: .user_id)
        rating = try c.decode(Int.self, forKey: .rating)
        comment = try c.decode(String.self, forKey: .comment)
        createdAt = try? c.decode(Date.self, forKey: .createdAt)
        updatedAt = try? c.decode(Date.self, forKey: .updatedAt)
        userName = try? c.decode(String.self, forKey: .userName)
    }
}

/// Parameter fuer submit_review RPC
struct SubmitReviewParams: @preconcurrency Encodable, Sendable {
    let p_provider_id: String
    let p_user_id: String
    let p_rating: Int
    let p_comment: String
}

/// Antwort der submit_review RPC-Funktion
struct SubmitReviewResponse: Codable, Sendable {
    let reviewId: UUID?
    let avgRating: Double?
    let reviewCount: Int?

    enum CodingKeys: String, CodingKey {
        case reviewId = "review_id"
        case avgRating = "avg_rating"
        case reviewCount = "review_count"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reviewId = try? c.decode(UUID.self, forKey: .reviewId)
        avgRating = try? c.decode(Double.self, forKey: .avgRating)
        reviewCount = try? c.decode(Int.self, forKey: .reviewCount)
    }
}

/// Typealias fuer Abwaertskompatibilitaet
typealias Review = Reviews

/// Zentraler Service fuer alle Review-Operationen
@MainActor
class ReviewService: ObservableObject {
    @Published var reviews: [Reviews] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let supabase = SupabaseManager.shared.client

    /// Eigene Review des aktuellen Users fuer einen Provider finden
    func myReview(for serviceProviderId: UUID, userId: UUID) -> Reviews? {
        return reviews.first { $0.service_provider_id == serviceProviderId && $0.user_id == userId }
    }

    /// Reviews fuer einen Provider laden
    func loadReviews(for service_provider_id: UUID) async {
        isLoading = true
        errorMessage = nil
        
        do {
            // Reviews laden – einfache Abfrage ohne Join
            let response: [Reviews] = try await supabase
                .from("reviews")
                .select("id, service_provider_id, user_id, rating, comment, created_at, updated_at")
                .eq("service_provider_id", value: service_provider_id.uuidString)
                .order("created_at", ascending: false)
                .execute()
                .value
            
            reviews = response
        } catch {
            print("Reviews: Fehler beim Laden: \(error)")
            errorMessage = error.localizedDescription
            reviews = []
        }
        
        isLoading = false
    }
    
    /// Review abschicken (erstellt neu oder aktualisiert bestehende)
    func submitReview(service_provider_id: UUID, userId: UUID, rating: Int, comment: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        
        do {
            let params = SubmitReviewParams(
                p_provider_id: service_provider_id.uuidString,
                p_user_id: userId.uuidString,
                p_rating: rating,
                p_comment: comment
            )
            let _: SubmitReviewResponse = try await supabase
                .rpc("submit_review", params: params)
                .execute()
                .value
            
            // Reviews neu laden
            await loadReviews(for: service_provider_id)
            isLoading = false
            return true
        } catch {
            print("ReviewService: Fehler beim Speichern: \(error)")
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }
}

