//
//  PlusUpgradeSheet.swift
//  Skipily
//
//  Upgrade-Sheet das geöffnet wird wenn der User auf das KI-Limit stößt
//  oder ein Plus-Feature nutzen will. Zeigt die verfügbaren Plus-Pläne
//  aus dem App Store (über StoreKit 2) und triggert den Kauf-Flow.
//
//  Layout: zwei Tier-Karten (Solo / Familie) mit Monat-/Jahr-Toggle.
//  Jahres-Auswahl trägt ein "2 Monate gratis"-Badge.
//  Freier Trial (Apple Introductory Offer) wird automatisch erkannt
//  und prominent in der gewählten Karte angezeigt.
//

import SwiftUI
import StoreKit

// MARK: - Tier-Modell

private enum PlanTier: String, CaseIterable, Identifiable {
    case solo    // skipily.plus.*
    case family  // skipily.pro.*

    var id: String { rawValue }
    var displayName: String { self == .solo ? "Skipily Plus" : "Skipily Plus Familie" }
    var icon: String        { self == .solo ? "person.fill" : "person.3.fill" }
    var idPrefix: String    { self == .solo ? "skipily.plus." : "skipily.pro." }
    var bullets: [String] {
        switch self {
        case .solo:
            return ["Unbegrenzte KI-Chats",
                    "Schadens-Foto-Analyse",
                    "Ausrüstungs-Empfehlungen"]
        case .family:
            return ["Alle Plus-Features",
                    "Bis 5 Skipper auf einem Boot",
                    "Gemeinsame Wartungsplanung"]
        }
    }
}

private enum BillingPeriod: String, Hashable {
    case monthly, yearly
    var idSuffix: String { self == .monthly ? "monthly" : "yearly" }
    var label: String    { self == .monthly ? "Monat" : "Jahr" }
}

// MARK: - View

struct PlusUpgradeSheet: View {
    @StateObject private var manager = PlusSubscriptionManager.shared
    @Environment(\.dismiss) private var dismiss

    /// Optionaler Kontext warum das Sheet angezeigt wird ("KI-Limit", "Foto-Analyse", …)
    var reason: String?

    /// Pro Tier gewählter Abrechnungs-Rhythmus. Default jährlich
    /// (Jahres-Discount ist das stärkere Angebot).
    @State private var selectedPeriod: [PlanTier: BillingPeriod] = [
        .solo: .yearly, .family: .yearly
    ]
    @State private var purchasing: String?
    @State private var purchaseError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header

                    if let reason {
                        Text(reason)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }

                    plansSection

                    if let err = purchaseError {
                        Text(err)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .padding(.horizontal)
                    }

