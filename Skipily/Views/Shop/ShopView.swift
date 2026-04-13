//
//  ShopView.swift
//  Skipily
//
//  Main shop screen with category navigation, search, recommendations, and product grid
//

import SwiftUI
import Supabase

struct ShopView: View {
    @EnvironmentObject var authService: AuthService
    @Environment(CartManager.self) private var cartManager

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
    @State private var showFilters = false
    @State private var minPrice: String = ""
    @State private var maxPrice: String = ""
    @State private var searchHistory: [String] = UserDefaults.standard.stringArray(forKey: "shopSearchHistory") ?? []
    @State private var equipmentKeywords: [String] = []
    @State private var equipmentDealProducts: [Product] = []
    @State private var cartToast: String?

    private let productService = ProductService.shared
    private let recommendationService = RecommendationService.shared
    private let promotionService = PromotionService.shared
    private let pageSize = 20

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Search bar
            searchBar

            ScrollView {
                LazyVStack(spacing: 16) {
                    // Search history chips (when search is empty and focused)
                    if searchText.isEmpty && !searchHistory.isEmpty {
                        searchHistoryChips
                    }

                    // Equipment quick-search (when authenticated and search is empty)
                    if searchText.isEmpty && !equipmentKeywords.isEmpty && selectedCategory == nil {
                        equipmentQuickSearch
                    }

                    // Filter bar
                    if showFilters {
                        priceFilter
                    }

                    // Active promotions banner
                    if !promotionService.activePromotions.isEmpty && searchText.isEmpty && selectedCategory == nil {
                        promotionsBanner
                    }

                    // Equipment deals section (promoted products matching user equipment)
                    if !equipmentDealProducts.isEmpty && searchText.isEmpty && selectedCategory == nil {
                        equipmentDealsSection
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
                        HStack(spacing: 8) {
                            if selectedCategory != nil || selectedSubcategory != nil {
                                Button {
                                    if selectedSubcategory != nil {
                                        selectedSubcategory = nil
                                    } else {
                                        selectedCategory = nil
                                    }
                                    Task { await loadProducts() }
                                } label: {
                                    HStack(spacing: 4) {
                                        Image(systemName: "chevron.left")
                                            .font(.subheadline.weight(.semibold))
                                        Text("Zurück")
                                            .font(.subheadline)
                                    }
                                    .foregroundStyle(AppColors.primary)
                                }
                                .buttonStyle(.plain)
                            }
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
            await loadEquipmentKeywords()
            await loadEquipmentDeals()
        }
        .overlay(alignment: .bottom) {
            if let toast = cartToast {
                HStack(spacing: 8) {
                    Image(systemName: "cart.fill")
                        .foregroundStyle(.white)
                    Text("\(toast) hinzugefuegt")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(AppColors.success)
                .clipShape(Capsule())
                .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
                .padding(.bottom, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.spring(duration: 0.3), value: cartToast)
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
                    Button {
                        // Search for products matching this promotion's categories
                        if let cats = promo.filterCategories, let first = cats.first {
                            searchText = first
                            Task { await loadProducts() }
                        }
                    } label: {
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

                            HStack(spacing: 4) {
                                if let until = promo.validUntil {
                                    Text("Bis \(until)")
                                        .font(.caption2)
                                        .foregroundStyle(.white.opacity(0.7))
                                }
                                Spacer()
                                Image(systemName: "arrow.right.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.8))
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
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Equipment Deals Section

    private var equipmentDealsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "flame.fill")
                    .foregroundStyle(AppColors.error)
                Text("Angebote fuer deine Ausruestung")
                    .font(.headline)
                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(equipmentDealProducts) { product in
                        equipmentDealCard(product)
                    }
                }
            }
        }
    }

    private func equipmentDealCard(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Tappable area navigates to product detail
            NavigationLink(value: product) {
                VStack(alignment: .leading, spacing: 6) {
                    // Image with discount badge overlay
                    ZStack(alignment: .topTrailing) {
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
                        .frame(width: 160, height: 110)
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                        // Discount badge
                        if let badge = promotionService.promotionBadgeText(for: product) {
                            Text(badge)
                                .font(.caption2)
                                .fontWeight(.bold)
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(AppColors.error)
                                .clipShape(Capsule())
                                .padding(6)
                        }
                    }

                    // Provider name
                    if let provider = product.provider {
                        Text(provider.companyName ?? "")
                            .font(.caption2)
                            .foregroundStyle(AppColors.primary)
                            .lineLimit(1)
                    }

                    Text(product.name)
                        .font(.caption)
                        .fontWeight(.medium)
                        .lineLimit(2)
                        .foregroundStyle(AppColors.gray900)

                    // Price with discount
                    if let discountedPrice = promotionService.displayDiscountedPrice(for: product) {
                        HStack(spacing: 4) {
                            Text(product.displayPrice)
                                .font(.caption2)
                                .strikethrough()
                                .foregroundStyle(AppColors.gray400)
                            Text(discountedPrice)
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundStyle(AppColors.error)
                        }
                    } else {
                        Text(product.displayPrice)
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundStyle(AppColors.primary)
                    }
                }
            }
            .buttonStyle(.plain)

            // Add to cart button
            Button {
                cartManager.addToCart(product: product)
                cartToast = product.name
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    if cartToast == product.name { cartToast = nil }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: cartManager.contains(productId: product.id) ? "checkmark" : "cart.badge.plus")
                        .font(.caption2)
                    Text(cartManager.contains(productId: product.id) ? "Im Warenkorb" : "In den Warenkorb")
                        .font(.caption2)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(cartManager.contains(productId: product.id) ? AppColors.success : AppColors.primary)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .frame(width: 160)
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(AppColors.primary.opacity(0.3), lineWidth: 1.5)
        )
        .shadow(color: AppColors.primary.opacity(0.1), radius: 6, y: 2)
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
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(AppColors.gray700)

                TextField("Produkte suchen...", text: $searchText)
                    .foregroundStyle(AppColors.gray900)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit {
                        saveToSearchHistory(searchText)
                        Task { await loadProducts() }
                    }

                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        Task { await loadProducts() }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(AppColors.gray500)
                    }
                }
            }
            .padding(12)
            .background(Color(.systemGray6))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(AppColors.gray300, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Filter-Button
            Button {
                withAnimation { showFilters.toggle() }
            } label: {
                Image(systemName: showFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    .font(.title3)
                    .foregroundStyle(showFilters ? AppColors.primary : AppColors.gray500)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Search History Chips

    private var searchHistoryChips: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Letzte Suchen")
                    .font(.caption)
                    .foregroundStyle(AppColors.gray500)
                Spacer()
                Button {
                    searchHistory.removeAll()
                    UserDefaults.standard.removeObject(forKey: "shopSearchHistory")
                } label: {
                    Text("Loeschen")
                        .font(.caption2)
                        .foregroundStyle(AppColors.gray400)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(searchHistory.prefix(5), id: \.self) { term in
                        Button {
                            searchText = term
                            Task { await loadProducts() }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "clock.arrow.circlepath")
                                    .font(.caption2)
                                Text(term)
                                    .font(.caption)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(AppColors.gray100)
                            .foregroundStyle(AppColors.gray700)
                            .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    // MARK: - Equipment Quick Search

    private var equipmentQuickSearch: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "gearshape.2.fill")
                    .foregroundStyle(AppColors.primary)
                    .font(.caption)
                Text("Passend zu deiner Ausruestung")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(AppColors.gray700)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(equipmentKeywords, id: \.self) { keyword in
                        Button {
                            searchText = keyword
                            saveToSearchHistory(keyword)
                            Task { await loadProducts() }
                        } label: {
                            Text(keyword)
                                .font(.caption)
                                .fontWeight(.medium)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(AppColors.primary.opacity(0.1))
                                .foregroundStyle(AppColors.primary)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    // MARK: - Price Filter

    private var priceFilter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Preisbereich")
                .font(.caption)
                .foregroundStyle(AppColors.gray500)
            HStack(spacing: 10) {
                HStack {
                    Text("Min")
                        .font(.caption2)
                        .foregroundStyle(AppColors.gray400)
                    TextField("0", text: $minPrice)
                        .keyboardType(.decimalPad)
                        .font(.caption)
                        .frame(width: 60)
                    Text("EUR")
                        .font(.caption2)
                        .foregroundStyle(AppColors.gray400)
                }
                .padding(8)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))

                Text("–")
                    .foregroundStyle(AppColors.gray400)

                HStack {
                    Text("Max")
                        .font(.caption2)
                        .foregroundStyle(AppColors.gray400)
                    TextField("999", text: $maxPrice)
                        .keyboardType(.decimalPad)
                        .font(.caption)
                        .frame(width: 60)
                    Text("EUR")
                        .font(.caption2)
                        .foregroundStyle(AppColors.gray400)
                }
                .padding(8)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))

                Button {
                    Task { await loadProducts() }
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(AppColors.primary)
                }
            }
        }
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: - Search Helpers

    private func saveToSearchHistory(_ term: String) {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        searchHistory.removeAll { $0 == trimmed }
        searchHistory.insert(trimmed, at: 0)
        if searchHistory.count > 10 { searchHistory = Array(searchHistory.prefix(10)) }
        UserDefaults.standard.set(searchHistory, forKey: "shopSearchHistory")
    }

    private func loadEquipmentKeywords() async {
        guard authService.isAuthenticated, let userId = authService.currentUser?.id else { return }
        do {
            // Load user boats
            struct BoatBasic: Codable { let id: UUID }
            let boats: [BoatBasic] = try await authService.supabase
                .from("boats").select("id")
                .eq("owner_id", value: userId.uuidString)
                .execute().value

            var keywords = Set<String>()
            for boat in boats {
                struct EquipBasic: Codable { let name: String; let manufacturer: String?; let category: String }
                let equipment: [EquipBasic] = try await authService.supabase
                    .from("equipment").select("name,manufacturer,category")
                    .eq("boat_id", value: boat.id.uuidString)
                    .execute().value

                for eq in equipment {
                    if let mfr = eq.manufacturer, !mfr.isEmpty { keywords.insert(mfr) }
                    keywords.insert(eq.category)
                }
            }
            await MainActor.run { equipmentKeywords = Array(keywords).sorted().prefix(8).map { $0 } }
        } catch {
            AppLog.error("Equipment-Keywords laden: \(error)")
        }
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
            AppLog.error("Failed to load categories: \(error)")
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
            var loaded = try await productService.fetchProducts(
                categoryId: categoryFilter,
                searchQuery: searchText.isEmpty ? nil : searchText,
                limit: pageSize,
                offset: 0
            )

            // Client-side price filter
            let minP = Double(minPrice.replacingOccurrences(of: ",", with: "."))
            let maxP = Double(maxPrice.replacingOccurrences(of: ",", with: "."))
            if minP != nil || maxP != nil {
                loaded = loaded.filter { product in
                    guard let price = product.price else { return true }
                    if let min = minP, price < min { return false }
                    if let max = maxP, price > max { return false }
                    return true
                }
            }

            // Sort: promoted products first
            loaded.sort { a, b in
                let aHasPromo = promotionService.bestPromotion(for: a) != nil
                let bHasPromo = promotionService.bestPromotion(for: b) != nil
                if aHasPromo != bHasPromo { return aHasPromo }
                return false
            }

            products = loaded
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
            AppLog.error("Failed to load more products: \(error)")
        }
        isLoadingMore = false
    }

    // MARK: - Equipment Deals

    private func loadEquipmentDeals() async {
        guard authService.isAuthenticated, let userId = authService.currentUser?.id else { return }
        guard !promotionService.activePromotions.isEmpty else { return }

        do {
            // Collect equipment manufacturers and categories from user's boats
            struct BoatBasic: Codable { let id: UUID }
            let boats: [BoatBasic] = try await authService.supabase
                .from("boats").select("id")
                .eq("owner_id", value: userId.uuidString)
                .execute().value

            var manufacturers = Set<String>()
            var equipCategories = Set<String>()

            for boat in boats {
                struct EquipBasic: Codable { let manufacturer: String?; let category: String }
                let equipment: [EquipBasic] = try await authService.supabase
                    .from("equipment").select("manufacturer,category")
                    .eq("boat_id", value: boat.id.uuidString)
                    .execute().value

                for eq in equipment {
                    if let mfr = eq.manufacturer, !mfr.isEmpty { manufacturers.insert(mfr.lowercased()) }
                    equipCategories.insert(eq.category.lowercased())
                }
            }

            guard !manufacturers.isEmpty || !equipCategories.isEmpty else { return }

            // Get all products from providers that have active promotions
            let promoProviderIds = Set(promotionService.activePromotions.map { $0.providerId })
            var dealProducts: [Product] = []

            for providerId in promoProviderIds {
                let providerProducts = try await productService.fetchProductsByProvider(providerId: providerId)
                dealProducts.append(contentsOf: providerProducts)
            }

            // Filter: must have a promotion AND match equipment (manufacturer or category keyword)
            let matched = dealProducts.filter { product in
                guard promotionService.bestPromotion(for: product) != nil else { return false }

                let nameL = product.name.lowercased()
                let mfgL = (product.manufacturer ?? "").lowercased()
                let catSlug = (product.category?.slug ?? "").lowercased()
                let catName = (product.category?.displayName ?? "").lowercased()

                // Check manufacturer match
                let mfgMatch = manufacturers.contains(where: { mfr in
                    nameL.contains(mfr) || mfgL.contains(mfr)
                })

                // Check category match
                let catMatch = equipCategories.contains(where: { cat in
                    catSlug.contains(cat) || catName.contains(cat) || nameL.contains(cat)
                })

                return mfgMatch || catMatch
            }

            // Sort by discount percentage (highest first), limit to 10
            let sorted = matched.sorted { a, b in
                let discA = promotionService.bestPromotion(for: a)?.discountValue ?? 0
                let discB = promotionService.bestPromotion(for: b)?.discountValue ?? 0
                return discA > discB
            }

            // Remove duplicates that are already in recommendations
            let recIds = Set(recommendationService.recommendedProducts.map { $0.id })
            let unique = sorted.filter { !recIds.contains($0.id) }

            equipmentDealProducts = Array(unique.prefix(10))
        } catch {
            AppLog.error("Equipment deals laden: \(error)")
        }
    }
}
