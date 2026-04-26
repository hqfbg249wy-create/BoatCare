//
//  Product.swift
//  Skipily
//
//  Product model matching metashop_products table
//

import Foundation

struct Product: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let providerId: UUID?
    let categoryId: UUID?
    let name: String
    let description: String?
    let manufacturer: String?
    let partNumber: String?
    let price: Double?
    let currency: String?
    let shippingCost: Double?
    let deliveryDays: Int?
    let inStock: Bool?
    let sku: String?
    let ean: String?
    let weightKg: Double?
    let stockQuantity: Int?
    let minOrderQuantity: Int?
    let isActive: Bool?
    let fitsBoatTypes: [String]?
    let fitsManufacturers: [String]?
    let compatibleEquipment: [String]?
    let tags: [String]?
    let images: [String]?
    /// Legacy single-image-Feld (wird vom Provider-Portal befüllt). Fällt
    /// als Fallback ein, wenn `images` (Array) leer/null ist.
    let imageUrl: String?
    let source: String?
    let createdAt: String?
    let updatedAt: String?

    // Joined data
    let category: ProductCategory?
    let provider: ServiceProviderBasic?

    enum CodingKeys: String, CodingKey {
        case id
        case providerId = "provider_id"
        case categoryId = "category_id"
        case name, description, manufacturer
        case partNumber = "part_number"
        case price, currency
        case shippingCost = "shipping_cost"
        case deliveryDays = "delivery_days"
        case inStock = "in_stock"
        case sku, ean
        case weightKg = "weight_kg"
        case stockQuantity = "stock_quantity"
        case minOrderQuantity = "min_order_quantity"
        case isActive = "is_active"
        case fitsBoatTypes = "fits_boat_types"
        case fitsManufacturers = "fits_manufacturers"
        case compatibleEquipment = "compatible_equipment"
        case tags, images
        case imageUrl = "image_url"
        case source
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case category = "product_categories"
        case provider = "service_providers"
    }

    var displayPrice: String {
        guard let price else { return "Preis auf Anfrage" }
        return String(format: "%.2f \(currency ?? "EUR")", price)
            .replacingOccurrences(of: ".", with: ",")
    }

    var displayShipping: String {
        guard let shippingCost else { return "" }
        if shippingCost == 0 { return "Kostenloser Versand" }
        return String(format: "zzgl. %.2f € Versand", shippingCost)
            .replacingOccurrences(of: ".", with: ",")
    }

    var isAvailable: Bool {
        (isActive ?? true) && (inStock ?? true) && (stockQuantity ?? 1) > 0
    }

    var firstImageURL: URL? {
        if let first = images?.first, let url = URL(string: first) {
            return url
        }
        // Fallback auf legacy `image_url`-Feld aus dem Provider-Portal
        if let single = imageUrl, !single.isEmpty {
            return URL(string: single)
        }
        return nil
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Product, rhs: Product) -> Bool {
        lhs.id == rhs.id
    }
}

struct ServiceProviderBasic: Codable, Sendable {
    let id: UUID
    let companyName: String?
    let city: String?

    enum CodingKeys: String, CodingKey {
        case id
        case companyName = "name"
        case city
    }
}
