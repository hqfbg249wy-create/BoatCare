//
//  ProviderShopSearchView.swift
//  BoatCare
//
//  Shows products from a specific provider or all products, filtered by search term
//

import SwiftUI

struct ProviderShopSearchView: View {
    let providerId: UUID
    let providerName: String
    let searchTerm: String

    @State private var products: [Product] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    private let productService = ProductService.shared
    private let promotionService = PromotionService.shared

    /// True if searching across all providers (providerId is a dummy UUID)
    private var isGlobalSearch: Bool {
        providerName == "Alle"
    }

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Header
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.orange)
                    Text(isGlobalSearch ? "Suche: \(searchTerm)" : providerName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(products.count) Produkte")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                if isLoading {
                    ProgressView("Produkte laden...")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if let error = errorMessage {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle)
                            .foregroundStyle(.orange)
                        Text(error)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        Button("Erneut versuchen") {
                            Task { await loadProducts() }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
                } else if products.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "shippingbox")
                            .font(.system(size: 48))
                            .foregroundStyle(.gray.opacity(0.3))
                        Text("Keine passenden Produkte gefunden")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Text("Versuche es mit einem anderen Suchbegriff")
                            .font(.callout)
                            .foregroundStyle(.tertiary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
                } else {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(products) { product in
                            NavigationLink {
                                ProductDetailView(product: product)
                            } label: {
                                ProductCardView(
                                    product: product,
                                    promotionBadge: promotionService.promotionBadgeText(for: product),
                                    discountedPrice: promotionService.displayDiscountedPrice(for: product)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.top, 8)
        }
        .navigationTitle(searchTerm)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadProducts() }
    }

    private func loadProducts() async {
        isLoading = true
        errorMessage = nil
        do {
            if isGlobalSearch {
                // Search across all products
                products = try await productService.fetchProducts(
                    searchQuery: searchTerm,
                    limit: 40,
                    offset: 0
                )
            } else {
                // Load from specific provider
                let allProducts = try await productService.fetchProductsByProvider(providerId: providerId)
                let term = searchTerm.lowercased()
                products = allProducts.filter { product in
                    if product.name.lowercased().contains(term) { return true }
                    if product.manufacturer?.lowercased().contains(term) == true { return true }
                    if product.description?.lowercased().contains(term) == true { return true }
                    if product.tags?.contains(where: { $0.lowercased().contains(term) }) == true { return true }
                    return false
                }
                // If no exact match, show all provider products
                if products.isEmpty { products = allProducts }
            }
        } catch {
            errorMessage = "Fehler: \(error.localizedDescription)"
        }
        isLoading = false
    }
}
