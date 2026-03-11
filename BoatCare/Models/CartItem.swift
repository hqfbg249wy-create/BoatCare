//
//  CartItem.swift
//  BoatCare
//
//  Local cart item (not persisted in DB until checkout)
//

import Foundation

struct CartItem: Identifiable, Sendable {
    let id: UUID
    let product: Product
    var quantity: Int

    var lineTotal: Double {
        (product.price ?? 0) * Double(quantity)
    }

    var displayLineTotal: String {
        String(format: "%.2f €", lineTotal).replacingOccurrences(of: ".", with: ",")
    }
}

/// Groups cart items by provider for separate orders
struct CartGroup: Identifiable, Sendable {
    let id: UUID  // provider ID
    let providerName: String
    let providerCity: String?
    let items: [CartItem]

    var subtotal: Double {
        items.reduce(0) { $0 + $1.lineTotal }
    }

    var shippingCost: Double {
        // Use highest shipping cost from items in this group
        items.compactMap { $0.product.shippingCost }.max() ?? 0
    }

    var total: Double {
        subtotal + shippingCost
    }

    var displaySubtotal: String {
        String(format: "%.2f €", subtotal).replacingOccurrences(of: ".", with: ",")
    }

    var displayShipping: String {
        if shippingCost == 0 { return "Kostenloser Versand" }
        return String(format: "%.2f €", shippingCost).replacingOccurrences(of: ".", with: ",")
    }

    var displayTotal: String {
        String(format: "%.2f €", total).replacingOccurrences(of: ".", with: ",")
    }
}
