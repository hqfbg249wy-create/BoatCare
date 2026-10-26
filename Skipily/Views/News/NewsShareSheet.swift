//
//  NewsShareSheet.swift
//  Skipily
//
//  Teilen von News-Beitraegen MIT echtem Medium (Foto/Video) statt nur einem
//  Link. Hintergrund: Facebooks iOS-App rendert bei einem per Share-Sheet
//  uebergebenen Link KEINE Vorschaukarte (seit den API-Aenderungen ~2019),
//  und Instagram zeigt grundsaetzlich nie eine Link-Vorschau. Darum laden wir
//  das Titel-Medium herunter und geben es als Datei/Bild ins Share-Sheet; der
//  Link (Landing-Page zur App-Installation) liegt im Begleittext. So erscheint
//  das Bild/Video zuverlaessig als echtes Foto-/Video-Posting, bei Facebook,
//  Instagram, WhatsApp, iMessage und Mail gleichermassen.
//

import SwiftUI
import UIKit

/// Identifiable-Huelle, damit `.sheet(item:)` die geladenen Items anzeigen kann.
struct ShareItemsPayload: Identifiable {
    let id = UUID()
    let items: [Any]
}

/// Duenner Wrapper um UIActivityViewController fuer beliebige activityItems.
struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

enum NewsShareBuilder {
    /// Laedt das Titel-Medium (Video bevorzugt, sonst erstes Bild) und baut die
    /// activityItems: [Medium] + Begleittext (Titel/Auszug + Link). Faellt ohne
    /// Medium auf reines URL-Teilen zurueck (dort rendern Apps mit
    /// OG-Unterstuetzung wie WhatsApp/iMessage selbst eine Karte).
    static func build(media: [NewsMedia], message: String, link: String) async -> [Any] {
        let caption = link.isEmpty ? message : "\(message)\n\n\(link)"

        // Titel-Medium bestimmen: Video zuerst, sonst erstes Bild.
        let primary = media.first(where: { $0.type == "video" }) ?? media.first

        if let primary, let url = URL(string: primary.url) {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                if primary.type == "video" {
                    let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
                    let tmp = FileManager.default.temporaryDirectory
                        .appendingPathComponent("skipily-share-\(UUID().uuidString).\(ext)")
                    try data.write(to: tmp)
                    return [tmp, caption]
                } else if let image = UIImage(data: data) {
                    // UIImage wird von Foto-Zielen (FB/IG/WhatsApp) als echtes
                    // Bild erkannt.
                    return [image, caption]
                }
            } catch {
                // Download fehlgeschlagen -> Link-Fallback unten.
            }
        }

        // Kein Medium (oder Fehler): URL als echtes Link-Item + Begleittext.
        if let u = URL(string: link), !link.isEmpty {
            return [u, message]
        }
        return [caption]
    }
}
