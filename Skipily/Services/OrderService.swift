//
//  OrderService.swift
//  Skipily
//
//  Service for creating and fetching orders from Supabase
//

import Foundation
import Supabase

@MainActor
final class OrderService {
    static let shared = OrderService()

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    private let orderSelect = """
        *, order_items(*), service_providers(id, name, city)
        """

    // MARK: - Cancel / Delete

    /// Storniert eine noch nicht bezahlte Order (Status pending/confirmed) ueber
    /// die Edge Function cancel-order. Diese prueft die Berechtigung + den Status
    /// serverseitig und benachrichtigt den Anbieter (nicht mehr versenden). Bei
    /// bereits bezahlten Bestellungen muss der Widerruf/Refund-Flow laufen.
    func cancelOrder(id: UUID) async throws {
        struct Body: Encodable { let order_id: String }
        struct Resp: Decodable { let ok: Bool?; let error: String? }
        let resp: Resp = try await client.functions.invoke(
            "cancel-order",
            options: .init(body: Body(order_id: id.uuidString))
        )
        if resp.ok != true {
            throw NSError(
                domain: "Skipily.Order",
                code: 409,
                userInfo: [NSLocalizedDescriptionKey: resp.error ?? "Stornierung fehlgeschlagen"]
            )
        }
    }

