//
//  ProductCategory.swift
//  Skipily
//
//  Product category model matching product_categories table
//

import Foundation

struct ProductCategory: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let slug: String?
    let nameDe: String
    let nameEn: String
    let parentId: UUID?
    let icon: String?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id, slug
        case nameDe = "name_de"
        case nameEn = "name_en"
        case parentId = "parent_id"
        case icon
        case sortOrder = "sort_order"
    }

    var displayName: String {
        // DE = Quelle. Für alle anderen Sprachen nutzen wir das Englisch-Feld
        // als saubere Fallback-Übersetzung (Kategorien sind kurz & generisch).
        let code = LanguageManager.shared.currentLanguage.code
        return code == "de" ? nameDe : nameEn
    }

    var sfSymbol: String {
        switch icon {
        case "paint-bucket": return "paintbrush.fill"
        case "settings": return "gearshape.fill"
        case "wind": return "wind"
        case "cpu": return "cpu"
        case "anchor": return "anchor.circle.fill"
        case "shield": return "shield.fill"
        case "droplets": return "drop.fill"
        case "sparkles": return "sparkles"
        case "truck": return "car.fill"
        case "shirt": return "tshirt.fill"
        default: return "tag.fill"
        }
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: ProductCategory, rhs: ProductCategory) -> Bool {
        lhs.id == rhs.id
    }
}
