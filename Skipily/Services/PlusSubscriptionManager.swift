//
//  PlusSubscriptionManager.swift
//  Skipily
//
//  StoreKit-2-Manager für Skipily Plus.
//  - Lädt verfügbare Produkte aus dem App Store
//  - Kauft / restored Abos
//  - Synchronisiert jede erfolgreiche Transaktion mit dem Skipily-Backend
//  - Beobachtet Transaction.updates kontinuierlich (Renewal, Refund, Family-Sharing)
//
//  Hinweis: Die App hat einen eigenen `Product`-Typ für Shop-Artikel
//  (`Skipily/Models/Product.swift`). Deshalb verwenden wir hier konsequent
//  `StoreKit.Product` damit's keine Namens-Kollision gibt.
//

import Foundation
import Combine       // für @Published / ObservableObject
import StoreKit

@MainActor
final class PlusSubscriptionManager: ObservableObject {
    static let shared = PlusSubscriptionManager()

    // Product-IDs müssen mit Skipily.storekit / App Store Connect übereinstimmen
    static let productIDs: [String] = [
        "skipily.plus.monthly",
        "skipily.plus.yearly",
        "skipily.pro.monthly",        // = plus_family Mapping im Backend
        "skipily.pro.yearly"
    ]

    @Published private(set) var products: [StoreKit.Product] = []
    @Published private(set) var purchasedProductIDs: Set<String> = []
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private var transactionListener: Task<Void, Never>?

    private init() {
        transactionListener = listenForTransactions()
    }

    deinit { transactionListener?.cancel() }

    // MARK: - Produkte laden
    func loadProducts() async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }
        do {
            let storeProducts = try await StoreKit.Product.products(for: Self.productIDs)
            self.products = storeProducts.sorted { $0.price < $1.price }
            await refreshPurchasedState()

            // Hilfreiche Diagnose: wenn App Store Connect die Produkte nicht
            // freigeschaltet hat (TestFlight ignoriert Skipily.storekit!),
            // liefert products(for:) eine leere Liste OHNE throw.
            if storeProducts.isEmpty {
                let requested = Self.productIDs.joined(separator: ", ")
                lastError = "App Store lieferte 0 Produkte für die IDs: \(requested). Prüfe in App Store Connect ob die Subscriptions angelegt UND zum Verkauf freigegeben sind."
                AppLog.warning("PlusManager: 0 Products returned. Requested: \(requested)")
            } else {
                AppLog.info("PlusManager: \(storeProducts.count) Products geladen: \(storeProducts.map { $0.id }.joined(separator: ", "))")
            }
        } catch {
            lastError = "Produkte konnten nicht geladen werden: \(error.localizedDescription)"
            AppLog.error("PlusManager.loadProducts: \(error)")
        }
    }

    // MARK: - Kauf
    /// Liefert `true` wenn der Kauf erfolgreich war, `false` bei Cancel/Pending.
    /// Wirft NICHT bei User-Cancel (z. B. Sheet weggewischt) — auch wenn StoreKit das als Error meldet.
    func purchase(_ product: StoreKit.Product) async throws -> Bool {
        let result: StoreKit.Product.PurchaseResult
        do {
            result = try await product.purchase()
        } catch {
            if Self.isUserCancellation(error) {
                return false
            }
            throw error
        }

        switch result {
        case .success(let verification):
            // verification.jwsRepresentation ist der signierte JWS,
            // den wir an unser Backend schicken können.
            let signedJWS = verification.jwsRepresentation
            let transaction = try checkVerified(verification)
            await syncWithBackend(jws: signedJWS)
            await transaction.finish()
            await refreshPurchasedState()
            return true

        case .userCancelled, .pending:
            return false

        @unknown default:
            return false
        }
    }

    /// Erkennt User-Abbruch des Payment Sheets — inkl. der AMSError-Variante
    /// "Payment Sheet Failed (Payment sheet dismissed with neither an error nor a result)",
    /// die StoreKit speziell im Sandbox/TestFlight wirft, wenn der User das Sheet
    /// wegwischt oder den Apple-ID-Auth-Dialog abbricht.
    static func isUserCancellation(_ error: Error) -> Bool {
        if let skError = error as? StoreKitError, case .userCancelled = skError { return true }
        let ns = error as NSError
        // AMSError Code 6 = "Payment Sheet Failed" (Dismiss/Cancel im Apple-Auth-Flow)
        if ns.domain == "AMSErrorDomain" && ns.code == 6 { return true }
        // ASDErrorDomain Code 825/907 = Cancel in App Store Daemon
        if ns.domain == "ASDErrorDomain" && (ns.code == 825 || ns.code == 907) { return true }
        return false
    }

    // MARK: - Restore
    func restore() async {
        do {
            try await AppStore.sync()
            await refreshPurchasedState()
        } catch {
            lastError = "Restore fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    // MARK: - Aktuell gültige Subscriptions ermitteln
    func refreshPurchasedState() async {
        var active: Set<String> = []
        for await result in StoreKit.Transaction.currentEntitlements {
            if case .verified(let tx) = result {
                if tx.revocationDate == nil && (tx.expirationDate ?? .distantFuture) > Date() {
                    active.insert(tx.productID)
                }
            }
        }
        self.purchasedProductIDs = active
    }

    var hasActivePlus: Bool { !purchasedProductIDs.isEmpty }

    // MARK: - Listener für Background-Updates (Renewal, Refund, Family-Sharing)
    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached(priority: .background) {
            for await update in StoreKit.Transaction.updates {
                guard case .verified(let tx) = update else { continue }
                let jws = update.jwsRepresentation
                await MainActor.run {
                    Task { await PlusSubscriptionManager.shared.syncWithBackend(jws: jws) }
                }
                await tx.finish()
            }
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified(_, let error):
            throw error
        }
    }

    // MARK: - Backend-Sync
    /// Schickt den signierten JWS einer Transaktion an unsere Edge Function
    /// damit `user_subscriptions` aktualisiert wird.
    private func syncWithBackend(jws: String) async {
        do {
            guard let accessToken = await SupabaseAuthHelper.currentAccessToken() else {
                AppLog.warning("PlusSync: kein Access-Token, abbruch")
                return
            }

            guard let url = URL(string: "\(SupabaseConfig.url)/functions/v1/verify-apple-receipt") else {
                AppLog.error("PlusSync: ungueltige Backend-URL")
                return
            }

            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "transaction_jws": jws,
                "environment": Self.currentEnvironment()
            ])

            let (data, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                let bodyText = String(data: data, encoding: .utf8) ?? ""
                AppLog.error("PlusSync \(http.statusCode): \(bodyText)")
            } else {
                AppLog.info("PlusSync erfolgreich verbucht")
            }
        } catch {
            AppLog.error("PlusSync fehlgeschlagen: \(error.localizedDescription)")
        }
    }

    private static func currentEnvironment() -> String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }
}

// MARK: - Auth-Helper Stub
/// Bitte durch die echte Implementation deines AuthService ersetzen, sobald
/// die Plus-Sheet in die App eingebunden wird.
///   z.B.   return AuthService.shared.currentSession?.accessToken
private enum SupabaseAuthHelper {
    static func currentAccessToken() async -> String? {
        // TODO: An den echten AuthService anbinden
        return nil
    }
}
