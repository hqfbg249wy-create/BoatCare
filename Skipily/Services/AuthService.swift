//
//  AuthService.swift
//  Skipily
//
//  Authentication service – ObservableObject pattern for compatibility
//  with original screens (MapScreen, BoatDataScreen, etc.)
//

import Foundation
import SwiftUI
import Combine
import Supabase

@MainActor
class AuthService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: AppUser?
    @Published var userProfile: UserProfile?
    @Published var isLoading = false
    @Published var errorMessage: String?
    /// Set to true once restoreSession() completes – prevents race conditions on app start
    @Published var sessionRestored = false

    var supabase: SupabaseClient { SupabaseManager.shared.client }

    // MARK: - Session Management

    /// Called on app start: restores existing Supabase session from Keychain.
    func restoreSession() async {
        isLoading = true
        do {
            let session = try await supabase.auth.session
            currentUser = AppUser(id: session.user.id, email: session.user.email ?? "")
            isAuthenticated = true
            await loadProfile()
        } catch {
            isAuthenticated = false
            currentUser = nil
        }
        sessionRestored = true
        isLoading = false
    }

    // MARK: - Sign In / Sign Up / Sign Out

    func signIn(email: String, password: String) async throws {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }

        let session = try await supabase.auth.signIn(email: email, password: password)
        currentUser = AppUser(id: session.user.id, email: session.user.email ?? email)
        isAuthenticated = true
        await loadProfile()
    }

    func signUp(email: String, password: String, fullName: String) async throws {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }

        let response = try await supabase.auth.signUp(email: email, password: password)
        let user = response.user
        currentUser = AppUser(id: user.id, email: user.email ?? email)

        // Create profile row
        try await supabase.from("profiles")
            .insert([
                "id": user.id.uuidString,
                "email": email,
                "full_name": fullName,
                "role": "user"
            ])
            .execute()

        isAuthenticated = true
        await loadProfile()
    }

    func signOut() async {
        try? await supabase.auth.signOut()
        isAuthenticated = false
        currentUser = nil
        userProfile = nil
    }

    func resetPassword(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(email)
    }

    // MARK: - Profile

    func loadProfile() async {
        guard let userId = currentUser?.id else { return }
        do {
            let profile: UserProfile = try await supabase
                .from("profiles")
                .select()
                .eq("id", value: userId.uuidString)
                .single()
                .execute()
                .value
            userProfile = profile
        } catch {
            print("Failed to load profile: \(error)")
        }
    }

    var isProfileComplete: Bool {
        userProfile?.isComplete ?? false
    }

    /// Extended update: personal data, shipping, boat preference, Stripe, privacy
    func updateProfile(_ profile: UserProfile) async throws {
        struct ProfileUpdate: Codable {
            let fullName: String?
            let username: String?
            let phoneNumber: String?
            let shippingStreet: String?
            let shippingCity: String?
            let shippingPostalCode: String?
            let shippingCountry: String?
            let preferredBoatId: UUID?
            let stripeCustomerId: String?
            let privacyAcceptedAt: String?
            let termsAcceptedAt: String?
            let website: String?
            let avatarUrl: String?

            enum CodingKeys: String, CodingKey {
                case fullName = "full_name"
                case username
                case phoneNumber = "phone_number"
                case shippingStreet = "shipping_street"
                case shippingCity = "shipping_city"
                case shippingPostalCode = "shipping_postal_code"
                case shippingCountry = "shipping_country"
                case preferredBoatId = "preferred_boat_id"
                case stripeCustomerId = "stripe_customer_id"
                case privacyAcceptedAt = "privacy_accepted_at"
                case termsAcceptedAt = "terms_accepted_at"
                case website
                case avatarUrl = "avatar_url"
            }
        }

        let isoFormatter = ISO8601DateFormatter()

        let update = ProfileUpdate(
            fullName: profile.fullName,
            username: profile.username,
            phoneNumber: profile.phoneNumber,
            shippingStreet: profile.shippingStreet,
            shippingCity: profile.shippingCity,
            shippingPostalCode: profile.shippingPostalCode,
            shippingCountry: profile.shippingCountry,
            preferredBoatId: profile.preferredBoatId,
            stripeCustomerId: profile.stripeCustomerId,
            privacyAcceptedAt: profile.privacyAcceptedAt.map { isoFormatter.string(from: $0) },
            termsAcceptedAt: profile.termsAcceptedAt.map { isoFormatter.string(from: $0) },
            website: profile.website,
            avatarUrl: profile.avatarUrl
        )

        try await supabase
            .from("profiles")
            .update(update)
            .eq("id", value: profile.id.uuidString)
            .execute()

        userProfile = profile
    }

    /// Legacy update for EditProfileView (original profile screen)
    func updateProfile(username: String?, fullName: String?, website: String?, avatarUrl: String?) async throws {
        guard let userId = currentUser?.id else { return }
        struct LegacyProfileUpdate: Encodable {
            let user_id: String
            let username: String?
            let full_name: String?
            let website: String?
            let avatar_url: String?
        }
        let update = LegacyProfileUpdate(
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

        if userProfile == nil { userProfile = UserProfile() }
        userProfile?.username = username
        userProfile?.fullName = fullName
        userProfile?.website = website
        userProfile?.avatarUrl = avatarUrl
    }

    /// Accept privacy policy and save timestamp
    func acceptPrivacy() async throws {
        guard var profile = userProfile else { return }
        profile.privacyAcceptedAt = Date()
        profile.termsAcceptedAt = Date()
        try await updateProfile(profile)
    }
}

// MARK: - AppUser (used by original screens)

struct AppUser: Identifiable, Codable, Equatable {
    let id: UUID
    let email: String
}
