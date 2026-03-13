//
//  LoginView.swift
//  BoatCare
//
//  Login screen – sign in or navigate to registration
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authService: AuthService

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var showResetPassword = false
    @State private var resetEmail = ""
    @State private var resetSent = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo & Header
                    VStack(spacing: 12) {
                        if UIImage(named: "AppIconDisplay") != nil {
                            Image("AppIconDisplay")
                                .resizable()
                                .frame(width: 100, height: 100)
                                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                                .shadow(color: .black.opacity(0.1), radius: 10, x: 0, y: 4)
                        } else {
                            Image(systemName: "sailboat.fill")
                                .font(.system(size: 60))
                                .foregroundStyle(AppColors.primary)
                        }

                        Text("BoatCare")
                            .font(.largeTitle)
                            .fontWeight(.bold)

                        Text("Willkommen zur\u{00FC}ck")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 60)

                    // Login Form
                    VStack(spacing: 16) {
                        TextField("E-Mail", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .textFieldStyle(.roundedBorder)

                        SecureField("Passwort", text: $password)
                            .textContentType(.password)
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

                    // Buttons
                    VStack(spacing: 16) {
                        // Sign In
                        Button {
                            Task { await signIn() }
                        } label: {
                            HStack {
                                if isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Anmelden")
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(!email.isEmpty && !password.isEmpty ? AppColors.primary : AppColors.gray300)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .disabled(email.isEmpty || password.isEmpty || isLoading)

                        // Forgot password
                        Button {
                            resetEmail = email
                            showResetPassword = true
                        } label: {
                            Text("Passwort vergessen?")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }

                        Divider()
                            .padding(.vertical, 4)

                        // Register
                        NavigationLink(destination: RegistrationView()) {
                            Text("Neues Konto erstellen")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(AppColors.gray100)
                                .foregroundStyle(AppColors.primary)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    .padding(.horizontal, 24)
                }
            }
            .navigationBarHidden(true)
            .alert("Passwort zur\u{00FC}cksetzen", isPresented: $showResetPassword) {
                TextField("E-Mail", text: $resetEmail)
                Button("Abbrechen", role: .cancel) {}
                Button("Senden") {
                    Task {
                        try? await authService.resetPassword(email: resetEmail)
                        resetSent = true
                    }
                }
            } message: {
                Text("Wir senden dir einen Link zum Zur\u{00FC}cksetzen.")
            }
            .alert("E-Mail gesendet", isPresented: $resetSent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Pr\u{00FC}fe dein Postfach f\u{00FC}r den Reset-Link.")
            }
        }
    }

    private func signIn() async {
        isLoading = true
        try? await authService.signIn(email: email, password: password)
        isLoading = false
    }
}
