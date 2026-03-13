//
//  ServiceProvider.swift
//  BoatCare
//

import Foundation
import CoreLocation

struct ServiceProviders: Identifiable, Codable {
    let id: UUID
    let user_id: UUID?
    let name: String
    let category: String
    let category2: String?
    let category3: String?
    let street: String?
    let city: String?
    let postalCode: String?
    let country: String?
    let latitude: Double
    let longitude: Double
    let phone: String?
    let email: String?
    let website: String?
    let description: String?
    let logoUrl: String?
    let coverImageUrl: String?
    let galleryUrls: [String]?
    let slogan: String?
    let rating: Double?
    let reviewCount: Int?
    let services: [String]?
    let products: [String]?
    let brands: [String]?
    let openingHours: String?
    let createdAt: Date?
    let updatedAt: Date?
    var currentPromotion: String?
    var shopUrl: String?

    enum CodingKeys: String, CodingKey {
        case id
        case user_id = "user_id"
        case name
        case category
        case category2
        case category3
        case street
        case city
        case postalCode = "postal_code"
        case country
        case latitude
        case longitude
        case phone
        case email
        case website
        case description
        case logoUrl = "logo_url"
        case coverImageUrl = "cover_image_url"
        case galleryUrls = "gallery_urls"
        case slogan
        case rating
        case reviewCount = "review_count"
        case services
        case products
        case brands
        case openingHours = "opening_hours"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case currentPromotion = "current_promotion"
        case shopUrl = "shop_url"
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var displayAddress: String {
        var parts: [String] = []
        if let s = street { parts.append(s) }
        if let c = city { parts.append(c) }
        return parts.joined(separator: ", ")
    }

    @available(*, deprecated, renamed: "street")
    var address: String? { street }

    /// Alle nicht-leeren Kategorien als Array (primary zuerst)
    var allCategories: [String] {
        var cats = [category]
        if let c2 = category2, !c2.isEmpty { cats.append(c2) }
        if let c3 = category3, !c3.isEmpty { cats.append(c3) }
        return cats
    }

    var categoryDisplayName: String {
        return LanguageManager.shared.localizedCategory(category)
    }

    var categoryIcon: String {
        switch category.lowercased() {
        case "werkstatt", "repair", "motor service":
            return "wrench.and.screwdriver.fill"
        case "motorservice", "motor_service":
            return "engine.combustion.fill"
        case "segelmacher", "sailmaker":
            return "sail"
        case "instrumente", "instruments", "marine electronics":
            return "antenna.radiowaves.left.and.right"
        case "zubehör", "marine supplies", "ausrüstung":
            return "cart.fill"
        case "bootsbauer", "yard", "werft", "shipyard":
            return "ferry.fill"
        case "tankstelle", "fuel":
            return "fuelpump.fill"
        case "rigg", "rigging":
            return "arrow.up.and.down.and.arrow.left.and.right"
        case "gutachter", "surveyor":
            return "doc.text.magnifyingglass"
        case "kran", "crane":
            return "arrow.up.to.line"
        case "lackiererei", "lackierung", "painting":
            return "paintbrush.fill"
        case "heizung/klima", "heating_climate":
            return "thermometer.sun.fill"
        case "winterlager":
            return "snowflake"
        //case "marina":
          //  return "sailboat.fill"
        default:
            return "building.2.fill"
        }
    }
}

/// Typealias fuer Abwaertskompatibilitaet (andere Views nutzen noch den Singular)
typealias ServiceProvider = ServiceProviders
