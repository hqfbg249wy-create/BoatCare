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
    /// UserDefaults-Key fuer die Persistenz des Warenkorbs. Cart ueberlebt
    /// damit App-Restarts und abgebrochene Checkouts — Items verschwinden
    /// nur noch durch expliziten User-Eingriff oder erfolgreichen Kauf.
    private static let persistenceKey = "Skipily.CartItems.v1"

    var items: [CartItem] = [] {
        didSet { persist() }
    }

    init() {
        load()
    }

    private func persist() {
        do {
            let data = try JSONEncoder().encode(items)
            UserDefaults.standard.set(data, forKey: Self.persistenceKey)
        } catch {
            AppLog.warning("CartManager.persist failed: \(error)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: Self.persistenceKey) else { return }
        do {
            let restored = try JSONDecoder().decode([CartItem].self, from: data)
            // Direkt zuweisen ohne didSet-Triggern: wir wollen keinen
            // sofortigen Re-Save mit den gerade geladenen Daten.
            items = restored
        } catch {
            AppLog.warning("CartManager.load failed (ignoring stored cart): \(error)")
        }
    }

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

    func addToCart(product: Product, variant: ProductVariant? = nil, quantity: Int = 1) {
        // Zeilen-ID: Varianten trennen sich über ihre eigene ID, sodass z. B.
        // "8mm" und "10mm" desselben Tauwerks getrennte Warenkorb-Zeilen sind.
        let lineId = variant?.id ?? product.id
        if let index = items.firstIndex(where: { $0.id == lineId }) {
            items[index].quantity += quantity
        } else {
            let item = CartItem(id: lineId, product: product, variant: variant, quantity: quantity)
            items.append(item)
        }
    }

    /// Entfernt eine Warenkorb-Zeile. `lineId` ist die Varianten-ID bei
    /// Varianten, sonst die Produkt-ID (beides via CartItem.id abgebildet).
    func removeFromCart(lineId: UUID) {
        items.removeAll { $0.id == lineId }
    }

    func updateQuantity(lineId: UUID, quantity: Int) {
        guard quantity > 0 else {
            removeFromCart(lineId: lineId)
            return
        }
        if let index = items.firstIndex(where: { $0.id == lineId }) {
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
