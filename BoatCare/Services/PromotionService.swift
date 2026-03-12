//
//  PromotionService.swift
//  BoatCare
//
//  Service for fetching, matching and applying promotions to products
//

import Foundation
import Supabase

@Observable
@MainActor
final class PromotionService {
    static let shared = PromotionService()

    var activePromotions: [Promotion] = []
    var isLoaded = false

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    // MARK: - Load Active Promotions

    func loadActivePromotions() async {
        guard !isLoaded else { return }

        do {
            let promotions: [Promotion] = try await client
                .from("provider_promotions")
                .select()
                .eq("is_active", value: true)
                .execute()
                .value

            // Filter by validity dates client-side
            let now = Date()
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]

            activePromotions = promotions.filter { promo in
                // Check valid_from
                if let from = promo.validFrom,
                   let fromDate = formatter.date(from: from),
                   now < fromDate {
                    return false
                }
                // Check valid_until
                if let until = promo.validUntil,
                   let untilDate = formatter.date(from: until),
                   now > untilDate {
                    return false
                }
                // Check max uses
                if let max = promo.maxUses, let current = promo.currentUses, current >= max {
                    return false
                }
                return true
            }

            isLoaded = true
        } catch {
            print("Failed to load promotions: \(error)")
        }
    }

    /// Force refresh promotions
    func refresh() async {
        isLoaded = false
        await loadActivePromotions()
    }

    // MARK: - Match Promotions to Products

    /// Find the best applicable promotion for a product
    func bestPromotion(for product: Product) -> Promotion? {
        let applicable = activePromotions.filter { $0.appliesTo(product: product) }

        guard !applicable.isEmpty else { return nil }

        // Return the one with highest discount value
        return applicable.max { a, b in
            let priceA = product.price ?? 0
            let discountA = a.discountAmount(for: priceA)
            let discountB = b.discountAmount(for: priceA)
            return discountA < discountB
        }
    }

    /// Calculate discounted price for a product
    func discountedPrice(for product: Product) -> Double? {
        guard let promo = bestPromotion(for: product),
              let price = product.price else { return nil }

        let discount = promo.discountAmount(for: price)
        let discounted = price - discount
        return discounted > 0 ? discounted : nil
    }

    /// Get display string for discounted price
    func displayDiscountedPrice(for product: Product) -> String? {
        guard let discounted = discountedPrice(for: product) else { return nil }
        let currency = product.currency ?? "EUR"
        return String(format: "%.2f \(currency)", discounted)
            .replacingOccurrences(of: ".", with: ",")
    }

    /// Get the promotion badge text (e.g. "-10%" or "-5,00 €")
    func promotionBadgeText(for product: Product) -> String? {
        guard let promo = bestPromotion(for: product) else { return nil }
        return promo.displayDiscount
    }

    // MARK: - Cart Promotions

    /// Calculate total discount for cart items
    func calculateCartDiscount(items: [(product: Product, quantity: Int)]) -> Double {
        var totalDiscount = 0.0

        for item in items {
            guard let price = item.product.price else { continue }
            if let promo = bestPromotion(for: item.product) {
                let itemSubtotal = price * Double(item.quantity)
                totalDiscount += promo.discountAmount(for: itemSubtotal)
            }
        }

        return totalDiscount
    }
}
