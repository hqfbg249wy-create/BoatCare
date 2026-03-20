//
//  ProductDetailView.swift
//  BoatCare
//
//  Product detail screen with images, info, promotions, and add-to-cart
//

import SwiftUI

struct ProductDetailView: View {
    let product: Product
    @Environment(CartManager.self) private var cartManager
    @EnvironmentObject var authService: AuthService

    @State private var quantity = 1
    @State private var showAddedToast = false
    @State private var selectedImageIndex = 0
    @State private var similarProducts: [Product] = []
    @State private var providerProducts: [Product] = []
    @State private var showChat = false
    @State private var chatConversation: Conversation?

    private let promotionService = PromotionService.shared
    private let recommendationService = RecommendationService.shared

    private var bestPromotion: Promotion? {
        promotionService.bestPromotion(for: product)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Image Gallery
                imageGallery

                VStack(alignment: .leading, spacing: 16) {
                    // Category & Provider
                    HStack {
                        if let category = product.category {
                            Text(category.displayName)
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundStyle(AppColors.primary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(AppColors.primary.opacity(0.1))
                                .clipShape(Capsule())
                        }

                        Spacer()

                        if let provider = product.provider {
                            HStack(spacing: 4) {
                                Image(systemName: "building.2")
                                    .font(.caption2)
                                Text(provider.companyName ?? "")
                                    .font(.caption)
                            }
                            .foregroundStyle(AppColors.gray500)
                        }
                    }

                    // Name
                    Text(product.name)
                        .font(.title2)
                        .fontWeight(.bold)

                    // Manufacturer & Part Number
                    if let manufacturer = product.manufacturer {
                        HStack(spacing: 8) {
                            Text(manufacturer)
                                .font(.subheadline)
                                .foregroundStyle(AppColors.gray500)
                            if let partNumber = product.partNumber {
                                Text("Art.-Nr.: \(partNumber)")
                                    .font(.caption)
                                    .foregroundStyle(AppColors.gray400)
                            }
                        }
                    }

                    // Promotion Banner
                    if let promo = bestPromotion {
                        promotionBanner(promo)
                    }

                    // Price
                    priceSection

                    Divider()

                    // Availability
                    availabilitySection

                    // Description
                    if let description = product.description {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Beschreibung")
                                .font(.headline)
                            Text(description)
                                .font(.body)
                                .foregroundStyle(AppColors.gray700)
                        }
                    }

                    // Compatibility
                    compatibilitySection

                    Divider()

                    // Quantity + Add to Cart
                    addToCartSection

                    // Similar Products
                    if !similarProducts.isEmpty {
                        Divider()
                        similarProductsSection
                    }

                    // More from Provider
                    if !providerProducts.isEmpty {
                        Divider()
                        providerProductsSection
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .overlay(alignment: .top) {
            if showAddedToast {
                toastView
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .task {
            await loadRelatedProducts()
        }
    }

    // MARK: - Promotion Banner

    private func promotionBanner(_ promo: Promotion) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "tag.fill")
                .font(.title3)
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 2) {
                Text(promo.name)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                Text(promo.displayDiscount)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.9))
            }

            Spacer()

