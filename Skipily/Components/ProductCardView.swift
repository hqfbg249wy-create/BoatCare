//
//  ProductCardView.swift
//  Skipily
//
//  Reusable product card component for grid/list display
//

import SwiftUI

struct ProductCardView: View {
    let product: Product
    var promotionBadge: String? = nil
    var discountedPrice: String? = nil

    @ObservedObject private var translator = TranslationService.shared
    @ObservedObject private var langManager = LanguageManager.shared

    private var displayName: String {
        translator.name(for: product, lang: langManager.currentLanguage.code)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Product Image with discount badge overlay — uniform size
            ZStack(alignment: .topTrailing) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(AppColors.gray100)

                    if let url = product.firstImageURL {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(minWidth: 0, maxWidth: .infinity)
                            case .failure:
                                productPlaceholder
                            default:
                                ProgressView()
                            }
                        }
                    } else {
                        productPlaceholder
                    }
                }
                .frame(height: 150)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Discount badge
                if let badge = promotionBadge {
                    Text(badge)
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(AppColors.error)
                        .clipShape(Capsule())
                        .padding(6)
                }
            }

            // Stock badge
            if !product.isAvailable {
                Text("shop.unavailable".loc)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(AppColors.error)
                    .clipShape(Capsule())
            }

            // Product name (localized via TranslationService cache)
            Text(displayName)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(2)
                .foregroundStyle(AppColors.gray900)

            // Manufacturer
            if let manufacturer = product.manufacturer {
                Text(manufacturer)
                    .font(.caption)
                    .foregroundStyle(AppColors.gray500)
            }

            Spacer(minLength: 0)

            // Price (with optional discount display)
            VStack(alignment: .leading, spacing: 2) {
                if let discountedPrice {
                    // Original price with strikethrough
                    Text(product.displayPrice)
                        .font(.caption)
                        .strikethrough()
                        .foregroundStyle(AppColors.gray400)

                    // Discounted price
                    Text(discountedPrice)
                        .font(.headline)
                        .foregroundStyle(AppColors.primary)
                } else {
                    Text(product.displayPrice)
                        .font(.headline)
                        .foregroundStyle(AppColors.primary)
                }

                if let shipping = product.shippingCost, shipping == 0 {
                    Text("shop.free_shipping".loc)
                        .font(.caption2)
                        .foregroundStyle(AppColors.success)
                }
            }
        }
        .padding(12)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    }

    private var productPlaceholder: some View {
        Image(systemName: "shippingbox")
            .font(.system(size: 36))
            .foregroundStyle(AppColors.gray300)
    }
}

#Preview {
    ProductCardView(
        product: Product(
            id: UUID(),
            providerId: nil,
            categoryId: nil,
            name: "Impeller Jabsco 1210-0001",
            description: "Original Jabsco Impeller",
            manufacturer: "Jabsco",
            partNumber: "1210-0001",
            price: 24.90,
            currency: "EUR",
            shippingCost: 0,
            deliveryDays: 3,
            inStock: true,
            sku: nil,
            ean: nil,
            weightKg: nil,
            stockQuantity: 45,
            minOrderQuantity: 1,
            isActive: true,
            fitsBoatTypes: nil,
            fitsManufacturers: nil,
            compatibleEquipment: nil,
            tags: nil,
            images: nil,
            imageUrl: nil,
            source: nil,
            createdAt: nil,
            updatedAt: nil,
            category: nil,
            provider: nil
        ),
        promotionBadge: "10% Rabatt",
        discountedPrice: "22,41 EUR"
    )
    .frame(width: 180)
    .padding()
}
