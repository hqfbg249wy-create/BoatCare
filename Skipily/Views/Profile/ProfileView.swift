//
//  ProfileView.swift
//  Skipily
//
//  User profile: personal data, shipping, boat selection, payment methods
//

import SwiftUI
import StripePaymentSheet
import Supabase
import PhotosUI

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
    @EnvironmentObject var authService: AuthService

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

    // Profile photo
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var profileImage: UIImage?
    @State private var isUploadingPhoto = false

    // UI state
    @State private var isSaving = false
    @State private var showSavedToast = false
    @State private var showLogoutConfirm = false
    @State private var showDeleteAccountConfirm = false
    @State private var showDeleteAccountFinalConfirm = false
    @State private var isDeletingAccount = false
    @State private var errorMessage: String?

    private var appVersionString: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "Skipily \(v) (\(b))"
    }

    private let paymentService = PaymentService.shared

    var body: some View {
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

                // MARK: - Delete Account
                deleteAccountButton

                // Version
                Text(appVersionString)
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
        .alert("Konto wirklich löschen?", isPresented: $showDeleteAccountConfirm) {
            Button("Weiter", role: .destructive) {
                showDeleteAccountFinalConfirm = true
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Dein Konto und ALLE zugehörigen Daten (Boote, Ausrüstung, Wartung, Nachrichten, Bestellungen, Fotos) werden unwiderruflich gelöscht.")
        }
        .alert("Letzte Bestätigung", isPresented: $showDeleteAccountFinalConfirm) {
            Button("Endgültig löschen", role: .destructive) {
                Task { await deleteAccount() }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Diese Aktion kann nicht rückgängig gemacht werden. Alle Daten werden sofort gelöscht.")
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
            // Profile photo with picker
            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                ZStack(alignment: .bottomTrailing) {
                    if let img = profileImage {
                        Image(uiImage: img)
                            .resizable().scaledToFill()
                            .frame(width: 90, height: 90)
                            .clipShape(Circle())
                    } else if let urlStr = authService.userProfile?.avatarUrl,
                              let url = URL(string: urlStr) {
                        AsyncImage(url: url) { phase in
                            if case .success(let image) = phase {
                                image.resizable().scaledToFill()
                                    .frame(width: 90, height: 90)
                                    .clipShape(Circle())
                            } else {
                                defaultAvatar
                            }
                        }
                    } else {
                        defaultAvatar
                    }

                    // Camera badge
                    Image(systemName: "camera.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(AppColors.primary)
                        .background(Circle().fill(.white).frame(width: 24, height: 24))
                }
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                guard let newItem else { return }
                Task { await loadAndUploadProfilePhoto(newItem) }
            }

            if isUploadingPhoto {
                ProgressView("Foto wird hochgeladen...")
                    .font(.caption)
            }

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

    private var defaultAvatar: some View {
        Image(systemName: "person.crop.circle.fill")
            .font(.system(size: 72))
            .foregroundStyle(AppColors.primary)
            .frame(width: 90, height: 90)
    }

    private func loadAndUploadProfilePhoto(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let uiImage = UIImage(data: data) else { return }

        await MainActor.run { profileImage = uiImage; isUploadingPhoto = true }

        // Compress and upload to Supabase storage
        guard let jpegData = uiImage.jpegData(compressionQuality: 0.7),
              let userId = authService.currentUser?.id else {
            await MainActor.run { isUploadingPhoto = false }
            return
        }

        let path = "avatars/\(userId.uuidString).jpg"
        do {
            // Upload to Supabase storage bucket "user-photos"
            try await SupabaseManager.shared.client.storage
                .from("user-photos")
                .upload(path, data: jpegData, options: .init(contentType: "image/jpeg", upsert: true))

            // Get public URL
            let publicURL = try SupabaseManager.shared.client.storage
                .from("user-photos")
                .getPublicURL(path: path)

            // Update profile
            if var profile = authService.userProfile {
                profile.avatarUrl = publicURL.absoluteString
                try await authService.updateProfile(profile)
            }
        } catch {
            AppLog.error("Avatar upload error: \(error)")
        }

        await MainActor.run { isUploadingPhoto = false }
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

    // MARK: - Delete Account Button

    private var deleteAccountButton: some View {
        VStack(spacing: 8) {
            Button(role: .destructive) {
                showDeleteAccountConfirm = true
            } label: {
                HStack {
                    if isDeletingAccount {
                        ProgressView().tint(AppColors.error)
                    } else {
                        Image(systemName: "trash")
                        Text("Konto löschen")
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(AppColors.error.opacity(0.08))
                .foregroundStyle(AppColors.error)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(AppColors.error.opacity(0.4), lineWidth: 1)
                )
            }
            .disabled(isDeletingAccount)

            Text("Dein Konto und alle zugehörigen Daten werden unwiderruflich gelöscht.")
                .font(.caption2)
                .foregroundStyle(AppColors.gray400)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 16)
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        errorMessage = nil
        do {
            try await authService.deleteAccount()
        } catch {
            errorMessage = "Löschen fehlgeschlagen: \(error.localizedDescription)"
            AppLog.error("Delete account error: \(error)")
        }
        isDeletingAccount = false
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
            AppLog.error("Failed to load boats: \(error)")
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
            AppLog.error("Save profile error: \(error)")
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

            // Present the PaymentSheet from the actually visible view controller.
            // Force-unwrapping rootViewController crashed on iPad / multi-scene
            // and when the Profile tab was nested in a NavigationStack.
            guard let presenter = UIApplication.shared.topMostViewController else {
                errorMessage = "Zahlungs-Sheet konnte nicht angezeigt werden."
                isSettingUpPayment = false
                return
            }

            paymentSetupSheet?.present(from: presenter) { result in
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

// MARK: - UIApplication extension for top-most view controller

extension UIApplication {
    /// Root VC of the key window (may be nil right after launch).
    var rootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap { $0.windows }
            .first(where: { $0.isKeyWindow })?
            .rootViewController
            ?? connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first?.rootViewController
    }

    /// Walks up presentedViewController / nav / tab hierarchy so we always
    /// hand Stripe the actually visible VC. Required because the profile
    /// lives inside a TabView + NavigationStack and presenting from the
    /// raw rootVC throws "view not in window hierarchy" → crash.
    var topMostViewController: UIViewController? {
        var top = rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        if let nav = top as? UINavigationController {
            return nav.visibleViewController ?? nav
        }
        if let tab = top as? UITabBarController, let selected = tab.selectedViewController {
            return selected
        }
        return top
    }
}
