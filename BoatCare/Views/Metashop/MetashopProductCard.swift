//
//  MetashopProduct.swift
//  BoatCare
//
//  Metashop Produkt Model mit Bild-Support
//

import Foundation

struct MetashopProduct: Identifiable, Codable {
    let id: UUID
    let providerId: UUID?
    let name: String
    let manufacturer: String
    let partNumber: String?
    let price: Double
    let currency: String
    let shopName: String
    let shopUrl: String
    let imageUrl: String?
    let inStock: Bool
    let shippingCost: Double?
    let deliveryDays: Int?
    let rating: Double?
    let reviewCount: Int?
    let description: String?
    let category: String?
    
    // Rabatt-Informationen (optional)
    let discountId: UUID?
    let discountType: String?
    let discountValue: Double?
    let minPurchaseAmount: Double?
    let discountDescription: String?
    let discountedPrice: Double?
    let savings: Double?
    
    enum CodingKeys: String, CodingKey {
        case id
        case providerId = "provider_id"
        case name
        case manufacturer
        case partNumber = "part_number"
        case price
        case currency
        case shopName = "shop_name"
        case shopUrl = "shop_url"
        case imageUrl = "image_url"
        case inStock = "in_stock"
        case shippingCost = "shipping_cost"
        case deliveryDays = "delivery_days"
        case rating
        case reviewCount = "review_count"
        case description
        case category
        case discountId = "discount_id"
        case discountType = "discount_type"
        case discountValue = "discount_value"
        case minPurchaseAmount = "min_purchase_amount"
        case discountDescription = "discount_description"
        case discountedPrice = "discounted_price"
        case savings
    }
    
    var formattedPrice: String {
        String(format: "%.2f %@", price, currency)
    }
    
    var totalPrice: Double {
        price + (shippingCost ?? 0)
    }
    
    var formattedTotalPrice: String {
        String(format: "%.2f %@", totalPrice, currency)
    }
    
    // Zeige Rabatt-Preis falls vorhanden
    var displayPrice: Double {
        discountedPrice ?? price
    }
    
    var formattedDisplayPrice: String {
        String(format: "%.2f %@", displayPrice, currency)
    }
    
    var hasDiscount: Bool {
        discountId != nil && (savings ?? 0) > 0
    }
    
    var formattedSavings: String? {
        guard let savings = savings, savings > 0 else { return nil }
        return String(format: "%.2f %@", savings, currency)
    }
}

// Produkt-Bild Model
struct ProductImage: Identifiable, Codable {
    let id: UUID
    let productId: UUID
    let imageUrl: String
    let displayOrder: Int
    let isPrimary: Bool
    
    enum CodingKeys: String, CodingKey {
        case id
        case productId = "product_id"
        case imageUrl = "image_url"
        case displayOrder = "display_order"
        case isPrimary = "is_primary"
    }
}
