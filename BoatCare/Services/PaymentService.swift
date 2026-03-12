//
//  PaymentService.swift
//  BoatCare
//
//  Stripe Payment integration using PaymentSheet
//

import Foundation
import StripePaymentSheet
import Supabase

/// Response from the create-payment-intent Edge Function
struct PaymentIntentResponse: Codable, Sendable {
    let clientSecret: String
    let ephemeralKey: String
    let customerId: String
    let publishableKey: String

    enum CodingKeys: String, CodingKey {
        case clientSecret = "client_secret"
        case ephemeralKey = "ephemeral_key"
        case customerId = "customer_id"
        case publishableKey = "publishable_key"
    }
}

@MainActor
final class PaymentService {
    static let shared = PaymentService()

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    /// Creates a PaymentIntent via Edge Function and returns a configured PaymentSheet
    func createPaymentSheet(
        for orders: [Order],
        totalAmount: Double
    ) async throws -> PaymentSheet {
        // Get auth token
        let session = try await client.auth.session
        let accessToken = session.accessToken

        // Prepare order IDs for the Edge Function
        let orderIds = orders.map { $0.id.uuidString }

        // Call Edge Function to create PaymentIntent
        let requestBody: [String: Any] = [
            "amount": Int(totalAmount * 100), // Stripe uses cents
            "currency": "eur",
            "order_ids": orderIds,
            "metadata": [
                "buyer_id": session.user.id.uuidString,
                "order_count": orders.count
            ]
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: requestBody)

        var request = URLRequest(url: StripeConfig.createPaymentIntentURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        request.httpBody = jsonData

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw PaymentError.serverError(errorBody)
        }

        let paymentResponse = try JSONDecoder().decode(PaymentIntentResponse.self, from: data)

        // Configure PaymentSheet
        var config = PaymentSheet.Configuration()
        config.merchantDisplayName = StripeConfig.merchantDisplayName
        config.allowsDelayedPaymentMethods = false

        // Customer configuration for saved payment methods
        config.customer = .init(
            id: paymentResponse.customerId,
            ephemeralKeySecret: paymentResponse.ephemeralKey
        )

        // Appearance matching BoatCare design
        var appearance = PaymentSheet.Appearance()
        appearance.colors.primary = UIColor(red: 0.976, green: 0.451, blue: 0.086, alpha: 1) // #f97316
        appearance.colors.background = .white
        appearance.colors.componentBackground = UIColor(red: 0.973, green: 0.980, blue: 0.988, alpha: 1) // gray-50
        appearance.colors.componentBorder = UIColor(red: 0.886, green: 0.910, blue: 0.941, alpha: 1) // gray-200
        appearance.cornerRadius = 12
        appearance.font.base = UIFont.systemFont(ofSize: 16)
        config.appearance = appearance

        let paymentSheet = PaymentSheet(
            paymentIntentClientSecret: paymentResponse.clientSecret,
            configuration: config
        )

        return paymentSheet
    }

    /// Updates order payment status after successful payment
    func confirmPayment(orderIds: [UUID]) async throws {
        for orderId in orderIds {
            try await client
                .from("orders")
                .update(["payment_status": "paid"])
                .eq("id", value: orderId.uuidString)
                .execute()
        }
    }

    /// Marks orders as payment failed
    func failPayment(orderIds: [UUID]) async throws {
        for orderId in orderIds {
            try await client
                .from("orders")
                .update(["payment_status": "failed"])
                .eq("id", value: orderId.uuidString)
                .execute()
        }
    }
}

enum PaymentError: LocalizedError {
    case serverError(String)
    case noPaymentIntent
    case cancelled

    var errorDescription: String? {
        switch self {
        case .serverError(let msg):
            return "Zahlungsfehler: \(msg)"
        case .noPaymentIntent:
            return "Zahlung konnte nicht initialisiert werden"
        case .cancelled:
            return "Zahlung abgebrochen"
        }
    }
}
