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
    /// TEST: Auf dem Branch feat/deferred-shop-payment auf true, um den neuen
    /// Ablauf im Stripe-TESTMODUS durchzuspielen. VOR einem Merge nach main
    /// wieder auf false setzen (bis der Test vollstaendig bestanden ist).
    static let deferredShopPayment = true
}
