//
//  RemotePushService.swift
//  Skipily
//
//  Plan B: Remote-Push (APNs). Registriert das Geraet bei APNs, speichert das
//  Device-Token pro eingeloggtem User in Supabase (RPC register_device_token)
//  und meldet es beim Logout wieder ab (unregister_device_token).
//
//  Ausgeloest wird die APNs-Registrierung sobald Notifications erlaubt sind
//  (siehe MaintenanceNotificationService-Grant + App-Start + Login). Das
//  Device-Token liefert der AppDelegate an handleDeviceToken(_:).
//
//  Serverseitiger Versand: Edge Function `send-push` (APNs HTTP/2, ES256-JWT).
//

import Foundation
import UIKit
import UserNotifications
import Supabase

final class RemotePushService {
    static let shared = RemotePushService()
    private init() {}

    private let tokenKey = "apnsDeviceTokenHex"

    /// Debug-Builds erhalten Sandbox-Tokens, Release-Builds Produktions-Tokens.
    /// send-push nutzt diese Angabe zur Host-Wahl (mit Fallback bei Mismatch).
    private var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    // MARK: - Registrierung anstossen

    /// Startet die APNs-Systemregistrierung, aber nur wenn der Nutzer
    /// Notifications erlaubt hat. Idempotent — bei jedem Start/Login rufbar.
    func registerIfAuthorized() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized
               || settings.authorizationStatus == .provisional else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    // MARK: - Token-Lebenszyklus

    /// Vom AppDelegate bei erfolgreicher APNs-Registrierung aufgerufen.
    func handleDeviceToken(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(hex, forKey: tokenKey)
        Task { await storeToken(hex) }
    }

    /// Nach Login: frische Systemregistrierung + gecachtes Token in der DB
    /// (falls schon eines vorliegt) an den neuen User binden.
    func onLogin() {
        registerIfAuthorized()
        if let hex = UserDefaults.standard.string(forKey: tokenKey) {
            Task { await storeToken(hex) }
        }
    }

    /// VOR dem Logout aufrufen — auth.uid() muss noch gueltig sein.
    func onLogout() async {
        guard let hex = UserDefaults.standard.string(forKey: tokenKey) else { return }
        do {
            try await SupabaseManager.shared.client
                .rpc("unregister_device_token", params: ["p_token": hex])
                .execute()
        } catch {
            AppLog.warning("unregister_device_token fehlgeschlagen: \(error)")
        }
    }

    // MARK: - Persistenz

    private func storeToken(_ hex: String) async {
        // Nur speichern, wenn eine Session existiert (RPC nutzt auth.uid()).
        guard (try? await SupabaseManager.shared.client.auth.session) != nil else { return }
        do {
            try await SupabaseManager.shared.client
                .rpc("register_device_token", params: [
                    "p_token": hex,
                    "p_platform": "ios",
                    "p_environment": environment,
                ])
                .execute()
            AppLog.info("APNs-Token registriert (\(environment))")
        } catch {
            AppLog.warning("register_device_token fehlgeschlagen: \(error)")
        }
    }
}
