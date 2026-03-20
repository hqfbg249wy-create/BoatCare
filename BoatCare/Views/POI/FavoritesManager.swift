//
//  FavoritesManager.swift
//  BoatCare
//

import Foundation
import Combine
import Supabase

class FavoritesManager: ObservableObject {
    @Published var favoriteIDs: Set<UUID> = []

    private let key = "favoriteProviderIDs"
    private var isSyncing = false

    init() {
        load()
        // Sync from Supabase on launch
        Task { await syncFromSupabase() }
    }

    func isFavorite(_ id: UUID) -> Bool {
        favoriteIDs.contains(id)
    }

    func toggle(_ id: UUID) {
        if favoriteIDs.contains(id) {
            favoriteIDs.remove(id)
            save()
            Task { await removeFromSupabase(id) }
        } else {
            favoriteIDs.insert(id)
            save()
            Task { await addToSupabase(id) }
        }
    }

    /// Compatibility overload used by MapScreen
    func toggleFavorite(card: FavoriteProviderCard) {
        toggle(card.id)
    }

    private func save() {
        let strings = favoriteIDs.map { $0.uuidString }
        UserDefaults.standard.set(strings, forKey: key)
    }

    private func load() {
        let strings = UserDefaults.standard.stringArray(forKey: key) ?? []
        favoriteIDs = Set(strings.compactMap { UUID(uuidString: $0) })
    }

    // MARK: - Supabase Sync

    private func syncFromSupabase() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        do {
            let session = try await SupabaseManager.shared.client.auth.session
            let userId = session.user.id

            let response: [UserFavoriteRow] = try await SupabaseManager.shared.client
                .from("user_favorites")
                .select("provider_id")
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value

            let remoteIDs = Set(response.map { $0.provider_id })
            let localIDs = favoriteIDs

            // Merge: union of local and remote
            let merged = localIDs.union(remoteIDs)

            // Upload any local-only favorites to Supabase
            let localOnly = localIDs.subtracting(remoteIDs)
            for id in localOnly {
                try? await SupabaseManager.shared.client
                    .from("user_favorites")
                    .insert(["user_id": userId.uuidString, "provider_id": id.uuidString])
                    .execute()
            }

            await MainActor.run {
                self.favoriteIDs = merged
                self.save()
            }
        } catch {
            print("FavoritesManager sync error: \(error)")
        }
    }

    private func addToSupabase(_ providerId: UUID) async {
        do {
            let session = try await SupabaseManager.shared.client.auth.session
            let userId = session.user.id
            try await SupabaseManager.shared.client
                .from("user_favorites")
                .insert(["user_id": userId.uuidString, "provider_id": providerId.uuidString])
                .execute()
        } catch {
            print("FavoritesManager add error: \(error)")
        }
    }

    private func removeFromSupabase(_ providerId: UUID) async {
        do {
            let session = try await SupabaseManager.shared.client.auth.session
            let userId = session.user.id
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
