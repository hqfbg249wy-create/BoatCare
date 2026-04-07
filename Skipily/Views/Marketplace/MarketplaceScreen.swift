//
//  MarketplaceScreen.swift
//  Skipily
//

import SwiftUI

// MARK: - Marketplace Screen
struct MarketplaceScreen: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @StateObject private var providerManager = ServiceProviderManager()

    @State private var promotionProviders: [BoatServiceProvider] = []
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var selectedProvider: BoatServiceProvider?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("general.loading".loc)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = loadError {
                    errorState(message: error)
                } else if promotionProviders.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(promotionProviders) { provider in
                                PromotionCard(provider: provider)
                                    .onTapGesture { selectedProvider = provider }
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("marketplace.title".loc)
            .navigationBarTitleDisplayMode(.large)
            .sheet(item: $selectedProvider) { provider in
                NavigationStack {
                    ServiceProviderDetailView(provider: toServiceProvider(provider))
                        .environmentObject(favoritesManager)
                        .environmentObject(authService)
                }
            }
            .task { await loadPromotions() }
            .refreshable { await loadPromotions() }
        }
    }

    // MARK: - Empty State
    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "tag.slash.fill")
                .font(.system(size: 64))
                .foregroundStyle(.orange.opacity(0.3))
            Text("marketplace.no_offers".loc)
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
            Text("marketplace.no_offers_hint".loc)
                .font(.subheadline)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button {
                Task { await loadPromotions() }
            } label: {
                Label("general.refresh".loc, systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Error State
    private func errorState(message: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.red.opacity(0.7))
            Text("general.error".loc)
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
            Text(message)
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button {
                Task { await loadPromotions() }
            } label: {
                Label("general.retry".loc, systemImage: "arrow.clockwise")
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Load
    private func loadPromotions() async {
        isLoading = true
        loadError = nil
        providerManager.setSupabase(authService.supabase)
        do {
            promotionProviders = try await providerManager.loadProvidersWithPromotionThrowing()
        } catch {
            loadError = error.localizedDescription
            print("❌ Marketplace-Fehler: \(error)")
        }
        isLoading = false
    }

    // MARK: - Convert BoatServiceProvider → ServiceProvider for Detail View
    private func toServiceProvider(_ p: BoatServiceProvider) -> ServiceProvider {
        ServiceProvider(
            id: p.id,
            user_id: nil,
            name: p.name,
            category: p.category,
            category2: p.category2,
            category3: p.category3,
            street: p.street,
            city: p.city,
            postalCode: p.postal_code,
            country: p.country,
            latitude: p.latitude,
            longitude: p.longitude,
            phone: p.phone,
            email: p.email,
            website: p.website,
            description: p.description,
            logoUrl: p.logo_url,
            coverImageUrl: nil,
            galleryUrls: nil,
            slogan: nil,
            rating: p.rating,
            reviewCount: p.review_count,
            services: p.services,
            products: p.products,
            brands: p.brands,
            openingHours: p.opening_hours,
            createdAt: nil,
            updatedAt: nil,
            currentPromotion: p.current_promotion,
            shopUrl: p.shop_url
        )
    }
}

// MARK: - Promotion Card
struct PromotionCard: View {
    let provider: BoatServiceProvider

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: Logo + Name + Kategorie
            HStack(spacing: 12) {
                if let url = provider.logo_url.usableImageURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                        default:
                            Image(systemName: "building.2.fill")
                                .foregroundStyle(.gray)
                        }
                    }
                    .frame(width: 52, height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    Image(systemName: "building.2.fill")
                        .font(.title)
                        .foregroundStyle(.blue)
                        .frame(width: 52, height: 52)
                        .background(Color.blue.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(provider.name)
                        .font(.headline)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text(LanguageManager.shared.localizedCategory(provider.category))
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.1))
                            .foregroundStyle(.blue)
                            .cornerRadius(4)
                        if !provider.address.isEmpty {
                            Text(provider.address)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                Spacer()

                // Rating
                if let rating = provider.rating, rating > 0 {
                    VStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .foregroundStyle(.yellow)
                            .font(.caption)
                        Text(String(format: "%.1f", rating))
                            .font(.caption2)
                            .fontWeight(.semibold)
                    }
                }
            }
            .padding()

            Divider()

            // Angebot
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "tag.fill")
                        .foregroundStyle(.orange)
                        .font(.subheadline)
                    Text("marketplace.offer".loc)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.orange)
                }

                if let promo = provider.current_promotion {
                    Text(promo)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Ablaufdatum
                if let until = provider.promotion_valid_until {
                    HStack(spacing: 4) {
                        Image(systemName: "calendar")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("marketplace.valid_until".loc + " \(until)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Aktions-Buttons
                HStack(spacing: 10) {
                    if let shopUrl = provider.shop_url, let url = URL(string: shopUrl) {
                        Button {
                            UIApplication.shared.open(url)
                        } label: {
                            Label("marketplace.to_shop".loc, systemImage: "cart.fill")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Color.orange)
                                .foregroundStyle(.white)
                                .cornerRadius(8)
                        }
                    } else if let website = provider.website {
                        Button {
                            var urlStr = website
                            if !urlStr.hasPrefix("http") { urlStr = "https://" + urlStr }
                            if let url = URL(string: urlStr) {
                                UIApplication.shared.open(url)
                            }
                        } label: {
                            Label("marketplace.to_website".loc, systemImage: "globe")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Color.blue)
                                .foregroundStyle(.white)
                                .cornerRadius(8)
                        }
                    }

                    if let phone = provider.phone {
                        Button {
                            if let url = URL(string: "tel://\(phone.replacingOccurrences(of: " ", with: ""))") {
                                UIApplication.shared.open(url)
                            }
                        } label: {
                            Image(systemName: "phone.fill")
                                .font(.subheadline)
                                .frame(width: 44, height: 36)
                                .background(Color.green)
                                .foregroundStyle(.white)
                                .cornerRadius(8)
                        }
                    }
                }
            }
            .padding()
        }
        .background(.background)
        .cornerRadius(14)
        .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
    }
}
