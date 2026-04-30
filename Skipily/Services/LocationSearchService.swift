//
//  LocationSearchService.swift
//  Skipily
//
//  Wrapper um MKLocalSearchCompleter (Typeahead) + MKLocalSearch (Resolve).
//  Nutzung: Eigner gibt z.B. "Hafen Cuxhaven" ein → bekommt eine Liste von
//  Orts-Treffern. Auswahl liefert Koordinaten, mit denen die Karte geschwenkt
//  und der Provider-Filter auf Proximity (Default 50 km) umgestellt wird.
//

import Foundation
import MapKit
import Combine

@MainActor
final class LocationSearchService: NSObject, ObservableObject {

    /// Aktuelle Vorschläge aus dem Completer (Title + Subtitle).
    @Published private(set) var suggestions: [MKLocalSearchCompletion] = []
    @Published private(set) var isSearching: Bool = false

    private let completer: MKLocalSearchCompleter

    override init() {
        self.completer = MKLocalSearchCompleter()
        super.init()
        // Wir interessieren uns für Adressen UND POIs (Häfen, Marinas, Werften
        // tauchen oft als POI auf, nicht als reine Adresse).
        self.completer.resultTypes = [.address, .pointOfInterest]
        self.completer.delegate = self
    }

    /// Liefert sofort einen leeren Reset (für Cleanup nach Auswahl).
    func clear() {
        completer.queryFragment = ""
        suggestions = []
    }

    /// Anfrage an den Completer schicken. Debounce passiert beim Caller.
    func updateQuery(_ text: String, near region: MKCoordinateRegion? = nil) {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            suggestions = []
            return
        }
        if let region {
            completer.region = region
        }
        completer.queryFragment = trimmed
    }

    /// Aus einer Auswahl den vollständigen MKMapItem inkl. Koordinaten holen.
    /// Ist asynchron, weil MKLocalSearch ein Netzwerk-Roundtrip ist.
    func resolve(_ completion: MKLocalSearchCompletion) async throws -> ResolvedLocation {
        let request = MKLocalSearch.Request(completion: completion)
        let search = MKLocalSearch(request: request)
        let response = try await search.start()
        guard let item = response.mapItems.first else {
            throw NSError(domain: "LocationSearchService", code: 404,
                          userInfo: [NSLocalizedDescriptionKey: "No map item found"])
        }
        let coord = item.placemark.coordinate
        return ResolvedLocation(
            title: completion.title,
            subtitle: completion.subtitle,
            coordinate: coord,
            mapItem: item
        )
    }
}

// MARK: - Delegate

extension LocationSearchService: MKLocalSearchCompleterDelegate {
    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let results = completer.results
        Task { @MainActor in
            self.suggestions = results
            self.isSearching = false
        }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        Task { @MainActor in
            // Fehler nicht hart anzeigen — der User tippt vielleicht noch.
            self.suggestions = []
            self.isSearching = false
            print("LocationSearchService failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Resolved value

struct ResolvedLocation: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let coordinate: CLLocationCoordinate2D
    let mapItem: MKMapItem
}
