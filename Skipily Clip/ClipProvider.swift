//
//  ClipProvider.swift
//  Skipily Clip
//
//  Minimal-Modell für die Provider-Liste im App Clip. Bewusst flach und
//  ohne Abhängigkeit zum Haupt-App-Target, damit der Clip schlank bleibt.
//

import Foundation
import CoreLocation

struct ClipProvider: Identifiable, Decodable {
    let id: UUID
    let name: String
    let city: String?
    let street: String?
    let latitude: Double
    let longitude: Double
    let logoUrl: String?
    /// Durchschnittliche Bewertung (0–5). nil = keine Bewertung vorhanden.
    let rating: Double?
    /// Single-Category-Feld (alte Spalte).
    let category: String?
    /// Multi-Category-Array (neue Spalte). Erste = primaere Kategorie.
    let categories: [String]?

    /// Identisch zur Haupt-App-Logik: erst categories[0], dann category.
    var primaryCategory: String {
        categories?.first ?? category ?? ""
    }

    enum CodingKeys: String, CodingKey {
        case id, name, city, street, latitude, longitude, rating
        case category, categories
        case logoUrl = "logo_url"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Anbieter"
        city = try? c.decode(String.self, forKey: .city)
        street = try? c.decode(String.self, forKey: .street)
        latitude = Self.flexDouble(c, .latitude) ?? 0
        longitude = Self.flexDouble(c, .longitude) ?? 0
        logoUrl = try? c.decode(String.self, forKey: .logoUrl)
        rating = Self.flexDouble(c, .rating)
        category = try? c.decode(String.self, forKey: .category)
        categories = try? c.decode([String].self, forKey: .categories)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    func distance(from location: CLLocation) -> Double {
        CLLocation(latitude: latitude, longitude: longitude).distance(from: location)
    }

    private static func flexDouble(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double? {
        if let d = try? c.decode(Double.self, forKey: key) { return d }
        if let i = try? c.decode(Int.self, forKey: key) { return Double(i) }
        if let s = try? c.decode(String.self, forKey: key), let d = Double(s) { return d }
        return nil
    }
}
