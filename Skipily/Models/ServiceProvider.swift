//
//  ServiceProvider.swift
//  Skipily
//
//  Robust model for the `service_providers` table. Uses a hand-written
//  init(from:) so that a single NULL or unexpected type on any row does
//  NOT crash the entire array decode (which was the bug causing empty
//  search results in ServiceSearchFromMaintenance).
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
    let createdAt: String?
    let updatedAt: String?
    var currentPromotion: String?
    var shopUrl: String?

    enum CodingKeys: String, CodingKey {
        case id
        case user_id
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

    // MARK: - Robust decoder (mirrors BoatServiceProvider approach)
    // Every optional field uses try? so a missing key or null value is safe.
    // Non-optional fields have sensible defaults.

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)

        id          = try c.decode(UUID.self, forKey: .id)
        name        = (try? c.decode(String.self, forKey: .name)) ?? ""
        category    = (try? c.decode(String.self, forKey: .category)) ?? ""
        user_id     = try? c.decode(UUID.self, forKey: .user_id)
        category2   = try? c.decode(String.self, forKey: .category2)
        category3   = try? c.decode(String.self, forKey: .category3)
        street      = try? c.decode(String.self, forKey: .street)
        city        = try? c.decode(String.self, forKey: .city)
        postalCode  = try? c.decode(String.self, forKey: .postalCode)
        country     = try? c.decode(String.self, forKey: .country)
        latitude    = (try? c.decode(Double.self, forKey: .latitude)) ?? 0.0
        longitude   = (try? c.decode(Double.self, forKey: .longitude)) ?? 0.0
        phone       = try? c.decode(String.self, forKey: .phone)
        email       = try? c.decode(String.self, forKey: .email)
        website     = try? c.decode(String.self, forKey: .website)
        description = try? c.decode(String.self, forKey: .description)
        logoUrl     = try? c.decode(String.self, forKey: .logoUrl)
        coverImageUrl = try? c.decode(String.self, forKey: .coverImageUrl)
        galleryUrls = try? c.decode([String].self, forKey: .galleryUrls)
        slogan      = try? c.decode(String.self, forKey: .slogan)
        openingHours = try? c.decode(String.self, forKey: .openingHours)
        currentPromotion = try? c.decode(String.self, forKey: .currentPromotion)
        shopUrl     = try? c.decode(String.self, forKey: .shopUrl)

        // Dates as strings (Supabase returns ISO 8601, not epoch)
        createdAt   = try? c.decode(String.self, forKey: .createdAt)
        updatedAt   = try? c.decode(String.self, forKey: .updatedAt)

        // Rating: can be Int (0) or Double (4.3)
        if let d = try? c.decode(Double.self, forKey: .rating) {
            rating = d
        } else if let i = try? c.decode(Int.self, forKey: .rating) {
            rating = Double(i)
        } else {
            rating = nil
        }

        // review_count
        if let i = try? c.decode(Int.self, forKey: .reviewCount) {
            reviewCount = i
        } else {
            reviewCount = nil
        }

        // Arrays: nil if missing or empty
        let rawServices = try? c.decode([String].self, forKey: .services)
        services = (rawServices?.isEmpty == true) ? nil : rawServices

        let rawProducts = try? c.decode([String].self, forKey: .products)
        products = (rawProducts?.isEmpty == true) ? nil : rawProducts

        let rawBrands = try? c.decode([String].self, forKey: .brands)
        brands = (rawBrands?.isEmpty == true) ? nil : rawBrands
    }

    // MARK: - Full memberwise init (used by toServiceProvider converters)
    init(id: UUID, user_id: UUID? = nil, name: String, category: String,
         category2: String? = nil, category3: String? = nil,
         street: String? = nil, city: String? = nil, postalCode: String? = nil, country: String? = nil,
         latitude: Double = 0, longitude: Double = 0,
         phone: String? = nil, email: String? = nil, website: String? = nil,
         description: String? = nil, logoUrl: String? = nil, coverImageUrl: String? = nil,
         galleryUrls: [String]? = nil, slogan: String? = nil,
         rating: Double? = nil, reviewCount: Int? = nil,
         services: [String]? = nil, products: [String]? = nil, brands: [String]? = nil,
         openingHours: String? = nil, createdAt: String? = nil, updatedAt: String? = nil,
         currentPromotion: String? = nil, shopUrl: String? = nil) {
        self.id = id; self.user_id = user_id; self.name = name; self.category = category
        self.category2 = category2; self.category3 = category3
        self.street = street; self.city = city; self.postalCode = postalCode; self.country = country
        self.latitude = latitude; self.longitude = longitude
        self.phone = phone; self.email = email; self.website = website
        self.description = description; self.logoUrl = logoUrl; self.coverImageUrl = coverImageUrl
        self.galleryUrls = galleryUrls; self.slogan = slogan
        self.rating = rating; self.reviewCount = reviewCount
        self.services = services; self.products = products; self.brands = brands
        self.openingHours = openingHours; self.createdAt = createdAt; self.updatedAt = updatedAt
        self.currentPromotion = currentPromotion; self.shopUrl = shopUrl
    }

    // MARK: - Computed Properties

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
        default:
            return "building.2.fill"
        }
    }
}

/// Typealias fuer Abwaertskompatibilitaet (andere Views nutzen noch den Singular)
typealias ServiceProvider = ServiceProviders
