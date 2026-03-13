//
//  AuthService.swift
//  BoatCare
//
//  Authentication service using Supabase Auth
//

import Foundation
import Supabase
import Observation

@Observable
@MainActor
final class AuthService {
    var currentUser: Supabase.User?
    var userProfile: UserProfile?
    var isAuthenticated = false
    var isLoading = true
    var errorMessage: String?

    private var client: SupabaseClient {
        SupabaseManager.shared.client
    }

    init() {
        Task {
            await checkSession()
        }
    }

    func checkSession() async {
        isLoading = true
        do {
            let session = try await client.auth.session
            currentUser = session.user
            isAuthenticated = true
            await loadProfile()
        } catch {
            currentUser = nil
            isAuthenticated = false
        }
        isLoading = false
    }

    func signIn(email: String, password: String) async {
        errorMessage = nil
        isLoading = true
        do {
            let session = try await client.auth.signIn(
                email: email,
                password: password
            )
            currentUser = session.user
            isAuthenticated = true
            await loadProfile()
        } catch {
            errorMessage = "Anmeldung fehlgeschlagen: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func signUp(email: String, password: String, fullName: String) async {
        errorMessage = nil
        isLoading = true
        do {
            let response = try await client.auth.signUp(
                email: email,
                password: password
            )
            let user = response.user
            currentUser = user
            // Create profile
            try await client.from("profiles")
                .insert([
                    "id": user.id.uuidString,
                    "email": email,
                    "full_name": fullName,
                    "role": "user"
                ])
                .execute()
            isAuthenticated = true
            await loadProfile()
        } catch {
            errorMessage = "Registrierung fehlgeschlagen: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func signOut() async {
        do {
            try await client.auth.signOut()
        } catch {
            print("Sign out error: \(error)")
        }
        currentUser = nil
        userProfile = nil
        isAuthenticated = false
    }

    func loadProfile() async {
        guard let userId = currentUser?.id else { return }
        do {
            let profile: UserProfile = try await client
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

    /// Whether the user profile has all necessary data for shopping
    var isProfileComplete: Bool {
        userProfile?.isComplete ?? false
    }

    func updateProfile(_ profile: UserProfile) async throws {
        struct ProfileUpdate: Codable {
            let fullName: String?
            let shippingStreet: String?
            let shippingCity: String?
            let shippingPostalCode: String?
            let shippingCountry: String?
            let preferredBoatId: UUID?
            let stripeCustomerId: String?

            enum CodingKeys: String, CodingKey {
                case fullName = "full_name"
                case shippingStreet = "shipping_street"
                case shippingCity = "shipping_city"
                case shippingPostalCode = "shipping_postal_code"
                case shippingCountry = "shipping_country"
                case preferredBoatId = "preferred_boat_id"
                case stripeCustomerId = "stripe_customer_id"
            }
        }

        let update = ProfileUpdate(
            fullName: profile.fullName,
            shippingStreet: profile.shippingStreet,
            shippingCity: profile.shippingCity,
            shippingPostalCode: profile.shippingPostalCode,
            shippingCountry: profile.shippingCountry,
            preferredBoatId: profile.preferredBoatId,
            stripeCustomerId: profile.stripeCustomerId
        )

        try await client
            .from("profiles")
            .update(update)
            .eq("id", value: profile.id.uuidString)
            .execute()

        userProfile = profile
    }
}
