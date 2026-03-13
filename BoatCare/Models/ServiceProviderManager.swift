//
//  ServiceProviderManager.swift
//  BoatCare
//
//  Created by Ekkehart Padberg on 25.01.26.
//

import Foundation
import Combine
import Supabase
import CoreLocation
import MapKit

struct BoatServiceProvider: Identifiable {
    let id: UUID
    let name: String
    let category: String
    let category2: String?
    let category3: String?
    let categories: [String]?
    let description: String?
    let phone: String?
    let email: String?
    let website: String?
    let street: String?
    let postal_code: String?
    let city: String?
    let country: String?
    let latitude: Double
    let longitude: Double
    let logo_url: String?
    let cover_image_url: String?
    let rating: Double?
    let review_count: Int?
    let services: [String]?
    let products: [String]?
    let brands: [String]?
    let opening_hours: String?
    let current_promotion: String?
    let promotion_valid_until: String?
    let shop_url: String?
    let created_at: String?
    let updated_at: String?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var address: String {
        var parts: [String] = []
        if let street = street, !street.isEmpty { parts.append(street) }
        if let city = city, !city.isEmpty { parts.append(city) }
        return parts.isEmpty ? "" : parts.joined(separator: ", ")
    }

    var primaryCategory: String {
        return categories?.first ?? category
    }

    /// Alle nicht-leeren Kategorien als Array (primary zuerst)
    var allCategories: [String] {
        var cats = [category]
        if let c2 = category2, !c2.isEmpty { cats.append(c2) }
        if let c3 = category3, !c3.isEmpty { cats.append(c3) }
        return cats
    }

    var allCategoriesText: String {
        return allCategories.joined(separator: ", ")
    }
}

// MARK: - Robuster Decoder der mit Integer/Double und leeren Arrays umgehen kann
extension BoatServiceProvider: Codable {
    enum CodingKeys: String, CodingKey {
        case id, name, category, category2, category3, categories, description, phone, email, website
        case street, postal_code, city, country, latitude, longitude
        case logo_url, cover_image_url, rating, review_count, services, products, brands, opening_hours
        case current_promotion, promotion_valid_until, shop_url
        case created_at, updated_at
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)

        id          = try c.decode(UUID.self, forKey: .id)
        name        = try c.decode(String.self, forKey: .name)
        category    = (try? c.decode(String.self, forKey: .category)) ?? ""
        category2   = try? c.decode(String.self, forKey: .category2)
        category3   = try? c.decode(String.self, forKey: .category3)
        categories  = try? c.decode([String].self, forKey: .categories)
        description = try? c.decode(String.self, forKey: .description)
        phone       = try? c.decode(String.self, forKey: .phone)
        email       = try? c.decode(String.self, forKey: .email)
        website     = try? c.decode(String.self, forKey: .website)
        street      = try? c.decode(String.self, forKey: .street)
        postal_code = try? c.decode(String.self, forKey: .postal_code)
        city        = try? c.decode(String.self, forKey: .city)
        country     = try? c.decode(String.self, forKey: .country)
        latitude    = (try? c.decode(Double.self, forKey: .latitude)) ?? 0.0
        longitude   = (try? c.decode(Double.self, forKey: .longitude)) ?? 0.0
        logo_url        = try? c.decode(String.self, forKey: .logo_url)
        cover_image_url = try? c.decode(String.self, forKey: .cover_image_url)
        created_at      = try? c.decode(String.self, forKey: .created_at)
        updated_at  = try? c.decode(String.self, forKey: .updated_at)

        // Rating: kann Integer (0) oder Double (4.3) sein
        if let d = try? c.decode(Double.self, forKey: .rating) {
            rating = d
        } else if let i = try? c.decode(Int.self, forKey: .rating) {
            rating = Double(i)
        } else {
            rating = nil
        }

        // review_count: kann Integer oder null sein
        if let i = try? c.decode(Int.self, forKey: .review_count) {
            review_count = i
        } else {
            review_count = nil
        }

        // Arrays: nil wenn fehlt oder leer
        let rawServices = try? c.decode([String].self, forKey: .services)
        services = (rawServices?.isEmpty == true) ? nil : rawServices

        let rawProducts = try? c.decode([String].self, forKey: .products)
        products = (rawProducts?.isEmpty == true) ? nil : rawProducts

        let rawBrands = try? c.decode([String].self, forKey: .brands)
        brands = (rawBrands?.isEmpty == true) ? nil : rawBrands

        // Öffnungszeiten
        opening_hours = try? c.decode(String.self, forKey: .opening_hours)

        // Promotion-Felder
        current_promotion     = try? c.decode(String.self, forKey: .current_promotion)
        promotion_valid_until = try? c.decode(String.self, forKey: .promotion_valid_until)
        shop_url              = try? c.decode(String.self, forKey: .shop_url)
    }
}

@MainActor
class ServiceProviderManager: ObservableObject {
    @Published var providers: [BoatServiceProvider] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    var supabase: SupabaseClient?
    
    init() {
        // Leer - supabase wird später gesetzt
    }
    
    func setSupabase(_ client: SupabaseClient) {
        self.supabase = client
    }
    
