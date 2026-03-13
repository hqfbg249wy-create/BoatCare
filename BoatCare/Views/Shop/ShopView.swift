//
//  ShopView.swift
//  BoatCare
//
//  Main shop screen with category navigation, search, recommendations, and product grid
//

import SwiftUI

struct ShopView: View {
    @EnvironmentObject var authService: AuthService

    @State private var searchText = ""
    @State private var categories: [ProductCategory] = []
    @State private var subcategories: [ProductCategory] = []
    @State private var products: [Product] = []
    @State private var selectedCategory: ProductCategory?
    @State private var selectedSubcategory: ProductCategory?
    @State private var isLoading = true
    @State private var isLoadingMore = false
    @State private var hasMoreProducts = true
    @State private var errorMessage: String?

    private let productService = ProductService.shared
    private let recommendationService = RecommendationService.shared
    private let promotionService = PromotionService.shared
    private let pageSize = 20

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                searchBar

                ScrollView {
                    LazyVStack(spacing: 16) {
                        // Active promotions banner
                        if !promotionService.activePromotions.isEmpty && searchText.isEmpty && selectedCategory == nil {
                            promotionsBanner
                        }

                        // Recommendations section (only on main page)
                        if !recommendationService.recommendedProducts.isEmpty && searchText.isEmpty && selectedCategory == nil {
                            recommendationsSection
                        }

                        // Category chips
                        categoryChips

                        // Subcategory chips (if category selected)
                        if !subcategories.isEmpty {
                            subcategoryChips
                        }

                        // Section title
                        if selectedCategory != nil || !searchText.isEmpty {
                            HStack {
                                Text(sectionTitle)
                                    .font(.headline)
                                Spacer()
                                Text("\(products.count) Produkte")
                                    .font(.caption)
                                    .foregroundStyle(AppColors.gray400)
                            }
                        }

                        // Products grid
                        if isLoading {
                            loadingView
                        } else if let error = errorMessage {
                            errorView(error)
                        } else if products.isEmpty {
                            emptyView
                        } else {
                            productGrid
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle("Shop")
            .task {
                await loadCategories()
                await loadProducts()
                await promotionService.loadActivePromotions()
                await recommendationService.loadRecommendations(for: authService.userProfile)
            }
        }
    }

    private var sectionTitle: String {
        if !searchText.isEmpty {
            return "Suchergebnisse"
        } else if let sub = selectedSubcategory {
            return sub.displayName
        } else if let cat = selectedCategory {
            return cat.displayName
        }
        return "Alle Produkte"
    }

    // MARK: - Promotions Banner

    private var promotionsBanner: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(promotionService.activePromotions.prefix(3)) { promo in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Image(systemName: "tag.fill")
                                .font(.caption)
                                .foregroundStyle(.white)
                            Text(promo.displayDiscount)
                                .font(.subheadline)
                                .fontWeight(.bold)
                                .foregroundStyle(.white)
                        }

                        Text(promo.name)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.9))
                            .lineLimit(1)

                        if let until = promo.validUntil {
                            Text("Gültig bis \(until)")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.7))
                        }
                    }
                    .padding(14)
                    .frame(width: 200)
                    .background(
                        LinearGradient(
                            colors: [AppColors.primary, AppColors.primaryDark],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
        }
    }

    // MARK: - Recommendations Section

    private var recommendationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(AppColors.primary)
                Text("Empfohlen für Dich")
                    .font(.headline)
                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(recommendationService.recommendedProducts) { product in
                        NavigationLink(value: product) {
                            recommendationCard(product)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationDestination(for: Product.self) { product in
            ProductDetailView(product: product)
        }
    }

    private func recommendationCard(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Image
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(AppColors.gray100)

                if let url = product.firstImageURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        default:
                            Image(systemName: "shippingbox")
                                .font(.system(size: 24))
                                .foregroundStyle(AppColors.gray300)
                        }
                    }
                } else {
                    Image(systemName: "shippingbox")
                        .font(.system(size: 24))
                        .foregroundStyle(AppColors.gray300)
                }
            }
            .frame(width: 140, height: 100)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Discount badge
            if let badge = promotionService.promotionBadgeText(for: product) {
                Text(badge)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(AppColors.error)
                    .clipShape(Capsule())
            }

            Text(product.name)
                .font(.caption)
                .fontWeight(.medium)
                .lineLimit(2)
                .foregroundStyle(AppColors.gray900)

            // Price with discount
            if let discountedPrice = promotionService.displayDiscountedPrice(for: product) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(product.displayPrice)
                        .font(.caption2)
                        .strikethrough()
                        .foregroundStyle(AppColors.gray400)
                    Text(discountedPrice)
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(AppColors.primary)
                }
            } else {
                Text(product.displayPrice)
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(AppColors.primary)
            }
        }
        .frame(width: 140)
        .padding(10)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(AppColors.gray500)

            TextField("Produkte suchen...", text: $searchText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit {
                    Task { await loadProducts() }
                }

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                    Task { await loadProducts() }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(AppColors.gray400)
                }
            }
        }
        .padding(12)
        .background(AppColors.gray100)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Category Chips

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                CategoryChipView(
                    category: ProductCategory(
                        id: UUID(),
                        slug: "all",
                        nameDe: "Alle",
                        nameEn: "All",
                        parentId: nil,
                        icon: nil,
                        sortOrder: 0
                    ),
                    isSelected: selectedCategory == nil
                ) {
                    selectedCategory = nil
                    selectedSubcategory = nil
                    subcategories = []
                    Task { await loadProducts() }
                }

                ForEach(categories) { category in
                    CategoryChipView(
                        category: category,
                        isSelected: selectedCategory?.id == category.id
                    ) {
                        if selectedCategory?.id == category.id {
                            selectedCategory = nil
                            selectedSubcategory = nil
                            subcategories = []
                        } else {
                            selectedCategory = category
                            selectedSubcategory = nil
                            Task {
                                await loadSubcategories(for: category)
                            }
                        }
                        Task { await loadProducts() }
                    }
                }
            }
        }
    }

    private var subcategoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(subcategories) { sub in
                    Button {
                        if selectedSubcategory?.id == sub.id {
                            selectedSubcategory = nil
                        } else {
                            selectedSubcategory = sub
                        }
                        Task { await loadProducts() }
                    } label: {
                        Text(sub.displayName)
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(selectedSubcategory?.id == sub.id ? AppColors.primaryDark : AppColors.gray200)
                            .foregroundStyle(selectedSubcategory?.id == sub.id ? .white : AppColors.gray700)
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    // MARK: - Product Grid

    private var productGrid: some View {
        VStack(spacing: 12) {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(products) { product in
                    NavigationLink(value: product) {
                        ProductCardView(
                            product: product,
                            promotionBadge: promotionService.promotionBadgeText(for: product),
                            discountedPrice: promotionService.displayDiscountedPrice(for: product)
                        )
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        // Infinite scroll: load more when nearing the end
                        if product.id == products.last?.id && hasMoreProducts && !isLoadingMore {
                            Task { await loadMoreProducts() }
                        }
                    }
                }
            }
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }

            // Loading more indicator
            if isLoadingMore {
                ProgressView()
                    .padding(.vertical, 16)
            }
        }
    }

    // MARK: - State Views

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Produkte werden geladen...")
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(AppColors.warning)
            Text(message)
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
            Button("Erneut versuchen") {
                Task { await loadProducts() }
            }
            .foregroundStyle(AppColors.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "shippingbox")
                .font(.system(size: 48))
                .foregroundStyle(AppColors.gray300)
            Text("Keine Produkte gefunden")
                .font(.headline)
                .foregroundStyle(AppColors.gray500)
            if !searchText.isEmpty {
                Text("Versuche einen anderen Suchbegriff")
                    .font(.callout)
                    .foregroundStyle(AppColors.gray400)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Data Loading

    private func loadCategories() async {
        do {
            categories = try await productService.fetchParentCategories()
        } catch {
            print("Failed to load categories: \(error)")
        }
    }

    private func loadSubcategories(for category: ProductCategory) async {
        do {
            subcategories = try await productService.fetchSubcategories(parentId: category.id)
        } catch {
            subcategories = []
        }
    }

    private func loadProducts() async {
        isLoading = true
        errorMessage = nil
        hasMoreProducts = true
        do {
            let categoryFilter = selectedSubcategory?.id ?? selectedCategory?.id
            products = try await productService.fetchProducts(
                categoryId: categoryFilter,
                searchQuery: searchText.isEmpty ? nil : searchText,
                limit: pageSize,
                offset: 0
            )
            hasMoreProducts = products.count >= pageSize
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func loadMoreProducts() async {
        guard !isLoadingMore && hasMoreProducts else { return }
        isLoadingMore = true
        do {
            let categoryFilter = selectedSubcategory?.id ?? selectedCategory?.id
            let moreProducts = try await productService.fetchProducts(
                categoryId: categoryFilter,
                searchQuery: searchText.isEmpty ? nil : searchText,
                limit: pageSize,
                offset: products.count
            )
            products.append(contentsOf: moreProducts)
            hasMoreProducts = moreProducts.count >= pageSize
        } catch {
            print("Failed to load more products: \(error)")
        }
        isLoadingMore = false
    }
}
