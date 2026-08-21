//
//  CachedAsyncImage.swift
//  Skipily
//
//  Drop-in replacement for SwiftUI's AsyncImage that caches the *decoded and
//  downsampled* image in memory.
//
//  Why: AsyncImage re-downloads (or at least re-decodes) the full-resolution
//  image every time a cell scrolls back into view. On the iPhone the shop grid
//  shows few cells at once, so it's barely noticeable. On the iPad the larger
//  viewport renders many more cells and several image carousels at the same
//  time, so the repeated full-size JPEG decoding caused the shop to hang and
//  feel sluggish. This view decodes each image once, downsamples it to the
//  display size via ImageIO, and serves the cached UIImage afterwards.
//
//  The content closure uses the same `AsyncImagePhase` API as AsyncImage, so
//  existing call sites only need to swap the type name and add a `targetSize`.
//

import SwiftUI
import ImageIO
import UIKit
import CryptoKit

/// Loads, downsamples and caches images off the main thread.
///
/// Cache-Strategie (skaliert auf sehr große Kataloge, 10 000+ Produkte):
///   1. Memory-Cache (NSCache): kleines, LRU-verwaltetes Arbeitsfenster für
///      die aktuell sichtbaren/nahen Kacheln. Man sieht immer nur ~30 Bilder,
///      also muss der Speicher NICHT den ganzen Katalog halten.
///   2. Thumbnail-Disk-Cache: das einmal heruntergerechnete Thumbnail (~420 px,
///      ~30 KB) wird als JPEG in Caches/ImageThumbs/ persistiert. Beim
///      Zurückscrollen wird ein aus dem Speicher verdrängtes Bild in
///      Millisekunden von der Platte dekodiert — KEIN Netz, KEIN erneutes
///      Downsampling. Nur nie zuvor gesehene Bilder gehen ans Netz.
/// Dadurch „verschwinden" beim Scrollen keine Bilder mehr, egal wie groß der
/// Katalog ist — der Speicherbedarf bleibt konstant.
actor ImageDownsampler {
    static let shared = ImageDownsampler()

    // NSCache ist thread-safe -> als statischer Speicher, damit auch ein
    // SYNCHRONER Peek (ohne Actor-Hop) möglich ist. Das verhindert das
    // Flackern/Verschwinden bereits geladener Bilder, wenn LazyVGrid-Zellen
    // beim Scrollen recycelt werden (v. a. auf dem iPad mit vielen Kacheln).
    private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 600                     // Arbeitsfenster, nicht der ganze Katalog
        c.totalCostLimit = 160 * 1024 * 1024   // ~160 MB decoded pixels
        return c
    }()

    /// Verzeichnis für persistierte Thumbnails (OS darf es unter Druck leeren).
    private static let thumbDir: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("ImageThumbs", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private init() {
        // Einmal pro Session im Hintergrund die Thumbnail-Ablage begrenzen.
        Task.detached(priority: .utility) { Self.trimDiskCache(maxBytes: 256 * 1024 * 1024) }
    }

    private static func cacheKey(_ url: URL, _ maxPixel: CGFloat) -> NSString {
        "\(url.absoluteString)|\(Int(maxPixel))" as NSString
    }

    private static func thumbFileURL(_ url: URL, _ maxPixel: CGFloat) -> URL {
        let raw = "\(url.absoluteString)|\(Int(maxPixel))"
        let digest = SHA256.hash(data: Data(raw.utf8))
        let name = digest.map { String(format: "%02x", $0) }.joined()
        return thumbDir.appendingPathComponent(name).appendingPathExtension("jpg")
    }

    /// Synchroner Cache-Zugriff (nonisolated, NSCache ist thread-safe).
    /// Liefert ein bereits dekodiertes Bild sofort — sonst nil.
    nonisolated static func cachedImage(for url: URL, maxPixel: CGFloat) -> UIImage? {
        cache.object(forKey: cacheKey(url, maxPixel))
    }

    /// Returns a decoded, downsampled image for `url`, no larger than
    /// `maxPixel` on its longest edge. Cached results are returned immediately.
    func image(for url: URL, maxPixel: CGFloat) async -> UIImage? {
        let key = Self.cacheKey(url, maxPixel)
        if let cached = Self.cache.object(forKey: key) { return cached }

        // 2. Disk-Thumbnail: verdrängtes Bild ohne Netz/Downsampling zurückholen.
        let thumbURL = Self.thumbFileURL(url, maxPixel)
        if let data = try? Data(contentsOf: thumbURL),
           let image = UIImage(data: data)?.preparingForDisplay() ?? UIImage(data: data) {
            Self.store(image, key: key)
            return image
        }

        // 3. Netz: einmalig laden, downsamplen, in Speicher + auf Platte ablegen.
        guard let data = await fetchData(url) else { return nil }
        guard let image = Self.downsample(data: data, maxPixel: maxPixel) else { return nil }
        Self.store(image, key: key)
        Self.writeThumb(image, to: thumbURL)
        return image
    }

    private static func store(_ image: UIImage, key: NSString) {
        let bytes = Int(image.size.width * image.scale * image.size.height * image.scale * 4)
        cache.setObject(image, forKey: key, cost: bytes)
    }

    private static func writeThumb(_ image: UIImage, to fileURL: URL) {
        // Alpha-Kanal erhalten (z. B. Provider-Logos): PNG, wenn Transparenz
        // vorhanden ist, sonst das kompaktere JPEG für Produktfotos.
        let hasAlpha: Bool = {
            switch image.cgImage?.alphaInfo {
            case .first, .last, .premultipliedFirst, .premultipliedLast: return true
            default: return false
            }
        }()
        let data = hasAlpha ? image.pngData() : image.jpegData(compressionQuality: 0.8)
        guard let data else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// Ältere Thumbnails löschen, bis die Ablage wieder unter `maxBytes` liegt.
    private static func trimDiskCache(maxBytes: Int) {
        let fm = FileManager.default
        let keys: [URLResourceKey] = [.contentAccessDateKey, .fileSizeKey]
        guard let files = try? fm.contentsOfDirectory(
            at: thumbDir, includingPropertiesForKeys: keys) else { return }
        var entries: [(url: URL, size: Int, accessed: Date)] = []
        var total = 0
        for f in files {
            let vals = try? f.resourceValues(forKeys: Set(keys))
            let size = vals?.fileSize ?? 0
            let accessed = vals?.contentAccessDate ?? .distantPast
            entries.append((f, size, accessed))
            total += size
        }
        guard total > maxBytes else { return }
        for e in entries.sorted(by: { $0.accessed < $1.accessed }) {  // ältester Zugriff zuerst
            try? fm.removeItem(at: e.url)
            total -= e.size
            if total <= maxBytes { break }
        }
    }

    private func fetchData(_ url: URL) async -> Data? {
        // URLSession.shared uses the app-wide URLCache (configured in
        // SkipilyApp), so the raw bytes are reused across screens too.
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return data
        } catch {
            return nil
        }
    }

    /// Decodes `data` directly at a reduced size — never inflates the full
    /// image into memory, which is what keeps the iPad responsive.
    nonisolated static func downsample(data: Data, maxPixel: CGFloat) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return nil
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(maxPixel, 1)
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}

