//
//  ShopView.swift
//  BoatCare
//
//  Main shop screen with category navigation, search, and product grid
//

import SwiftUI

struct ShopView: View {
    @State private var searchText = ""
    @State private var categories: [ProductCategory] = []
    @State private var subcategories: [ProductCategory] = []
    @State private var products: [Product] = []
    @State private var selectedCategory: ProductCategory?
    @State private var selectedSubcategory: ProductCategory?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private let productService = ProductService.shared
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
                        // Category chips
                        categoryChips

                        // Subcategory chips (if category selected)
                        if !subcategories.isEmpty {
                            subcategoryChips
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
            }
        }
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
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(products) { product in
                NavigationLink(value: product) {
                    ProductCardView(product: product)
                }
                .buttonStyle(.plain)
            }
        }
        .navigationDestination(for: Product.self) { product in
            ProductDetailView(product: product)
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
        do {
            let categoryFilter = selectedSubcategory?.id ?? selectedCategory?.id
            products = try await productService.fetchProducts(
                categoryId: categoryFilter,
                searchQuery: searchText.isEmpty ? nil : searchText
            )
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
        }
        isLoading = false
    }
}
