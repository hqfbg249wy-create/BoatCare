//
//  LoginView.swift
//  Skipily
//
//  Login screen – sign in or navigate to registration
//

import SwiftUI
import AuthenticationServices

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
                    VStack(spacing: 16) {
                        SkipilyLogoView(
                            style: .light,
                            layout: .vertical,
                            iconSize: 90,
                            showSlogan: true
                        )

                        Text("auth.welcome_back".loc)
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 48)

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
                                    Text("auth.sign_in".loc)
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
                            Text("auth.forgot_password".loc)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }

                        // Divider with "oder"
                        HStack {
                            Rectangle().frame(height: 1).foregroundStyle(.secondary.opacity(0.3))
                            Text("auth.or".loc).font(.caption).foregroundStyle(.secondary)
                            Rectangle().frame(height: 1).foregroundStyle(.secondary.opacity(0.3))
                        }
                        .padding(.vertical, 4)

                        // Sign in with Apple
                        SignInWithAppleButton(.signIn) { request in
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

                        // Register
                        NavigationLink(destination: RegistrationView()) {
                            Text("auth.new_account".loc)
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
            .alert("auth.forgot_password_title".loc, isPresented: $showResetPassword) {
                TextField("auth.email".loc, text: $resetEmail)
                Button("general.cancel".loc, role: .cancel) {}
                Button("auth.send".loc) {
                    Task {
                        try? await authService.resetPassword(email: resetEmail)
                        resetSent = true
                    }
                }
            } message: {
                Text("auth.reset_link_hint".loc)
            }
            .alert("auth.email_sent".loc, isPresented: $resetSent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("auth.email_sent_hint".loc)
            }
        }
    }

    private func signIn() async {
        isLoading = true
        try? await authService.signIn(email: email, password: password)
        isLoading = false
    }
}
