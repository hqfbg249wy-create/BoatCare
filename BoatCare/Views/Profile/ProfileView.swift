//
//  ProfileView.swift
//  BoatCare
//
//  User profile: personal data, shipping, boat selection, payment methods
//

import SwiftUI
import Auth
import StripePaymentSheet
import Supabase

// MARK: - Simple Boat model for picker
struct BoatInfo: Codable, Identifiable, Sendable {
    let id: UUID
    let name: String
    let boatType: String
    let manufacturer: String
    let model: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case boatType = "boat_type"
        case manufacturer, model
    }

    var displayName: String {
        if !manufacturer.isEmpty && !model.isEmpty {
            return "\(name) (\(manufacturer) \(model))"
        } else if !manufacturer.isEmpty {
            return "\(name) (\(manufacturer))"
        }
        return name
    }
}

struct ProfileView: View {
    @Environment(AuthService.self) private var authService

    // Personal data
    @State private var fullName = ""
    @State private var email = ""

    // Shipping address
    @State private var shippingStreet = ""
    @State private var shippingCity = ""
    @State private var shippingPostalCode = ""
    @State private var shippingCountry = "DE"

    // Boat selection
    @State private var boats: [BoatInfo] = []
    @State private var selectedBoatId: UUID?
    @State private var isLoadingBoats = false

    // Payment
    @State private var isSettingUpPayment = false
    @State private var paymentSetupSheet: PaymentSheet?

    // UI state
    @State private var isSaving = false
    @State private var showSavedToast = false
    @State private var showLogoutConfirm = false
    @State private var errorMessage: String?

    private let paymentService = PaymentService.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // MARK: - Profile Completion
                    if let profile = authService.userProfile, !profile.isComplete {
                        completionBanner(profile: profile)
                    }

                    // MARK: - Avatar
                    avatarSection

                    // MARK: - Personal Data
                    personalDataSection

                    // MARK: - Shipping Address
                    shippingSection

                    // MARK: - Boot Selection
                    boatSelectionSection

                    // MARK: - Payment Methods
                    paymentSection

                    // MARK: - Save Button
                    saveButton

                    Divider()
                        .padding(.horizontal, 16)

                    // MARK: - Logout
                    logoutButton

