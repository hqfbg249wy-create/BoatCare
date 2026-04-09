//
//  FavoritesManager.swift
//  Skipily
//
//  User-scoped favorites. Always tied to the currently authenticated user:
//  - UserDefaults cache key is namespaced by user id
//  - On auth state changes (login / logout / user switch) the local state is
//    cleared and re-loaded from Supabase
//  - No cross-user merge: syncFromSupabase REPLACES the local set, it does not
//    union with whatever was in memory from a previous session
//

import Foundation
import Combine
import Supabase

@MainActor
final class FavoritesManager: ObservableObject {
    @Published var favoriteIDs: Set<UUID> = []

    private let baseKey = "favoriteProviderIDs"
    private var currentUserId: UUID?
    private var authListenerTask: Task<Void, Never>?

    init() {
        // Kick off listening for auth changes and do the initial load.
        startAuthListener()
        Task { await bootstrap() }
    }

    deinit {
        authListenerTask?.cancel()
    }

    // MARK: - Public API

    func isFavorite(_ id: UUID) -> Bool {
        favoriteIDs.contains(id)
    }

    func toggle(_ id: UUID) {
        guard let userId = currentUserId else {
            // Not logged in — do nothing, favorites require an account.
            return
        }
        if favoriteIDs.contains(id) {
            favoriteIDs.remove(id)
            saveCache()
            Task { await removeFromSupabase(providerId: id, userId: userId) }
        } else {
            favoriteIDs.insert(id)
            saveCache()
            Task { await addToSupabase(providerId: id, userId: userId) }
        }
    }

    /// Compatibility overload used by MapScreen
    func toggleFavorite(card: FavoriteProviderCard) {
        toggle(card.id)
    }

    // MARK: - Auth state handling

    private func startAuthListener() {
        authListenerTask = Task { [weak self] in
            let stream = SupabaseManager.shared.client.auth.authStateChanges
            for await change in stream {
                guard let self else { return }
                let newUserId = change.session?.user.id
                await self.handleAuthChange(newUserId: newUserId)
            }
        }
    }

    /// Initial load directly from the current session (avoids waiting for the
    /// first authStateChanges event, which may arrive late on cold start).
    private func bootstrap() async {
        let userId = try? await SupabaseManager.shared.client.auth.session.user.id
        await handleAuthChange(newUserId: userId)
    }

    private func handleAuthChange(newUserId: UUID?) async {
        // Switching user (or logging out): drop the in-memory set, load from
        // the correct user-scoped cache, then sync from Supabase.
        if newUserId != currentUserId {
            currentUserId = newUserId
            loadCache()
        }

        if newUserId != nil {
            await syncFromSupabase()
        } else {
            // Logged out: clear everything
            favoriteIDs = []
        }
    }

    // MARK: - Local cache (per user)

    private var cacheKey: String? {
        guard let uid = currentUserId else { return nil }
        return "\(baseKey)_\(uid.uuidString)"
    }

    private func saveCache() {
        guard let key = cacheKey else { return }
        let strings = favoriteIDs.map { $0.uuidString }
        UserDefaults.standard.set(strings, forKey: key)
    }

    private func loadCache() {
        guard let key = cacheKey else {
            favoriteIDs = []
            return
        }
        let strings = UserDefaults.standard.stringArray(forKey: key) ?? []
        favoriteIDs = Set(strings.compactMap { UUID(uuidString: $0) })
    }

    // MARK: - Supabase sync

    /// Replaces the local set with whatever is on the server. Does NOT merge
    /// previous-session data — that was the old bug that leaked one user's
    /// favorites into another user's account.
    private func syncFromSupabase() async {
        guard let userId = currentUserId else { return }
        do {
            let response: [UserFavoriteRow] = try await SupabaseManager.shared.client
                .from("user_favorites")
                .select("provider_id")
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value

            let remoteIDs = Set(response.map { $0.provider_id })
            self.favoriteIDs = remoteIDs
            self.saveCache()
        } catch {
            print("FavoritesManager sync error: \(error)")
            // Keep whatever's in cache as the last known good state
        }
    }

    private func addToSupabase(providerId: UUID, userId: UUID) async {
        do {
            try await SupabaseManager.shared.client
                .from("user_favorites")
                .upsert(
                    ["user_id": userId.uuidString, "provider_id": providerId.uuidString],
                    onConflict: "user_id,provider_id"
                )
                .execute()
        } catch {
            print("FavoritesManager add error: \(error)")
        }
    }

    private func removeFromSupabase(providerId: UUID, userId: UUID) async {
        do {
            try await SupabaseManager.shared.client
                .from("user_favorites")
                .delete()
                .eq("user_id", value: userId.uuidString)
                .eq("provider_id", value: providerId.uuidString)
                .execute()
        } catch {
            print("FavoritesManager remove error: \(error)")
        }
    }
}

// Row type for decoding Supabase response
private struct UserFavoriteRow: Decodable {
    let provider_id: UUID
}
