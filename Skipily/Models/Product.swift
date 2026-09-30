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
    /// Produktvarianten-Optionen (Shop-Standard), z. B. Durchmesser/Größe/Farbe.
    /// Format: [{ name, values: [] }]. Null/leer = Produkt ohne Varianten.
    let variantOptions: [VariantOption]?
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
        case variantOptions = "variant_options"
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

    /// Hat das Produkt konfigurierbare Varianten (mind. eine Option mit Werten)?
    var hasVariants: Bool {
        (variantOptions ?? []).contains { !$0.name.isEmpty && !$0.values.isEmpty }
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

/// Navigationsziel für ein Produkt. Product ist NUR über `id` hashbar; wenn
/// dasselbe Produkt gleichzeitig in mehreren Bereichen (Empfehlungen, Deals,
/// Raster) als NavigationLink erscheint, sind die Werte identisch und SwiftUI
/// aktiviert dann nur EINEN Link — die übrigen „Details"-Buttons wirken tot
/// (v. a. auf dem iPad, wo mehr Kacheln gleichzeitig sichtbar sind). Ein
/// Kontext-Diskriminator macht die Werte je Platzierung eindeutig.
struct ProductRoute: Hashable {
    let product: Product
    let context: String
}

/// Eine Varianten-Option eines Produkts, z. B. { name: "Durchmesser",
/// values: ["6mm","8mm","10mm"] }. Liegt als JSONB in metashop_products.
struct VariantOption: Codable, Hashable, Sendable {
    let name: String
    let values: [String]
    /// Optional als Farboption markiert (Farbfeld statt reinem Text).
    let isColor: Bool?
    /// Optionaler Farbcode je Wert (z. B. RAL/Gelcoat -> Hex), Wert -> "#rrggbb".
    let swatches: [String: String]?

    enum CodingKeys: String, CodingKey {
        case name, values
        case isColor = "is_color"
        case swatches
    }
}

/// Eine konkrete Varianten-Kombination (Zeile in product_variants) mit eigenem
/// Preis/Bestand/SKU/Bild. `attributes` = { "Durchmesser": "6mm", ... }.
struct ProductVariant: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let productId: UUID
    let sku: String?
    let attributes: [String: String]
    let price: Double?
    let stockQuantity: Int?
    let inStock: Bool?
    let images: [String]?
    let imageUrl: String?
    let isActive: Bool?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case productId = "product_id"
        case sku, attributes, price, images
        case stockQuantity = "stock_quantity"
        case inStock = "in_stock"
        case imageUrl = "image_url"
        case isActive = "is_active"
        case sortOrder = "sort_order"
    }

    /// Bildergalerie der Variante (bis zu 5). Faellt auf das Einzelbild zurueck.
    var galleryImages: [String] {
        if let imgs = images, !imgs.isEmpty { return imgs }
        if let single = imageUrl, !single.isEmpty { return [single] }
        return []
    }

    /// Lesbare Kurzbeschreibung, z. B. "Durchmesser: 8mm, Farbe: Blau".
    func label(for options: [VariantOption]) -> String {
        options.compactMap { opt in
            attributes[opt.name].map { "\(opt.name): \($0)" }
        }.joined(separator: ", ")
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