                    // Version
                    Text("BoatCare v1.0 - Testphase")
                        .font(.caption2)
                        .foregroundStyle(AppColors.gray400)
                        .padding(.bottom, 20)
                }
            }
            .navigationTitle("Profil")
            .alert("Abmelden?", isPresented: $showLogoutConfirm) {
                Button("Abmelden", role: .destructive) {
                    Task { await authService.signOut() }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Möchtest Du Dich wirklich abmelden?")
            }
            .overlay(alignment: .top) {
                if showSavedToast {
                    toastView("Profil gespeichert", icon: "checkmark.circle.fill", color: AppColors.success)
                }
            }
            .task {
                loadProfile()
                await loadBoats()
            }
        }
    }

    // MARK: - Completion Banner

    private func completionBanner(profile: UserProfile) -> some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "person.badge.clock")
                    .foregroundStyle(AppColors.primary)
                Text("Profil vervollständigen")
                    .font(.headline)
                Spacer()
                Text("\(Int(profile.completionProgress * 100))%")
                    .font(.headline)
                    .foregroundStyle(AppColors.primary)
            }

            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppColors.gray100)
                        .frame(height: 8)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppColors.primary)
                        .frame(width: geo.size.width * profile.completionProgress, height: 8)
                        .animation(.spring(duration: 0.5), value: profile.completionProgress)
                }
            }
            .frame(height: 8)

            // Missing steps
            if !profile.missingSteps.isEmpty {
                HStack(spacing: 8) {
                    ForEach(profile.missingSteps, id: \.self) { step in
                        HStack(spacing: 4) {
                            Image(systemName: "circle")
                                .font(.caption2)
                                .foregroundStyle(AppColors.gray400)
                            Text(step)
                                .font(.caption)
                                .foregroundStyle(AppColors.gray500)
                        }
                    }
                    Spacer()
                }
            }
        }
        .padding(16)
        .background(AppColors.primary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Avatar

    private var avatarSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(AppColors.primary)

            Text(authService.userProfile?.fullName ?? "Benutzer")
                .font(.title3)
                .fontWeight(.semibold)

            Text(authService.currentUser?.email ?? "")
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    // MARK: - Personal Data

    private var personalDataSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Persönliche Daten", icon: "person.fill")

            TextField("Vollständiger Name", text: $fullName)
                .textContentType(.name)
                .textFieldStyle(.roundedBorder)

            TextField("E-Mail", text: $email)
                .textContentType(.emailAddress)
                .textFieldStyle(.roundedBorder)
                .disabled(true)
                .foregroundStyle(AppColors.gray400)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Shipping Address

    private var shippingSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Lieferadresse", icon: "shippingbox.fill")

            TextField("Straße + Hausnummer", text: $shippingStreet)
                .textContentType(.streetAddressLine1)
                .textFieldStyle(.roundedBorder)

            HStack(spacing: 12) {
                TextField("PLZ", text: $shippingPostalCode)
                    .textContentType(.postalCode)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 120)

                TextField("Stadt", text: $shippingCity)
                    .textContentType(.addressCity)
                    .textFieldStyle(.roundedBorder)
            }

            Picker("Land", selection: $shippingCountry) {
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
        .padding(.horizontal, 16)
    }

    // MARK: - Boat Selection

    private var boatSelectionSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Mein Boot", icon: "sailboat.fill")

            if isLoadingBoats {
                HStack {
                    ProgressView()
                    Text("Boote laden...")
                        .font(.subheadline)
                        .foregroundStyle(AppColors.gray500)
                }
            } else if boats.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(AppColors.info)
                    Text("Noch keine Boote registriert. Füge Dein Boot im Boote-Tab hinzu.")
                        .font(.subheadline)
                        .foregroundStyle(AppColors.gray500)
                }
                .padding(12)
                .background(AppColors.gray50)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Picker("Boot auswählen", selection: $selectedBoatId) {
                    Text("Kein Boot ausgewählt").tag(nil as UUID?)
                    ForEach(boats) { boat in
                        Text(boat.displayName).tag(boat.id as UUID?)
                    }
                }
                .pickerStyle(.menu)

                if let boat = boats.first(where: { $0.id == selectedBoatId }) {
                    HStack(spacing: 12) {
                        Image(systemName: "sailboat.fill")
                            .foregroundStyle(AppColors.primary)
                            .font(.title3)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(boat.name)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            if !boat.boatType.isEmpty {
                                Text("\(boat.boatType) • \(boat.manufacturer) \(boat.model)")
                                    .font(.caption)
                                    .foregroundStyle(AppColors.gray500)
                            }
                        }
                        Spacer()
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(AppColors.success)
                    }
                    .padding(12)
                    .background(AppColors.success.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                Text("Dein ausgewähltes Boot wird für passende Shop-Empfehlungen verwendet.")
                    .font(.caption)
                    .foregroundStyle(AppColors.gray400)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Payment Methods

    private var paymentSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Zahlungsmethode", icon: "creditcard.fill")

            if let profile = authService.userProfile, profile.hasPaymentMethod {
                // Has saved payment method
                HStack(spacing: 12) {
                    Image(systemName: "creditcard.fill")
                        .foregroundStyle(AppColors.success)
                        .font(.title3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Zahlungsmethode hinterlegt")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        Text("Deine Karte ist für schnelle Zahlungen gespeichert")
                            .font(.caption)
                            .foregroundStyle(AppColors.gray500)
                    }
                    Spacer()
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(AppColors.success)
                }
                .padding(12)
                .background(AppColors.success.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 10))

                Button {
                    Task { await setupPaymentMethod() }
                } label: {
                    HStack {
                        if isSettingUpPayment {
                            ProgressView().tint(AppColors.primary)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                            Text("Zahlungsmethode ändern")
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(AppColors.primary)
                }
                .disabled(isSettingUpPayment)
            } else {
                // No payment method yet
                HStack(spacing: 12) {
                    Image(systemName: "creditcard")
                        .foregroundStyle(AppColors.gray400)
                        .font(.title3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Keine Zahlungsmethode")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        Text("Hinterlege eine Karte für schnellere Bestellungen")
                            .font(.caption)
                            .foregroundStyle(AppColors.gray500)
                    }
                }
                .padding(12)
                .background(AppColors.gray50)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                Button {
                    Task { await setupPaymentMethod() }
                } label: {
                    HStack {
                        if isSettingUpPayment {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "plus.circle.fill")
                            Text("Zahlungsmethode hinzufügen")
                                .fontWeight(.medium)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(AppColors.info)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(isSettingUpPayment)
            }

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(AppColors.error)
            }

            HStack(spacing: 4) {
                Image(systemName: "lock.shield.fill")
                    .font(.caption2)
                Text("Zahlungsdaten werden sicher bei Stripe gespeichert")
                    .font(.caption2)
            }
            .foregroundStyle(AppColors.gray400)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Save Button

    private var saveButton: some View {
        Button {
            Task { await saveProfile() }
        } label: {
            HStack {
                if isSaving {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: "checkmark")
                    Text("Speichern")
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(AppColors.primary)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(isSaving)
        .padding(.horizontal, 16)
    }

    // MARK: - Logout Button

    private var logoutButton: some View {
        Button(role: .destructive) {
            showLogoutConfirm = true
        } label: {
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                Text("Abmelden")
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(AppColors.error.opacity(0.1))
            .foregroundStyle(AppColors.error)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(AppColors.primary)
            Text(title)
                .font(.headline)
                .foregroundStyle(AppColors.gray700)
        }
    }

    private func toastView(_ text: String, icon: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(text)
                .fontWeight(.medium)
        }
        .font(.subheadline)
        .foregroundStyle(.white)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(color)
        .clipShape(Capsule())
        .shadow(radius: 8)
        .padding(.top, 8)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: - Data Loading

    private func loadProfile() {
        if let profile = authService.userProfile {
            fullName = profile.fullName ?? ""
            email = profile.email ?? authService.currentUser?.email ?? ""
            shippingStreet = profile.shippingStreet ?? ""
            shippingCity = profile.shippingCity ?? ""
            shippingPostalCode = profile.shippingPostalCode ?? ""
            shippingCountry = profile.shippingCountry ?? "DE"
            selectedBoatId = profile.preferredBoatId
        }
    }

    private func loadBoats() async {
        guard let userId = authService.currentUser?.id else { return }
        isLoadingBoats = true
        do {
            let data: [BoatInfo] = try await SupabaseManager.shared.client
                .from("boats")
                .select("id, name, boat_type, manufacturer, model")
                .eq("owner_id", value: userId.uuidString)
                .order("name")
                .execute()
                .value
            boats = data
        } catch {
            print("Failed to load boats: \(error)")
        }
        isLoadingBoats = false
    }

    // MARK: - Save Profile

    private func saveProfile() async {
        guard var profile = authService.userProfile else { return }
        isSaving = true

        profile.fullName = fullName
        profile.shippingStreet = shippingStreet
        profile.shippingCity = shippingCity
        profile.shippingPostalCode = shippingPostalCode
        profile.shippingCountry = shippingCountry
        profile.preferredBoatId = selectedBoatId

        do {
            try await authService.updateProfile(profile)
            withAnimation(.spring(duration: 0.3)) {
                showSavedToast = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                withAnimation { showSavedToast = false }
            }
        } catch {
            print("Save profile error: \(error)")
        }
        isSaving = false
    }

    // MARK: - Stripe Setup

    private func setupPaymentMethod() async {
        isSettingUpPayment = true
        errorMessage = nil

        do {
            let (sheet, customerId) = try await paymentService.createSetupSheet()
            paymentSetupSheet = sheet

            // Present the PaymentSheet
            paymentSetupSheet?.present(from: UIApplication.shared.rootViewController!) { result in
                Task { @MainActor in
                    switch result {
                    case .completed:
                        // Save stripe_customer_id to profile
                        if var profile = authService.userProfile {
                            profile.stripeCustomerId = customerId
                            try? await authService.updateProfile(profile)
                        }
                        withAnimation(.spring(duration: 0.3)) {
                            showSavedToast = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation { showSavedToast = false }
                        }
                    case .canceled:
                        break
                    case .failed(let error):
                        errorMessage = error.localizedDescription
                    }
                    isSettingUpPayment = false
                }
            }
        } catch {
            errorMessage = error.localizedDescription
            isSettingUpPayment = false
        }
    }
}

// MARK: - UIApplication extension for root view controller

extension UIApplication {
    var rootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first(where: { $0.isKeyWindow })?
            .rootViewController
    }
}