/// Drop-in cached replacement for `AsyncImage(url:content:)`.
///
/// `targetSize` is the display size in points; the image is downsampled to
/// that size times the screen scale.
struct CachedAsyncImage<Content: View>: View {
    private let url: URL?
    private let targetSize: CGSize
    private let content: (AsyncImagePhase) -> Content

    @State private var phase: AsyncImagePhase

    init(url: URL?,
         targetSize: CGSize,
         @ViewBuilder content: @escaping (AsyncImagePhase) -> Content) {
        self.url = url
        self.targetSize = targetSize
        self.content = content
        // Bereits gecachtes Bild sofort als Startzustand -> kein Flackern beim
        // Recycling/Zurückscrollen. Erst-Laden bleibt async (unten in load()).
        if let url {
            let maxPixel = max(targetSize.width, targetSize.height) * UIScreen.main.scale
            if let img = ImageDownsampler.cachedImage(for: url, maxPixel: maxPixel) {
                _phase = State(initialValue: .success(Image(uiImage: img)))
                return
            }
        }
        _phase = State(initialValue: .empty)
    }

    var body: some View {
        content(phase)
            .task(id: url) { await load() }
    }

    @MainActor
    private func load() async {
        guard let url else {
            phase = .empty
            return
        }
        let maxPixel = max(targetSize.width, targetSize.height) * UIScreen.main.scale
        // Synchroner Cache-Treffer -> sofort setzen, kein Actor-Hop nötig.
        if let cached = ImageDownsampler.cachedImage(for: url, maxPixel: maxPixel) {
            phase = .success(Image(uiImage: cached))
            return
        }
        if let image = await ImageDownsampler.shared.image(for: url, maxPixel: maxPixel) {
            phase = .success(Image(uiImage: image))
        } else {
            phase = .failure(URLError(.cannotDecodeContentData))
        }
    }
}
