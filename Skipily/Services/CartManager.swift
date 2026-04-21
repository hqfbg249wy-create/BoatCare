//
//  CartManager.swift
//  Skipily
//
//  Shopping cart state management (local, groups items by provider)
//

import Foundation
import Observation

@Observable
@MainActor
final class CartManager {
    var items: [CartItem] = []

    var itemCount: Int {
        items.reduce(0) { $0 + $1.quantity }
    }

    var isEmpty: Bool {
        items.isEmpty
    }

    /// Groups cart items by provider for separate orders
    var groupedByProvider: [CartGroup] {
        let grouped = Dictionary(grouping: items) { item -> UUID in
            item.product.providerId ?? UUID()
        }

        return grouped.map { (providerId, items) in
            let providerName = items.first?.product.provider?.companyName ?? "Unbekannter Anbieter"
            let providerCity = items.first?.product.provider?.city
            return CartGroup(
                id: providerId,
                providerName: providerName,
                providerCity: providerCity,
                items: items
            )
        }.sorted { $0.providerName < $1.providerName }
    }

    var grandTotal: Double {
        groupedByProvider.reduce(0) { $0 + $1.total }
    }

    var displayGrandTotal: String {
        String(format: "%.2f €", grandTotal).replacingOccurrences(of: ".", with: ",")
    }

    // MARK: - Cart Operations

    func addToCart(product: Product, quantity: Int = 1) {
        if let index = items.firstIndex(where: { $0.product.id == product.id }) {
            items[index].quantity += quantity
        } else {
            let item = CartItem(id: product.id, product: product, quantity: quantity)
            items.append(item)
        }
    }

    func removeFromCart(productId: UUID) {
        items.removeAll { $0.product.id == productId }
    }

    func updateQuantity(productId: UUID, quantity: Int) {
        guard quantity > 0 else {
            removeFromCart(productId: productId)
            return
        }
        if let index = items.firstIndex(where: { $0.product.id == productId }) {
            items[index].quantity = quantity
        }
    }

    func clearCart() {
        items.removeAll()
    }

    func clearProviderItems(providerId: UUID) {
        items.removeAll { $0.product.providerId == providerId }
    }

    func contains(productId: UUID) -> Bool {
        items.contains { $0.product.id == productId }
    }

    func quantity(for productId: UUID) -> Int {
        items.first { $0.product.id == productId }?.quantity ?? 0
    }
}
