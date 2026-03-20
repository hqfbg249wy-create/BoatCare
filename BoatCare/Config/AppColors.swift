//
//  AppColors.swift
//  BoatCare
//
//  Design System Colors – adaptive for Light & Dark Mode
//

import SwiftUI

enum AppColors {
    // Brand
    static let primary = Color(red: 0.976, green: 0.451, blue: 0.086)      // #f97316 Orange
    static let primaryDark = Color(red: 0.918, green: 0.345, blue: 0.047)  // #ea580c

    // Status
    static let success = Color(red: 0.063, green: 0.725, blue: 0.506)      // #10b981
    static let warning = Color(red: 0.961, green: 0.620, blue: 0.043)      // #f59e0b
    static let error = Color(red: 0.937, green: 0.267, blue: 0.267)        // #ef4444
    static let info = Color(red: 0.231, green: 0.510, blue: 0.965)         // #3b82f6

    // Order status
    static let pending = Color(red: 0.961, green: 0.620, blue: 0.043)      // yellow
    static let confirmed = Color(red: 0.231, green: 0.510, blue: 0.965)    // blue
    static let shipped = Color(red: 0.545, green: 0.361, blue: 0.965)      // purple
    static let delivered = Color(red: 0.063, green: 0.725, blue: 0.506)    // green
    static let cancelled = Color(red: 0.937, green: 0.267, blue: 0.267)    // red

    // Grays – adaptive for Light & Dark Mode
    static let gray50  = Color(UIColor.secondarySystemBackground)
    static let gray100 = Color(UIColor.tertiarySystemBackground)
    static let gray200 = Color(UIColor.systemGray5)
    static let gray300 = Color(UIColor.systemGray4)
    static let gray400 = Color(UIColor.systemGray2)
    static let gray500 = Color(UIColor.secondaryLabel)
    static let gray700 = Color(UIColor.label)
    static let gray900 = Color(UIColor.label)

    // Explicit background helpers
    static let cardBackground = Color(UIColor.secondarySystemBackground)
    static let background = Color(UIColor.systemBackground)

    static func statusColor(for status: String) -> Color {
        switch status.lowercased() {
        case "pending": return pending
        case "confirmed": return confirmed
        case "shipped": return shipped
        case "delivered": return delivered
        case "cancelled", "refunded": return cancelled
        default: return .gray
        }
    }

    static func statusLabel(for status: String) -> String {
        switch status.lowercased() {
        case "pending": return "Ausstehend"
        case "confirmed": return "Bestätigt"
        case "shipped": return "Versendet"
        case "delivered": return "Geliefert"
        case "cancelled": return "Storniert"
        case "refunded": return "Erstattet"
        default: return status
        }
    }
}
