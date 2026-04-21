//
//  ImageURLSanitizing.swift
//  Skipily
//
//  Lightweight sanity check for strings that should hold an http(s) image URL.
//  Does NOT filter specific hosts — Google Places photo URLs are valid when
//  loaded from the iOS app because the API key is restricted to the Skipily
//  bundle ID. Rejecting them here would hide working images.
//

import Foundation

extension String {
    /// True if the string is a non-empty, http(s) URL that can be passed to
    /// AsyncImage. Does not attempt to validate the host or content.
    var isUsableImageURL: Bool {
        guard !isEmpty else { return false }
        guard let url = URL(string: self),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return false
        }
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
