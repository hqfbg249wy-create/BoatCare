//
//  CheckoutView.swift
//  Skipily
//
//  Checkout flow: shipping address → review & pay (Stripe) → confirmation
//

import SwiftUI
import StripePaymentSheet
import Supabase

struct CheckoutView: View {
    @EnvironmentObject var authService: AuthService
    @Environment(CartManager.self) private var cartManager
    @Environment(\.dismiss) private var dismiss

    @State private var shippingAddress = ShippingAddress()
    @State private var buyerNote = ""
    @State private var isPlacingOrder = false
    @State private var placedOrders: [Order] = []
    @State private var errorMessage: String?
    @State private var currentStep = 0 // 0: address, 1: review+pay, 2: confirmation

    // Stripe
    @State private var paymentSheet: PaymentSheet?
    @State private var isPreparingPayment = false

    var body: some View {
        VStack(spacing: 0) {
            stepIndicator

            if currentStep == 0 {
                addressStep
            } else if currentStep == 1 {
                reviewAndPayStep
            } else {
                confirmationStep
            }
        }
        .navigationTitle("Checkout")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(currentStep == 2)
        .onAppear { loadSavedAddress() }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        HStack(spacing: 0) {
            stepDot(index: 0, label: "Adresse")
            stepLine(completed: currentStep > 0)
            stepDot(index: 1, label: "Bezahlen")
            stepLine(completed: currentStep > 1)
            stepDot(index: 2, label: "Bestätigung")
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 16)
    }

