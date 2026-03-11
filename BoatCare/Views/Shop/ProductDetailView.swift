//
//  ProductDetailView.swift
//  BoatCare
//
//  Product detail screen with images, info, and add-to-cart
//

import SwiftUI

struct ProductDetailView: View {
    let product: Product
    @Environment(CartManager.self) private var cartManager

    @State private var quantity = 1
    @State private var showAddedToast = false
    @State private var selectedImageIndex = 0

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

                    // Price
                    HStack(alignment: .bottom, spacing: 8) {
                        Text(product.displayPrice)
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundStyle(AppColors.primary)

                        Text(product.displayShipping)
                            .font(.caption)
                            .foregroundStyle(AppColors.gray500)
                    }

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
}
