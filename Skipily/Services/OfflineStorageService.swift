//
//  OfflineStorageService.swift
//  Skipily
//
//  Provides offline capability by caching service providers and products
//  for the user's current country. Monitors network connectivity and
//  serves cached data when offline.
//

import Foundation
import Network
import CoreLocation
import Supabase
import Observation

@Observable
@MainActor
final class OfflineStorageService {
    static let shared = OfflineStorageService()

    // MARK: - Public State

    /// Whether the device currently has network connectivity
    private(set) var isOnline = true

    /// The detected ISO country code (e.g. "DE", "NL", "ES")
    private(set) var currentCountryCode: String?

    /// Timestamp of last successful sync
    private(set) var lastSyncDate: Date?

    /// Number of cached providers
    private(set) var cachedProviderCount: Int = 0

    /// Number of cached products
    private(set) var cachedProductCount: Int = 0

    // MARK: - Private

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "de.boatcare.network-monitor")
    private let geocoder = CLGeocoder()
    private let fileManager = FileManager.default

    private var cachedProviders: [ServiceProvider] = []
    private var cachedProducts: [Product] = []
    private var hasStarted = false

    // MARK: - File Paths

    private var cacheDirectory: URL {
        let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docs.appendingPathComponent("OfflineCache", isDirectory: true)
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private var providersFile: URL { cacheDirectory.appendingPathComponent("providers.json") }
    private var productsFile: URL { cacheDirectory.appendingPathComponent("products.json") }
    private var metadataFile: URL { cacheDirectory.appendingPathComponent("metadata.json") }

    // MARK: - Metadata

    private struct CacheMetadata: Codable {
        var countryCode: String?
        var lastSync: Date?
        var providerCount: Int
        var productCount: Int
    }

    // MARK: - Init

    private init() {
        loadMetadata()
        loadCachedData()
    }

    // MARK: - Start Monitoring

    func start() {
        guard !hasStarted else { return }
        hasStarted = true

        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = !self.isOnline
                self.isOnline = path.status == .satisfied

                // If we just came back online, trigger a sync
                if wasOffline && self.isOnline {
                    await self.syncIfNeeded()
                }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    func stop() {
        monitor.cancel()
        hasStarted = false
    }

    // MARK: - Country Detection

    func detectCountry(from location: CLLocation) async {
        do {
            let placemarks = try await geocoder.reverseGeocodeLocation(location)
            if let code = placemarks.first?.isoCountryCode {
                let changed = code != currentCountryCode
                currentCountryCode = code
                if changed {
                    // Country changed → re-sync for new country
                    await syncIfNeeded(force: true)
                }
            }
        } catch {
            AppLog.error("Offline: Geocoding fehlgeschlagen: \(error.localizedDescription)")
        }
    }

    // MARK: - Sync (Download for Offline)

    func syncIfNeeded(force: Bool = false) async {
        guard isOnline else { return }

        // Skip if synced recently (< 1 hour) and not forced
        if !force, let lastSync = lastSyncDate, Date().timeIntervalSince(lastSync) < 3600 {
            return
        }

        await syncProviders()
        await syncProducts()
        saveMetadata()
    }

    private func syncProviders() async {
        do {
            let providers: [ServiceProvider]
            if let country = currentCountryCode {
                providers = try await SupabaseManager.shared.client
                    .from("service_providers")
                    .select()
                    .eq("country", value: country)
                    .limit(500)
                    .execute()
                    .value
            } else {
                providers = try await SupabaseManager.shared.client
                    .from("service_providers")
                    .select()
                    .limit(500)
                    .execute()
                    .value
            }

            cachedProviders = providers
            cachedProviderCount = providers.count

            // Persist to disk
            let data = try JSONEncoder().encode(providers)
            try data.write(to: providersFile)

            AppLog.debug("Offline: \(providers.count) Provider gecacht (Land: \(currentCountryCode ?? "alle"))")
        } catch {
            AppLog.error("Offline: Provider-Sync fehlgeschlagen: \(error.localizedDescription)")
        }
    }

    private func syncProducts() async {
        do {
            let products: [Product] = try await SupabaseManager.shared.client
                .from("products")
                .select()
                .limit(200)
                .order("created_at", ascending: false)
                .execute()
                .value

            cachedProducts = products
            cachedProductCount = products.count

            // Persist to disk
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(products)
            try data.write(to: productsFile)

            AppLog.debug("Offline: \(products.count) Produkte gecacht")
        } catch {
            AppLog.error("Offline: Produkt-Sync fehlgeschlagen: \(error.localizedDescription)")
        }
    }

    // MARK: - Offline Data Access

    /// Get cached service providers (for offline use or as fallback)
    func getProviders() -> [ServiceProvider] {
        return cachedProviders
    }

    /// Get cached service providers filtered by category keywords
    func getProviders(matching keywords: [String]) -> [ServiceProvider] {
        guard !keywords.isEmpty else { return cachedProviders }
        return cachedProviders.filter { provider in
            let provCat = provider.category.lowercased()
            let provServices = (provider.services ?? []).map { $0.lowercased() }
            let provCats = provider.allCategories.map { $0.lowercased() }
            return keywords.contains { kw in
                provCat.contains(kw) ||
                provCats.contains { $0.contains(kw) } ||
                provServices.contains { $0.contains(kw) }
            }
        }
    }

    /// Get cached products
    func getProducts() -> [Product] {
        return cachedProducts
    }

    /// Search cached products by name/description
    func searchProducts(query: String) -> [Product] {
        guard !query.isEmpty else { return cachedProducts }
        let term = query.lowercased()
        return cachedProducts.filter {
            $0.name.lowercased().contains(term) ||
            ($0.description ?? "").lowercased().contains(term)
        }
    }

    // MARK: - Persistence

    private func loadCachedData() {
        // Load providers
        if let data = try? Data(contentsOf: providersFile) {
            let decoder = JSONDecoder()
            if let providers = try? decoder.decode([ServiceProvider].self, from: data) {
                cachedProviders = providers
                cachedProviderCount = providers.count
            }
        }

        // Load products
        if let data = try? Data(contentsOf: productsFile) {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            if let products = try? decoder.decode([Product].self, from: data) {
                cachedProducts = products
                cachedProductCount = products.count
            }
        }
    }

    private func loadMetadata() {
        guard let data = try? Data(contentsOf: metadataFile),
              let meta = try? JSONDecoder().decode(CacheMetadata.self, from: data) else { return }

        currentCountryCode = meta.countryCode
        lastSyncDate = meta.lastSync
        cachedProviderCount = meta.providerCount
        cachedProductCount = meta.productCount
    }

    private func saveMetadata() {
        lastSyncDate = Date()
        let meta = CacheMetadata(
            countryCode: currentCountryCode,
            lastSync: lastSyncDate,
            providerCount: cachedProviderCount,
            productCount: cachedProductCount
        )
        if let data = try? JSONEncoder().encode(meta) {
            try? data.write(to: metadataFile)
        }
    }

    // MARK: - Cache Info

    var cacheAge: String? {
        guard let lastSync = lastSyncDate else { return nil }
        let interval = Date().timeIntervalSince(lastSync)
        if interval < 60 { return "gerade eben" }
        if interval < 3600 { return "\(Int(interval / 60)) Min." }
        if interval < 86400 { return "\(Int(interval / 3600)) Std." }
        return "\(Int(interval / 86400)) Tage"
    }
}