    private func stepDot(index: Int, label: String) -> some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(currentStep >= index ? AppColors.primary : AppColors.gray200)
                    .frame(width: 32, height: 32)
                if currentStep > index {
                    Image(systemName: "checkmark")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                } else {
                    Text("\(index + 1)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(currentStep >= index ? .white : AppColors.gray500)
                }
            }
            Text(label)
                .font(.caption2)
                .foregroundStyle(currentStep >= index ? AppColors.primary : AppColors.gray400)
        }
    }

    private func stepLine(completed: Bool) -> some View {
        Rectangle()
            .fill(completed ? AppColors.primary : AppColors.gray200)
            .frame(height: 2)
            .padding(.bottom, 16)
    }

    // MARK: - Step 1: Address

    private var addressStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Lieferadresse")
                    .font(.title3)
                    .fontWeight(.bold)

                VStack(spacing: 14) {
                    TextField("Vollständiger Name", text: $shippingAddress.name)
                        .textContentType(.name)
                        .textFieldStyle(.roundedBorder)

                    TextField("Straße + Hausnummer", text: $shippingAddress.street)
                        .textContentType(.streetAddressLine1)
                        .textFieldStyle(.roundedBorder)

                    HStack(spacing: 12) {
                        TextField("PLZ", text: $shippingAddress.postalCode)
                            .textContentType(.postalCode)
                            .keyboardType(.numberPad)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 120)

                        TextField("Stadt", text: $shippingAddress.city)
                            .textContentType(.addressCity)
                            .textFieldStyle(.roundedBorder)
                    }

                    HStack {
                        Text("Land")
                            .font(.subheadline)
                            .foregroundStyle(AppColors.gray500)
                        Spacer()
                        Picker("Land", selection: $shippingAddress.country) {
                            Text("Deutschland").tag("DE")
                            Text("Österreich").tag("AT")
                            Text("Schweiz").tag("CH")
                            Text("Niederlande").tag("NL")
                            Text("Frankreich").tag("FR")
                            Text("Italien").tag("IT")
                            Text("Spanien").tag("ES")
                            Text("Kroatien").tag("HR")
                            Text("Griechenland").tag("GR")
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Anmerkung (optional)")
                        .font(.subheadline)
                        .foregroundStyle(AppColors.gray500)
                    TextField("z.B. Lieferung an Steg 5, Marina Kiel", text: $buyerNote, axis: .vertical)
                        .lineLimit(3...6)
                        .textFieldStyle(.roundedBorder)
                }

                Button {
                    withAnimation { currentStep = 1 }
                } label: {
                    Text("Weiter zur Bestellübersicht")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(shippingAddress.isComplete ? AppColors.primary : AppColors.gray300)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!shippingAddress.isComplete)
            }
            .padding(16)
        }
    }

    // MARK: - Step 2: Review + Pay

    private var reviewAndPayStep: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Bestellübersicht")
                        .font(.title3)
                        .fontWeight(.bold)

                    // Address summary
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            HStack(spacing: 6) {
                                Image(systemName: "location.fill")
                                    .font(.caption)
                                    .foregroundStyle(AppColors.primary)
                                Text("Lieferadresse")
                                    .font(.headline)
                            }
                            Spacer()
                            Button("Ändern") {
                                withAnimation { currentStep = 0 }
                            }
                            .font(.caption)
                            .foregroundStyle(AppColors.primary)
                        }
                        Text(shippingAddress.name)
                        Text(shippingAddress.street)
                        Text("\(shippingAddress.postalCode) \(shippingAddress.city)")
                    }
                    .font(.subheadline)
                    .foregroundStyle(AppColors.gray700)
                    .padding(16)
                    .background(AppColors.gray50)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Order groups
                    ForEach(cartManager.groupedByProvider) { group in
                        orderGroupCard(group)
                    }

                    // Grand total
                    HStack {
                        Text("Gesamtbetrag")
                            .font(.title3)
                            .fontWeight(.bold)
                        Spacer()
                        Text(cartManager.displayGrandTotal)
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundStyle(AppColors.primary)
                    }

                    if let error = errorMessage {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(AppColors.error)
                            Text(error)
                                .font(.callout)
                        }
                        .foregroundStyle(AppColors.error)
                        .padding(12)
                        .background(AppColors.error.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    // Payment methods
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 6) {
                            Image(systemName: "creditcard.fill")
                                .foregroundStyle(AppColors.info)
                            Text("Zahlungsmethoden")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                        }

                        HStack(spacing: 12) {
                            payBadge("Kreditkarte", icon: "creditcard")
                            payBadge("SEPA", icon: "building.columns")
                            payBadge("Apple Pay", icon: "apple.logo")
                        }

                        HStack(spacing: 6) {
                            Image(systemName: "testtube.2")
                                .font(.caption2)
                                .foregroundStyle(AppColors.warning)
                            Text("Testmodus – Keine echten Kosten. Testkarte: 4242 4242 4242 4242")
                                .font(.caption2)
                                .foregroundStyle(AppColors.gray400)
                        }
                        .padding(10)
                        .background(AppColors.warning.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .padding(16)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.04), radius: 4, y: 1)
                }
                .padding(16)
            }

            // Pay button
            VStack(spacing: 8) {
                Divider()
                Button {
                    Task { await placeOrderAndPay() }
                } label: {
                    HStack(spacing: 8) {
                        if isPlacingOrder || isPreparingPayment {
                            ProgressView().tint(.white)
                            Text(isPreparingPayment ? "Zahlung vorbereiten..." : "Bestellung erstellen...")
                                .fontWeight(.semibold)
                        } else {
                            Image(systemName: "lock.fill")
                                .font(.caption)
                            Text("Jetzt bezahlen – \(cartManager.displayGrandTotal)")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(AppColors.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(isPlacingOrder || isPreparingPayment)
                .padding(.horizontal, 16)

                HStack(spacing: 4) {
                    Image(systemName: "lock.shield.fill")
                        .font(.caption2)
                    Text("Sichere Zahlung über Stripe")
                        .font(.caption2)
                }
                .foregroundStyle(AppColors.gray400)
                .padding(.bottom, 8)
            }
            .background(Color(.systemBackground))
        }
    }

    private func orderGroupCard(_ group: CartGroup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "building.2")
                    .font(.caption)
                    .foregroundStyle(AppColors.primary)
                Text(group.providerName)
                    .font(.headline)
            }

            ForEach(group.items) { item in
                HStack {
                    Text("\(item.quantity)x \(item.product.name)")
                        .font(.subheadline)
                        .lineLimit(1)
                    Spacer()
                    Text(item.displayLineTotal)
                        .font(.subheadline)
                }
            }

            HStack {
                Text("Versand")
                    .font(.caption)
                    .foregroundStyle(AppColors.gray500)
                Spacer()
                Text(group.displayShipping)
                    .font(.caption)
                    .foregroundStyle(group.shippingCost == 0 ? AppColors.success : AppColors.gray500)
            }

            HStack {
                Text("Summe")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                Text(group.displayTotal)
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }
        }
        .padding(16)
        .background(AppColors.gray50)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func payBadge(_ label: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(label)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(AppColors.gray100)
        .foregroundStyle(AppColors.gray700)
        .clipShape(Capsule())
    }

    // MARK: - Step 3: Confirmation

    private var confirmationStep: some View {
        VStack(spacing: 24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(AppColors.success.opacity(0.1))
                    .frame(width: 120, height: 120)
                Circle()
                    .fill(AppColors.success.opacity(0.2))
                    .frame(width: 90, height: 90)
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(AppColors.success)
            }

            Text("Zahlung erfolgreich!")
                .font(.title2)
                .fontWeight(.bold)

            VStack(spacing: 6) {
                ForEach(placedOrders) { order in
                    HStack(spacing: 6) {
                        Image(systemName: "number")
                            .font(.caption)
                            .foregroundStyle(AppColors.primary)
                        Text(order.orderNumber ?? order.id.uuidString.prefix(8).description)
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }
                }
            }

            Text("Du erhältst eine Bestätigung per E-Mail.\nDer Anbieter wird Deine Bestellung bearbeiten.")
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
                .multilineTextAlignment(.center)

            // Total recap
            HStack {
                Text("Bezahlt")
                    .font(.subheadline)
                    .foregroundStyle(AppColors.gray500)
                Spacer()
                let totalPaid = placedOrders.reduce(0.0) { $0 + $1.total }
                Text(String(format: "%.2f €", totalPaid).replacingOccurrences(of: ".", with: ","))
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(AppColors.success)
            }
            .padding(16)
            .background(AppColors.success.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 24)

            Spacer()

            Button {
                dismiss()
            } label: {
                Text("Zurück zum Shop")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(AppColors.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
    }

    // MARK: - Actions

    private func loadSavedAddress() {
        if let profile = authService.userProfile {
            shippingAddress.name = profile.fullName ?? ""
            shippingAddress.street = profile.shippingStreet ?? ""
            shippingAddress.city = profile.shippingCity ?? ""
            shippingAddress.postalCode = profile.shippingPostalCode ?? ""
            shippingAddress.country = profile.shippingCountry ?? "DE"
        }
    }

    private func placeOrderAndPay() async {
        guard let buyerId = authService.currentUser?.id else {
            errorMessage = "Bitte melde Dich an"
            return
        }

        errorMessage = nil
        isPlacingOrder = true

        do {
            // 0. Refresh auth session to ensure valid JWT
            let supabase = SupabaseManager.shared.client
            do {
                _ = try await supabase.auth.refreshSession()
                print("✅ Session refreshed before checkout")
            } catch {
                print("⚠️ Session refresh failed, trying with existing session: \(error)")
            }

            // 1. Create orders in DB
            placedOrders = try await OrderService.shared.createOrders(
                from: cartManager.groupedByProvider,
                buyerId: buyerId,
                shippingAddress: shippingAddress,
                buyerNote: buyerNote.isEmpty ? nil : buyerNote
            )

            isPlacingOrder = false
            isPreparingPayment = true

            // 2. Create Stripe PaymentIntent
            let totalAmount = placedOrders.reduce(0.0) { $0 + $1.total }
            let sheet = try await PaymentService.shared.createPaymentSheet(
                for: placedOrders,
                totalAmount: totalAmount
            )

            isPreparingPayment = false
            paymentSheet = sheet

            // 3. Present Payment Sheet
            presentPaymentSheet()

        } catch {
            isPlacingOrder = false
            isPreparingPayment = false
            print("❌ Checkout error: \(error)")
            errorMessage = "Fehler: \(error.localizedDescription)"
        }
    }

    private func presentPaymentSheet() {
        guard let sheet = paymentSheet else { return }

        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = windowScene.windows.first?.rootViewController else {
            errorMessage = "Zahlung konnte nicht angezeigt werden"
            return
        }

        var topVC = rootVC
        while let presented = topVC.presentedViewController {
            topVC = presented
        }

        sheet.present(from: topVC) { result in
            Task { @MainActor in
                await handlePaymentResult(result)
            }
        }
    }

    private func handlePaymentResult(_ result: PaymentSheetResult) async {
        let orderIds = placedOrders.map { $0.id }

        switch result {
        case .completed:
            do {
                try await PaymentService.shared.confirmPayment(orderIds: orderIds)

                if var profile = authService.userProfile {
                    profile.shippingStreet = shippingAddress.street
                    profile.shippingCity = shippingAddress.city
                    profile.shippingPostalCode = shippingAddress.postalCode
                    profile.shippingCountry = shippingAddress.country
                    try? await authService.updateProfile(profile)
                }

                cartManager.clearCart()
                withAnimation { currentStep = 2 }
            } catch {
                errorMessage = "Zahlung erfolgreich, Status-Update fehlgeschlagen"
            }

        case .canceled:
            errorMessage = nil // User cancelled, can retry

        case .failed(let error):
            try? await PaymentService.shared.failPayment(orderIds: orderIds)
            errorMessage = "Zahlung fehlgeschlagen: \(error.localizedDescription)"
        }
    }
}
