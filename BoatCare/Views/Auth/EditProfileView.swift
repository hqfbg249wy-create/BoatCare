//
//  EditProfileView.swift
//  BoatCare
//
//  Created by Ekkehart Padberg on 27.01.26.
//

import SwiftUI

struct EditProfileView: View {
    @EnvironmentObject var authService: AuthService
    @ObservedObject private var languageManager = LanguageManager.shared
    @Environment(\.dismiss) var dismiss

    @State private var fullName = ""
    @State private var username = ""
    @State private var website = ""
    @State private var avatarUrl = ""

    @State private var errorMessage: String?
    @State private var showError = false
    @State private var isSaving = false

    var body: some View {
        NavigationView {
            Form {
                Section("profile.personal_info".loc) {
                    TextField("profile.full_name".loc, text: $fullName)
                        .textContentType(.name)
                        .autocapitalization(.words)

                    TextField("profile.username".loc, text: $username)
                        .textContentType(.username)
                        .autocapitalization(.none)
                }

                Section("profile.additional_info".loc) {
                    TextField("Website", text: $website)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .keyboardType(.URL)

                    TextField("Avatar URL", text: $avatarUrl)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                }

                // MARK: - Spracheinstellung
                Section("profile.language".loc) {
                    ForEach(AppLanguage.allCases, id: \.rawValue) { language in
                        Button(action: {
                            languageManager.setLanguage(language)
                        }) {
                            HStack {
                                Text(language.flag)
                                Text(language.displayName)
                                    .foregroundColor(.primary)
                                Spacer()
                                if languageManager.currentLanguage == language {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.blue)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("profile.edit".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("profile.cancel".loc) {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("profile.save".loc) {
                        saveProfile()
                    }
                    .disabled(isSaving || !isFormValid)
                }
            }
            .alert("general.error".loc, isPresented: $showError) {
                Button("general.ok".loc, role: .cancel) { }
            } message: {
                Text(errorMessage ?? "Ein unbekannter Fehler ist aufgetreten")
            }
            .onAppear {
                loadCurrentProfile()
            }
        }
        .languageAware()
    }
    
    private var isFormValid: Bool {
        !fullName.isEmpty && !username.isEmpty
    }
    
    private func loadCurrentProfile() {
        if let profile = authService.userProfile {
            fullName = profile.fullName ?? ""
            username = profile.username ?? ""
            website = profile.website ?? ""
            avatarUrl = profile.avatarUrl ?? ""
        }
    }
    
    private func saveProfile() {
        isSaving = true
        errorMessage = nil
        
        Task {
            do {
                try await authService.updateProfile(
                    username: username.isEmpty ? nil : username,
                    fullName: fullName.isEmpty ? nil : fullName,
                    website: website.isEmpty ? nil : website,
                    avatarUrl: avatarUrl.isEmpty ? nil : avatarUrl
                )
                dismiss()
            } catch {
                errorMessage = "Profil konnte nicht gespeichert werden: \(error.localizedDescription)"
                showError = true
            }
            isSaving = false
        }
    }
}



