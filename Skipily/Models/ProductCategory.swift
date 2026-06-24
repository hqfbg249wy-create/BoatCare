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
    // Weitere Sprachen (Migration 093). Optional, da nicht jede Kategorie
    // zwingend befüllt ist → Fallback über displayName.
    var nameFr: String? = nil
    var nameIt: String? = nil
    var nameEs: String? = nil
    var nameNl: String? = nil
    let parentId: UUID?
    let icon: String?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id, slug
        case nameDe = "name_de"
        case nameEn = "name_en"
        case nameFr = "name_fr"
        case nameIt = "name_it"
        case nameEs = "name_es"
        case nameNl = "name_nl"
        case parentId = "parent_id"
        case icon
        case sortOrder = "sort_order"
    }

    var displayName: String {
        // DE = Quelle. Übrige Sprachen aus dem jeweiligen Feld, mit Fallback
        // auf Englisch und zuletzt Deutsch (Kategorien sind kurz & generisch).
        switch LanguageManager.shared.currentLanguage.code {
        case "de": return nameDe
        case "fr": return nameFr ?? nameEn
        case "it": return nameIt ?? nameEn
        case "es": return nameEs ?? nameEn
        case "nl": return nameNl ?? nameEn
        default:   return nameEn
        }
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
