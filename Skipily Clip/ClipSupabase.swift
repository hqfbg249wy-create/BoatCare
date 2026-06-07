//
//  ClipSupabase.swift
//  Skipily Clip
//
//  Schlanker Supabase-REST-Client, der nur das kann was der Clip braucht:
//  öffentliche Provider-Liste lesen (RLS lässt das für anon erlaubt).
//  Kein supabase-swift SDK → spart ~2 MB im Clip-Bundle.
//

import Foundation
import CoreLocation

enum ClipSupabase {
    /// Supabase-Projekt-URL. Identisch zum Haupt-App-Target.
    static let baseURL = URL(string: "https://vcjwlyqkfkszumdrfvtm.supabase.co")!

    /// Anon-Key (öffentlich, gleicher Key wie im owner-portal).
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ"

    /// Lädt Provider in einem Umkreis um die User-Position.
    /// Vereinfachte Bounding-Box-Filterung statt PostGIS-Query (fuer
    /// kleine Datenmengen ausreichend; bei > 1000 Providern auf
    /// rpc('providers_near', lat, lng, radius) umstellen).
    static func loadProviders(near location: CLLocation, radiusKm: Double = 50) async throws -> [ClipProvider] {
        // Grobe Bounding-Box berechnen (1° lat ≈ 111 km).
        let dLat = radiusKm / 111.0
        let dLon = radiusKm / (111.0 * max(cos(location.coordinate.latitude * .pi / 180), 0.01))
        let minLat = location.coordinate.latitude - dLat
        let maxLat = location.coordinate.latitude + dLat
        let minLon = location.coordinate.longitude - dLon
        let maxLon = location.coordinate.longitude + dLon

        var components = URLComponents(
            url: baseURL.appendingPathComponent("rest/v1/service_providers"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            .init(name: "select", value: "id,name,city,street,latitude,longitude,logo_url,rating,category,categories"),
            .init(name: "latitude", value: "gte.\(minLat)"),
            .init(name: "latitude", value: "lte.\(maxLat)"),
            .init(name: "longitude", value: "gte.\(minLon)"),
            .init(name: "longitude", value: "lte.\(maxLon)"),
            .init(name: "limit", value: "50"),
        ]

        var req = URLRequest(url: components.url!)
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 8

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw NSError(domain: "Skipily.Clip", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Provider konnten nicht geladen werden"])
        }

        let decoder = JSONDecoder()
        let providers = try decoder.decode([ClipProvider].self, from: data)
        // Nach echter Entfernung sortieren (Bounding-Box ist nur grob).
        return providers.sorted { $0.distance(from: location) < $1.distance(from: location) }
    }
}
