//
//  StripeConfig.swift
//  BoatCare
//
//  Stripe Configuration - Test mode keys
//  Replace with live keys for production
//

import Foundation

enum StripeConfig {
    // IMPORTANT: Replace these with your actual Stripe keys
    // Test mode publishable key (safe for client-side)
    static let publishableKey = "pk_test_REPLACE_WITH_YOUR_KEY"

    // Merchant display name shown in Payment Sheet
    static let merchantDisplayName = "BoatCare"

    // Supabase Edge Function URLs for payment processing
    static var createPaymentIntentURL: URL {
        URL(string: "\(SupabaseConfig.url)/functions/v1/create-payment-intent")!
    }

    static var createConnectAccountURL: URL {
        URL(string: "\(SupabaseConfig.url)/functions/v1/create-connect-account")!
    }
}
