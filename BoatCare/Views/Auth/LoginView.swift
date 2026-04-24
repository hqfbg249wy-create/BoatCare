//
//  LoginView.swift
//  BoatCare
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var isRegistering = false
    @State private var errorMessage = ""
    @State private var showError = false

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Logo
                VStack(spacing: 8) {
                    Image(systemName: "ferry.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)
                    Text("BoatCare")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text(isRegistering ? "auth.register".loc : "auth.login".loc)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 40)

                // Form
                VStack(spacing: 16) {
                    TextField("auth.email".loc, text: $email)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    SecureField("auth.password".loc, text: $password)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal)

                // Action Button
                Button {
                    Task { await performAction() }
                } label: {
                    if authService.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                    } else {
                        Text(isRegistering ? "auth.register".loc : "auth.login".loc)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                }
                .padding(.horizontal)
                .disabled(email.isEmpty || password.isEmpty || authService.isLoading)

                // Toggle register/login
                Button {
                    isRegistering.toggle()
                    errorMessage = ""
                } label: {
                    Text(isRegistering ? "auth.have_account".loc : "auth.no_account".loc)
                        .foregroundColor(.blue)
                }

                Spacer()
            }
            .navigationBarHidden(true)
            .alert("general.error".loc, isPresented: $showError) {
                Button("general.ok".loc, role: .cancel) {}
            } message: {
                Text(errorMessage)
            }
            // Sheet automatisch schließen sobald erfolgreich eingeloggt
            .onChange(of: authService.isAuthenticated) { _, isAuth in
                if isAuth { dismiss() }
            }
        }
    }

    private func performAction() async {
        do {
            if isRegistering {
                try await authService.signUp(email: email, password: password)
            } else {
                try await authService.signIn(email: email, password: password)
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}
