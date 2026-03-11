//
//  ProductCardView.swift
//  BoatCare
//
//  Reusable product card component for grid/list display
//

import SwiftUI

struct ProductCardView: View {
    let product: Product

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Product Image
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
            .frame(height: 140)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Stock badge
            if !product.isAvailable {
                Text("Nicht verfügbar")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(AppColors.error)
                    .clipShape(Capsule())
            }

            // Product name
            Text(product.name)
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

            // Price
            VStack(alignment: .leading, spacing: 2) {
                Text(product.displayPrice)
                    .font(.headline)
                    .foregroundStyle(AppColors.primary)

                if let shipping = product.shippingCost, shipping == 0 {
                    Text("Kostenloser Versand")
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
    ProductCardView(product: Product(
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
        source: nil,
        createdAt: nil,
        updatedAt: nil,
        category: nil,
        provider: nil
    ))
    .frame(width: 180)
    .padding()
}
