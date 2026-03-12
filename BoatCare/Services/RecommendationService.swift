//
//  RecommendationService.swift
//  BoatCare
//
//  Smart product recommendations based on user's boat profile
//

import Foundation
import Supabase

@Observable
@MainActor
final class RecommendationService {
    static let shared = RecommendationService()

    var recommendedProducts: [Product] = []
    var isLoading = false

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    private let productSelect = """
        *, product_categories(*), service_providers(id, company_name, city)
        """

    // MARK: - Boat Profile Based Recommendations

    /// Fetch products that match the user's boat type and manufacturer preferences
    func loadRecommendations(for profile: UserProfile?) async {
        guard let profile else {
            recommendedProducts = []
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            var allRecommended: [Product] = []

            // Strategy 1: If user has a preferred boat, load boat details and match
            if let boatId = profile.preferredBoatId {
                let boatProducts = try await fetchProductsForBoat(boatId: boatId)
                allRecommended.append(contentsOf: boatProducts)
            }

            // Strategy 2: Load recently added / popular products as fallback
            if allRecommended.count < 8 {
                let recent = try await fetchRecentProducts(excluding: Set(allRecommended.map(\.id)))
                allRecommended.append(contentsOf: recent)
            }

            // Deduplicate and limit
            var seen = Set<UUID>()
            recommendedProducts = allRecommended.filter { product in
                guard !seen.contains(product.id) else { return false }
                seen.insert(product.id)
                return true
            }
            .prefix(12)
            .map { $0 }

        } catch {
            print("Failed to load recommendations: \(error)")
            recommendedProducts = []
        }
    }

    // MARK: - Boat-specific Products

    private func fetchProductsForBoat(boatId: UUID) async throws -> [Product] {
        // First get the boat info to know type/manufacturer
        struct BoatInfo: Codable {
            let boatType: String?
            let manufacturer: String?

            enum CodingKeys: String, CodingKey {
                case boatType = "boat_type"
                case manufacturer
            }
        }

        // Try to load boat info — the table might be "boats" or "user_boats"
        // We'll use a broad approach: fetch products matching common boat types
        do {
            let boat: BoatInfo = try await client
                .from("boats")
                .select("boat_type, manufacturer")
                .eq("id", value: boatId.uuidString)
                .single()
                .execute()
                .value

            var products: [Product] = []

            // Fetch by boat type
            if let boatType = boat.boatType, !boatType.isEmpty {
                let typeProducts: [Product] = try await client
                    .from("metashop_products")
                    .select(productSelect)
                    .eq("is_active", value: true)
                    .contains("fits_boat_types", value: [boatType])
                    .order("created_at", ascending: false)
                    .range(from: 0, to: 9)
                    .execute()
                    .value
                products.append(contentsOf: typeProducts)
            }

            // Fetch by manufacturer
            if let manufacturer = boat.manufacturer, !manufacturer.isEmpty {
                let mfgProducts: [Product] = try await client
                    .from("metashop_products")
                    .select(productSelect)
                    .eq("is_active", value: true)
                    .contains("fits_manufacturers", value: [manufacturer])
                    .order("created_at", ascending: false)
                    .range(from: 0, to: 5)
                    .execute()
                    .value
                products.append(contentsOf: mfgProducts)
            }

            return products
        } catch {
            // Boat table might not exist yet, silently fail
            print("Could not fetch boat info: \(error)")
            return []
        }
    }

    private func fetchRecentProducts(excluding excludeIds: Set<UUID>) async throws -> [Product] {
        let products: [Product] = try await client
            .from("metashop_products")
            .select(productSelect)
            .eq("is_active", value: true)
            .order("created_at", ascending: false)
            .range(from: 0, to: 11)
            .execute()
            .value

        return products.filter { !excludeIds.contains($0.id) }
    }

    // MARK: - Category-based Suggestions

    /// Fetch products in the same category (for "Ähnliche Produkte" section)
    func fetchSimilarProducts(to product: Product, limit: Int = 6) async throws -> [Product] {
        guard let categoryId = product.categoryId else { return [] }

        let products: [Product] = try await client
            .from("metashop_products")
            .select(productSelect)
            .eq("is_active", value: true)
            .eq("category_id", value: categoryId.uuidString)
            .neq("id", value: product.id.uuidString)
            .order("created_at", ascending: false)
            .range(from: 0, to: limit - 1)
            .execute()
            .value

        return products
    }

    /// Fetch products from the same provider
    func fetchProviderProducts(for product: Product, limit: Int = 4) async throws -> [Product] {
        guard let providerId = product.providerId else { return [] }

        let products: [Product] = try await client
            .from("metashop_products")
            .select(productSelect)
            .eq("is_active", value: true)
            .eq("provider_id", value: providerId.uuidString)
            .neq("id", value: product.id.uuidString)
            .order("name")
            .range(from: 0, to: limit - 1)
            .execute()
            .value

        return products
    }
}
