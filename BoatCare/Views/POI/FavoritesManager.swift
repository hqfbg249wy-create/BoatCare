//
//  FavoritesManager.swift
//  BoatCare
//

import Foundation
import Combine

class FavoritesManager: ObservableObject {
    @Published var favoriteIDs: Set<UUID> = []

    private let key = "favoriteProviderIDs"

    init() {
        load()
    }

    func isFavorite(_ id: UUID) -> Bool {
        favoriteIDs.contains(id)
    }

    func toggle(_ id: UUID) {
        if favoriteIDs.contains(id) {
            favoriteIDs.remove(id)
        } else {
            favoriteIDs.insert(id)
        }
        save()
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
}
