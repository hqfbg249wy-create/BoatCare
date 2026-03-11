//
//  CheckoutView.swift
//  BoatCare
//
//  Checkout flow: shipping address, order review, place order
//

import SwiftUI

struct CheckoutView: View {
    @Environment(AuthService.self) private var authService
    @Environment(CartManager.self) private var cartManager
    @Environment(\.dismiss) private var dismiss

    @State private var shippingAddress = ShippingAddress()
    @State private var buyerNote = ""
    @State private var isPlacingOrder = false
    @State private var orderPlaced = false
    @State private var placedOrders: [Order] = []
    @State private var errorMessage: String?
    @State private var currentStep = 0 // 0: address, 1: review, 2: confirmation

    var body: some View {
        VStack(spacing: 0) {
            // Step indicator
            stepIndicator

            if currentStep == 0 {
                addressStep
            } else if currentStep == 1 {
                reviewStep
            } else {
                confirmationStep
            }
        }
        .navigationTitle("Checkout")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(currentStep == 2)
        .onAppear {
            loadSavedAddress()
        }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        HStack(spacing: 0) {
            stepDot(index: 0, label: "Adresse")
            stepLine(completed: currentStep > 0)
            stepDot(index: 1, label: "Prüfen")
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

                // Buyer note
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

    // MARK: - Step 2: Review

    private var reviewStep: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Bestellübersicht")
                        .font(.title3)
                        .fontWeight(.bold)

                    // Shipping address summary
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Lieferadresse")
                                .font(.headline)
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
                        Text(shippingAddress.country)
                    }
                    .font(.subheadline)
                    .foregroundStyle(AppColors.gray700)
                    .padding(16)
                    .background(AppColors.gray50)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Order groups
                    ForEach(cartManager.groupedByProvider) { group in
                        orderGroupReview(group)
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
                    .padding(.top, 8)

                    if let error = errorMessage {
                        Text(error)
                            .font(.callout)
                            .foregroundStyle(AppColors.error)
                    }

                    // Payment info
                    HStack(spacing: 8) {
                        Image(systemName: "info.circle")
                            .foregroundStyle(AppColors.info)
                        Text("Zahlung wird in der Testphase simuliert. Keine echten Kosten.")
                            .font(.caption)
                            .foregroundStyle(AppColors.gray500)
                    }
                    .padding(12)
                    .background(AppColors.info.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(16)
            }

            // Place order button
            VStack(spacing: 8) {
                Divider()
                Button {
                    Task { await placeOrder() }
                } label: {
                    HStack(spacing: 8) {
                        if isPlacingOrder {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "checkmark.seal")
                            Text("Kostenpflichtig bestellen")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(AppColors.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(isPlacingOrder)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }
            .background(.white)
        }
    }

    private func orderGroupReview(_ group: CartGroup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(group.providerName)
                .font(.headline)

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

    // MARK: - Step 3: Confirmation

    private var confirmationStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 72))
                .foregroundStyle(AppColors.success)

            Text("Bestellung aufgegeben!")
                .font(.title2)
                .fontWeight(.bold)

            VStack(spacing: 4) {
                ForEach(placedOrders) { order in
                    Text("Bestellung \(order.orderNumber ?? order.id.uuidString.prefix(8).description)")
                        .font(.subheadline)
                        .foregroundStyle(AppColors.gray500)
                }
            }

            Text("Du erhältst eine Bestätigung per E-Mail.\nDer Anbieter wird Deine Bestellung bearbeiten.")
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
                .multilineTextAlignment(.center)

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

    private func placeOrder() async {
        guard let buyerId = authService.currentUser?.id else {
            errorMessage = "Bitte melde Dich an"
            return
        }

        isPlacingOrder = true
        errorMessage = nil

        do {
            placedOrders = try await OrderService.shared.createOrders(
                from: cartManager.groupedByProvider,
                buyerId: buyerId,
                shippingAddress: shippingAddress,
                buyerNote: buyerNote.isEmpty ? nil : buyerNote
            )

            // Save shipping address to profile
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
            errorMessage = "Bestellung fehlgeschlagen: \(error.localizedDescription)"
        }

        isPlacingOrder = false
    }
}
