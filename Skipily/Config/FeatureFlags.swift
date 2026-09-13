//
//  FeatureFlags.swift
//  Skipily
//
//  Zentrale, einfache Feature-Schalter. Bewusst als Konstanten, damit ein
//  Umschalten bewusst per Build erfolgt (kein versehentliches Scharfschalten).
//

import Foundation

enum FeatureFlags {
    /// Neuer Shop-Zahlungsablauf: Bei Bestellung wird die Karte nur hinterlegt
    /// (SetupIntent, keine Abbuchung). Die Abbuchung erfolgt erst, wenn der
    /// Provider den Versand bestaetigt (Edge Function confirm-shipment), inkl.
    /// Rechnung + Widerrufsbelehrung.
    ///
    /// false = bisheriger Sofort-Zahlungs-Flow (Abbuchung bei Bestellung).
    /// Erst nach vollstaendigem Stripe-Test scharfschalten.
    ///
    /// GO-LIVE mit Release 1.0.6: Zahlung erst bei Versandbestaetigung.
    /// Voraussetzungen fuer die Produktion (vor Einreichung sicherstellen):
    /// (1) Widerrufsbelehrung juristisch freigegeben, (2) Stripe in Supabase auf
    /// LIVE-Keys (sk_live_…) + Provider-Connect-Accounts live/charges_enabled.
    static let deferredShopPayment = true
}
