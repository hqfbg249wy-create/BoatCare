//
//  OrderService.swift
//  BoatCare
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
        *, order_items(*), service_providers(id, company_name, city)
        """

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
    func createOrders(
        from cartGroups: [CartGroup],
        buyerId: UUID,
        shippingAddress: ShippingAddress,
        buyerNote: String? = nil
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
                let buyerNote: String?

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
                    case buyerNote = "buyer_note"
                }
            }

            let orderInsert = OrderInsert(
                buyerId: buyerId.uuidString,
                providerId: group.id.uuidString,
                status: "pending",
                subtotal: group.subtotal,
                shippingCost: group.shippingCost,
                commissionRate: commissionRate,
                commissionAmount: commissionAmount,
                total: group.total,
                currency: "EUR",
                shippingName: shippingAddress.name,
                shippingStreet: shippingAddress.street,
                shippingCity: shippingAddress.city,
                shippingPostalCode: shippingAddress.postalCode,
                shippingCountry: shippingAddress.country,
                paymentStatus: "pending",
                buyerNote: buyerNote
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
                let quantity: Int
                let unitPrice: Double
                let total: Double
                let productName: String
                let productSku: String?
                let productManufacturer: String?

                enum CodingKeys: String, CodingKey {
                    case orderId = "order_id"
                    case productId = "product_id"
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
                    productId: item.product.id.uuidString,
                    quantity: item.quantity,
                    unitPrice: item.product.price ?? 0,
                    total: item.lineTotal,
                    productName: item.product.name,
                    productSku: item.product.sku,
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
