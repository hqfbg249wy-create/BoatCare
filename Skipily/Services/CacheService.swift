//
//  CacheService.swift
//  Skipily
//
//  Generic in-memory cache with TTL (time-to-live) support
//  Used to reduce network requests for frequently accessed data
//

import Foundation

@MainActor
final class CacheService {
    static let shared = CacheService()

    // MARK: - Configuration

    private let defaultTTL: TimeInterval = 300 // 5 minutes
    private let maxEntries = 200

    // MARK: - Storage

    private var cache: [String: CacheEntry] = [:]

    private struct CacheEntry {
        let data: Any
        let timestamp: Date
        let ttl: TimeInterval

        var isExpired: Bool {
            Date().timeIntervalSince(timestamp) > ttl
        }
    }

    // MARK: - Generic Cache Operations

    func get<T>(_ key: String) -> T? {
        guard let entry = cache[key] else { return nil }
        if entry.isExpired {
            cache.removeValue(forKey: key)
            return nil
        }
        return entry.data as? T
    }

    func set<T>(_ key: String, value: T, ttl: TimeInterval? = nil) {
        // Evict oldest if at capacity
        if cache.count >= maxEntries {
            evictOldest()
        }

        cache[key] = CacheEntry(
            data: value,
            timestamp: Date(),
            ttl: ttl ?? defaultTTL
        )
    }

    func remove(_ key: String) {
        cache.removeValue(forKey: key)
    }

    func removeAll() {
        cache.removeAll()
    }

    /// Remove all entries matching a prefix
    func removeAll(prefix: String) {
        cache = cache.filter { !$0.key.hasPrefix(prefix) }
    }

    // MARK: - Convenience Methods

    /// Get cached value or fetch from async closure
    func getOrFetch<T>(_ key: String, ttl: TimeInterval? = nil, fetch: () async throws -> T) async throws -> T {
        if let cached: T = get(key) {
            return cached
        }
        let value = try await fetch()
        set(key, value: value, ttl: ttl)
        return value
    }

    // MARK: - Cache Keys

    enum Keys {
        static let categories = "categories"
        static let parentCategories = "parentCategories"
        static func subcategories(_ parentId: UUID) -> String {
            "subcategories_\(parentId.uuidString)"
        }
        static func product(_ id: UUID) -> String {
            "product_\(id.uuidString)"
        }
        static let promotions = "promotions"
        static func products(_ page: Int, _ category: UUID?, _ search: String?) -> String {
            "products_p\(page)_c\(category?.uuidString ?? "all")_s\(search ?? "")"
        }
    }

    // MARK: - Private

    private func evictOldest() {
        // Remove expired first
        let expiredKeys = cache.filter { $0.value.isExpired }.map(\.key)
        for key in expiredKeys {
            cache.removeValue(forKey: key)
        }

        // If still over capacity, remove oldest
        if cache.count >= maxEntries {
            let sortedKeys = cache.sorted { $0.value.timestamp < $1.value.timestamp }
            let toRemove = sortedKeys.prefix(cache.count - maxEntries + 10) // Remove 10 extra for headroom
            for (key, _) in toRemove {
                cache.removeValue(forKey: key)
            }
        }
    }

    // MARK: - Stats (for debugging)

    var entryCount: Int { cache.count }

    var stats: (total: Int, expired: Int) {
        let expired = cache.filter { $0.value.isExpired }.count
        return (cache.count, expired)
    }
}
