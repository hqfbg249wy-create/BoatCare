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
    /// Test im Stripe-TESTMODUS bestanden (2026-09). Fuer den Merge nach main
    /// bewusst auf false = Code dormant im Release. Scharfschalten ist ein
    /// eigener Go-Live-Schritt: (1) Widerrufsbelehrung juristisch freigegeben,
    /// (2) Stripe auf Live-Keys, (3) diesen Flag auf true + neuer App-Release.
    static let deferredShopPayment = false
}
