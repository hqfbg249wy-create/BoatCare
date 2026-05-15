//
//  PlusUpgradeSheet.swift
//  Skipily
//
//  Upgrade-Sheet das geöffnet wird wenn der User auf das KI-Limit stößt
//  oder ein Plus-Feature nutzen will. Zeigt die verfügbaren Stripe-Plus-Pläne
//  aus dem App Store und triggert den Kauf-Flow.
//

import SwiftUI
import StoreKit

struct PlusUpgradeSheet: View {
    @StateObject private var manager = PlusSubscriptionManager.shared
    @Environment(\.dismiss) private var dismiss

    /// Optionaler Kontext warum das Sheet angezeigt wird ("KI-Limit", "Foto-Analyse", …)
    var reason: String?

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

                    if manager.isLoading {
                        ProgressView("Pläne werden geladen…")
                            .padding()
                    } else if manager.products.isEmpty {
                        Text("Keine Pläne verfügbar — bitte später erneut versuchen.")
                            .foregroundStyle(.secondary)
                    } else {
                        VStack(spacing: 12) {
                            ForEach(manager.products, id: \.id) { product in
                                planCard(product)
                            }
                        }
                        .padding(.horizontal)
                    }

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

    private var header: some View {
        VStack(spacing: 10) {
            Text("✨")
                .font(.system(size: 60))
            Text("Mehr aus deinem Boot herausholen")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 4) {
                bullet("Unbegrenzte KI-Chats")
                bullet("Schadens-Foto-Analyse")
                bullet("Ausrüstungs-Empfehlungen")
            }
            .padding(.horizontal, 32)
        }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("✓")
                .foregroundStyle(.green)
                .fontWeight(.bold)
            Text(text)
        }
        .font(.subheadline)
    }

    @ViewBuilder
    private func planCard(_ product: StoreKit.Product) -> some View {
        let isPurchasing = purchasing == product.id
        let isActive = manager.purchasedProductIDs.contains(product.id)

        Button {
            Task { await buy(product) }
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(product.displayName)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(product.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(product.displayPrice)
                        .font(.title3.bold())
                    if let period = product.subscription?.subscriptionPeriod {
                        Text(periodText(period))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isActive ? Color.green.opacity(0.08) : Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isActive ? .green : Color(.systemGray4), lineWidth: 1.5)
            )
            .overlay(alignment: .topTrailing) {
                if isActive {
                    Text("Aktiv")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Color.green)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                        .padding(6)
                }
                if isPurchasing {
                    ProgressView()
                        .padding(.trailing, 6)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isPurchasing || isActive)
    }

    private func periodText(_ period: StoreKit.Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .day:   return "pro Tag"
        case .week:  return "pro Woche"
        case .month: return period.value == 1 ? "pro Monat" : "alle \(period.value) Monate"
        case .year:  return "pro Jahr"
        @unknown default: return ""
        }
    }

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
    PlusUpgradeSheet(reason: "Du hast deine 2 kostenlosen KI-Anfragen für diesen Monat aufgebraucht.")
}
