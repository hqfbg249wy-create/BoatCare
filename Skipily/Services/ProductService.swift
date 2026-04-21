//
//  ProductService.swift
//  Skipily
//
//  Service for fetching products and categories from Supabase
//  Includes in-memory caching for categories and frequently accessed data
//

import Foundation
import Supabase

@MainActor
final class ProductService {
    static let shared = ProductService()

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    private let cache = CacheService.shared

    // MARK: - Categories (cached)

    func fetchCategories() async throws -> [ProductCategory] {
        try await cache.getOrFetch(CacheService.Keys.categories, ttl: 600) {
            let categories: [ProductCategory] = try await client
                .from("product_categories")
                .select()
                .order("sort_order")
                .execute()
                .value
            return categories
        }
    }

    func fetchParentCategories() async throws -> [ProductCategory] {
        try await cache.getOrFetch(CacheService.Keys.parentCategories, ttl: 600) {
            let categories: [ProductCategory] = try await client
                .from("product_categories")
                .select()
                .filter("parent_id", operator: "is", value: "null")
                .order("sort_order")
                .execute()
                .value
            return categories
        }
    }

    func fetchSubcategories(parentId: UUID) async throws -> [ProductCategory] {
        try await cache.getOrFetch(CacheService.Keys.subcategories(parentId), ttl: 600) {
            let categories: [ProductCategory] = try await client
                .from("product_categories")
                .select()
                .eq("parent_id", value: parentId.uuidString)
                .order("sort_order")
                .execute()
                .value
            return categories
        }
    }

    // MARK: - Products

    private let productSelect = """
        *, product_categories(*), service_providers(id, name, city)
        """

    func fetchProducts(
        categoryId: UUID? = nil,
        searchQuery: String? = nil,
        limit: Int = 20,
        offset: Int = 0
    ) async throws -> [Product] {
        // Don't cache search queries (too many variations)
        // Cache first page of category listings
        let useCache = searchQuery == nil && offset == 0

        if useCache {
            let cacheKey = CacheService.Keys.products(0, categoryId, nil)
            if let cached: [Product] = cache.get(cacheKey) {
                return cached
            }
        }

        var query = client
            .from("metashop_products")
            .select(productSelect)
            .eq("is_active", value: true)

        if let categoryId {
            query = query.eq("category_id", value: categoryId.uuidString)
        }

        if let searchQuery, !searchQuery.isEmpty {
            query = query.ilike("name", pattern: "%\(searchQuery)%")
        }

        let products: [Product] = try await query
            .order("created_at", ascending: false)
            .range(from: offset, to: offset + limit - 1)
            .execute()
            .value

        if useCache {
            let cacheKey = CacheService.Keys.products(0, categoryId, nil)
            cache.set(cacheKey, value: products, ttl: 120) // 2 min for product listings
        }

        return products
    }

    /// Breitere Volltextsuche über mehrere Produktfelder (name, manufacturer,
    /// description, part_number, tags). Splittet die Query an Whitespace und
    /// sucht jedes Wort per ILIKE in allen Feldern. Wird vor allem von der
    /// "Ersatzteile aus Equipment"-Suche benutzt, weil dort meistens mehrere
    /// Tokens kombiniert ankommen (z.B. "Volvo Penta D2-40").
    func searchProductsBroad(query: String, limit: Int = 40) async throws -> [Product] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        // Tokens mit min. 2 Zeichen; max. 6 damit die OR-Kette handlich bleibt.
        let tokens = trimmed
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
            .filter { $0.count >= 2 }
            .prefix(6)

        guard !tokens.isEmpty else { return [] }

        // PostgREST erwartet: or=(name.ilike.*foo*,manufacturer.ilike.*foo*,...)
        // Wir verbinden alle Token-Matches ebenfalls per OR, nicht AND, um
        // möglichst viele Kandidaten zu liefern — Ranking erfolgt clientseitig.
        let fields = ["name", "manufacturer", "description", "part_number"]
        var orParts: [String] = []
        for token in tokens {
            let sanitized = token
                .replacingOccurrences(of: ",", with: " ")
                .replacingOccurrences(of: "(", with: " ")
                .replacingOccurrences(of: ")", with: " ")
            for field in fields {
                orParts.append("\(field).ilike.*\(sanitized)*")
            }
        }
        let orClause = orParts.joined(separator: ",")

        let products: [Product] = try await client
            .from("metashop_products")
            .select(productSelect)
            .eq("is_active", value: true)
            .or(orClause)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value

        // Clientseitiges Ranking: mehr Token-Treffer = höheres Gewicht.
        let lowerTokens = tokens.map { $0.lowercased() }
        let ranked = products.map { p -> (Product, Int) in
            var score = 0
            let haystack = [
                p.name,
                p.manufacturer ?? "",
                p.description ?? "",
                p.partNumber ?? ""
            ].joined(separator: " ").lowercased()
            for t in lowerTokens where haystack.contains(t) {
                score += haystack.contains(" \(t) ") || haystack.hasPrefix(t) ? 2 : 1
            }
            return (p, score)
        }

        return ranked
            .sorted { $0.1 > $1.1 }
            .map { $0.0 }
    }

    func fetchProduct(id: UUID) async throws -> Product {
        try await cache.getOrFetch(CacheService.Keys.product(id), ttl: 180) {
            let product: Product = try await client
                .from("metashop_products")
                .select(productSelect)
                .eq("id", value: id.uuidString)
                .single()
                .execute()
                .value
            return product
        }
    }

    func fetchProductsByProvider(providerId: UUID) async throws -> [Product] {
        let products: [Product] = try await client
            .from("metashop_products")
            .select(productSelect)
            .eq("provider_id", value: providerId.uuidString)
            .eq("is_active", value: true)
            .order("name")
            .execute()
            .value
        return products
    }

    func fetchProductsByBoatType(_ boatType: String) async throws -> [Product] {
        let products: [Product] = try await client
            .from("metashop_products")
            .select(productSelect)
            .eq("is_active", value: true)
            .contains("fits_boat_types", value: [boatType])
            .order("created_at", ascending: false)
            .execute()
            .value
        return products
    }

    // MARK: - Promotions

    func fetchActivePromotions() async throws -> [Promotion] {
        try await cache.getOrFetch(CacheService.Keys.promotions, ttl: 300) {
            let promotions: [Promotion] = try await client
                .from("provider_promotions")
                .select()
                .eq("is_active", value: true)
                .execute()
                .value
            return promotions
        }
    }

    // MARK: - Cache Management

    func invalidateProductCache() {
        cache.removeAll(prefix: "products_")
        cache.removeAll(prefix: "product_")
    }

    func invalidateCategoryCache() {
        cache.remove(CacheService.Keys.categories)
        cache.remove(CacheService.Keys.parentCategories)
        cache.removeAll(prefix: "subcategories_")
    }

    func invalidateAll() {
        cache.removeAll()
    }
}