            if let until = promo.validUntil {
                Text("bis \(until)")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: [AppColors.primary, AppColors.primaryDark],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Price Section

    private var priceSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let discountedPrice = promotionService.displayDiscountedPrice(for: product) {
                // Original price strikethrough
                Text(product.displayPrice)
                    .font(.callout)
                    .strikethrough()
                    .foregroundStyle(AppColors.gray400)

                HStack(alignment: .bottom, spacing: 8) {
                    // Discounted price
                    Text(discountedPrice)
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundStyle(AppColors.primary)

                    // Savings badge
                    if let promo = bestPromotion {
                        Text("Spare \(promo.displayDiscount)")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(AppColors.success)
                            .clipShape(Capsule())
                    }
                }

                Text(product.displayShipping)
                    .font(.caption)
                    .foregroundStyle(AppColors.gray500)
            } else {
                HStack(alignment: .bottom, spacing: 8) {
                    Text(product.displayPrice)
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundStyle(AppColors.primary)

                    Text(product.displayShipping)
                        .font(.caption)
                        .foregroundStyle(AppColors.gray500)
                }
            }
        }
    }

    // MARK: - Image Gallery

    private var imageGallery: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedImageIndex) {
                if let images = product.images, !images.isEmpty {
                    ForEach(images.indices, id: \.self) { index in
                        AsyncImage(url: URL(string: images[index])) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                            default:
                                imagePlaceholder
                            }
                        }
                        .tag(index)
                    }
                } else {
                    imagePlaceholder
                        .tag(0)
                }
            }
            .tabViewStyle(.page)
            .frame(height: 300)
            .background(AppColors.gray50)

            if let images = product.images, images.count > 1 {
                HStack(spacing: 6) {
                    ForEach(images.indices, id: \.self) { index in
                        Circle()
                            .fill(selectedImageIndex == index ? AppColors.primary : AppColors.gray300)
                            .frame(width: 8, height: 8)
                    }
                }
                .padding(.bottom, 12)
            }
        }
    }

    private var imagePlaceholder: some View {
        VStack {
            Image(systemName: "photo")
                .font(.system(size: 48))
                .foregroundStyle(AppColors.gray300)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Availability

    private var availabilitySection: some View {
        HStack(spacing: 16) {
            // Stock status
            HStack(spacing: 6) {
                Circle()
                    .fill(product.isAvailable ? AppColors.success : AppColors.error)
                    .frame(width: 10, height: 10)
                Text(product.isAvailable ? "Auf Lager" : "Nicht verfügbar")
                    .font(.subheadline)
            }

            if let stock = product.stockQuantity, stock < 10 && stock > 0 {
                Text("Nur noch \(stock) Stück")
                    .font(.caption)
                    .foregroundStyle(AppColors.warning)
            }

            Spacer()

            // Delivery time
            if let days = product.deliveryDays {
                HStack(spacing: 4) {
                    Image(systemName: "truck.box")
                        .font(.caption)
                    Text("\(days) Werktage")
                        .font(.caption)
                }
                .foregroundStyle(AppColors.gray500)
            }
        }
    }

    // MARK: - Compatibility

    private var compatibilitySection: some View {
        Group {
            if product.fitsBoatTypes != nil || product.fitsManufacturers != nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Kompatibilität")
                        .font(.headline)

                    if let types = product.fitsBoatTypes, !types.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "sailboat")
                                .font(.caption)
                                .foregroundStyle(AppColors.info)
                            Text("Bootstypen: \(types.joined(separator: ", "))")
                                .font(.caption)
                                .foregroundStyle(AppColors.gray500)
                        }
                    }

                    if let manufacturers = product.fitsManufacturers, !manufacturers.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "wrench.and.screwdriver")
                                .font(.caption)
                                .foregroundStyle(AppColors.info)
                            Text("Hersteller: \(manufacturers.joined(separator: ", "))")
                                .font(.caption)
                                .foregroundStyle(AppColors.gray500)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Add to Cart

    private var addToCartSection: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Menge")
                    .font(.subheadline)
                    .foregroundStyle(AppColors.gray500)

                Spacer()

                QuantityStepperView(
                    quantity: $quantity,
                    minimum: product.minOrderQuantity ?? 1,
                    maximum: product.stockQuantity ?? 99
                )
            }

            Button {
                cartManager.addToCart(product: product, quantity: quantity)
                withAnimation(.spring(duration: 0.3)) {
                    showAddedToast = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    withAnimation { showAddedToast = false }
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "cart.badge.plus")
                    Text("In den Warenkorb")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(product.isAvailable ? AppColors.primary : AppColors.gray300)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(!product.isAvailable)
        }
        .padding(.bottom, 20)
    }

    // MARK: - Similar Products

    private var similarProductsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ähnliche Produkte")
                .font(.headline)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(similarProducts) { similar in
                        NavigationLink(value: similar) {
                            relatedProductCard(similar)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationDestination(for: Product.self) { prod in
            ProductDetailView(product: prod)
        }
    }

    private var providerProductsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Mehr von \(product.provider?.companyName ?? "diesem Anbieter")")
                    .font(.headline)
                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(providerProducts) { provProd in
                        NavigationLink(value: provProd) {
                            relatedProductCard(provProd)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func relatedProductCard(_ prod: Product) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(AppColors.gray100)

                if let url = prod.firstImageURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        default:
                            Image(systemName: "shippingbox")
                                .font(.system(size: 20))
                                .foregroundStyle(AppColors.gray300)
                        }
                    }
                } else {
                    Image(systemName: "shippingbox")
                        .font(.system(size: 20))
                        .foregroundStyle(AppColors.gray300)
                }
            }
            .frame(width: 120, height: 90)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Text(prod.name)
                .font(.caption)
                .fontWeight(.medium)
                .lineLimit(2)
                .foregroundStyle(AppColors.gray900)

            Text(prod.displayPrice)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(AppColors.primary)
        }
        .frame(width: 120)
        .padding(8)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 1)
    }

    // MARK: - Toast

    private var toastView: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
            Text("Zum Warenkorb hinzugefügt")
                .fontWeight(.medium)
        }
        .font(.subheadline)
        .foregroundStyle(.white)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(AppColors.success)
        .clipShape(Capsule())
        .shadow(radius: 8)
        .padding(.top, 8)
    }

    // MARK: - Data Loading

    private func loadRelatedProducts() async {
        do {
            similarProducts = try await recommendationService.fetchSimilarProducts(to: product)
        } catch {
            print("Failed to load similar products: \(error)")
        }

        do {
            providerProducts = try await recommendationService.fetchProviderProducts(for: product)
        } catch {
            print("Failed to load provider products: \(error)")
        }
    }
}
