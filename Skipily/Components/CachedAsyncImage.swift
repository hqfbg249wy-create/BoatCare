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

/// Loads, downsamples and caches images off the main thread.
actor ImageDownsampler {
    static let shared = ImageDownsampler()

    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 250
        // ~80 MB of decoded pixels — plenty for many small downsampled images.
        cache.totalCostLimit = 80 * 1024 * 1024
    }

    /// Returns a decoded, downsampled image for `url`, no larger than
    /// `maxPixel` on its longest edge. Cached results are returned immediately.
    func image(for url: URL, maxPixel: CGFloat) async -> UIImage? {
        let key = "\(url.absoluteString)|\(Int(maxPixel))" as NSString
        if let cached = cache.object(forKey: key) { return cached }

        guard let data = await fetchData(url) else { return nil }
        guard let image = Self.downsample(data: data, maxPixel: maxPixel) else { return nil }

        let bytes = Int(image.size.width * image.scale * image.size.height * image.scale * 4)
        cache.setObject(image, forKey: key, cost: bytes)
        return image
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

    @State private var phase: AsyncImagePhase = .empty

    init(url: URL?,
         targetSize: CGSize,
         @ViewBuilder content: @escaping (AsyncImagePhase) -> Content) {
        self.url = url
        self.targetSize = targetSize
        self.content = content
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
        if let image = await ImageDownsampler.shared.image(for: url, maxPixel: maxPixel) {
            phase = .success(Image(uiImage: image))
        } else {
            phase = .failure(URLError(.cannotDecodeContentData))
        }
    }
}
