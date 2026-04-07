//
//  ImageURLSanitizing.swift
//  Skipily
//
//  Many service_providers rows were populated from Google Places v1 photo
//  URLs of the form:
//    https://places.googleapis.com/v1/places/.../photos/.../media?...
//
//  Google's photo reference tokens are only valid for a limited time after
//  the Places lookup that produced them. Once cached in our DB they expire
//  and the endpoint starts returning HTTP 400 "The photo resource in the
//  request is invalid", which makes AsyncImage hang on the spinner forever.
//
//  Until the DB is cleaned up (see database/037_clear_google_places_urls.sql)
//  we filter these URLs out on the client so the category-icon fallback is
//  shown instantly instead.
//

import Foundation

extension String {
    /// True if the string looks like a usable image URL. Rejects empty
    /// strings, non-http(s) schemes, and expiring Google Places photo URLs.
    var isUsableImageURL: Bool {
        guard !isEmpty else { return false }
        guard let url = URL(string: self), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return false }
        if contains("places.googleapis.com") { return false }
        if contains("maps.googleapis.com/maps/api/place/photo") { return false }
        return true
    }

    /// Convenience: return a URL only if `isUsableImageURL` is true.
    var usableImageURL: URL? {
        isUsableImageURL ? URL(string: self) : nil
    }
}

extension Optional where Wrapped == String {
    var usableImageURL: URL? {
        self?.usableImageURL
    }
}
