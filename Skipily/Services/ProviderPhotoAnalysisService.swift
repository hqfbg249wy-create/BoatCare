//
//  ProviderPhotoAnalysisService.swift
//  Skipily
//
//  Analysiert ein Foto eines Service-Betriebs (Schild, Ladenfront,
//  Visitenkarte, Fahrzeugbeschriftung) mit der KI und liefert die erkannten
//  Stammdaten zum Vorbefüllen des "Betrieb vorschlagen"-Formulars auf der
//  Karte. Ruft die Edge Function `analyze-provider-photo` auf.
//

import Foundation
import UIKit
import Supabase

@MainActor
final class ProviderPhotoAnalysisService {
    static let shared = ProviderPhotoAnalysisService()
    private init() {}

    private var client: SupabaseClient { SupabaseManager.shared.client }

    /// Von der KI erkannte Betriebsdaten (leere Strings = nicht lesbar).
    struct Fields: Decodable {
        let name: String
        let category: String
        let street: String
        let postal_code: String
        let city: String
        let country: String
        let phone: String
        let email: String
        let website: String
        let description: String
    }

    struct Result: Decodable {
        let fields: Fields
        let confidence: String   // "high" | "medium" | "low"
        let note: String
    }

    private struct RequestBody: Encodable {
        let image_base64: String
        let media_type: String
        let lang: String
    }

    /// Skaliert das Foto, schickt es an die Edge Function und gibt die
    /// erkannten Betriebsdaten zurück.
    func analyze(_ image: UIImage) async throws -> Result {
        guard let jpeg = Self.scaledJPEG(image) else {
            throw NSError(
                domain: "ProviderPhotoAnalysis", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Bild konnte nicht kodiert werden"]
            )
        }

        let body = RequestBody(
            image_base64: jpeg.base64EncodedString(),
            media_type: "image/jpeg",
            lang: LanguageManager.shared.currentLanguage.code
        )

        let result: Result = try await client.functions.invoke(
            "analyze-provider-photo",
            options: .init(body: body)
        )
        return result
    }

    /// Verkleinert das Bild auf max. `maxDimension` px längste Kante und gibt
    /// JPEG-Daten zurück — hält den Upload klein, reicht für Text-/Schild-OCR.
    private static func scaledJPEG(
        _ image: UIImage,
        maxDimension: CGFloat = 1600,
        quality: CGFloat = 0.8
    ) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let target: UIImage
        if longest > maxDimension {
            let scale = maxDimension / longest
            let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            target = UIGraphicsImageRenderer(size: newSize, format: format).image { _ in
                image.draw(in: CGRect(origin: .zero, size: newSize))
            }
        } else {
            target = image
        }
        return target.jpegData(compressionQuality: quality)
    }
}
