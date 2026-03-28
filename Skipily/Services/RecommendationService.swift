//
//  RecommendationService.swift
//  Skipily
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
        *, product_categories(*), service_providers(id, name, city)
        """

    // MARK: - Boat Profile Based Recommendations

    /// Fetch products that match the user's boats, equipment, and manufacturer preferences
    func loadRecommendations(for profile: UserProfile?) async {
        isLoading = true
        defer { isLoading = false }

        do {
            var allRecommended: [Product] = []

            // Strategy 1: Load all user's boats and match products
            let boats = try await fetchUserBoats()
            for boat in boats {
                let boatProducts = try await fetchProductsForBoatInfo(boat)
                allRecommended.append(contentsOf: boatProducts)
            }

            // Strategy 2: Match products to user's equipment manufacturers
            if !boats.isEmpty {
                let equipmentProducts = try await fetchProductsForEquipment(boatIds: boats.map(\.id))
                allRecommended.append(contentsOf: equipmentProducts)
            }

            // Strategy 3: If user has preferred boat, also use that
            if let boatId = profile?.preferredBoatId, !boats.contains(where: { $0.id == boatId }) {
                let boatProducts = try await fetchProductsForBoat(boatId: boatId)
                allRecommended.append(contentsOf: boatProducts)
            }

            // Strategy 4: Load recently added as fallback
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

    // MARK: - Load User's Boats

    private struct UserBoatRow: Codable, Identifiable {
        let id: UUID
        let boatType: String?
        let manufacturer: String?

        enum CodingKeys: String, CodingKey {
            case id
            case boatType = "boat_type"
            case manufacturer
        }
    }

    private func fetchUserBoats() async throws -> [UserBoatRow] {
        try await client
            .from("boats")
            .select("id, boat_type, manufacturer")
            .execute()
            .value
    }

    private func fetchProductsForBoatInfo(_ boat: UserBoatRow) async throws -> [Product] {
        var products: [Product] = []

        if let boatType = boat.boatType, !boatType.isEmpty {
            let typeProducts: [Product] = try await client
                .from("metashop_products")
                .select(productSelect)
                .eq("is_active", value: true)
                .contains("fits_boat_types", value: [boatType])
                .order("created_at", ascending: false)
                .range(from: 0, to: 5)
                .execute()
                .value
            products.append(contentsOf: typeProducts)
        }

        if let manufacturer = boat.manufacturer, !manufacturer.isEmpty {
            let mfgProducts: [Product] = try await client
                .from("metashop_products")
                .select(productSelect)
                .eq("is_active", value: true)
                .contains("fits_manufacturers", value: [manufacturer])
                .order("created_at", ascending: false)
                .range(from: 0, to: 3)
                .execute()
                .value
            products.append(contentsOf: mfgProducts)
        }

        return products
    }

    // MARK: - Equipment-based Recommendations

    private func fetchProductsForEquipment(boatIds: [UUID]) async throws -> [Product] {
        struct EquipRow: Codable {
            let name: String?
            let manufacturer: String?
            let category: String?
        }

        let equipment: [EquipRow] = try await client
            .from("equipment")
            .select("name, manufacturer, category")
            .in("boat_id", values: boatIds.map(\.uuidString))
            .execute()
            .value

        var products: [Product] = []

        // Strategy A: Match products by equipment manufacturer
        let manufacturers = Set(equipment.compactMap(\.manufacturer).filter { !$0.isEmpty })
        for mfg in manufacturers.prefix(5) {
            let mfgProducts: [Product] = try await client
                .from("metashop_products")
                .select(productSelect)
                .eq("is_active", value: true)
                .ilike("manufacturer", pattern: "%\(mfg)%")
                .order("created_at", ascending: false)
                .range(from: 0, to: 2)
                .execute()
                .value
            products.append(contentsOf: mfgProducts)
        }

        // Strategy B: Match products by equipment category keywords in product name/tags
        let categories = Set(equipment.compactMap(\.category).filter { !$0.isEmpty })
        for cat in categories.prefix(5) {
            // Search product names matching equipment category
            let catProducts: [Product] = try await client
                .from("metashop_products")
                .select(productSelect)
                .eq("is_active", value: true)
                .ilike("name", pattern: "%\(cat)%")
                .order("created_at", ascending: false)
                .range(from: 0, to: 2)
                .execute()
                .value
            products.append(contentsOf: catProducts)
        }

        // Strategy C: Match products by equipment name (e.g. "Volvo Penta D2-40")
        let equipNames = Set(equipment.compactMap(\.name).filter { !$0.isEmpty })
        for name in equipNames.prefix(4) {
            // Use first word (brand) for broader matching
            let keyword = name.components(separatedBy: " ").first ?? name
            guard keyword.count >= 3 else { continue }
            let nameProducts: [Product] = try await client
                .from("metashop_products")
                .select(productSelect)
                .eq("is_active", value: true)
                .ilike("name", pattern: "%\(keyword)%")
                .order("created_at", ascending: false)
                .range(from: 0, to: 1)
                .execute()
                .value
            products.append(contentsOf: nameProducts)
        }

        return products
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
