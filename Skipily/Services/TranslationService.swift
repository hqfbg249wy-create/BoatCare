//
//  TranslationService.swift
//  Skipily
//
//  Lazy product-translation client (Strategy B aus dem i18n-Plan).
//
//  - Cacht Übersetzungen In-Memory pro (productId, lang).
//  - Ruft die Edge-Function `translate-product` auf, sobald Cache-Misses
//    auftauchen. Diese liefert Übersetzungen UND persistiert sie in
//    `metashop_products.translations` (JSONB), damit andere Clients den
//    Cache direkt nutzen können.
//  - Quelle bleibt Deutsch — bei `de` (oder unbekannter Sprache) wird
//    nichts übersetzt und das Original zurückgegeben.
//

import Foundation
import Supabase

@MainActor
final class TranslationService: ObservableObject {
    static let shared = TranslationService()

    struct Translation: Codable, Hashable {
        let name: String
        let description: String?
    }

    struct ProviderTranslation: Codable, Hashable {
        let services: [String]
        let description: String?
        let slogan: String?
    }

    /// cache[productId][lang] = Translation
    @Published private(set) var cache: [UUID: [String: Translation]] = [:]

    /// providerCache[providerId][lang] = ProviderTranslation
    @Published private(set) var providerCache: [UUID: [String: ProviderTranslation]] = [:]

    private var inflight: [String: Task<Void, Never>] = [:]

    private var client: SupabaseClient { SupabaseManager.shared.client }

    private static let supportedLangs: Set<String> = ["en", "es", "fr", "it", "nl"]

    private init() {}

    // MARK: - Public API

    /// Ist diese Sprache überhaupt zu übersetzen? (DE = Quelle → false)
    func needsTranslation(_ lang: String) -> Bool {
        Self.supportedLangs.contains(lang)
    }

    /// Liefert den anzuzeigenden Namen — Übersetzung wenn vorhanden,
    /// sonst Original.
    func name(for product: Product, lang: String) -> String {
        guard needsTranslation(lang),
              let t = cache[product.id]?[lang] else {
            return product.name
        }
        return t.name
    }

    /// Liefert die anzuzeigende Beschreibung.
    func description(for product: Product, lang: String) -> String? {
        guard needsTranslation(lang),
              let t = cache[product.id]?[lang] else {
            return product.description
        }
        return t.description ?? product.description
    }

    /// Stellt sicher, dass alle übergebenen Produkte für `lang` übersetzt sind.
    /// Cache-Hits werden übersprungen, Misses in einem Batch übersetzt.
    /// Failures sind non-fatal — Originaltext bleibt sichtbar.
    func ensureTranslations(for products: [Product], lang: String) async {
        guard needsTranslation(lang), !products.isEmpty else { return }

        let missing = products
            .map(\.id)
            .filter { cache[$0]?[lang] == nil }

        guard !missing.isEmpty else { return }

        // Inflight-Dedup: gleiche Anfrage nicht doppelt feuern
        let key = "\(lang):\(missing.sorted().map(\.uuidString).joined(separator: ","))"
        if let existing = inflight[key] {
            await existing.value
            return
        }

        let task = Task { [weak self] in
            await self?.fetchAndCache(productIds: missing, lang: lang)
        }
        inflight[key] = task
        await task.value
        inflight.removeValue(forKey: key)
    }

    // MARK: - Provider Translation API

    /// Liefert die anzuzeigende Service-Liste eines Providers.
    func services(for providerId: UUID, original: [String], lang: String) -> [String] {
        guard needsTranslation(lang),
              let t = providerCache[providerId]?[lang] else {
            return original
        }
        return t.services.isEmpty ? original : t.services
    }

    /// Liefert anzuzeigende Provider-Beschreibung.
    func providerDescription(for providerId: UUID, original: String?, lang: String) -> String? {
        guard needsTranslation(lang),
              let t = providerCache[providerId]?[lang] else {
            return original
        }
        return t.description ?? original
    }

    /// Stellt sicher, dass alle Provider für `lang` übersetzt sind.
    func ensureProviderTranslations(providerIds: [UUID], lang: String) async {
        guard needsTranslation(lang), !providerIds.isEmpty else { return }

        let missing = providerIds.filter { providerCache[$0]?[lang] == nil }
        guard !missing.isEmpty else { return }

        let key = "prov:\(lang):\(missing.sorted().map(\.uuidString).joined(separator: ","))"
        if let existing = inflight[key] {
            await existing.value
            return
        }

        let task = Task { [weak self] in
            await self?.fetchAndCacheProviders(providerIds: missing, lang: lang)
        }
        inflight[key] = task
        await task.value
        inflight.removeValue(forKey: key)
    }

    // MARK: - Edge Function Call

    private struct RequestBody: Encodable {
        let product_ids: [String]
        let target_lang: String
    }

    private struct ResponseBody: Decodable {
        let translations: [String: Translation]
    }

    private struct ProviderRequestBody: Encodable {
        let provider_ids: [String]
        let target_lang: String
    }

    private struct ProviderResponseBody: Decodable {
        let translations: [String: ProviderTranslation]
    }

    private func fetchAndCache(productIds: [UUID], lang: String) async {
        // Edge Function akzeptiert max 50 Produkte pro Call
        let chunks = productIds.chunked(into: 50)

        for chunk in chunks {
            let body = RequestBody(
                product_ids: chunk.map(\.uuidString),
                target_lang: lang
            )

            do {
                let response: ResponseBody = try await client.functions.invoke(
                    "translate-product",
                    options: .init(body: body)
                )

                for (idStr, translation) in response.translations {
                    guard let id = UUID(uuidString: idStr) else { continue }
                    var perLang = cache[id] ?? [:]
                    perLang[lang] = translation
                    cache[id] = perLang
                }
            } catch {
                AppLog.error("translate-product failed for lang=\(lang): \(error)")
                // Nicht werfen — UI fällt einfach auf DE-Original zurück.
            }
        }
    }

    private func fetchAndCacheProviders(providerIds: [UUID], lang: String) async {
        let chunks = providerIds.chunked(into: 30)

        for chunk in chunks {
            let body = ProviderRequestBody(
                provider_ids: chunk.map(\.uuidString),
                target_lang: lang
            )

            do {
                let response: ProviderResponseBody = try await client.functions.invoke(
                    "translate-provider",
                    options: .init(body: body)
                )

                for (idStr, translation) in response.translations {
                    guard let id = UUID(uuidString: idStr) else { continue }
                    var perLang = providerCache[id] ?? [:]
                    perLang[lang] = translation
                    providerCache[id] = perLang
                }
            } catch {
                AppLog.error("translate-provider failed for lang=\(lang): \(error)")
            }
        }
    }
}

// MARK: - Helpers

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        guard size > 0 else { return [self] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}
