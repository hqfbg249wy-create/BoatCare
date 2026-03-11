//
//  UserProfile.swift
//  BoatCare
//
//  User profile model matching profiles table
//

import Foundation

struct UserProfile: Codable, Identifiable, Sendable {
    let id: UUID
    var fullName: String?
    var email: String?
    var role: String?
    var shippingStreet: String?
    var shippingCity: String?
    var shippingPostalCode: String?
    var shippingCountry: String?
    var preferredBoatId: UUID?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case email, role
        case shippingStreet = "shipping_street"
        case shippingCity = "shipping_city"
        case shippingPostalCode = "shipping_postal_code"
        case shippingCountry = "shipping_country"
        case preferredBoatId = "preferred_boat_id"
        case createdAt = "created_at"
    }

    var hasShippingAddress: Bool {
        shippingStreet != nil && shippingCity != nil && shippingPostalCode != nil
    }

    var displayAddress: String {
        guard hasShippingAddress else { return "Keine Lieferadresse" }
        return "\(shippingStreet ?? "")\n\(shippingPostalCode ?? "") \(shippingCity ?? "")\n\(shippingCountry ?? "DE")"
    }
}

struct ShippingAddress: Sendable {
    var name: String = ""
    var street: String = ""
    var city: String = ""
    var postalCode: String = ""
    var country: String = "DE"

    var isComplete: Bool {
        !name.isEmpty && !street.isEmpty && !city.isEmpty && !postalCode.isEmpty
    }
}
