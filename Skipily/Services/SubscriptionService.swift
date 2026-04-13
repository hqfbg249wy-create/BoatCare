//
//  SubscriptionService.swift
//  Skipily
//
//  StoreKit 2 scaffold for Plus / Pro auto-renewable subscriptions.
//  Apple mandates StoreKit for digital goods inside iOS apps — the Stripe
//  integration remains only for PHYSICAL goods (shop) and service bookings.
//
//  Product IDs must match App Store Connect and Skipily.storekit:
//    skipily.plus.monthly   (€4.99 / month)
//    skipily.plus.yearly    (€49.00 / year)
//    skipily.pro.monthly    (€9.99 / month)
//    skipily.pro.yearly     (€99.00 / year)
//
//  NOTE: `Product` is qualified as `StoreKit.Product` throughout because the
//  shop uses its own `Product` model type.
//

import Foundation
import Combine
import StoreKit

@MainActor
final class SubscriptionService: ObservableObject {
    static let shared = SubscriptionService()

    // MARK: - Product IDs

    enum SubscriptionProductID: String, CaseIterable {
        case plusMonthly = "skipily.plus.monthly"
        case plusYearly  = "skipily.plus.yearly"
        case proMonthly  = "skipily.pro.monthly"
        case proYearly   = "skipily.pro.yearly"

        var tier: SubscriptionTier {
            switch self {
            case .plusMonthly, .plusYearly: return .plus
            case .proMonthly,  .proYearly:  return .pro
            }
        }
    }

    enum SubscriptionTier: String, Comparable {
        case free, plus, pro

        static func < (lhs: SubscriptionTier, rhs: SubscriptionTier) -> Bool {
            let order: [SubscriptionTier] = [.free, .plus, .pro]
            return order.firstIndex(of: lhs)! < order.firstIndex(of: rhs)!
        }
    }

    // MARK: - Published state

    @Published private(set) var products: [StoreKit.Product] = []
    @Published private(set) var purchasedProductIDs: Set<String> = []
    @Published private(set) var currentTier: SubscriptionTier = .free
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private var updatesTask: Task<Void, Never>?

    private init() {
        updatesTask = listenForTransactionUpdates()
    }

    deinit { updatesTask?.cancel() }

    // MARK: - Loading

    func loadProducts() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let ids = SubscriptionProductID.allCases.map(\.rawValue)
            let fetched = try await StoreKit.Product.products(for: ids)
            // Stable order: Plus monthly, yearly, Pro monthly, yearly
            self.products = ids.compactMap { id in fetched.first { $0.id == id } }
            await refreshEntitlements()
        } catch {
            lastError = "Produkte konnten nicht geladen werden: \(error.localizedDescription)"
            AppLog.error("SubscriptionService.loadProducts error: \(error)")
        }
    }

    // MARK: - Purchase

    @discardableResult
    func purchase(_ product: StoreKit.Product) async -> Bool {
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await transaction.finish()
                await refreshEntitlements()
                return true
            case .userCancelled:
                return false
            case .pending:
                lastError = "Kauf wartet auf Bestätigung (Ask-to-Buy o. ä.)."
                return false
            @unknown default:
                return false
            }
        } catch {
            lastError = "Kauf fehlgeschlagen: \(error.localizedDescription)"
            AppLog.error("SubscriptionService.purchase error: \(error)")
            return false
        }
    }

    /// Required by Apple for App Store review — must be reachable from the paywall UI.
    func restorePurchases() async {
        do {
            try await AppStore.sync()
            await refreshEntitlements()
        } catch {
            lastError = "Wiederherstellen fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    // MARK: - Entitlements

    func refreshEntitlements() async {
        var owned = Set<String>()
        var highest: SubscriptionTier = .free
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard transaction.revocationDate == nil else { continue }
            if let expiration = transaction.expirationDate, expiration < Date() { continue }
            owned.insert(transaction.productID)
            if let pid = SubscriptionProductID(rawValue: transaction.productID), pid.tier > highest {
                highest = pid.tier
            }
        }
        self.purchasedProductIDs = owned
        self.currentTier = highest
    }

    private func listenForTransactionUpdates() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    await self.refreshEntitlements()
                }
            }
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error): throw error
        case .verified(let value):      return value
        }
    }

    // MARK: - Convenience

    var hasPlus: Bool { currentTier >= .plus }
    var hasPro:  Bool { currentTier == .pro }

    func product(for id: SubscriptionProductID) -> StoreKit.Product? {
        products.first { $0.id == id.rawValue }
    }
}
