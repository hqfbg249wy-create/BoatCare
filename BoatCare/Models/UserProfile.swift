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
    var stripeCustomerId: String?
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
        case stripeCustomerId = "stripe_customer_id"
        case createdAt = "created_at"
    }

    var hasShippingAddress: Bool {
        guard let street = shippingStreet, !street.isEmpty,
              let city = shippingCity, !city.isEmpty,
              let postal = shippingPostalCode, !postal.isEmpty else {
            return false
        }
        return true
    }

    var hasPaymentMethod: Bool {
        stripeCustomerId != nil && !(stripeCustomerId?.isEmpty ?? true)
    }

    var hasBoatSelected: Bool {
        preferredBoatId != nil
    }

    /// Profil-Vollständigkeit: 0.0 bis 1.0
    var completionProgress: Double {
        var steps = 0.0
        let total = 4.0
        if fullName != nil && !(fullName?.isEmpty ?? true) { steps += 1 }
        if hasShippingAddress { steps += 1 }
        if hasBoatSelected { steps += 1 }
        if hasPaymentMethod { steps += 1 }
        return steps / total
    }

    /// Welche Schritte fehlen noch
    var missingSteps: [String] {
        var missing: [String] = []
        if fullName == nil || (fullName?.isEmpty ?? true) { missing.append("Name") }
        if !hasShippingAddress { missing.append("Lieferadresse") }
        if !hasBoatSelected { missing.append("Boot auswählen") }
        if !hasPaymentMethod { missing.append("Zahlungsmethode") }
        return missing
    }

    var isComplete: Bool {
        completionProgress >= 1.0
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
