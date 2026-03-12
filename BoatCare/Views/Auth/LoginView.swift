//
//  LoginView.swift
//  BoatCare
//
//  Login and Registration screen
//

import SwiftUI

struct LoginView: View {
    @Environment(AuthService.self) private var authService

    @State private var email = ""
    @State private var password = ""
    @State private var fullName = ""
    @State private var isRegistering = false
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo & Header
                    VStack(spacing: 12) {
                        Image(systemName: "sailboat.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(AppColors.primary)

                        Text("BoatCare")
                            .font(.largeTitle)
                            .fontWeight(.bold)

                        Text("Dein Boot-Shop")
                            .font(.title3)
                            .foregroundStyle(AppColors.gray500)
                    }
                    .padding(.top, 60)

                    // Form
                    VStack(spacing: 16) {
                        if isRegistering {
                            TextField("Vollständiger Name", text: $fullName)
                                .textContentType(.name)
                                .textFieldStyle(.roundedBorder)
                        }

                        TextField("E-Mail", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .textFieldStyle(.roundedBorder)

                        SecureField("Passwort", text: $password)
                            .textContentType(isRegistering ? .newPassword : .password)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.horizontal, 24)

                    // Error message
                    if let error = authService.errorMessage {
                        Text(error)
                            .font(.callout)
                            .foregroundStyle(AppColors.error)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    // Submit button
                    VStack(spacing: 12) {
                        Button {
                            Task { await submit() }
                        } label: {
                            HStack {
                                if isLoading {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text(isRegistering ? "Registrieren" : "Anmelden")
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(isFormValid ? AppColors.primary : AppColors.gray300)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .disabled(!isFormValid || isLoading)

                        Button {
                            withAnimation {
                                isRegistering.toggle()
                                authService.errorMessage = nil
                            }
                        } label: {
                            Text(isRegistering
                                 ? "Bereits ein Konto? Anmelden"
                                 : "Noch kein Konto? Registrieren")
                            .font(.callout)
                            .foregroundStyle(AppColors.primary)
                        }
                    }
                    .padding(.horizontal, 24)
                }
            }
            .navigationBarHidden(true)
        }
    }

    private var isFormValid: Bool {
        !email.isEmpty && !password.isEmpty && (!isRegistering || !fullName.isEmpty)
    }

    private func submit() async {
        isLoading = true
        if isRegistering {
            await authService.signUp(email: email, password: password, fullName: fullName)
        } else {
            await authService.signIn(email: email, password: password)
        }
        isLoading = false
    }
}
