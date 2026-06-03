//
//  ResetPasswordOTPSheet.swift
//  Skipily
//
//  Rein nativer Passwort-Reset: User gibt den 6-stelligen Code aus der
//  Reset-Mail ein und setzt im selben Sheet ein neues Passwort.
//  Kein Browser-Switch, kein Web-Portal.
//

import SwiftUI

struct ResetPasswordOTPSheet: View {
    let email: String

    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) private var dismiss

    @State private var code: String = ""
    @State private var newPassword: String = ""
    @State private var confirm: String = ""
    @State private var working = false
    @State private var error: String?
    @State private var success = false
    @FocusState private var focus: Field?

    private enum Field { case code, password, confirm }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("E-Mail", value: email)
                        .foregroundColor(.secondary)
                } footer: {
                    Text("Falls keine Mail kommt, prüfe deinen Spam-Ordner.")
                }

                Section("Code aus der E-Mail") {
                    TextField("Code aus der Mail", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .focused($focus, equals: .code)
                        .font(.title3.monospacedDigit())
                        .onChange(of: code) { _, newValue in
                            // Nur Ziffern erlauben, auf 10 Stellen kappen
                            // (Supabase-OTP ist üblicherweise 6–8-stellig).
                            let digits = newValue.filter(\.isNumber)
                            if digits != newValue { code = digits }
                            if digits.count > 10 { code = String(digits.prefix(10)) }
                        }
                }

                Section("Neues Passwort") {
                    SecureField("Mindestens 8 Zeichen", text: $newPassword)
                        .textContentType(.newPassword)
                        .focused($focus, equals: .password)
                    SecureField("Passwort wiederholen", text: $confirm)
                        .textContentType(.newPassword)
                        .focused($focus, equals: .confirm)
                }

                if let error {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.callout)
                    }
                }

                if success {
                    Section {
                        Label("Passwort aktualisiert — du kannst dich jetzt damit anmelden.",
                              systemImage: "checkmark.circle.fill")
                            .foregroundColor(.green)
                    }
                }
            }
            .navigationTitle("Neues Passwort setzen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }.disabled(working)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button(working ? "…" : "Speichern") { submit() }
                        .disabled(working || !isValid || success)
                }
            }
            .task { focus = .code }
        }
    }

    private var isValid: Bool {
        code.count >= 6
            && newPassword.count >= 8
            && newPassword == confirm
    }

    private func submit() {
        error = nil
        working = true
        Task {
            do {
                try await authService.verifyResetOTPAndSetPassword(
                    email: email, code: code, newPassword: newPassword
                )
                success = true
                working = false
                // Kurz Erfolg zeigen, dann Sheet zu — User landet auf Login
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                dismiss()
            } catch {
                working = false
                self.error = friendlyError(error)
            }
        }
    }

    private func friendlyError(_ err: Error) -> String {
        let msg = err.localizedDescription.lowercased()
        if msg.contains("expired") || msg.contains("invalid") || msg.contains("token") {
            return "Der Code ist ungültig oder abgelaufen. Fordere bitte einen neuen an."
        }
        if msg.contains("password") {
            return "Das Passwort wurde abgelehnt. Mindestens 8 Zeichen, bitte etwas Stärkeres wählen."
        }
        return "Es ist ein Fehler aufgetreten: \(err.localizedDescription)"
    }
}
