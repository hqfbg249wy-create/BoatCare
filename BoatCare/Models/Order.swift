//
//  Order.swift
//  BoatCare
//
//  Order and OrderItem models matching orders/order_items tables
//

import Foundation

struct Order: Codable, Identifiable, Sendable {
    let id: UUID
    let orderNumber: String?
    let buyerId: UUID
    let providerId: UUID
    let boatId: UUID?
    let status: String
    let subtotal: Double
    let shippingCost: Double?
    let commissionRate: Double?
    let commissionAmount: Double?
    let total: Double
    let currency: String?
    let shippingName: String?
    let shippingStreet: String?
    let shippingCity: String?
    let shippingPostalCode: String?
    let shippingCountry: String?
    let paymentStatus: String?
    let trackingNumber: String?
    let trackingUrl: String?
    let estimatedDelivery: String?
    let shippedAt: String?
    let deliveredAt: String?
    let buyerNote: String?
    let createdAt: String?
    let updatedAt: String?

    // Joined data
    let items: [OrderItem]?
    let provider: ServiceProviderBasic?

    enum CodingKeys: String, CodingKey {
        case id
        case orderNumber = "order_number"
        case buyerId = "buyer_id"
        case providerId = "provider_id"
        case boatId = "boat_id"
        case status, subtotal
        case shippingCost = "shipping_cost"
        case commissionRate = "commission_rate"
        case commissionAmount = "commission_amount"
        case total, currency
        case shippingName = "shipping_name"
        case shippingStreet = "shipping_street"
        case shippingCity = "shipping_city"
        case shippingPostalCode = "shipping_postal_code"
        case shippingCountry = "shipping_country"
        case paymentStatus = "payment_status"
        case trackingNumber = "tracking_number"
        case trackingUrl = "tracking_url"
        case estimatedDelivery = "estimated_delivery"
        case shippedAt = "shipped_at"
        case deliveredAt = "delivered_at"
        case buyerNote = "buyer_note"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case items = "order_items"
        case provider = "service_providers"
    }

    var displayTotal: String {
        String(format: "%.2f €", total).replacingOccurrences(of: ".", with: ",")
    }

    var displayDate: String {
        guard let createdAt else { return "" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: createdAt) else { return createdAt }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        display.locale = Locale(identifier: "de_DE")
        return display.string(from: date)
    }

    var statusIcon: String {
        switch status {
        case "pending": return "clock.fill"
        case "confirmed": return "checkmark.circle.fill"
        case "shipped": return "shippingbox.fill"
        case "delivered": return "checkmark.seal.fill"
        case "cancelled": return "xmark.circle.fill"
        case "refunded": return "arrow.uturn.left.circle.fill"
        default: return "questionmark.circle"
        }
    }
}

struct OrderItem: Codable, Identifiable, Sendable {
    let id: UUID
    let orderId: UUID?
    let productId: UUID
    let quantity: Int
    let unitPrice: Double
    let discountPercent: Double?
    let discountAmount: Double?
    let total: Double
    let productName: String
    let productSku: String?
    let productManufacturer: String?

    enum CodingKeys: String, CodingKey {
        case id
        case orderId = "order_id"
        case productId = "product_id"
        case quantity
        case unitPrice = "unit_price"
        case discountPercent = "discount_percent"
        case discountAmount = "discount_amount"
        case total
        case productName = "product_name"
        case productSku = "product_sku"
        case productManufacturer = "product_manufacturer"
    }

    var displayPrice: String {
        String(format: "%.2f €", unitPrice).replacingOccurrences(of: ".", with: ",")
    }

    var displayTotal: String {
        String(format: "%.2f €", total).replacingOccurrences(of: ".", with: ",")
    }
}
