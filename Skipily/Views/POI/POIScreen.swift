//
//  POIScreen.swift
//  Skipily
//

import SwiftUI
import MapKit
import Supabase

struct POIScreen: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager

    @State private var favoriteProviders: [BoatServiceProvider] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showingResetConfirm = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView("general.loading".loc)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = errorMessage {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.orange)
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                    Button {
                        Task { await loadFavorites() }
                    } label: {
                        Label("Erneut versuchen", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if favoriteProviders.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(favoriteProviders) { provider in
                        FavoriteRow(provider: provider) {
                            favoritesManager.toggle(provider.id)
                            favoriteProviders.removeAll { $0.id == provider.id }
                        }
                    }
                    .onDelete { offsets in
                        for index in offsets {
                            let provider = favoriteProviders[index]
                            favoritesManager.toggle(provider.id)
                        }
                        favoriteProviders.remove(atOffsets: offsets)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("poi.favorites".loc)
        .toolbar {
            if !favoritesManager.favoriteIDs.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .destructive) {
                        showingResetConfirm = true
                    } label: {
                        Image(systemName: "trash")
                    }
                }
            }
        }
        .confirmationDialog(
            "Alle Favoriten zurücksetzen?",
            isPresented: $showingResetConfirm,
            titleVisibility: .visible
        ) {
            Button("Alle löschen", role: .destructive) {
                Task {
                    await favoritesManager.clearAllForCurrentUser()
                    favoriteProviders = []
                }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Entfernt ALLE markierten Anbieter aus deinem Profil. Diese Aktion kann nicht rückgängig gemacht werden.")
        }
        .task {
            await loadFavorites()
        }
    }

    // MARK: - Load only favorited providers by ID

    private func loadFavorites() async {
        let ids = favoritesManager.favoriteIDs
        guard !ids.isEmpty else {
            isLoading = false
            favoriteProviders = []
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let idStrings = ids.map { $0.uuidString }
            let result: [BoatServiceProvider] = try await authService.supabase
                .from("service_providers")
                .select()
                .in("id", values: idStrings)
                .execute()
                .value

            favoriteProviders = result
            print("✅ POIScreen: \(result.count) Favoriten geladen (von \(ids.count) IDs)")

            // Bereinige IDs die nicht mehr in der DB existieren
            let foundIDs = Set(result.map { $0.id })
            let orphanIDs = ids.subtracting(foundIDs)
            for orphan in orphanIDs {
                print("⚠️ Favorit \(orphan) nicht mehr in DB - wird entfernt")
                favoritesManager.toggle(orphan)
            }
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
            print("❌ POIScreen Fehler: \(error)")
        }

        isLoading = false
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "heart.slash.fill")
                .font(.system(size: 60))
                .foregroundStyle(.pink.opacity(0.3))
            Text("poi.no_favorites".loc)
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("poi.no_favorites_hint".loc)
                .font(.subheadline)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if favoritesManager.favoriteIDs.isEmpty {
                Text("Markiere Provider mit ❤️ auf der Karte")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            Button {
                Task { await loadFavorites() }
            } label: {
                Label("general.refresh".loc, systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Favorite Row

struct FavoriteRow: View {
    let provider: BoatServiceProvider
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {

            // MARK: Header: Logo + Name + Adresse + Herz-Button
            HStack(spacing: 12) {
                // Logo
                if let url = provider.logo_url.usableImageURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                        default:
                            categoryIconView
                        }
                    }
                    .frame(width: 48, height: 48)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    categoryIconView
                }

                // Name + Adresse
                VStack(alignment: .leading, spacing: 2) {
                    Text(provider.name)
                        .font(.headline)
                        .lineLimit(1)
                    if !provider.address.isEmpty {
                        Text(provider.address)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    // Kategorie-Badge
                    Text(provider.category.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption2)
                        .foregroundStyle(.blue)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.1))
                        .clipShape(Capsule())

                    // Bewertung
                    if let rating = provider.rating, rating > 0 {
                        HStack(spacing: 4) {
                            ForEach(0..<5) { index in
                                Image(systemName: index < Int(rating.rounded()) ? "star.fill" : "star")
                                    .font(.caption2)
                                    .foregroundStyle(.yellow)
                            }
                            Text(String(format: "%.1f", rating))
                                .font(.caption)
                                .foregroundColor(.secondary)
                            if let count = provider.review_count, count > 0 {
                                Text("(\(count))")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                Spacer()

                // Favorit entfernen
                Button { onRemove() } label: {
                    Image(systemName: "heart.fill")
                        .foregroundStyle(.pink)
                        .font(.title3)
                }
                .buttonStyle(.plain)
            }

            // MARK: Kontakt-Buttons: Route | Telefon | E-Mail | Website
            let hasRoute   = provider.latitude != 0 || provider.longitude != 0
            let hasPhone   = provider.phone != nil
            let hasEmail   = provider.email != nil
            let hasWebsite = provider.website != nil

            if hasRoute || hasPhone || hasEmail || hasWebsite {
                HStack(spacing: 10) {
                    if hasRoute {
                        contactButton(
                            icon: "arrow.triangle.turn.up.right.circle.fill",
                            label: "provider.route".loc,
                            color: .blue
                        ) {
                            openInMaps(provider: provider)
                        }
                    }
                    if let phone = provider.phone {
                        contactButton(
                            icon: "phone.fill",
                            label: "provider.phone".loc,
                            color: .green
                        ) {
                            if let url = URL(string: "tel://\(phone.replacingOccurrences(of: " ", with: ""))") {
                                UIApplication.shared.open(url)
                            }
                        }
                    }
                    if let email = provider.email {
                        contactButton(
                            icon: "envelope.fill",
                            label: "provider.email".loc,
                            color: .indigo
                        ) {
                            if let url = URL(string: "mailto:\(email)") {
                                UIApplication.shared.open(url)
                            }
                        }
                    }
                    if let website = provider.website {
                        contactButton(
                            icon: "globe",
                            label: "provider.website".loc,
                            color: .purple
                        ) {
                            var urlStr = website
                            if !urlStr.hasPrefix("http") { urlStr = "https://" + urlStr }
                            if let url = URL(string: urlStr) {
                                UIApplication.shared.open(url)
                            }
                        }
                    }
                    Spacer()
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Helpers

    private var categoryIconView: some View {
        Image(systemName: "building.2.fill")
            .font(.title2)
            .foregroundStyle(.blue)
            .frame(width: 48, height: 48)
            .background(Color.blue.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func contactButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundStyle(color)
                    .frame(width: 42, height: 42)
                    .background(color.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(label)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }

    private func openInMaps(provider: BoatServiceProvider) {
        let coord = CLLocationCoordinate2D(latitude: provider.latitude, longitude: provider.longitude)
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coord))
        item.name = provider.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
    }
}
