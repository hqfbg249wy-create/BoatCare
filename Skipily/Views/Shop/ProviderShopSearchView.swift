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
    @State private var aiSuggestions: [Product] = []
    @State private var aiKeywords: [String] = []
    @State private var isLoading = true
    @State private var isLoadingAI = false
    @State private var errorMessage: String?

    private let productService = ProductService.shared
    private let promotionService = PromotionService.shared
    private let aiService = AIChatService.shared

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

    // MARK: - Empty state + AI fallback

    @ViewBuilder
    private var emptyStateWithAIFallback: some View {
        VStack(spacing: 20) {
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
            }
            .padding(.top, 40)

            if isLoadingAI {
                VStack(spacing: 8) {
                    ProgressView()
                    Text("shop.ai_searching".loc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 20)
            } else if !aiSuggestions.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .foregroundStyle(.orange)
                        Text("shop.ai_suggestions".loc)
                            .font(.headline)
                        Spacer()
                    }
                    if !aiKeywords.isEmpty {
                        Text("Gefunden über: \(aiKeywords.joined(separator: " · "))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(aiSuggestions) { product in
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
            } else if !aiKeywords.isEmpty {
                // AI hat Vorschläge gemacht, aber auch die lieferten 0 Treffer.
                VStack(spacing: 8) {
                    Text("Auch zu den KI-Vorschlägen (\(aiKeywords.joined(separator: ", "))) gab es keine passenden Produkte im Shop.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }
        }
    }

    // MARK: - Loading

    private func loadProducts() async {
        isLoading = true
        errorMessage = nil
        aiSuggestions = []
        aiKeywords = []
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
                // If no exact match, show all provider products
                if products.isEmpty { products = allProducts }
            }
        } catch {
            errorMessage = "Fehler: \(error.localizedDescription)"
        }
        isLoading = false

        // Wenn die direkte Suche nichts ergab → AI-Fallback starten
        if products.isEmpty && errorMessage == nil {
            await runAIFallback()
        }
    }

    /// Fragt Claude nach alternativen Suchbegriffen und re-queryed damit den Shop.
    private func runAIFallback() async {
        isLoadingAI = true
        defer { isLoadingAI = false }

        do {
            let alternatives = try await aiService.suggestSearchAlternatives(
                originalQuery: searchTerm
            )
            aiKeywords = alternatives
            guard !alternatives.isEmpty else { return }

            // Für jedes Keyword eine kleine Suche und Ergebnisse dedupen.
            var seen = Set<UUID>()
            var collected: [Product] = []
            for keyword in alternatives {
                if let found = try? await productService.searchProductsBroad(
                    query: keyword,
                    limit: 10
                ) {
                    for product in found where !seen.contains(product.id) {
                        seen.insert(product.id)
                        collected.append(product)
                    }
                }
                // Harte Obergrenze, sonst wird's unübersichtlich
                if collected.count >= 24 { break }
            }
            aiSuggestions = collected
        } catch {
            // AI nicht erreichbar oder nicht eingeloggt – wir zeigen einfach
            // den regulären Leerzustand, kein zusätzlicher Fehler.
            aiKeywords = []
            aiSuggestions = []
        }
    }
}
