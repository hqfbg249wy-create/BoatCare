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
import Supabase      // Backend-Entitlement (RPC user_ai_tier) + Access-Token

/// Abo-Stufe des Bootseigners (Phase 1). Reihenfolge = Wertigkeit.
enum SubscriptionTier: Int, Comparable {
    case free  = 0
    case basic = 1
    case plus  = 2

    static func < (lhs: SubscriptionTier, rhs: SubscriptionTier) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

@MainActor
final class PlusSubscriptionManager: ObservableObject {
    static let shared = PlusSubscriptionManager()

    // Product-IDs müssen mit Skipily.storekit / App Store Connect übereinstimmen.
    // Zwei Stufen (Phase 1): Basic (1,99/19,99) und Plus (4,99/49,00).
    // Fleet/Family kommen später (eigene Produkt-IDs).
    static let basicIDs: Set<String> = ["skipily.basic.monthly", "skipily.basic.yearly"]
    static let plusIDs:  Set<String> = ["skipily.plus.monthly",  "skipily.plus.yearly"]
    static let productIDs: [String] = Array(basicIDs) + Array(plusIDs)

    @Published private(set) var products: [StoreKit.Product] = []
    @Published private(set) var purchasedProductIDs: Set<String> = []
    /// Tier laut Backend (`user_subscriptions` via RPC `user_ai_tier`).
    /// Deckt Fälle ab, die StoreKit LOKAL NICHT kennt — insbesondere
    /// kostenlose Admin-Freischaltungen (Custom-Verträge) und Käufe, die auf
    /// einem anderen Gerät getätigt und serverseitig verbucht wurden.
    /// Das effektive `tier` ist das MAXIMUM aus StoreKit und Backend.
    @Published private(set) var backendTier: SubscriptionTier = .free
    /// Produkt-IDs, für die der aktuelle Account TATSÄCHLICH noch für das
    /// Intro-Offer (Gratis-Trial) berechtigt ist. StoreKit liefert
    /// `introductoryOffer` auch dann, wenn der Trial bereits verbraucht wurde —
    /// deshalb dürfen wir einen Trial nur bewerben, wenn die ID hier enthalten
    /// ist. Andernfalls verspricht die App einen Gratiszeitraum, den Apples
    /// Kauf-Bestätigung nicht gewährt (App-Store-Guideline 2.1(b)).
    @Published private(set) var introEligibleProductIDs: Set<String> = []
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
            // Bestehende Bindung dieses Kontos aktualisieren (Renewals) — legt
            // keine neue an, daher kein Doppel-Abo bei Konto-Wechsel.
            await reconcileEntitlements(intent: "sync")
            await refreshBackendEntitlement()
            await refreshIntroEligibility()

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
            // Aktiver Kauf → an DIESES Konto binden.
            await syncWithBackend(jws: signedJWS, intent: "purchase")
            await transaction.finish()
            await refreshPurchasedState()
            await refreshBackendEntitlement()
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
            // Explizite Nutzer-Aktion → Kauf an DIESES Konto binden (mit
            // Cross-Account-Schutz im Backend). So holen sich Bestandskäufer
            // (z.B. Kauf aus einer älteren App-Version) ihr Abo ins Konto.
            await reconcileEntitlements(intent: "purchase")
            await refreshBackendEntitlement()
        } catch {
            lastError = "Restore fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    /// Schickt alle aktuell gültigen StoreKit-Entitlements ans Backend.
    /// `intent: "sync"` aktualisiert nur eine bereits bestehende Bindung dieses
    /// Kontos (Renewals), legt aber NIE eine neue an. `intent: "purchase"`
    /// bindet aktiv (Kauf/Restore).
    private func reconcileEntitlements(intent: String) async {
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let tx) = result,
                  tx.revocationDate == nil,
                  (tx.expirationDate ?? .distantFuture) > Date() else { continue }
            await syncWithBackend(jws: result.jwsRepresentation, intent: intent)
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

    /// Tier NUR aus den lokalen StoreKit-Käufen. Plus hat Vorrang vor Basic.
    var storeKitTier: SubscriptionTier {
        if !purchasedProductIDs.isDisjoint(with: Self.plusIDs)  { return .plus }
        if !purchasedProductIDs.isDisjoint(with: Self.basicIDs) { return .basic }
        return .free
    }

    /// Effektive KI-/Feature-Stufe des ANGEMELDETEN KONTOS.
    ///
    /// Autorität ist das Backend (`user_subscriptions` ist pro Konto an die
    /// Apple-Transaktion gebunden) — NICHT die lokale StoreKit-Entitlement.
    /// Grund: StoreKit-Käufe hängen an der Apple-ID, nicht am Skipily-Konto.
    /// Würde man StoreKit hier mit einbeziehen (`max`), erschiene derselbe Kauf
    /// in JEDEM Skipily-Konto, das auf demselben Gerät/derselben Apple-ID
    /// eingeloggt wird (Doppel-Abo-Bug). StoreKit dient nur zum Kauf, zum
    /// Wiederherstellen und zum Aktualisieren der bereits gebundenen Zeile.
    var tier: SubscriptionTier { backendTier }

    /// Aktives Abo existiert nur im Backend, nicht in StoreKit — typisch für
    /// eine kostenlose Admin-Freischaltung. Dann gibt es KEIN Apple-Abo zum
    /// Verwalten; die UI zeigt einen entsprechenden Hinweis statt des
    /// „Bei Apple verwalten"-Buttons.
    var isBackendOnlyGrant: Bool {
        storeKitTier == .free && backendTier != .free
    }

    /// Plus-Stufe aktiv (4,99): stärkere KI, Family, Excel-Import, Wartungsreport.
    var hasActivePlus: Bool { tier == .plus }

    /// Irgendein bezahltes Abo aktiv (Basic ODER Plus): Foto-Analyse, SKIPILY-Rabatte.
    var hasPaidTier: Bool { tier != .free }

    // MARK: - Backend-Entitlement (Admin-Grants + geräteübergreifende Käufe)
    /// Fragt `user_ai_tier` in Supabase ab und spiegelt das Ergebnis nach
    /// `backendTier`. So werden kostenlose Admin-Freischaltungen und auf
    /// anderen Geräten getätigte Käufe in der App sichtbar, obwohl StoreKit
    /// sie lokal nicht kennt. Bei fehlender Session (nicht eingeloggt) bleibt
    /// `backendTier` unverändert bzw. free.
    func refreshBackendEntitlement() async {
        let client = SupabaseManager.shared.client
        guard let uid = try? await client.auth.session.user.id else {
            // Nicht eingeloggt → kein Backend-Entitlement.
            self.backendTier = .free
            return
        }
        do {
            let tierStr: String = try await client
                .rpc("user_ai_tier", params: ["p_user_id": uid.uuidString])
                .execute()
                .value
            switch tierStr {
            case "plus":  self.backendTier = .plus
            case "basic": self.backendTier = .basic
            default:      self.backendTier = .free
            }
            AppLog.info("PlusManager: backendTier = \(tierStr)")
        } catch {
            // Netz-/Decode-Fehler dürfen den lokalen StoreKit-Status nicht
            // verschlechtern — backendTier bleibt wie er war.
            AppLog.warning("PlusManager.refreshBackendEntitlement: \(error.localizedDescription)")
        }
    }

    // MARK: - Intro-Offer-Eligibility (Gratis-Trial) ermitteln
    /// Prüft pro Produkt, ob der aktuelle Account noch für das Intro-Offer
    /// berechtigt ist. Nur dann darf die UI einen Gratis-Trial bewerben —
    /// sonst entsteht der 2.1(b)-Widerspruch (App verspricht Trial, Apples
    /// Kauf-Sheet zeigt keinen).
    private func refreshIntroEligibility() async {
        var eligible: Set<String> = []
        for product in products {
            guard let sub = product.subscription,
                  sub.introductoryOffer != nil else { continue }
            if await sub.isEligibleForIntroOffer {
                eligible.insert(product.id)
            }
        }
        self.introEligibleProductIDs = eligible
    }

    // MARK: - Listener für Background-Updates (Renewal, Refund, Family-Sharing)
    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached(priority: .background) {
            for await update in StoreKit.Transaction.updates {
                guard case .verified(let tx) = update else { continue }
                let jws = update.jwsRepresentation
                // Passiver Hintergrund-Abgleich (Renewal/Refund/Family) →
                // nur bestehende Bindung dieses Kontos aktualisieren, keine
                // neue anlegen (verhindert Doppel-Abo bei Konto-Wechsel).
                await PlusSubscriptionManager.shared.syncWithBackend(jws: jws, intent: "sync")
                await PlusSubscriptionManager.shared.refreshBackendEntitlement()
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
    private func syncWithBackend(jws: String, intent: String) async {
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
                "environment": Self.currentEnvironment(),
                "intent": intent
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

// MARK: - Auth-Helper
/// Liefert das aktuelle Supabase-Access-Token für den Backend-Sync der
/// StoreKit-Transaktionen. Ohne gültige Session (nicht eingeloggt) `nil`.
private enum SupabaseAuthHelper {
    static func currentAccessToken() async -> String? {
        try? await SupabaseManager.shared.client.auth.session.accessToken
    }
}
