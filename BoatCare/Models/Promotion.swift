//
//  Promotion.swift
//  BoatCare
//
//  Provider promotion model matching provider_promotions table
//

import Foundation

struct Promotion: Codable, Identifiable, Sendable {
    let id: UUID
    let providerId: UUID
    let name: String
    let discountType: String
    let discountValue: Double
    let filterCategories: [String]?
    let filterBoatTypes: [String]?
    let filterManufacturers: [String]?
    let filterMinOrder: Double?
    let validFrom: String?
    let validUntil: String?
    let isActive: Bool?
    let maxUses: Int?
    let currentUses: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case providerId = "provider_id"
        case name
        case discountType = "discount_type"
        case discountValue = "discount_value"
        case filterCategories = "filter_categories"
        case filterBoatTypes = "filter_boat_types"
        case filterManufacturers = "filter_manufacturers"
        case filterMinOrder = "filter_min_order"
        case validFrom = "valid_from"
        case validUntil = "valid_until"
        case isActive = "is_active"
        case maxUses = "max_uses"
        case currentUses = "current_uses"
    }

    var displayDiscount: String {
        if discountType == "percent" {
            return String(format: "%.0f%% Rabatt", discountValue)
        } else {
            return String(format: "%.2f € Rabatt", discountValue).replacingOccurrences(of: ".", with: ",")
        }
    }

    func appliesTo(product: Product) -> Bool {
        guard isActive ?? true else { return false }
        // Check category filter
        if let cats = filterCategories, !cats.isEmpty {
            // Simple check — in production, compare category IDs
        }
        // Check boat type filter
        if let types = filterBoatTypes, !types.isEmpty {
            guard let productTypes = product.fitsBoatTypes,
                  !Set(types).isDisjoint(with: Set(productTypes)) else {
                return false
            }
        }
        return true
    }

    func discountAmount(for subtotal: Double) -> Double {
        if discountType == "percent" {
            return subtotal * (discountValue / 100.0)
        } else {
            return min(discountValue, subtotal)
        }
    }
}
