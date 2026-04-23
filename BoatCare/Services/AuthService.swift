//
//  AuthService.swift
//  BoatCare
//

import Foundation
import SwiftUI
import Combine
import Supabase

@MainActor
class AuthService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: AppUser?
    @Published var currentProfile: UserProfile?
    @Published var isLoading = false
    /// Wird true sobald restoreSession() abgeschlossen ist — verhindert Race Condition beim App-Start
    @Published var sessionRestored = false

    /// Gemeinsamer Supabase-Client – alle Services nutzen dieselbe Instanz und Auth-Session
    var supabase: SupabaseClient { SupabaseManager.shared.client }

    /// Beim App-Start aufrufen: Wiederherstellt eine bestehende Supabase-Session (Token im Keychain).
    /// Setzt sessionRestored = true wenn fertig, egal ob Session vorhanden oder nicht.
    func restoreSession() async {
        do {
            let session = try await supabase.auth.session
            currentUser = AppUser(id: session.user.id, email: session.user.email ?? "")
            isAuthenticated = true
        } catch {
            // Keine aktive Session — User ist ausgeloggt, kein Fehler
            isAuthenticated = false
            currentUser = nil
        }
        sessionRestored = true
    }

    func signIn(email: String, password: String) async throws {
        isLoading = true
        defer { isLoading = false }
        let session = try await supabase.auth.signIn(email: email, password: password)
        currentUser = AppUser(id: session.user.id, email: session.user.email ?? email)
        isAuthenticated = true
    }

    func signUp(email: String, password: String, fullName: String? = nil) async throws {
        isLoading = true
        defer { isLoading = false }
        let session = try await supabase.auth.signUp(email: email, password: password)
        currentUser = AppUser(id: session.user.id, email: session.user.email ?? email)
        isAuthenticated = true
    }

    func signOut() async {
        try? await supabase.auth.signOut()
        isAuthenticated = false
        currentUser = nil
        currentProfile = nil
    }

    func resetPassword(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(email)
    }

    func updateProfile(username: String?, fullName: String?, website: String?, avatarUrl: String?) async throws {
        guard let userId = currentUser?.id else { return }
        struct ProfileUpdate: Encodable {
            let user_id: String
            let username: String?
            let full_name: String?
            let website: String?
            let avatar_url: String?
        }
        let update = ProfileUpdate(
            user_id: userId.uuidString,
            username: username,
            full_name: fullName,
            website: website,
            avatar_url: avatarUrl
        )
        try await supabase
            .from("profiles")
            .upsert(update)
            .execute()

        // Update local profile
        if currentProfile == nil { currentProfile = UserProfile() }
        currentProfile?.username = username
        currentProfile?.fullName = fullName
        currentProfile?.website = website
        currentProfile?.avatarUrl = avatarUrl
    }
}

struct AppUser: Identifiable, Codable, Equatable {
    let id: UUID
    let email: String
}

struct UserProfile: Codable {
    var id: UUID?
    var userId: UUID?
    var username: String?
    var fullName: String?
    var phoneNumber: String?
    var address: String?
    var city: String?
    var country: String?
    var website: String?
    var avatarUrl: String?
    var role: String?

    enum CodingKeys: String, CodingKey {
        case id, username, city, country, website, role
        case userId = "user_id"
        case fullName = "full_name"
        case phoneNumber = "phone_number"
        case address
        case avatarUrl = "avatar_url"
    }
}
