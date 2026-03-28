//
//  PaymentService.swift
//  Skipily
//
//  Stripe Payment integration using PaymentSheet & SetupSheet
//

import Foundation
import UIKit
import StripePaymentSheet
import Supabase

/// Response from create-payment-intent & setup-payment-method Edge Functions
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

/// Saved payment method info
struct SavedPaymentMethod: Identifiable, Sendable {
    let id: String
    let brand: String     // visa, mastercard, amex, etc.
    let last4: String
    let expMonth: Int
    let expYear: Int

    var displayName: String {
        let brandName: String
        switch brand.lowercased() {
        case "visa": brandName = "Visa"
        case "mastercard": brandName = "Mastercard"
        case "amex": brandName = "American Express"
        case "sepa_debit": brandName = "SEPA Lastschrift"
        default: brandName = brand.capitalized
        }
        return "\(brandName) •••• \(last4)"
    }

    var brandIcon: String {
        switch brand.lowercased() {
        case "visa": return "creditcard.fill"
        case "mastercard": return "creditcard.fill"
        case "amex": return "creditcard.fill"
        case "sepa_debit": return "building.columns.fill"
        default: return "creditcard"
        }
    }

    var expiryString: String {
        String(format: "%02d/%d", expMonth, expYear % 100)
    }
}

@MainActor
final class PaymentService {
    static let shared = PaymentService()

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    /// Shared Stripe appearance – adapts to Light & Dark Mode
    private var boatCareAppearance: PaymentSheet.Appearance {
        var appearance = PaymentSheet.Appearance()
        appearance.colors.primary = UIColor(red: 0.976, green: 0.451, blue: 0.086, alpha: 1) // #f97316
        appearance.colors.background = .systemBackground
        appearance.colors.componentBackground = .secondarySystemBackground
        appearance.colors.componentBorder = .separator
        appearance.colors.text = .label
        appearance.colors.textSecondary = .secondaryLabel
        appearance.colors.componentPlaceholderText = .tertiaryLabel
        appearance.cornerRadius = 12
        appearance.font.base = UIFont.systemFont(ofSize: 16)
        return appearance
    }

    // MARK: - Payment (existing checkout flow)

    /// Creates a PaymentIntent via Edge Function and returns a configured PaymentSheet
    func createPaymentSheet(
        for orders: [Order],
        totalAmount: Double
    ) async throws -> PaymentSheet {
        let session = try await client.auth.session
        let orderIds = orders.map { $0.id.uuidString }

        struct PaymentRequest: Encodable {
            let amount: Int
            let currency: String
            let order_ids: [String]
            let metadata: [String: String]
        }

        let requestBody = PaymentRequest(
            amount: Int(totalAmount * 100),
            currency: "eur",
            order_ids: orderIds,
            metadata: [
                "buyer_id": session.user.id.uuidString,
                "order_count": "\(orders.count)"
            ]
        )

        let paymentResponse: PaymentIntentResponse = try await client.functions.invoke(
            "create-payment-intent",
            options: .init(body: requestBody)
        )

        var config = PaymentSheet.Configuration()
        config.merchantDisplayName = StripeConfig.merchantDisplayName
        config.allowsDelayedPaymentMethods = false
        config.customer = .init(
            id: paymentResponse.customerId,
            ephemeralKeySecret: paymentResponse.ephemeralKey
        )
        config.appearance = boatCareAppearance

        return PaymentSheet(
            paymentIntentClientSecret: paymentResponse.clientSecret,
            configuration: config
        )
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

    // MARK: - Setup (save payment method without purchasing)

    /// Creates a SetupIntent so the user can save a payment method in their profile
    func createSetupSheet() async throws -> (PaymentSheet, String) {
        struct EmptyBody: Encodable {}

        let paymentResponse: PaymentIntentResponse = try await client.functions.invoke(
            "setup-payment-method",
            options: .init(body: EmptyBody())
        )

        var config = PaymentSheet.Configuration()
        config.merchantDisplayName = StripeConfig.merchantDisplayName
        config.customer = .init(
            id: paymentResponse.customerId,
            ephemeralKeySecret: paymentResponse.ephemeralKey
        )
        config.appearance = boatCareAppearance

        let setupSheet = PaymentSheet(
            setupIntentClientSecret: paymentResponse.clientSecret,
            configuration: config
        )

        return (setupSheet, paymentResponse.customerId)
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
