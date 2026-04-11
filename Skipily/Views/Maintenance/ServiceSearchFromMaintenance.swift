//
//  ServiceSearchFromMaintenance.swift
//  Skipily
//
//  Shows service providers relevant to a specific equipment item.
//  Filters by category keywords AND manufacturer/brand matching,
//  with filter chips the user can toggle.
//

import SwiftUI
import Supabase
import CoreLocation

struct ServiceSearchFromMaintenance: View {
    let equipmentName: String
    let category: String
    let manufacturer: String

    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @StateObject private var locationManager = LocationManager()

    @State private var allProviders: [ServiceProvider] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var filterByCategory = true
    @State private var filterByBrand = true

    // MARK: - Derived provider list

    /// Available categories extracted from the DB to offer as chip filters
    private var availableCategories: [String] {
        var cats = Set<String>()
        for p in allProviders {
            for c in p.allCategories { cats.insert(c) }
        }
        return cats.sorted()
    }

    /// The equipment's manufacturer tokens (lowercased) for brand matching.
    private var manufacturerTokens: [String] {
        guard !manufacturer.isEmpty else { return [] }
        // Split "Volvo Penta" → ["volvo", "penta"], "Yanmar" → ["yanmar"]
        return manufacturer
            .lowercased()
            .split(separator: " ")
            .map(String.init)
            .filter { $0.count >= 3 }
    }

    private var categoryKeywordList: [String] {
        categoryKeywords(for: category)
    }

    private var filteredProviders: [ServiceProvider] {
        var result = allProviders

        // Filter: category match
        if filterByCategory && !categoryKeywordList.isEmpty {
            let matches = result.filter { providerMatchesCategory($0, keywords: categoryKeywordList) }
            // Only filter down if there are actual matches; otherwise show all
            if !matches.isEmpty { result = matches }
        }

        // Filter: brand match (provider.brands contains manufacturer tokens)
        if filterByBrand && !manufacturerTokens.isEmpty {
            let matches = result.filter { providerMatchesBrand($0) }
            if !matches.isEmpty { result = matches }
        }

        // Free-text search
        if !searchText.isEmpty {
            let term = searchText.lowercased()
            result = result.filter {
                $0.name.lowercased().contains(term) ||
                $0.category.lowercased().contains(term) ||
                ($0.services ?? []).contains(where: { $0.lowercased().contains(term) }) ||
                ($0.brands ?? []).contains(where: { $0.lowercased().contains(term) }) ||
                ($0.city ?? "").lowercased().contains(term)
            }
        }

        return result
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Filter chips
            if !categoryKeywordList.isEmpty || !manufacturerTokens.isEmpty {
                filterChips
            }

            // Results
            Group {
                if isLoading {
                    ProgressView("Service-Anbieter laden...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredProviders.isEmpty {
                    emptyState
                } else {
                    List(filteredProviders) { provider in
                        NavigationLink {
                            ServiceProviderDetailView(provider: provider)
                        } label: {
                            ServiceProviderSearchRow(
                                provider: provider,
                                userLocation: locationManager.location
                            )
                        }
                    }
                    .listStyle(.plain)
                }
            }
        }
        .navigationTitle("Service: \(equipmentName)")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Anbieter, Marke oder Ort suchen...")
        .task {
            locationManager.requestPermission()
            await loadProviders()
        }
        .onChange(of: locationManager.location) { _, newLoc in
            guard newLoc != nil else { return }
            sortProviders()
        }
    }

    // MARK: - Filter Chips

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Category chip
                if !categoryKeywordList.isEmpty {
                    FilterChip(
                        label: categoryDisplayName(for: category),
                        icon: "tag.fill",
                        isActive: $filterByCategory
                    )
                }

                // Brand chip
                if !manufacturerTokens.isEmpty {
                    FilterChip(
                        label: manufacturer,
                        icon: "building.2.fill",
                        isActive: $filterByBrand
                    )
                }