    func loadProviders(nearLocation location: CLLocationCoordinate2D, radiusKm: Double = 50) async {
        guard let supabase = supabase else {
            errorMessage = "Supabase nicht initialisiert"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        do {
            // Lade alle Provider aus Supabase
            let response: [BoatServiceProvider] = try await supabase
                .from("service_providers")
                .select()
                .execute()
                .value
            
            // Filtere nach Entfernung
            let userLocation = CLLocation(latitude: location.latitude, longitude: location.longitude)
            let filtered = response.filter { provider in
                let providerLocation = CLLocation(
                    latitude: provider.latitude,
                    longitude: provider.longitude
                )
                let distance = userLocation.distance(from: providerLocation) / 1000 // in km
                return distance <= radiusKm
            }
            
            providers = filtered
            print("✅ \(providers.count) Betriebe geladen")
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
            print("❌ Fehler beim Laden der Betriebe: \(error)")
        }
        
        isLoading = false
    }
    
    func loadProvidersByCategory(category: String, nearLocation location: CLLocationCoordinate2D, radiusKm: Double = 50) async {
        guard let supabase = supabase else {
            errorMessage = "Supabase nicht initialisiert"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        do {
            let response: [BoatServiceProvider] = try await supabase
                .from("service_providers")
                .select()
                .eq("category", value: category)
                .execute()
                .value
            
            let userLocation = CLLocation(latitude: location.latitude, longitude: location.longitude)
            let filtered = response.filter { provider in
                let providerLocation = CLLocation(
                    latitude: provider.latitude,
                    longitude: provider.longitude
                )
                let distance = userLocation.distance(from: providerLocation) / 1000
                return distance <= radiusKm
            }
            
            providers = filtered
            print("✅ \(providers.count) Betriebe in Kategorie '\(category)' geladen")
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
            print("❌ Fehler: \(error)")
        }
        
        isLoading = false
    }
    
    /// Lädt Provider innerhalb einer Kartenregion (+ 20 km Puffer) direkt per DB-Bounding-Box.
    /// Damit werden nie mehr Daten geladen als auf dem Bildschirm sichtbar sind.
    func loadProviders(in region: MKCoordinateRegion, extraPaddingKm: Double = 20) async {
        guard let supabase = supabase else {
            errorMessage = "Supabase nicht initialisiert"
            return
        }

        isLoading = true
        errorMessage = nil

        // Umrechnungsfaktor: 1 Grad Breitengrad ≈ 111 km
        let latPad  = (extraPaddingKm / 111.0)
        let lonPad  = (extraPaddingKm / (111.0 * cos(region.center.latitude * .pi / 180)))

        let minLat = region.center.latitude  - region.span.latitudeDelta  / 2 - latPad
        let maxLat = region.center.latitude  + region.span.latitudeDelta  / 2 + latPad
        let minLon = region.center.longitude - region.span.longitudeDelta / 2 - lonPad
        let maxLon = region.center.longitude + region.span.longitudeDelta / 2 + lonPad

        do {
            let result: [BoatServiceProvider] = try await supabase
                .from("service_providers")
                .select()
                .gte("latitude",  value: minLat)
                .lte("latitude",  value: maxLat)
                .gte("longitude", value: minLon)
                .lte("longitude", value: maxLon)
                .execute()
                .value

            providers = result
            print("✅ \(providers.count) Betriebe in Region geladen (BBox: \(String(format:"%.2f",minLat))–\(String(format:"%.2f",maxLat)), \(String(format:"%.2f",minLon))–\(String(format:"%.2f",maxLon)))")
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
            print("❌ Region-Fetch-Fehler: \(error)")
        }

        isLoading = false
    }

    func loadAllProviders() async {
        guard let supabase = supabase else {
            errorMessage = "Supabase nicht initialisiert"
            print("❌ ServiceProviderManager: supabase client is nil")
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let result: [BoatServiceProvider] = try await supabase
                .from("service_providers")
                .select()
                .execute()
                .value

            providers = result
            print("✅ \(providers.count) Betriebe geladen (alle)")

            if providers.isEmpty {
                print("⚠️ Keine Provider gefunden – RLS-Policy oder leere DB?")
            }
        } catch let decodingError as DecodingError {
            // Detailliertes Decoding-Fehler-Logging
            switch decodingError {
            case .typeMismatch(let type, let context):
                print("❌ Type mismatch: \(type) at \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
                print("   Debug: \(context.debugDescription)")
                errorMessage = "Decode-Fehler: Typ-Mismatch bei \(context.codingPath.last?.stringValue ?? "?")"
            case .keyNotFound(let key, let context):
                print("❌ Key not found: \(key.stringValue) at \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
                errorMessage = "Decode-Fehler: Feld '\(key.stringValue)' fehlt"
            case .valueNotFound(let type, let context):
                print("❌ Value not found: \(type) at \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
                errorMessage = "Decode-Fehler: Wert fehlt bei \(context.codingPath.last?.stringValue ?? "?")"
            case .dataCorrupted(let context):
                print("❌ Data corrupted at \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
                print("   Debug: \(context.debugDescription)")
                errorMessage = "Decode-Fehler: Daten beschädigt"
            @unknown default:
                print("❌ Unbekannter Decode-Fehler: \(decodingError)")
                errorMessage = "Decode-Fehler: \(decodingError.localizedDescription)"
            }
        } catch {
            errorMessage = "Fehler beim Laden: \(error.localizedDescription)"
            print("❌ Fetch-Fehler: \(error)")
        }

        isLoading = false
    }

    // MARK: - Marketplace: Betriebe mit aktiver Promotion laden
    func loadProvidersWithPromotion() async -> [BoatServiceProvider] {
        guard let supabase = supabase else { return [] }
        do {
            let result: [BoatServiceProvider] = try await supabase
                .from("service_providers")
                .select()
                .not("current_promotion", operator: .is, value: AnyJSON.null)
                .execute()
                .value
            return result
        } catch {
            print("❌ Promotion-Fehler: \(error)")
            return []
        }
    }

    func loadProvidersWithPromotionThrowing() async throws -> [BoatServiceProvider] {
        guard let supabase = supabase else { return [] }
        return try await supabase
            .from("service_providers")
            .select()
            .not("current_promotion", operator: .is, value: AnyJSON.null)
            .execute()
            .value
    }
}