                    Button("Käufe wiederherstellen") {
                        Task { await manager.restore() }
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                    Text("Du kannst das Abo jederzeit in den iPhone-Einstellungen kündigen.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.bottom)
                }
                .padding(.vertical)
            }
            .navigationTitle("Skipily Plus")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Schließen") { dismiss() }
                }
            }
        }
        .task { await manager.loadProducts() }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 10) {
            Text("✨").font(.system(size: 60))
            Text("Mehr aus deinem Boot herausholen")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("Alle Kernfunktionen bleiben gratis. Plus erweitert die App.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }

    // MARK: - Pläne

    @ViewBuilder
    private var plansSection: some View {
        if manager.isLoading {
            ProgressView("Pläne werden geladen…").padding()
        } else if manager.products.isEmpty {
            emptyState
        } else {
            VStack(spacing: 14) {
                ForEach(PlanTier.allCases) { tier in
                    if hasAnyProduct(for: tier) {
                        tierCard(tier)
                    }
                }
            }
            .padding(.horizontal)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title2).foregroundStyle(.orange)
            Text("Pläne können gerade nicht geladen werden.")
                .font(.subheadline.bold())
                .multilineTextAlignment(.center)
            if let err = manager.lastError {
                Text(err)
                    .font(.caption).foregroundStyle(.red)
                    .multilineTextAlignment(.center).padding(.horizontal)
            }
            Text("Mögliche Ursachen:\n• Produkte in App Store Connect noch nicht freigeschaltet\n• Kein gültiger Sandbox-Account auf diesem Gerät\n• Netzwerk-Problem")
                .font(.caption2).foregroundStyle(.secondary)
                .multilineTextAlignment(.leading).padding(.horizontal, 20)
            Button {
                Task { await manager.loadProducts() }
            } label: {
                Label("Erneut versuchen", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
        }
        .padding(.vertical)
    }

    // MARK: - Tier-Card

    @ViewBuilder
    private func tierCard(_ tier: PlanTier) -> some View {
        let period  = selectedPeriod[tier] ?? .yearly
        let product = product(for: tier, period: period)
        let isActive = product.map { manager.purchasedProductIDs.contains($0.id) } ?? false

        VStack(alignment: .leading, spacing: 14) {
            // Titel-Zeile
            HStack(spacing: 10) {
                Image(systemName: tier.icon)
                    .font(.title3).foregroundStyle(.purple)
                    .frame(width: 32, height: 32)
                    .background(Color.purple.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(tier.displayName).font(.headline)
                Spacer()
                if isActive {
                    Text("Aktiv")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Color.green).foregroundStyle(.white)
                        .clipShape(Capsule())
                }
            }

            // Bullet-Liste
            VStack(alignment: .leading, spacing: 4) {
                ForEach(tier.bullets, id: \.self) { bullet($0) }
            }

            // Monat / Jahr Picker — nur wenn beide Varianten existieren
            if hasAnyProduct(for: tier, period: .monthly)
            && hasAnyProduct(for: tier, period: .yearly) {
                periodPicker(for: tier)
            }

            // Preis-Block
            if let product {
                priceRow(tier: tier, period: period, product: product)
            }

            // Kauf-Button
            if let product, !isActive {
                purchaseButton(product: product)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(isActive ? Color.green.opacity(0.06) : Color(.secondarySystemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isActive ? Color.green : Color(.systemGray4), lineWidth: 1.5)
        )
    }

    private func periodPicker(for tier: PlanTier) -> some View {
        Picker("Abrechnung", selection: Binding(
            get: { selectedPeriod[tier] ?? .yearly },
            set: { selectedPeriod[tier] = $0 }
        )) {
            Text(BillingPeriod.monthly.label).tag(BillingPeriod.monthly)
            Text("\(BillingPeriod.yearly.label)  •  2 Monate gratis").tag(BillingPeriod.yearly)
        }
        .pickerStyle(.segmented)
    }

    @ViewBuilder
    private func priceRow(tier: PlanTier, period: BillingPeriod, product: StoreKit.Product) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(product.displayPrice).font(.title2.bold())
            Text(period == .yearly ? "/ Jahr" : "/ Monat")
                .font(.subheadline).foregroundStyle(.secondary)
            Spacer()
            if period == .yearly, let monthly = product(for: tier, period: .monthly) {
                savingsBadge(yearly: product, monthly: monthly)
            }
        }
        if let trialText = introductoryOfferText(product) {
            Label(trialText, systemImage: "gift.fill")
                .font(.caption.bold())
                .foregroundStyle(.green)
        }
    }

    private func savingsBadge(yearly: StoreKit.Product, monthly: StoreKit.Product) -> some View {
        let annual = monthly.price * 12
        let saved  = annual - yearly.price
        let pct    = saved > 0 ? Int((saved / annual * 100).rounded()) : 0
        return Text("Spare \(pct) %")
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.orange.opacity(0.15))
            .foregroundStyle(.orange)
            .clipShape(Capsule())
    }

    private func purchaseButton(product: StoreKit.Product) -> some View {
        let isPurchasing = purchasing == product.id
        let hasTrial     = product.subscription?.introductoryOffer?.paymentMode == .freeTrial
        return Button {
            Task { await buy(product) }
        } label: {
            HStack {
                if isPurchasing {
                    ProgressView().tint(.white)
                } else {
                    Text(hasTrial ? "Gratis testen" : "Abonnieren")
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.purple)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(isPurchasing)
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("✓").foregroundStyle(.green).fontWeight(.bold)
            Text(text)
        }
        .font(.subheadline)
    }

    // MARK: - Produkt-Mapping

    private func product(for tier: PlanTier, period: BillingPeriod) -> StoreKit.Product? {
        manager.products.first { $0.id == tier.idPrefix + period.idSuffix }
    }

    private func hasAnyProduct(for tier: PlanTier, period: BillingPeriod) -> Bool {
        product(for: tier, period: period) != nil
    }

    private func hasAnyProduct(for tier: PlanTier) -> Bool {
        hasAnyProduct(for: tier, period: .monthly) || hasAnyProduct(for: tier, period: .yearly)
    }

    /// Liefert lokalisierten Text für ein Introductory Offer (z. B. "7 Tage gratis testen").
    private func introductoryOfferText(_ product: StoreKit.Product) -> String? {
        guard let offer = product.subscription?.introductoryOffer,
              offer.paymentMode == .freeTrial else { return nil }
        let period = offer.period
        let unitText: String
        switch period.unit {
        case .day:   unitText = period.value == 1 ? "Tag" : "Tage"
        case .week:  unitText = period.value == 1 ? "Woche" : "Wochen"
        case .month: unitText = period.value == 1 ? "Monat" : "Monate"
        case .year:  unitText = period.value == 1 ? "Jahr" : "Jahre"
        @unknown default: return nil
        }
        return "\(period.value) \(unitText) gratis testen"
    }

    // MARK: - Kauf

    private func buy(_ product: StoreKit.Product) async {
        purchasing = product.id
        purchaseError = nil
        defer { purchasing = nil }
        do {
            _ = try await manager.purchase(product)
        } catch {
            purchaseError = "Kauf fehlgeschlagen: \(error.localizedDescription)"
        }
    }
}

#Preview {
    PlusUpgradeSheet(reason: "Du hast deine kostenlosen KI-Anfragen für diesen Monat aufgebraucht.")
}
