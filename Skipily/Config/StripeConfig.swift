//
//  StripeConfig.swift
//  Skipily
//
//  Stripe configuration. The publishable key is injected at build time
//  via Debug.xcconfig / Release.xcconfig → Info.plist (key: StripePublishableKey).
//  Never hardcode live keys in source control.
//

import Foundation

enum StripeConfig {

    /// Publishable key resolved from Info.plist (populated by the active xcconfig).
    /// In DEBUG builds we fall back to the known test key so developers can run
    /// the app without manually attaching xcconfig files on fresh checkouts.
    static let publishableKey: String = {
        if let key = Bundle.main.object(forInfoDictionaryKey: "StripePublishableKey") as? String,
           !key.isEmpty,
           !key.hasPrefix("$(") {        // unresolved variable → treat as missing
            return key
        }
        #if DEBUG
        // Development fallback — test mode only.
        return "pk_test_51TA7UZAKSxHR03mT7pUUxkzinP3uCALPTnpA0uCsTCHffyscoELwNpU1ia3MwwyhBvJQPHahLJT9N5KqtsC9qcyS00C79hUZFl"
        #else
        assertionFailure("StripePublishableKey missing from Info.plist. Attach Release.xcconfig with a live key.")
        return ""
        #endif
    }()

    /// Merchant display name shown in Payment Sheet.
    static let merchantDisplayName = "Skipily"

    // Supabase Edge Function URLs for payment processing
    static var createPaymentIntentURL: URL {
        URL(string: "\(SupabaseConfig.url)/functions/v1/create-payment-intent")!
    }

    static var createConnectAccountURL: URL {
        URL(string: "\(SupabaseConfig.url)/functions/v1/create-connect-account")!
    }
}
