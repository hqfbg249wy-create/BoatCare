//
//  ProviderShopSearchView.swift
//  Skipily
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
    @State private var showBroaderSearchPrompt = false
    @State private var navigateToGlobal = false

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
                    ProgressView("shop.loading".loc)
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
                        Button("general.retry".loc) {
                            Task { await loadProducts() }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
                } else if products.isEmpty {
                    emptyStateWithAIFallback
                    // Hidden NavigationLink activated programmatically after user confirms
                    NavigationLink(destination: ProviderShopSearchView(
                        providerId: UUID(),
                        providerName: "Alle",
                        searchTerm: searchTerm
                    ), isActive: $navigateToGlobal) { EmptyView() }
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

    // MARK: - Empty state

    @ViewBuilder
    private var emptyStateWithAIFallback: some View {
        VStack(spacing: 24) {
            VStack(spacing: 12) {
                Image(systemName: "shippingbox")
                    .font(.system(size: 48))
                    .foregroundStyle(.gray.opacity(0.3))
                Text("shop.no_exact_match".loc)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Text(String(format: "shop.no_exact_match_hint".loc, searchTerm))
                    .font(.callout)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding(.top, 40)

            if !isGlobalSearch {
                Button {
                    showBroaderSearchPrompt = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                        Text("Bei allen Anbietern suchen")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.orange)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .padding(.horizontal, 32)
                .confirmationDialog(
                    "Keine Treffer bei \(providerName)",
                    isPresented: $showBroaderSearchPrompt,
                    titleVisibility: .visible
                ) {
                    Button("Alle Anbieter durchsuchen") {
                        navigateToGlobal = true
                    }
                    Button("Abbrechen", role: .cancel) { }
                } message: {
                    Text("Für „\(searchTerm)" gibt es bei \(providerName) keine Produkte. Soll bei allen Anbietern gesucht werden?")
                }
            }
        }
    }

    // MARK: - Loading

    private func loadProducts() async {
        isLoading = true
        errorMessage = nil
        do {
            if isGlobalSearch {
                // Breite Volltextsuche über name/manufacturer/description/part_number
                products = try await productService.searchProductsBroad(
                    query: searchTerm,
                    limit: 40
                )

                // Fallback auf die alte, enge Name-Suche falls der OR-Filter
                // (z.B. wegen PostgREST-Quirks) nichts liefert.
                if products.isEmpty {
                    products = try await productService.fetchProducts(
                        searchQuery: searchTerm,
                        limit: 40,
                        offset: 0
                    )
                }
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
            }
        } catch {
            errorMessage = "Fehler: \(error.localizedDescription)"
        }
        isLoading = false
    }

}
