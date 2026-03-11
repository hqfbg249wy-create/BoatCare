//
//  AppColors.swift
//  BoatCare
//
//  Design System Colors
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

    // Grays
    static let gray50 = Color(red: 0.973, green: 0.980, blue: 0.988)
    static let gray100 = Color(red: 0.945, green: 0.961, blue: 0.976)
    static let gray200 = Color(red: 0.886, green: 0.910, blue: 0.941)
    static let gray300 = Color(red: 0.796, green: 0.835, blue: 0.882)
    static let gray500 = Color(red: 0.392, green: 0.455, blue: 0.545)
    static let gray700 = Color(red: 0.200, green: 0.255, blue: 0.333)
    static let gray900 = Color(red: 0.059, green: 0.090, blue: 0.165)

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
