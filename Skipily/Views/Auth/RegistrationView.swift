//
//  RegistrationView.swift
//  Skipily
//
//  Multi-step registration: Account → Personal Data → Privacy
//

import SwiftUI
import AuthenticationServices

struct RegistrationView: View {
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) private var dismiss

    @State private var currentStep = 1
    private let totalSteps = 3

    // Step 1: Account
    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var passwordConfirm = ""

    // Step 2: Personal Data
    @State private var phoneNumber = ""
    @State private var street = ""
    @State private var postalCode = ""
    @State private var city = ""
    @State private var country = "DE"

    // Step 3: Privacy
    @State private var privacyAccepted = false
    @State private var termsAccepted = false
    @State private var showPrivacyPolicy = false

    // General
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let countries = [
        ("DE", "Deutschland"), ("AT", "\u{00D6}sterreich"), ("CH", "Schweiz"),
        ("NL", "Niederlande"), ("FR", "Frankreich"), ("IT", "Italien"),
        ("ES", "Spanien"), ("HR", "Kroatien"), ("GR", "Griechenland")
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Progress indicator
            stepIndicator

            ScrollView {
                VStack(spacing: 24) {
                    switch currentStep {
                    case 1: accountStep
                    case 2: personalDataStep
                    case 3: privacyStep
                    default: EmptyView()
                    }
                }
                .padding(24)
            }

            // Navigation buttons
            navigationButtons
        }
        .navigationTitle("auth.registration".loc)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showPrivacyPolicy) {
            PrivacyPolicyView()
        }
        .onChange(of: authService.isAuthenticated) { _, isAuth in
            if isAuth && currentStep == 1 {
                // Account created, move to step 2
                currentStep = 2
            }
        }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        VStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(1...totalSteps, id: \.self) { step in
                    Capsule()
                        .fill(step <= currentStep ? AppColors.primary : AppColors.gray200)
                        .frame(height: 4)
                }
            }
            .padding(.horizontal, 24)

            Text(stepTitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 12)
    }

    private var stepTitle: String {
        switch currentStep {
        case 1: return "auth.step_1".loc
        case 2: return "auth.step_2".loc
        case 3: return "auth.step_3".loc
        default: return ""
        }
    }

    // MARK: - Step 1: Account

    private var accountStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("auth.create_account_title".loc)
                .font(.title2)
                .fontWeight(.bold)

            // Sign in with Apple — schnelle Registrierung
            SignInWithAppleButton(.signUp) { request in
                let appleRequest = authService.prepareAppleSignIn()
                request.requestedScopes = appleRequest.requestedScopes
                request.nonce = appleRequest.nonce
            } onCompletion: { result in
                Task { await authService.handleAppleSignIn(result: result) }
            }
            .signInWithAppleButtonStyle(
                UITraitCollection.current.userInterfaceStyle == .dark ? .white : .black
            )
            .frame(height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            HStack {
                Rectangle().frame(height: 1).foregroundStyle(.secondary.opacity(0.3))
                Text("auth.or_email".loc).font(.caption).foregroundStyle(.secondary)
                Rectangle().frame(height: 1).foregroundStyle(.secondary.opacity(0.3))
            }

            fieldLabel("auth.full_name_label".loc)
            TextField("Max Mustermann", text: $fullName)
                .textContentType(.name)
                .textFieldStyle(.roundedBorder)

            fieldLabel("auth.email_label".loc)
            TextField("max@beispiel.de", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .textFieldStyle(.roundedBorder)

            fieldLabel("auth.password_label".loc)
            SecureField("auth.password_min".loc, text: $password)
                .textContentType(.newPassword)
                .textFieldStyle(.roundedBorder)

            fieldLabel("auth.password_confirm_label".loc)
            SecureField("auth.password_repeat".loc, text: $passwordConfirm)
                .textContentType(.newPassword)
                .textFieldStyle(.roundedBorder)

            if password != passwordConfirm && !passwordConfirm.isEmpty {
                Text("auth.passwords_mismatch".loc)
                    .font(.caption)
                    .foregroundStyle(AppColors.error)
            }

            if let error = errorMessage {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(AppColors.error)
            }
        }
    }

    // MARK: - Step 2: Personal Data

    private var personalDataStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("auth.personal_data".loc)
                .font(.title2)
                .fontWeight(.bold)

            Text("auth.personal_data_hint".loc)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            fieldLabel("auth.phone_optional".loc)
            TextField("+49 ...", text: $phoneNumber)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .textFieldStyle(.roundedBorder)

            fieldLabel("auth.street_label".loc)
            TextField("Hafenstra\u{00DF}e 1", text: $street)
                .textContentType(.streetAddressLine1)
                .textFieldStyle(.roundedBorder)

            HStack(spacing: 12) {
                VStack(alignment: .leading) {
                    fieldLabel("auth.postal_code_label".loc)
                    TextField("12345", text: $postalCode)
                        .textContentType(.postalCode)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                }
                .frame(width: 100)

                VStack(alignment: .leading) {
                    fieldLabel("auth.city_label".loc)
                    TextField("Hamburg", text: $city)
                        .textContentType(.addressCity)
                        .textFieldStyle(.roundedBorder)
                }
            }

            fieldLabel("auth.country_label".loc)
            Picker("auth.country_label".loc, selection: $country) {
                ForEach(countries, id: \.0) { code, _ in
                    Text("country.\(code)".loc).tag(code)
                }
            }
            .pickerStyle(.menu)
            .padding(10)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    // MARK: - Step 3: Privacy / DSGVO

    private var privacyStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("auth.privacy_terms".loc)
                .font(.title2)
                .fontWeight(.bold)

            Text("auth.privacy_terms_hint".loc)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Privacy Policy
            VStack(alignment: .leading, spacing: 12) {
                Button {
                    showPrivacyPolicy = true
                } label: {
                    HStack {
                        Image(systemName: "doc.text")
                        Text("auth.read_privacy".loc)
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .padding()
                    .background(AppColors.gray50)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .foregroundStyle(.primary)

                Toggle(isOn: $privacyAccepted) {
                    Text("auth.accept_privacy".loc)
                        .font(.callout)
                }
                .toggleStyle(.switch)
                .tint(AppColors.primary)

                Toggle(isOn: $termsAccepted) {
                    Text("auth.accept_terms".loc)
                        .font(.callout)
                }
                .toggleStyle(.switch)
                .tint(AppColors.primary)
            }

            if !privacyAccepted || !termsAccepted {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(AppColors.warning)
                    Text("auth.consent_required".loc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: 16) {
            if currentStep > 1 && currentStep < 3 {
                Button {
                    withAnimation { currentStep -= 1 }
                } label: {
                    Text("auth.back".loc)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(AppColors.gray100)
                        .foregroundStyle(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }

            Button {
                Task { await handleNext() }
            } label: {
                HStack {
                    if isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text(nextButtonTitle)
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(canProceed ? AppColors.primary : AppColors.gray300)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!canProceed || isLoading)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(.ultraThinMaterial)
    }

    private var nextButtonTitle: String {
        switch currentStep {
        case 1: return "auth.create_account_btn".loc
        case 2: return "auth.continue_btn".loc
        case 3: return "auth.accept_go".loc
        default: return "auth.continue_btn".loc
        }
    }

    private var canProceed: Bool {
        switch currentStep {
        case 1: return !fullName.isEmpty && !email.isEmpty && password.count >= 8 && password == passwordConfirm
        case 2: return true // Personal data is optional at this stage
        case 3: return privacyAccepted && termsAccepted
        default: return false
        }
    }

    // MARK: - Actions

    private func handleNext() async {
        errorMessage = nil
        isLoading = true

        switch currentStep {
        case 1:
            // Create account
            do {
                try await authService.signUp(email: email, password: password, fullName: fullName)
                withAnimation { currentStep = 2 }
            } catch {
                errorMessage = "\("auth.registration_failed".loc): \(error.localizedDescription)"
            }

        case 2:
            // Save personal data
            if var profile = authService.userProfile {
                profile.phoneNumber = phoneNumber.isEmpty ? nil : phoneNumber
                profile.shippingStreet = street.isEmpty ? nil : street
                profile.shippingPostalCode = postalCode.isEmpty ? nil : postalCode
                profile.shippingCity = city.isEmpty ? nil : city
                profile.shippingCountry = country
                try? await authService.updateProfile(profile)
            }
            withAnimation { currentStep = 3 }

        case 3:
            // Accept privacy & terms, then done
            try? await authService.acceptPrivacy()
            dismiss()

        default:
            break
        }

        isLoading = false
    }

    // MARK: - Helpers

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .fontWeight(.medium)
            .foregroundStyle(.secondary)
    }
}