                // Result count
                Spacer()
                Text("\(filteredProviders.count) Ergebnis\(filteredProviders.count == 1 ? "" : "se")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Data Loading

    private func loadProviders() async {
        isLoading = true
        do {
            let providers: [ServiceProvider] = try await authService.supabase
                .from("service_providers")
                .select()
                .execute()
                .value

            await MainActor.run {
                allProviders = providers
                sortProviders()
            }
        } catch {
            print("❌ Service-Anbieter laden: \(error)")
        }
        isLoading = false
    }

    /// Sort: best matches first (category + brand), then by distance, then by rating
    private func sortProviders() {
        let keywords = categoryKeywordList
        let userLoc = locationManager.location

        allProviders.sort { a, b in
            let aCategory = providerMatchesCategory(a, keywords: keywords)
            let bCategory = providerMatchesCategory(b, keywords: keywords)
            let aBrand = providerMatchesBrand(a)
            let bBrand = providerMatchesBrand(b)

            // Score: +2 for category, +2 for brand
            let aScore = (aCategory ? 2 : 0) + (aBrand ? 2 : 0)
            let bScore = (bCategory ? 2 : 0) + (bBrand ? 2 : 0)
            if aScore != bScore { return aScore > bScore }

            // Same score → sort by distance
            if let loc = userLoc {
                let distA = loc.distance(from: CLLocation(latitude: a.latitude, longitude: a.longitude))
                let distB = loc.distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
                return distA < distB
            }

            return (a.rating ?? 0) > (b.rating ?? 0)
        }
    }

    // MARK: - Matching Logic

    private func providerMatchesCategory(_ provider: ServiceProvider, keywords: [String]) -> Bool {
        guard !keywords.isEmpty else { return false }
        let provCat = provider.category.lowercased()
        let provServices = (provider.services ?? []).map { $0.lowercased() }
        let provCats = provider.allCategories.map { $0.lowercased() }
        return keywords.contains(where: { kw in
            provCat.contains(kw) ||
            provCats.contains(where: { $0.contains(kw) }) ||
            provServices.contains(where: { $0.contains(kw) })
        })
    }

    private func providerMatchesBrand(_ provider: ServiceProvider) -> Bool {
        guard !manufacturerTokens.isEmpty else { return false }
        let provBrands = (provider.brands ?? []).map { $0.lowercased() }
        let provName = provider.name.lowercased()
        let provServices = (provider.services ?? []).map { $0.lowercased() }

        return manufacturerTokens.contains(where: { token in
            provBrands.contains(where: { $0.contains(token) }) ||
            provName.contains(token) ||
            provServices.contains(where: { $0.contains(token) })
        })
    }

    // MARK: - Category Keywords

    private func categoryKeywords(for equipmentCategory: String) -> [String] {
        let cat = equipmentCategory.lowercased()
        if cat.contains("motor") || cat.contains("engine") || cat.contains("antrieb") {
            return ["motor", "werkstatt", "engine", "mechani", "repair"]
        } else if cat.contains("elektr") || cat.contains("electronic") || cat.contains("navigation") || cat.contains("instrument") {
            return ["elektr", "electronic", "instrument", "navigation"]
        } else if cat.contains("segel") || cat.contains("sail") || cat.contains("rigg") {
            return ["segel", "sail", "rigg", "sailmaker"]
        } else if cat.contains("sicherheit") || cat.contains("safety") || cat.contains("rettung") {
            return ["sicherheit", "safety", "rettung"]
        } else if cat.contains("sanitaer") || cat.contains("sanit") || cat.contains("wasser") || cat.contains("pump") {
            return ["sanitaer", "sanit", "pump", "wasser"]
        } else if cat.contains("lack") || cat.contains("paint") || cat.contains("antifouling") {
            return ["lack", "paint", "werft", "yard"]
        } else if cat.contains("heiz") || cat.contains("klima") {
            return ["heiz", "klima", "heat"]
        } else if cat.contains("deck") || cat.contains("rumpf") || cat.contains("hull") || cat.contains("osmose") {
            return ["werft", "yard", "rumpf", "hull", "osmose", "bootsbau"]
        } else if cat.contains("anker") || cat.contains("anchor") || cat.contains("kette") {
            return ["anker", "anchor", "zubeh"]
        } else if cat.contains("komm") || cat.contains("funk") || cat.contains("radio") || cat.contains("comm") {
            return ["elektr", "electronic", "funk", "radio", "kommunikation"]
        }
        // Fallback: nutze den Kategorie-String selbst als Keyword
        if !cat.isEmpty && cat != "other" && cat != "sonstiges" {
            return [cat]
        }
        return []
    }

    private func categoryDisplayName(for cat: String) -> String {
        LanguageManager.shared.localizedCategory(cat)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.system(size: 48))
                .foregroundStyle(.orange.opacity(0.3))
            Text("Keine Service-Anbieter gefunden")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("Fuer \(equipmentName) (\(category)\(!manufacturer.isEmpty ? ", \(manufacturer)" : "")) wurden keine passenden Anbieter gefunden.")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            // Hint: disable filters
            if filterByCategory || filterByBrand {
                Button {
                    filterByCategory = false
                    filterByBrand = false
                } label: {
                    Label("Alle Anbieter anzeigen", systemImage: "line.3.horizontal.decrease.circle")
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Filter Chip
struct FilterChip: View {
    let label: String
    let icon: String
    @Binding var isActive: Bool

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { isActive.toggle() }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption2)
                Text(label)
                    .font(.caption)
                    .fontWeight(.medium)
                if isActive {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isActive ? Color.blue.opacity(0.15) : Color(.systemGray5))
            .foregroundStyle(isActive ? .blue : .secondary)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(isActive ? Color.blue.opacity(0.3) : .clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Service Provider Row (compact, for search results)
struct ServiceProviderSearchRow: View {
    let provider: ServiceProvider
    let userLocation: CLLocation?

    /// Distance in km from user to provider
    private var distanceText: String? {
        guard let userLoc = userLocation else { return nil }
        // Skip providers without valid coordinates
        guard provider.latitude != 0 || provider.longitude != 0 else { return nil }
        let provLoc = CLLocation(latitude: provider.latitude, longitude: provider.longitude)
        let distanceMeters = userLoc.distance(from: provLoc)
        let distanceKm = distanceMeters / 1000.0
        if distanceKm < 1 {
            return String(format: "%.0f m", distanceMeters)
        } else if distanceKm < 100 {
            return String(format: "%.1f km", distanceKm)
        } else {
            return String(format: "%.0f km", distanceKm)
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            // Logo or icon
            if let url = provider.logoUrl.usableImageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        providerIcon
                    }
                }
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                providerIcon
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(provider.name)
                    .font(.subheadline)
                    .fontWeight(.semibold)

                HStack(spacing: 6) {
                    if !provider.displayAddress.isEmpty {
                        Text(provider.displayAddress)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if let dist = distanceText {
                        Text("·")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                        HStack(spacing: 2) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 8))
                            Text(dist)
                        }
                        .font(.caption)
                        .foregroundStyle(.blue)
                    }
                }

                // Brands + Services
                let brandChips = (provider.brands ?? []).prefix(3)
                let serviceChips = (provider.services ?? []).prefix(3)
                if !brandChips.isEmpty || !serviceChips.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(Array(brandChips), id: \.self) { brand in
                            Text(brand)
                                .font(.system(size: 9))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.1))
                                .foregroundStyle(.orange)
                                .clipShape(Capsule())
                        }
                        ForEach(Array(serviceChips), id: \.self) { svc in
                            Text(svc)
                                .font(.system(size: 9))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.blue.opacity(0.1))
                                .foregroundStyle(.blue)
                                .clipShape(Capsule())
                        }
                    }
                    .lineLimit(1)
                }
            }

            Spacer()

            // Rating
            VStack(alignment: .trailing, spacing: 4) {
                if let rating = provider.rating, rating > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var providerIcon: some View {
        Image(systemName: provider.categoryIcon)
            .font(.title3)
            .foregroundStyle(.blue)
            .frame(width: 44, height: 44)
            .background(Color.blue.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