    /// Loescht eine Order komplett aus der DB inkl. order_items.
    /// Nur fuer pending unpaid orders sinnvoll — bei bezahlten Orders sind
    /// Aufbewahrungspflichten zu beachten.
    func deleteOrder(id: UUID) async throws {
        try await client
            .from("order_items")
            .delete()
            .eq("order_id", value: id.uuidString)
            .execute()
        try await client
            .from("orders")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Fetch Orders

    func fetchOrders(buyerId: UUID) async throws -> [Order] {
        let orders: [Order] = try await client
            .from("orders")
            .select(orderSelect)
            .eq("buyer_id", value: buyerId.uuidString)
            .order("created_at", ascending: false)
            .execute()
            .value
        return orders
    }

    func fetchOrder(id: UUID) async throws -> Order {
        let order: Order = try await client
            .from("orders")
            .select(orderSelect)
            .eq("id", value: id.uuidString)
            .single()
            .execute()
            .value
        return order
    }

    // MARK: - Create Order

    /// Creates one order per provider group from the cart
    /// - Parameter agbVersion: AGB-Version die der Kunde im Checkout
    ///   akzeptiert hat (siehe orders.agb_accepted_version / _at). Wird pro
    ///   Order gespeichert für Audit-Trail.
    /// Versandkosten einer Provider-Gruppe über die Engine (provider_shipping_rules).
    /// Freigrenze + gewichtsbasierte Staffel je Zone. Fällt bei Fehler/Engine-aus
    /// auf den bisherigen Wert (höchster Produkt-Versand) zurück. Wird sowohl im
    /// Checkout-Review (Anzeige) als auch bei der Bestellanlage genutzt.
    func shippingCost(for group: CartGroup, country: String) async -> Double {
        struct ShipReq: Encodable {
            let provider_id: String
            let country: String
            let subtotal: Double
            let items: [Item]
            struct Item: Encodable { let weight_kg: Double?; let quantity: Int; let shipping_cost: Double? }
        }
        struct ShipResp: Decodable { let shipping_cost: Double? }
        do {
            let req = ShipReq(
                provider_id: group.id.uuidString,
                country: country,
                subtotal: group.subtotal,
                items: group.items.map {
                    .init(weight_kg: $0.product.weightKg, quantity: $0.quantity, shipping_cost: $0.product.shippingCost)
                }
            )
            let resp: ShipResp = try await client.functions.invoke(
                "calculate-shipping",
                options: .init(body: req)
            )
            return resp.shipping_cost ?? group.shippingCost
        } catch {
            AppLog.warning("calculate-shipping fehlgeschlagen, Fallback: \(error)")
            return group.shippingCost
        }
    }

    func createOrders(
        from cartGroups: [CartGroup],
        buyerId: UUID,
        shippingAddress: ShippingAddress,
        buyerNote: String? = nil,
        agbVersion: String? = nil,
        deferredPayment: Bool = false
    ) async throws -> [Order] {
        var createdOrders: [Order] = []

        for group in cartGroups {
            // Fetch provider's commission rate
            let providerData: [String: Double] = try await client
                .from("service_providers")
                .select("commission_rate")
                .eq("id", value: group.id.uuidString)
                .single()
                .execute()
                .value

            let commissionRate = providerData["commission_rate"] ?? 10.0
            let commissionAmount = group.subtotal * (commissionRate / 100.0)

            // Versandkosten über die Engine (siehe shippingCost(for:country:)).
            let shippingCost = await shippingCost(for: group, country: shippingAddress.country)
            let effectiveTotal = group.subtotal + shippingCost

            // Create order
            struct OrderInsert: Codable {
                let buyerId: String
                let providerId: String
                let status: String
                let subtotal: Double
                let shippingCost: Double
                let commissionRate: Double
                let commissionAmount: Double
                let total: Double
                let currency: String
                let shippingName: String
                let shippingStreet: String
                let shippingCity: String
                let shippingPostalCode: String
                let shippingCountry: String
                let paymentStatus: String
                let paymentFlow: String
                let buyerNote: String?
                let agbAcceptedVersion: String?
                let agbAcceptedAt: String?

                enum CodingKeys: String, CodingKey {
                    case buyerId = "buyer_id"
                    case providerId = "provider_id"
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
                    case paymentFlow = "payment_flow"
                    case buyerNote = "buyer_note"
                    case agbAcceptedVersion = "agb_accepted_version"
                    case agbAcceptedAt      = "agb_accepted_at"
                }
            }

            // AGB-Annahme als ISO-8601-Timestamp (oder nil falls keine Version)
            let agbAcceptedAtIso: String? = agbVersion.map { _ in
                ISO8601DateFormatter().string(from: Date())
            }

            let orderInsert = OrderInsert(
                buyerId: buyerId.uuidString,
                providerId: group.id.uuidString,
                status: "pending",
                subtotal: group.subtotal,
                shippingCost: shippingCost,
                commissionRate: commissionRate,
                commissionAmount: commissionAmount,
                total: effectiveTotal,
                currency: "EUR",
                shippingName: shippingAddress.name,
                shippingStreet: shippingAddress.street,
                shippingCity: shippingAddress.city,
                shippingPostalCode: shippingAddress.postalCode,
                shippingCountry: shippingAddress.country,
                paymentStatus: "pending",
                paymentFlow: deferredPayment ? "deferred" : "immediate",
                buyerNote: buyerNote,
                agbAcceptedVersion: agbVersion,
                agbAcceptedAt:      agbAcceptedAtIso
            )

            let order: Order = try await client
                .from("orders")
                .insert(orderInsert)
                .select(orderSelect)
                .single()
                .execute()
                .value

            // Create order items
            struct OrderItemInsert: Codable {
                let orderId: String
                let productId: String
                let variantId: String?
                let variantSku: String?
                let quantity: Int
                let unitPrice: Double
                let total: Double
                let productName: String
                let productSku: String?
                let productManufacturer: String?

                enum CodingKeys: String, CodingKey {
                    case orderId = "order_id"
                    case productId = "product_id"
                    case variantId = "variant_id"
                    case variantSku = "variant_sku"
                    case quantity
                    case unitPrice = "unit_price"
                    case total
                    case productName = "product_name"
                    case productSku = "product_sku"
                    case productManufacturer = "product_manufacturer"
                }
            }

            let itemInserts = group.items.map { item in
                OrderItemInsert(
                    orderId: order.id.uuidString,
                    // product_id bleibt die echte Produkt-ID; die Variante wird
                    // separat in variant_id/variant_sku gespeichert.
                    productId: item.product.id.uuidString,
                    variantId: item.variant?.id.uuidString,
                    variantSku: item.variant?.sku,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.lineTotal,
                    productName: item.displayName,
                    productSku: item.variant?.sku ?? item.product.sku,
                    productManufacturer: item.product.manufacturer
                )
            }

            try await client
                .from("order_items")
                .insert(itemInserts)
                .execute()

            // Reload order with items
            let fullOrder = try await fetchOrder(id: order.id)
            createdOrders.append(fullOrder)
        }

        return createdOrders
    }
}
