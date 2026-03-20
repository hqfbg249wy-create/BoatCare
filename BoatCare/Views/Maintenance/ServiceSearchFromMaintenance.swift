//
//  ServiceSearchFromMaintenance.swift
//  BoatCare
//
//  Shows service providers relevant to a specific equipment item from the maintenance screen
//

import SwiftUI
import Supabase
import CoreLocation

struct ServiceSearchFromMaintenance: View {
    let equipmentName: String
    let category: String

    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @StateObject private var locationManager = LocationManager()

    @State private var providers: [ServiceProvider] = []
    @State private var isLoading = true
    @State private var searchText = ""

    private var filteredProviders: [ServiceProvider] {
        var result = providers

        // Apply search filter
        if !searchText.isEmpty {
            let term = searchText.lowercased()
            result = result.filter {
                $0.name.lowercased().contains(term) ||
                $0.category.lowercased().contains(term) ||
                ($0.services ?? []).contains(where: { $0.lowercased().contains(term) }) ||
                ($0.city ?? "").lowercased().contains(term)
            }
        }

        return result
    }

    var body: some View {
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
        .navigationTitle("Service: \(equipmentName)")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Anbieter suchen...")
        .task {
            locationManager.requestPermission()
            await loadProviders()
        }
    }

    private func loadProviders() async {
        isLoading = true
        do {
            let allProviders: [ServiceProvider] = try await authService.supabase
                .from("service_providers")
                .select()
                .execute()
                .value

            // Sort: matching categories first, then by distance (if location available), then by rating
            let matchCategories = categoryKeywords(for: category)
            let userLoc = locationManager.location

            let sorted = allProviders.sorted { a, b in
                let aMatch = providerMatchesCategory(a, keywords: matchCategories)
                let bMatch = providerMatchesCategory(b, keywords: matchCategories)
                if aMatch != bMatch { return aMatch }

                // If both match (or both don't), sort by distance
                if let loc = userLoc {
                    let distA = loc.distance(from: CLLocation(latitude: a.latitude, longitude: a.longitude))
                    let distB = loc.distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
                    return distA < distB
                }

                return (a.rating ?? 0) > (b.rating ?? 0)
            }

            await MainActor.run { providers = sorted }
        } catch {
            print("❌ Service-Anbieter laden: \(error)")
        }
        isLoading = false
    }

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

    private func categoryKeywords(for equipmentCategory: String) -> [String] {
        let cat = equipmentCategory.lowercased()
        if cat.contains("motor") || cat.contains("engine") || cat.contains("antrieb") {
            return ["motor", "werkstatt", "engine", "mechani"]
        } else if cat.contains("elektr") || cat.contains("electronic") || cat.contains("navigation") || cat.contains("instrument") {
            return ["elektr", "electronic", "instrument", "navigation"]
        } else if cat.contains("segel") || cat.contains("sail") || cat.contains("rigg") {
            return ["segel", "sail", "rigg"]
        } else if cat.contains("sicherheit") || cat.contains("safety") || cat.contains("rettung") {
            return ["sicherheit", "safety", "rettung"]
        } else if cat.contains("sanitaer") || cat.contains("wasser") || cat.contains("pump") {
            return ["sanitaer", "sanit", "pump", "wasser"]
        } else if cat.contains("lack") || cat.contains("paint") || cat.contains("antifouling") {
            return ["lack", "paint", "werft", "yard"]
        } else if cat.contains("heiz") || cat.contains("klima") {
            return ["heiz", "klima", "heat"]
        }
        return []
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.system(size: 48))
                .foregroundStyle(.orange.opacity(0.3))
            Text("Keine Service-Anbieter gefunden")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("Fuer \(equipmentName) (\(category)) wurden noch keine passenden Anbieter hinterlegt.")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            if let logoUrl = provider.logoUrl, let url = URL(string: logoUrl) {
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

                // Services
                if let services = provider.services, !services.isEmpty {
                    Text(services.prefix(3).joined(separator: " · "))
                        .font(.caption2)
                        .foregroundStyle(.blue)
                        .lineLimit(1)
                }
            }

            Spacer()

            // Rating + Distance column
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
