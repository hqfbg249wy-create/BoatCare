//
//  EquipmentPhotoAnalysisService.swift
//  Skipily
//
//  Analysiert bis zu 5 Fotos eines Ausruestungsgegenstands (Typenschild,
//  Geraet, Label, Verpackung) mit der KI und liefert erkannte Stammdaten
//  (Name, Hersteller, Modell, Seriennummer, Teilenummer, Beschreibung,
//  Kategorie) zum Vorschlagen im Erfassungsformular. Ruft die Edge Function
//  `analyze-equipment-photo` auf. Uebernahme erfolgt als Vorschlag, den der
//  Nutzer feldweise bestaetigt (kein Auto-Overwrite).
//

import Foundation
import UIKit
import Supabase

/// Von der KI erkannte Ausruestungsdaten. Dient zugleich als Model fuer das
/// Vorschlags-Sheet (camelCase im Code, snake_case aus der Function-Antwort).
struct EquipmentAIFields: Decodable, Equatable {
    var name: String = ""
    var manufacturer: String = ""
    var model: String = ""
    var serialNumber: String = ""
    var partNumber: String = ""
    var itemDescription: String = ""
    var category: String = ""

    enum CodingKeys: String, CodingKey {
        case name, manufacturer, model, category
        case serialNumber = "serial_number"
        case partNumber = "part_number"
        case itemDescription = "item_description"
    }

    init(name: String = "", manufacturer: String = "", model: String = "",
         serialNumber: String = "", partNumber: String = "",
         itemDescription: String = "", category: String = "") {
        self.name = name; self.manufacturer = manufacturer; self.model = model
        self.serialNumber = serialNumber; self.partNumber = partNumber
        self.itemDescription = itemDescription; self.category = category
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func s(_ k: CodingKeys) -> String { (try? c.decode(String.self, forKey: k)) ?? "" }
        name = s(.name); manufacturer = s(.manufacturer); model = s(.model)
        serialNumber = s(.serialNumber); partNumber = s(.partNumber)
        itemDescription = s(.itemDescription); category = s(.category)
    }

    var hasAnyValue: Bool {
        !(name.isEmpty && manufacturer.isEmpty && model.isEmpty
          && serialNumber.isEmpty && partNumber.isEmpty && itemDescription.isEmpty)
    }
}

@MainActor
final class EquipmentPhotoAnalysisService {
    static let shared = EquipmentPhotoAnalysisService()
    private init() {}

    private var client: SupabaseClient { SupabaseManager.shared.client }

    struct Result: Decodable {
        let fields: EquipmentAIFields
        let confidence: String   // "high" | "medium" | "low"
        let note: String?
    }

    private struct ImagePart: Encodable {
        let image_base64: String
        let media_type: String
    }
    private struct RequestBody: Encodable {
        let images: [ImagePart]
        let lang: String
        let userLocale: String
    }

    /// Analysiert die uebergebenen Bilder (max. 5) gemeinsam.
    func analyze(_ images: [UIImage]) async throws -> Result {
        let parts: [ImagePart] = images.prefix(5).compactMap { img in
            guard let jpeg = Self.scaledJPEG(img) else { return nil }
            return ImagePart(image_base64: jpeg.base64EncodedString(), media_type: "image/jpeg")
        }
        guard !parts.isEmpty else {
            throw NSError(domain: "EquipmentPhotoAnalysis", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Bild konnte nicht kodiert werden"])
        }
        let body = RequestBody(
            images: parts,
            lang: LanguageManager.shared.currentLanguage.code,
            userLocale: LanguageManager.shared.aiResponseLocale
        )
        return try await client.functions.invoke("analyze-equipment-photo", options: .init(body: body))
    }

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
