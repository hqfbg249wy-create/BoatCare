//
//  UserProfile.swift
//  BoatCare
//
//  Merged user profile: original fields + shop/shipping + DSGVO
//

import Foundation

struct UserProfile: Codable, Identifiable, Sendable {
    // Core
    var id: UUID
    var fullName: String?
    var email: String?
    var role: String?

    // Original profile fields
    var username: String?
    var phoneNumber: String?
    var website: String?
    var avatarUrl: String?

    // Shipping address (shop)
    var shippingStreet: String?
    var shippingCity: String?
    var shippingPostalCode: String?
    var shippingCountry: String?

    // Boat preference (recommendations)
    var preferredBoatId: UUID?

    // Payment (Stripe)
    var stripeCustomerId: String?

    // DSGVO / Privacy
    var privacyAcceptedAt: Date?
    var termsAcceptedAt: Date?

    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case email, role, username
        case phoneNumber = "phone_number"
        case website
        case avatarUrl = "avatar_url"
        case shippingStreet = "shipping_street"
        case shippingCity = "shipping_city"
        case shippingPostalCode = "shipping_postal_code"
        case shippingCountry = "shipping_country"
        case preferredBoatId = "preferred_boat_id"
        case stripeCustomerId = "stripe_customer_id"
        case privacyAcceptedAt = "privacy_accepted_at"
        case termsAcceptedAt = "terms_accepted_at"
        case createdAt = "created_at"
    }

    /// Memberwise init (for creating new empty profiles)
    init(
        id: UUID = UUID(),
        fullName: String? = nil,
        email: String? = nil,
        role: String? = nil,
        username: String? = nil,
        phoneNumber: String? = nil,
        website: String? = nil,
        avatarUrl: String? = nil,
        shippingStreet: String? = nil,
        shippingCity: String? = nil,
        shippingPostalCode: String? = nil,
        shippingCountry: String? = nil,
        preferredBoatId: UUID? = nil,
        stripeCustomerId: String? = nil,
        privacyAcceptedAt: Date? = nil,
        termsAcceptedAt: Date? = nil,
        createdAt: String? = nil
    ) {
        self.id = id
        self.fullName = fullName
        self.email = email
        self.role = role
        self.username = username
        self.phoneNumber = phoneNumber
        self.website = website
        self.avatarUrl = avatarUrl
        self.shippingStreet = shippingStreet
        self.shippingCity = shippingCity
        self.shippingPostalCode = shippingPostalCode
        self.shippingCountry = shippingCountry
        self.preferredBoatId = preferredBoatId
        self.stripeCustomerId = stripeCustomerId
        self.privacyAcceptedAt = privacyAcceptedAt
        self.termsAcceptedAt = termsAcceptedAt
        self.createdAt = createdAt
    }

    // MARK: - Computed Properties

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

    var hasAcceptedPrivacy: Bool {
        privacyAcceptedAt != nil
    }

    /// Profile completion: 0.0 to 1.0
    var completionProgress: Double {
        var steps = 0.0
        let total = 4.0
        if fullName != nil && !(fullName?.isEmpty ?? true) { steps += 1 }
        if hasShippingAddress { steps += 1 }
        if hasBoatSelected { steps += 1 }
        if hasPaymentMethod { steps += 1 }
        return steps / total
    }

    var missingSteps: [String] {
        var missing: [String] = []
        if fullName == nil || (fullName?.isEmpty ?? true) { missing.append("Name") }
        if !hasShippingAddress { missing.append("Lieferadresse") }
        if !hasBoatSelected { missing.append("Boot ausw\u{00E4}hlen") }
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

// MARK: - Shipping Address (used in CheckoutView)

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
