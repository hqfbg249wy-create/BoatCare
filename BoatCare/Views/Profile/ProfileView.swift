//
//  ProfileView.swift
//  BoatCare
//
//  User profile with shipping address management
//

import SwiftUI

struct ProfileView: View {
    @Environment(AuthService.self) private var authService

    @State private var fullName = ""
    @State private var email = ""
    @State private var shippingStreet = ""
    @State private var shippingCity = ""
    @State private var shippingPostalCode = ""
    @State private var shippingCountry = "DE"
    @State private var isSaving = false
    @State private var showSavedToast = false
    @State private var showLogoutConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Avatar
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
                    .padding(.top, 16)

                    // Personal info
                    VStack(alignment: .leading, spacing: 16) {
                        sectionHeader("Persönliche Daten")

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

                    // Shipping address
                    VStack(alignment: .leading, spacing: 16) {
                        sectionHeader("Lieferadresse")

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

                    // Save button
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

                    Divider()
                        .padding(.horizontal, 16)

                    // Logout
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

                    // Version info
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
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Profil gespeichert")
                            .fontWeight(.medium)
                    }
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(AppColors.success)
                    .clipShape(Capsule())
                    .shadow(radius: 8)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .task {
                loadProfile()
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.headline)
            .foregroundStyle(AppColors.gray700)
    }

    private func loadProfile() {
        if let profile = authService.userProfile {
            fullName = profile.fullName ?? ""
            email = profile.email ?? authService.currentUser?.email ?? ""
            shippingStreet = profile.shippingStreet ?? ""
            shippingCity = profile.shippingCity ?? ""
            shippingPostalCode = profile.shippingPostalCode ?? ""
            shippingCountry = profile.shippingCountry ?? "DE"
        }
    }

    private func saveProfile() async {
        guard var profile = authService.userProfile else { return }
        isSaving = true

        profile.fullName = fullName
        profile.shippingStreet = shippingStreet
        profile.shippingCity = shippingCity
        profile.shippingPostalCode = shippingPostalCode
        profile.shippingCountry = shippingCountry

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
}
