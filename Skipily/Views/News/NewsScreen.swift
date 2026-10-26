//
//  NewsScreen.swift
//  Skipily
//
//  News-Feed „Tipps & Tricks": Eigner stellen Lösungen vor, Provider Produkte
//  (mit „Zum Shop"). Beiträge werden per KI moderiert (Edge Function
//  create-news-post). Feed-Mischung 3:1 liefert die RPC news_feed.
//

import SwiftUI
import PhotosUI
import AVKit
import Combine
import UIKit
import WebKit
import Supabase

// MARK: - Model
struct NewsPost: Identifiable, Decodable {
    let id: UUID
    let kind: String            // 'solution' | 'product'
    let title: String
    let subtitle: String
    let boatRef: String
    let equipmentRef: String
    let body: String
    let providerId: UUID?
    let productId: UUID?
    let authorId: UUID?
    let authorName: String
    let authorAvatarUrl: String
    var media: [NewsMedia] = []
    var productIds: [UUID] = []   // verlinkte Shop-Produkte (Provider-Beitrag)

    enum CodingKeys: String, CodingKey {
        case id, kind, title, subtitle, body
        case boatRef = "boat_ref"
        case equipmentRef = "equipment_ref"
        case providerId = "provider_id"
        case productId = "product_id"
        case authorId = "author_id"
        case authorName = "author_name"
        case authorAvatarUrl = "author_avatar_url"
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        kind = (try? c.decode(String.self, forKey: .kind)) ?? "solution"
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        subtitle = (try? c.decode(String.self, forKey: .subtitle)) ?? ""
        boatRef = (try? c.decode(String.self, forKey: .boatRef)) ?? ""
        equipmentRef = (try? c.decode(String.self, forKey: .equipmentRef)) ?? ""
        body = (try? c.decode(String.self, forKey: .body)) ?? ""
        providerId = try? c.decode(UUID.self, forKey: .providerId)
        productId = try? c.decode(UUID.self, forKey: .productId)
        authorId = try? c.decode(UUID.self, forKey: .authorId)
        authorName = (try? c.decode(String.self, forKey: .authorName)) ?? ""
        authorAvatarUrl = (try? c.decode(String.self, forKey: .authorAvatarUrl)) ?? ""
    }
}

struct NewsMedia: Identifiable {
    let id = UUID()
    let url: String
    let type: String   // 'image' | 'video'
}

// MARK: - Service
@MainActor
final class NewsService {
    static let shared = NewsService()
    private init() {}
    private var client: SupabaseClient { SupabaseManager.shared.client }

    struct FeedParams: Encodable { let p_limit: Int; let p_offset: Int }
    struct SearchParams: Encodable { let p_query: String; let p_limit: Int; let p_offset: Int }
    private struct MediaRow: Decodable { let post_id: UUID; let url: String; let media_type: String?; let sort_order: Int? }
    private struct ProductLinkRow: Decodable { let post_id: UUID; let product_id: UUID; let sort_order: Int? }

    func loadFeed(limit: Int = 40) async -> [NewsPost] {
        do {
            let posts: [NewsPost] = try await client
                .rpc("news_feed", params: FeedParams(p_limit: limit, p_offset: 0))
                .execute().value
            return await hydrateMedia(posts)
        } catch {
            AppLog.error("news_feed: \(error)")
            return []
        }
    }

    /// Volltext-Suche im Feed (Lösungen + Produkte) nach Ausrüstung/Lösung.
    func search(query: String, limit: Int = 40) async -> [NewsPost] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return await loadFeed(limit: limit) }
        do {
            let posts: [NewsPost] = try await client
                .rpc("news_search", params: SearchParams(p_query: term, p_limit: limit, p_offset: 0))
                .execute().value
            return await hydrateMedia(posts)
        } catch {
            AppLog.error("news_search: \(error)")
            return []
        }
    }

    /// Medien (Bilder/Video) zu den Beiträgen laden und zuordnen.
    private func hydrateMedia(_ posts: [NewsPost]) async -> [NewsPost] {
        var posts = posts
        let ids = posts.map { $0.id.uuidString }
        if !ids.isEmpty {
            let media: [MediaRow] = (try? await client.from("news_post_media")
                .select("post_id, url, media_type, sort_order").in("post_id", values: ids)
                .order("sort_order", ascending: true).execute().value) ?? []
            var byPost: [UUID: [NewsMedia]] = [:]
            for m in media { byPost[m.post_id, default: []].append(NewsMedia(url: m.url, type: m.media_type ?? "image")) }
            for i in posts.indices { posts[i].media = byPost[posts[i].id] ?? [] }

            // Verlinkte Shop-Produkte (für "Im Shop ansehen" → oben anpinnen)
            let links: [ProductLinkRow] = (try? await client.from("news_post_products")
                .select("post_id, product_id, sort_order").in("post_id", values: ids)
                .order("sort_order", ascending: true).execute().value) ?? []
            var prodByPost: [UUID: [UUID]] = [:]
            for l in links { prodByPost[l.post_id, default: []].append(l.product_id) }
            for i in posts.indices {
                var pids = prodByPost[posts[i].id] ?? []
                if pids.isEmpty, let single = posts[i].productId { pids = [single] }
                posts[i].productIds = pids
            }
        }
        return posts
    }

    struct CreateBody: Encodable {
        let kind: String
        let title: String
        let boat_ref: String
        let equipment_ref: String
        let body: String
        let media_urls: [String]
        let video_urls: [String]
        let youtube_url: String
    }
    struct CreateResult: Decodable { let status: String; let moderation_reason: String? }

    func createSolution(title: String, boatRef: String, equipmentRef: String,
                        body: String, images: [UIImage], videos: [Data],
                        youtubeUrl: String = "") async throws -> CreateResult {
        let uid = (try? await client.auth.session.user.id.uuidString) ?? "anon"
        var urls: [String] = []
        for (i, img) in images.prefix(5).enumerated() {
            guard let data = img.jpegData(compressionQuality: 0.7) else { continue }
            let path = "\(uid)/\(UUID().uuidString)_\(i).jpg"
            try await client.storage.from("news-media")
                .upload(path, data: data, options: .init(contentType: "image/jpeg", upsert: true))
            let pub = try client.storage.from("news-media").getPublicURL(path: path)
            urls.append(pub.absoluteString)
        }
        var videoUrls: [String] = []
        for (i, data) in videos.prefix(1).enumerated() {
            let outData = await Self.compressVideo(data)
            let path = "\(uid)/\(UUID().uuidString)_v\(i).mp4"
            try await client.storage.from("news-media")
                .upload(path, data: outData, options: .init(contentType: "video/mp4", upsert: true))
            let pub = try client.storage.from("news-media").getPublicURL(path: path)
            videoUrls.append(pub.absoluteString)
        }
        return try await client.functions.invoke("create-news-post", options: .init(
            body: CreateBody(kind: "solution", title: title, boat_ref: boatRef,
                             equipment_ref: equipmentRef, body: body, media_urls: urls, video_urls: videoUrls,
                             youtube_url: youtubeUrl)))
    }

    func report(postId: UUID, reason: String) async {
        struct R: Encodable { let post_id: String; let reason: String }
        _ = try? await client.from("news_reports").insert(R(post_id: postId.uuidString, reason: reason)).execute()
    }

    func currentUserId() async -> UUID? { try? await client.auth.session.user.id }

    // MARK: - Kommentare
    struct NewsComment: Identifiable, Decodable {
        let id: UUID
        let author_id: UUID?
        let author_name: String
        let author_avatar_url: String
        let body: String
        let created_at: String?
    }
    private struct CommentInsert: Encodable {
        let post_id: String; let body: String; let author_name: String; let author_avatar_url: String
    }

    func loadComments(postId: UUID) async -> [NewsComment] {
        (try? await client.from("news_comments")
            .select("id, author_id, author_name, author_avatar_url, body, created_at")
            .eq("post_id", value: postId.uuidString)
            .order("created_at", ascending: true)
            .execute().value) ?? []
    }

    func addComment(postId: UUID, body: String) async -> NewsComment? {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let uid = try? await client.auth.session.user.id else { return nil }
        struct Prof: Decodable { let full_name: String?; let email: String?; let avatar_url: String? }
        let prof: Prof? = try? await client.from("profiles")
            .select("full_name, email, avatar_url").eq("id", value: uid.uuidString).single().execute().value
        var name = prof?.full_name ?? ""
        if name.isEmpty, let mail = prof?.email { name = String(mail.prefix(while: { $0 != "@" })) }
        let rows: [NewsComment] = (try? await client.from("news_comments")
            .insert(CommentInsert(post_id: postId.uuidString, body: text,
                                  author_name: name, author_avatar_url: prof?.avatar_url ?? ""))
            .select("id, author_id, author_name, author_avatar_url, body, created_at")
            .execute().value) ?? []
        return rows.first
    }

    func deleteComment(id: UUID) async {
        _ = try? await client.from("news_comments").delete().eq("id", value: id.uuidString).execute()
    }

    private struct CommentPostRow: Decodable { let post_id: UUID }
    func loadCommentCounts(postIds: [UUID]) async -> [UUID: Int] {
        guard !postIds.isEmpty else { return [:] }
        let rows: [CommentPostRow] = (try? await client.from("news_comments")
            .select("post_id").in("post_id", values: postIds.map { $0.uuidString })
            .execute().value) ?? []
        var counts: [UUID: Int] = [:]
        for r in rows { counts[r.post_id, default: 0] += 1 }
        return counts
    }

    // MARK: - Artikel im Shop finden (KI + Shop-Suche)
    struct PartMatch: Decodable, Identifiable {
        let id: String; let name: String; let manufacturer: String?; let part_number: String?
        let price: Double?; let currency: String?; let image: String?; let provider_id: String?
    }
    struct PartFallback: Decodable {
        let article_number: String; let description: String
        let confidence: String?; let installed_match: Bool?
    }
    struct PartItem: Decodable, Identifiable {
        var id: String { query }
        let query: String; let matches: [PartMatch]; let fallback: PartFallback?
    }
    struct PartsResult { let items: [PartItem]; let paid: Bool; let quotaExhausted: Bool; let hint: String? }
    private struct PartsResp: Decodable {
        let items: [PartItem]?; let paid: Bool?; let quota_exhausted: Bool?; let upgrade_hint: String?
    }
    private struct PartsReq: Encodable { let post_id: String }

    func findParts(postId: UUID) async -> PartsResult {
        do {
            let r: PartsResp = try await client.functions.invoke("find-post-parts",
                options: .init(body: PartsReq(post_id: postId.uuidString)))
            return PartsResult(items: r.items ?? [], paid: r.paid ?? false,
                               quotaExhausted: r.quota_exhausted ?? false, hint: r.upgrade_hint)
        } catch {
            AppLog.error("find-post-parts: \(error)")
            return PartsResult(items: [], paid: false, quotaExhausted: false, hint: nil)
        }
    }

    // MARK: - Übersetzung
    struct TranslatedFields: Decodable { let title: String; let subtitle: String; let body: String }
    struct TranslateResult { let map: [UUID: TranslatedFields]; let quotaExhausted: Bool; let hint: String? }
    private struct TransPost: Encodable { let id: String; let title: String; let subtitle: String; let body: String }
    private struct TransReq: Encodable { let posts: [TransPost]; let target_lang: String }
    private struct TransResp: Decodable {
        let translations: [String: TranslatedFields]
        let quota_exhausted: Bool?
        let upgrade_hint: String?
    }

    /// Übersetzt die Textfelder der Beiträge in die Zielsprache (gecacht serverseitig).
    func translate(posts: [NewsPost], lang: String) async -> TranslateResult {
        guard lang != "de", !posts.isEmpty else { return TranslateResult(map: [:], quotaExhausted: false, hint: nil) }
        let payload = posts.map { TransPost(id: $0.id.uuidString, title: $0.title, subtitle: $0.subtitle, body: $0.body) }
        do {
            let r: TransResp = try await client.functions.invoke("translate-news",
                options: .init(body: TransReq(posts: payload, target_lang: lang)))
            var map: [UUID: TranslatedFields] = [:]
            for (k, v) in r.translations { if let id = UUID(uuidString: k) { map[id] = v } }
            return TranslateResult(map: map, quotaExhausted: r.quota_exhausted ?? false, hint: r.upgrade_hint)
        } catch {
            AppLog.error("translate-news: \(error)")
            return TranslateResult(map: [:], quotaExhausted: false, hint: nil)
        }
    }

    /// Komprimiert ein Video (1080p-Preset, netz-optimiert) vor dem Upload.
    /// Fällt bei Fehlern auf das Original zurück. Fuer sehr lange Videos besser
    /// den YouTube-Link nutzen.
    static func compressVideo(_ data: Data) async -> Data {
        let tmp = FileManager.default.temporaryDirectory
        let inURL = tmp.appendingPathComponent(UUID().uuidString + ".mov")
        let outURL = tmp.appendingPathComponent(UUID().uuidString + ".mp4")
        defer {
            try? FileManager.default.removeItem(at: inURL)
            try? FileManager.default.removeItem(at: outURL)
        }
        do {
            try data.write(to: inURL)
            let asset = AVURLAsset(url: inURL)
            // 1080p bevorzugen; faellt auf 720p zurueck, falls nicht verfuegbar.
            let preset = AVAssetExportSession.exportPresets(compatibleWith: asset).contains(AVAssetExportPreset1920x1080)
                ? AVAssetExportPreset1920x1080 : AVAssetExportPreset1280x720
            guard let export = AVAssetExportSession(asset: asset, presetName: preset) else { return data }
            export.outputURL = outURL
            export.outputFileType = .mp4
            export.shouldOptimizeForNetworkUse = true
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                export.exportAsynchronously { cont.resume() }
            }
            if export.status == .completed,
               let out = try? Data(contentsOf: outURL), out.count > 0, out.count < data.count {
                return out
            }
        } catch {
            AppLog.error("compressVideo: \(error)")
        }
        return data
    }

    func deletePost(id: UUID) async {
        _ = try? await client.from("news_posts").delete().eq("id", value: id.uuidString).execute()
    }

    private struct UpdateBody: Encodable {
        let post_id: String
        let title: String
        let boat_ref: String
        let equipment_ref: String
        let body: String
        let media_urls: [String]
        let video_urls: [String]
        let youtube_url: String
    }

    /// Bearbeitet einen eigenen Lösungs-Beitrag (Re-Moderation serverseitig).
    func updateSolution(postId: UUID, title: String, boatRef: String, equipmentRef: String,
                        body: String, keepImages: [String], keepVideos: [String],
                        newImages: [UIImage], newVideos: [Data],
                        youtubeUrl: String = "") async throws -> CreateResult {
        let uid = (try? await client.auth.session.user.id.uuidString) ?? "anon"
        var imageUrls = keepImages
        for (i, img) in newImages.enumerated() where imageUrls.count < 5 {
            guard let data = img.jpegData(compressionQuality: 0.7) else { continue }
            let path = "\(uid)/\(UUID().uuidString)_\(i).jpg"
            try await client.storage.from("news-media").upload(path, data: data, options: .init(contentType: "image/jpeg", upsert: true))
            imageUrls.append(try client.storage.from("news-media").getPublicURL(path: path).absoluteString)
        }
        var videoUrls = keepVideos
        for (i, data) in newVideos.enumerated() where videoUrls.count < 1 {
            let outData = await Self.compressVideo(data)
            let path = "\(uid)/\(UUID().uuidString)_v\(i).mp4"
            try await client.storage.from("news-media").upload(path, data: outData, options: .init(contentType: "video/mp4", upsert: true))
            videoUrls.append(try client.storage.from("news-media").getPublicURL(path: path).absoluteString)
        }
        return try await client.functions.invoke("update-news-post", options: .init(
            body: UpdateBody(post_id: postId.uuidString, title: title, boat_ref: boatRef,
                             equipment_ref: equipmentRef, body: body,
                             media_urls: Array(imageUrls.prefix(5)), video_urls: Array(videoUrls.prefix(1)),
                             youtube_url: youtubeUrl)))
    }

    // MARK: - Emoji-Reaktionen
    private struct ReactionRow: Decodable { let post_id: UUID; let emoji: String; let user_id: UUID }

    /// Liefert Zählung je Beitrag/Emoji + Set der eigenen Reaktionen ("<postId>:<emoji>").
    func loadReactions(postIds: [UUID]) async -> (counts: [UUID: [String: Int]], mine: Set<String>) {
        guard !postIds.isEmpty else { return ([:], []) }
        let myId = try? await client.auth.session.user.id
        let rows: [ReactionRow] = (try? await client.from("news_post_reactions")
            .select("post_id, emoji, user_id")
            .in("post_id", values: postIds.map { $0.uuidString })
            .execute().value) ?? []
        var counts: [UUID: [String: Int]] = [:]
        var mine: Set<String> = []
        for r in rows {
            counts[r.post_id, default: [:]][r.emoji, default: 0] += 1
            if let myId, r.user_id == myId { mine.insert("\(r.post_id.uuidString):\(r.emoji)") }
        }
        return (counts, mine)
    }

    // MARK: - Untertitel (WebVTT)
    struct SubtitlesResult { let vtt: String?; let quotaExhausted: Bool; let hint: String? }
    private struct SubtitlesResp: Decodable { let vtt: String?; let status: String?; let quota_exhausted: Bool?; let upgrade_hint: String? }
    private struct SubtitlesReq: Encodable { let post_id: String; let target_lang: String }

    /// Holt die WebVTT-Untertitelspur eines Videos in der Zielsprache (lazy + gecacht serverseitig).
    func subtitles(postId: UUID, lang: String) async -> SubtitlesResult {
        do {
            let r: SubtitlesResp = try await client.functions.invoke("news-subtitles",
                options: .init(body: SubtitlesReq(post_id: postId.uuidString, target_lang: lang)))
            return SubtitlesResult(vtt: r.vtt, quotaExhausted: r.quota_exhausted ?? (r.status == "quota"), hint: r.upgrade_hint)
        } catch {
            AppLog.error("news-subtitles: \(error)")
            return SubtitlesResult(vtt: nil, quotaExhausted: false, hint: nil)
        }
    }

    func addReaction(postId: UUID, emoji: String) async {
        struct R: Encodable { let post_id: String; let emoji: String }
        _ = try? await client.from("news_post_reactions").insert(R(post_id: postId.uuidString, emoji: emoji)).execute()
    }

    func removeReaction(postId: UUID, emoji: String) async {
        guard let myId = try? await client.auth.session.user.id else { return }
        _ = try? await client.from("news_post_reactions").delete()
            .eq("post_id", value: postId.uuidString)
            .eq("emoji", value: emoji)
            .eq("user_id", value: myId.uuidString)
            .execute()
    }
}

let NEWS_REACTION_EMOJIS = ["👍", "❤️", "⚓", "🔧", "👏"]
// Erweiterte Auswahl im Long-Press-Popover.
let NEWS_REACTION_EMOJIS_ALL = ["👍", "❤️", "⚓", "🔧", "👏", "😂", "😮", "🙏", "⛵️", "🌊", "💪", "💡", "🎉", "🔥"]

/// Hält einen Abo-Hinweis, wenn das KI-Budget für Übersetzung/Untertitel erschöpft ist.
@MainActor final class NewsQuotaStore: ObservableObject {
    static let shared = NewsQuotaStore()
    @Published var hint: String?
    private init() {}
}

// MARK: - Feed
struct ShopProviderRef: Identifiable { let id: UUID; var pinned: [UUID] = [] }

struct NewsScreen: View {
    @State private var posts: [NewsPost] = []
    @State private var isLoading = true
    @State private var showCompose = false
    @State private var reactionCounts: [UUID: [String: Int]] = [:]
    @State private var commentCounts: [UUID: Int] = [:]
    @State private var myReactions: Set<String> = []
    @State private var shopProvider: ShopProviderRef?
    @State private var myUserId: UUID?
    @State private var editPost: NewsPost?
    @State private var translations: [UUID: NewsService.TranslatedFields] = [:]
    @State private var showOriginal: Set<UUID> = []
    @State private var searchText = ""
    @State private var partsResult: NewsService.PartsResult?
    @State private var partsLoading = false
    @State private var showParts = false
    @ObservedObject private var quotaStore = NewsQuotaStore.shared
    @State private var showPlusSheet = false

    // Feed-Inhalt ausgelagert, damit die große Modifier-Kette im body den
    // Typprüfer nicht überlastet.
    @ViewBuilder
    private var feedContent: some View {
        if isLoading {
            ProgressView("general.loading".loc).frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if posts.isEmpty {
            if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                ContentUnavailableView("news.empty".loc, systemImage: "newspaper",
                                       description: Text("news.emptyHint".loc))
            } else {
                ContentUnavailableView("news.empty".loc, systemImage: "magnifyingglass",
                                       description: Text("news.searchEmpty".loc))
            }
        } else {
            ScrollView {
                LazyVStack(spacing: 16) {
                    ForEach(posts) { post in card(for: post) }
                }
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
                .padding(.horizontal, 12)
                // Unten genug Platz, damit Karteninhalt (z. B. das Kommentar-
                // Eingabefeld) über die schwebende Tab-Leiste gescrollt werden kann.
                .padding(.bottom, 96)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    var body: some View {
        NavigationStack {
            feedContent
            .navigationTitle("news.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text("news.title".loc).font(.headline)
                        Text("news.subtitle".loc).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCompose = true } label: { Image(systemName: "square.and.pencil") }
                }
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: "news.searchPh".loc)
            .refreshable { await load() }
            // Erst-Laden + entprellte Suche: bei jeder Textänderung neu laden,
            // vorheriger Task wird durch die id-Bindung abgebrochen.
            .task(id: searchText) {
                if !searchText.isEmpty {
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    if Task.isCancelled { return }
                }
                await load()
            }
            .sheet(isPresented: $showCompose, onDismiss: { Task { await load() } }) {
                NewsComposeView()
            }
            .sheet(item: $shopProvider) { ref in
                NavigationStack {
                    ProviderShopSearchView(providerId: ref.id, providerName: "", searchTerm: "", pinnedProductIds: ref.pinned)
                }
            }
            .sheet(item: $editPost, onDismiss: { Task { await load() } }) { post in
                NewsComposeView(editPost: post)
            }
            .sheet(isPresented: $showPlusSheet) {
                PlusUpgradeSheet(reason: quotaStore.hint ?? "news.aiBudgetHint".loc)
            }
            .sheet(isPresented: $showParts) {
                PostPartsSheet(loading: partsLoading, result: partsResult,
                               onUpgrade: { showParts = false; showPlusSheet = true })
            }
            .safeAreaInset(edge: .top) {
                if let h = quotaStore.hint {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles").foregroundStyle(AppColors.primary)
                        Text(h).font(.caption).foregroundStyle(.primary)
                        Spacer()
                        Button("news.toSubscription".loc) { showPlusSheet = true }
                            .font(.caption.weight(.semibold))
                        Button { quotaStore.hint = nil } label: { Image(systemName: "xmark").font(.caption) }
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(.bar)
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        if myUserId == nil { myUserId = await NewsService.shared.currentUserId() }
        let term = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        posts = term.isEmpty ? await NewsService.shared.loadFeed() : await NewsService.shared.search(query: term)
        let r = await NewsService.shared.loadReactions(postIds: posts.map { $0.id })
        reactionCounts = r.counts; myReactions = r.mine
        commentCounts = await NewsService.shared.loadCommentCounts(postIds: posts.map { $0.id })
        isLoading = false
        // Immer in die UI-Sprache des Nutzers uebersetzen. Beitraege, die bereits
        // in dieser Sprache sind, gibt translate-news unveraendert zurueck (die
        // Funktion cached pro Beitrag+Sprache). So sieht z. B. ein deutscher
        // Nutzer auch niederlaendische/englische Beitraege auf Deutsch.
        let lang = LanguageManager.shared.currentLanguage.code
        let tr = await NewsService.shared.translate(posts: posts, lang: lang)
        translations = tr.map
        if tr.quotaExhausted { NewsQuotaStore.shared.hint = tr.hint ?? "news.aiBudgetHint".loc }
    }

    // Ausgelagert, damit der Typprüfer den großen Initializer nicht inline
    // auflösen muss (sonst „unable to type-check in reasonable time").
    @ViewBuilder
    private func card(for post: NewsPost) -> some View {
        NewsCard(
            post: post,
            counts: reactionCounts[post.id] ?? [:],
            mine: myReactions,
            commentCount: commentCounts[post.id] ?? 0,
            onCommentDelta: { delta in commentCounts[post.id, default: 0] = max(0, (commentCounts[post.id] ?? 0) + delta) },
            myUserId: myUserId,
            isOwn: myUserId != nil && post.authorId == myUserId && post.kind == "solution",
            translation: showOriginal.contains(post.id) ? nil : translations[post.id],
            onReact: { emoji in Task { await toggleReaction(post, emoji) } },
            onOpenShop: { if let pid = post.providerId { shopProvider = ShopProviderRef(id: pid, pinned: post.productIds) } },
            onFindParts: { Task { await startFindParts(post) } },
            onEdit: { editPost = post },
            onDelete: { Task { await NewsService.shared.deletePost(id: post.id); await load() } },
            hasTranslation: translations[post.id] != nil,
            isShowingOriginal: showOriginal.contains(post.id),
            onToggleTranslation: {
                if showOriginal.contains(post.id) { showOriginal.remove(post.id) }
                else { showOriginal.insert(post.id) }
            }
        )
    }

    private func startFindParts(_ post: NewsPost) async {
        partsResult = nil; partsLoading = true; showParts = true
        let r = await NewsService.shared.findParts(postId: post.id)
        partsResult = r; partsLoading = false
        if r.quotaExhausted, let h = r.hint { NewsQuotaStore.shared.hint = h }
    }

    private func toggleReaction(_ post: NewsPost, _ emoji: String) async {
        let key = "\(post.id.uuidString):\(emoji)"
        let had = myReactions.contains(key)
        // optimistisch
        if had { myReactions.remove(key) } else { myReactions.insert(key) }
        var c = reactionCounts[post.id] ?? [:]
        c[emoji] = max(0, (c[emoji] ?? 0) + (had ? -1 : 1))
        if c[emoji] == 0 { c[emoji] = nil }
        reactionCounts[post.id] = c
        if had { await NewsService.shared.removeReaction(postId: post.id, emoji: emoji) }
        else { await NewsService.shared.addReaction(postId: post.id, emoji: emoji) }
    }
}

// MARK: - Card
private struct NewsCard: View {
    let post: NewsPost
    let counts: [String: Int]
    let mine: Set<String>
    var commentCount: Int = 0
    var onCommentDelta: (Int) -> Void = { _ in }
    var myUserId: UUID? = nil
    var isOwn: Bool = false
    var translation: NewsService.TranslatedFields? = nil
    let onReact: (String) -> Void
    let onOpenShop: () -> Void
    var onFindParts: () -> Void = {}
    var onEdit: () -> Void = {}
    var onDelete: () -> Void = {}
    var hasTranslation: Bool = false
    var isShowingOriginal: Bool = false
    var onToggleTranslation: () -> Void = {}
    private var dTitle: String { translation?.title ?? post.title }
    private var dSubtitle: String { translation?.subtitle ?? post.subtitle }
    private var dBody: String { translation?.body ?? post.body }
    /// Link zur Landing-Page (App-Installation). UUID klein geschrieben
    /// (konsistent mit den Web-Links, vermeidet doppelten FB-Cache).
    private var shareLink: String {
        "https://app.skipily.app/p/\(post.id.uuidString.lowercased())"
    }
    /// Begleittext (Titel + Auszug). Beim Teilen wird der Link angehängt.
    private var shareMessage: String {
        var parts = [dTitle]
        let body = dBody.trimmingCharacters(in: .whitespacesAndNewlines)
        if !body.isEmpty { parts.append(String(body.prefix(240)) + (body.count > 240 ? "…" : "")) }
        return parts.joined(separator: "\n\n")
    }
    @State private var sharePayload: ShareItemsPayload?
    @State private var isPreparingShare = false

    /// Lädt das Titel-Medium (Foto/Video) herunter und öffnet das Share-Sheet
    /// mit echtem Medium + Text/Link. So erscheint das Bild/Video zuverlässig
    /// als Posting (auch bei Facebook & Instagram, die Link-Vorschauen aus dem
    /// Share-Sheet nicht rendern).
    private func prepareShare() async {
        isPreparingShare = true
        let items = await NewsShareBuilder.build(media: post.media, message: shareMessage, link: shareLink)
        isPreparingShare = false
        sharePayload = ShareItemsPayload(items: items)
    }
    @State private var showReport = false
    @State private var reportText = ""
    @State private var showDeleteConfirm = false
    @State private var bodyExpanded = false
    @State private var showComments = false
    @State private var fsImage: FSImage?   // Foto im Vollbild (Pinch-Zoom)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if post.kind == "product" { sponsoredBadge }
            if !post.media.isEmpty { mediaGallery }
            VStack(alignment: .leading, spacing: 6) {
                authorHeader
                Text(dTitle).font(.headline)
                if !dSubtitle.isEmpty {
                    Text(dSubtitle).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                }
                if !post.boatRef.isEmpty || !post.equipmentRef.isEmpty { refRow }
                bodyView
                if hasTranslation {
                    Button(isShowingOriginal ? "news.showTranslation".loc : "news.autoTranslated".loc) { onToggleTranslation() }
                        .font(.caption2)
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
                actionRow
                reactionsRow
                if showComments {
                    NewsCommentsView(postId: post.id, myUserId: myUserId, onCountChange: onCommentDelta)
                        .padding(.top, 6)
                }
            }
            .padding(12)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(.systemGray5)))
        .padding(.horizontal)
        .alert("news.report".loc, isPresented: $showReport) {
            TextField("news.reportPrompt".loc, text: $reportText)
            Button("general.cancel".loc, role: .cancel) {}
            Button("news.report".loc) { Task { await NewsService.shared.report(postId: post.id, reason: reportText); reportText = "" } }
        }
        .alert("news.deleteConfirm".loc, isPresented: $showDeleteConfirm) {
            Button("general.cancel".loc, role: .cancel) {}
            Button("news.delete".loc, role: .destructive) { onDelete() }
        }
        .fullScreenCover(item: $fsImage) { img in
            ZoomableImageView(url: img.url)
        }
    }

    private var sponsoredBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: "shippingbox.fill").font(.caption2)
            Text("news.sponsored".loc).font(.caption2.weight(.bold))
        }
        .foregroundStyle(.blue)
        .padding(.horizontal, 12).padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.blue.opacity(0.1))
    }

    @ViewBuilder
    private var mediaGallery: some View {
        // Video + Fotos in EINER horizontalen Zeile — Video immer zuerst,
        // dann YouTube, dann Fotos. Alles gleich hoch.
        let video = post.media.first(where: { $0.type == "video" })
        let youtube = post.media.first(where: { $0.type == "youtube" })
        let images = post.media.filter { $0.type == "image" }
        let H: CGFloat = 200
        if video != nil || youtube != nil || !images.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    if let v = video, let url = URL(string: v.url) {
                        NewsVideoPlayer(url: url, postId: post.id, lang: LanguageManager.shared.currentLanguage.code)
                            .frame(width: 320, height: H)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    if let y = youtube, let vid = Self.youtubeID(y.url) {
                        YouTubeInlinePlayer(videoID: vid)
                            .frame(width: 320, height: H)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    ForEach(images) { m in
                        AsyncImage(url: URL(string: m.url)) { phase in
                            if case .success(let img) = phase {
                                img.resizable().scaledToFill()
                            } else { Rectangle().fill(Color(.systemGray5)) }
                        }
                        .frame(width: 260, height: H).clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .contentShape(Rectangle())
                        .onTapGesture { fsImage = FSImage(url: m.url) }
                    }
                }
                .padding(.horizontal, 12)
            }
            .frame(height: H)
            .padding(.top, 10)
        }
    }

    /// Extrahiert die YouTube-Video-ID aus einer URL (watch/embed/shorts/youtu.be).
    static func youtubeID(_ url: String) -> String? {
        let patterns = [
            "(?:youtube\\.com/(?:watch\\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\\.be/)([A-Za-z0-9_-]{11})",
            "^([A-Za-z0-9_-]{11})$"
        ]
        for p in patterns {
            if let r = try? NSRegularExpression(pattern: p),
               let m = r.firstMatch(in: url, range: NSRange(url.startIndex..., in: url)),
               let range = Range(m.range(at: 1), in: url) {
                return String(url[range])
            }
        }
        return nil
    }

    @ViewBuilder
    private var authorHeader: some View {
        HStack(spacing: 8) {
            if !post.authorName.isEmpty || !post.authorAvatarUrl.isEmpty {
                if let url = URL(string: post.authorAvatarUrl), !post.authorAvatarUrl.isEmpty {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase { img.resizable().scaledToFill() }
                        else { Circle().fill(Color(.systemGray4)) }
                    }
                    .frame(width: 30, height: 30).clipShape(Circle())
                } else {
                    ZStack {
                        Circle().fill(Color(.systemGray5))
                        Text(String(post.authorName.prefix(1)).uppercased()).font(.caption.weight(.bold)).foregroundStyle(.secondary)
                    }.frame(width: 30, height: 30)
                }
                Text(post.authorName.isEmpty ? "—" : post.authorName)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
            }
            Spacer(minLength: 0)
            // ⋯-Menü: Bearbeiten/Löschen (nur eigene) + Melden
            Menu {
                if isOwn {
                    Button { onEdit() } label: { Label("news.edit".loc, systemImage: "pencil") }
                    Button(role: .destructive) { showDeleteConfirm = true } label: { Label("news.delete".loc, systemImage: "trash") }
                }
                Button { showReport = true } label: { Label("news.report".loc, systemImage: "flag") }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 28)
                    .contentShape(Rectangle())
            }
        }
        .padding(.bottom, 2)
    }

    @ViewBuilder
    private var bodyView: some View {
        if !dBody.isEmpty {
            Text(dBody)
                .font(.subheadline).foregroundStyle(.primary)
                .lineLimit(bodyExpanded ? nil : 4)
            if dBody.count > 160 || dBody.filter({ $0 == "\n" }).count >= 4 {
                Button(bodyExpanded ? "news.less".loc : "news.more".loc) { bodyExpanded.toggle() }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.plain)
                    .foregroundStyle(AppColors.primary)
            }
        }
    }

    private var refRow: some View {
        // Schiffstyp + Ausrüstung in EINER Zeile (spart Platz, kürzt bei Bedarf).
        HStack(spacing: 12) {
            if !post.boatRef.isEmpty {
                Label(post.boatRef, systemImage: "sailboat.fill")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail)
            }
            if !post.equipmentRef.isEmpty {
                Label(post.equipmentRef, systemImage: "shippingbox")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private var actionRow: some View {
        // Nur der Shop-Button beim Produktbeitrag; der Artikelfinder sitzt bei
        // Lösungsbeiträgen kompakt in der Reaktionszeile. ⋯-Menü = oben.
        if post.kind == "product", post.providerId != nil {
            HStack {
                Button { onOpenShop() } label: {
                    Label("news.toShop".loc, systemImage: "cart.fill").font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                Spacer()
            }
            .padding(.top, 2)
        }
    }

    private var totalReactions: Int { counts.values.reduce(0, +) }
    private var summaryEmojis: String {
        let active = NEWS_REACTION_EMOJIS.filter { (counts[$0] ?? 0) > 0 }
        return active.isEmpty ? NEWS_REACTION_EMOJIS[0] : active.prefix(3).joined()
    }
    private var iReacted: Bool { mine.contains { $0.hasPrefix(post.id.uuidString + ":") } }

    private var reactionsRow: some View {
        HStack(spacing: 8) {
            // Zusammengefasste Reaktion: Tippen = 👍, langer Druck = Auswahl.
            // Natives Menu mit primaryAction: Tippen löst 👍 aus, Gedrückt-Halten
            // öffnet die Emoji-Auswahl (zuverlässiger als onLongPressGesture).
            Menu {
                ForEach(NEWS_REACTION_EMOJIS_ALL, id: \.self) { em in
                    Button { onReact(em) } label: {
                        Text((counts[em] ?? 0) > 0 ? "\(em)   \(counts[em]!)" : em)
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(summaryEmojis)
                    if totalReactions > 0 {
                        Text("\(totalReactions)").font(.caption.weight(.bold))
                            .foregroundStyle(iReacted ? AppColors.primary : .secondary)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(iReacted ? AppColors.primary.opacity(0.12) : Color(.systemGray6))
                .clipShape(Capsule())
            } primaryAction: {
                onReact(NEWS_REACTION_EMOJIS[0])
            }
            .buttonStyle(.plain)

            // Kommentare öffnen (Bubble + Anzahl).
            Button { showComments.toggle() } label: {
                HStack(spacing: 4) {
                    Image(systemName: showComments ? "bubble.left.fill" : "bubble.left")
                    if commentCount > 0 { Text("\(commentCount)").font(.caption.weight(.bold)) }
                }
                .font(.subheadline)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Capsule().fill(Color(.systemGray6)))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.primary)
            .accessibilityLabel("news.comments".loc)

            if post.kind != "product" {
                Button { onFindParts() } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.subheadline)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Capsule().fill(Color(.systemGray6)))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
                .accessibilityLabel("news.findParts".loc)
            }

            // Teilen (neben der Lupe) — Medium (Foto/Video) + Link via Share-Sheet.
            Button {
                Task { await prepareShare() }
            } label: {
                Group {
                    if isPreparingShare {
                        ProgressView().scaleEffect(0.7).frame(width: 18, height: 18)
                    } else {
                        Image(systemName: "square.and.arrow.up").font(.subheadline)
                    }
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Capsule().fill(Color(.systemGray6)))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.primary)
            .disabled(isPreparingShare)
            .accessibilityLabel("news.share".loc)
            .sheet(item: $sharePayload) { payload in
                ActivityShareSheet(items: payload.items)
            }

            Spacer(minLength: 0)
        }
        .padding(.top, 4)
    }
}

// MARK: - Reaktions-Chip
private struct ReactionChip: View {
    let emoji: String
    let count: Int
    let isMine: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(emoji)
                if count > 0 {
                    Text("\(count)").font(.caption.weight(.bold))
                        .foregroundStyle(isMine ? AppColors.primary : .secondary)
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(isMine ? AppColors.primary.opacity(0.12) : Color(.systemGray6))
            .overlay(Capsule().stroke(isMine ? AppColors.primary : Color.clear))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Kommentare (per Klick geöffnet, unterhalb des Beitrags)
private struct NewsCommentsView: View {
    let postId: UUID
    var myUserId: UUID? = nil
    var onCountChange: (Int) -> Void = { _ in }
    @State private var comments: [NewsService.NewsComment] = []
    @State private var loading = true
    @State private var draft = ""
    @State private var sending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            if loading {
                HStack(spacing: 6) { ProgressView().controlSize(.small); Text("general.loading".loc).font(.caption).foregroundStyle(.secondary) }
            } else if comments.isEmpty {
                Text("news.noComments".loc).font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(comments) { c in
                    HStack(alignment: .top, spacing: 8) {
                        avatar(c)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(c.author_name.isEmpty ? "—" : c.author_name).font(.caption.weight(.semibold))
                            Text(c.body).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        if canDelete(c) {
                            Button { Task { await NewsService.shared.deleteComment(id: c.id); comments.removeAll { $0.id == c.id }; onCountChange(-1) } } label: {
                                Image(systemName: "trash").font(.caption2).foregroundStyle(.secondary)
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
            // Eingabe
            HStack(spacing: 8) {
                TextField("news.commentPh".loc, text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                Button { Task { await send() } } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .task { comments = await NewsService.shared.loadComments(postId: postId); loading = false }
    }

    @ViewBuilder private func avatar(_ c: NewsService.NewsComment) -> some View {
        if let u = URL(string: c.author_avatar_url), !c.author_avatar_url.isEmpty {
            AsyncImage(url: u) { ph in
                if case .success(let i) = ph { i.resizable().scaledToFill() } else { Circle().fill(Color(.systemGray5)) }
            }.frame(width: 24, height: 24).clipShape(Circle())
        } else {
            ZStack { Circle().fill(Color(.systemGray5))
                Text(String(c.author_name.prefix(1)).uppercased()).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
            }.frame(width: 24, height: 24)
        }
    }

    private func canDelete(_ c: NewsService.NewsComment) -> Bool {
        myUserId != nil && c.author_id == myUserId
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true
        if let newC = await NewsService.shared.addComment(postId: postId, body: text) {
            comments.append(newC); draft = ""; onCountChange(1)
        }
        sending = false
    }
}

// MARK: - Video mit Untertitel-Overlay
struct SubtitleCue { let start: Double; let end: Double; let text: String }

/// Parst WebVTT in Cues (Zeitmarken + Text).
func parseVtt(_ vtt: String) -> [SubtitleCue] {
    func seconds(_ s: String) -> Double {
        // HH:MM:SS.mmm  oder MM:SS.mmm
        let parts = s.trimmingCharacters(in: .whitespaces).split(separator: ":")
        let nums = parts.map { Double($0.replacingOccurrences(of: ",", with: ".")) ?? 0 }
        if nums.count == 3 { return nums[0] * 3600 + nums[1] * 60 + nums[2] }
        if nums.count == 2 { return nums[0] * 60 + nums[1] }
        return nums.first ?? 0
    }
    var cues: [SubtitleCue] = []
    let lines = vtt.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    var i = 0
    while i < lines.count {
        let line = lines[i]
        if line.contains("-->") {
            let comps = line.components(separatedBy: "-->")
            if comps.count == 2 {
                let start = seconds(comps[0])
                let end = seconds(comps[1].components(separatedBy: " ").first ?? comps[1])
                var text: [String] = []
                i += 1
                while i < lines.count && !lines[i].trimmingCharacters(in: .whitespaces).isEmpty {
                    text.append(lines[i]); i += 1
                }
                let t = text.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty { cues.append(SubtitleCue(start: start, end: end, text: t)) }
            }
        }
        i += 1
    }
    return cues
}

struct NewsVideoPlayer: View {
    let url: URL
    let postId: UUID
    let lang: String
    @State private var player: AVPlayer
    @State private var cues: [SubtitleCue] = []
    @State private var currentText = ""
    @State private var showSubtitles = true
    @State private var observer: Any?
    @State private var loaded = false
    @State private var poster: UIImage?       // erstes Videobild als Vorschau
    @State private var showPoster = true      // Poster + Play bis zum Start

    init(url: URL, postId: UUID, lang: String) {
        self.url = url; self.postId = postId; self.lang = lang
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        VideoPlayer(player: player)
            // Vor dem Start statt schwarzem Bild das erste Videobild zeigen.
            .overlay {
                if showPoster {
                    ZStack {
                        if let poster {
                            Image(uiImage: poster).resizable().scaledToFill()
                        } else {
                            Color.black
                        }
                        Button {
                            showPoster = false
                            player.play()
                        } label: {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 54))
                                .foregroundStyle(.white.opacity(0.9))
                                .shadow(radius: 6)
                        }
                    }
                    .clipped()
                    .contentShape(Rectangle())
                }
            }
            .overlay(alignment: .bottom) {
                if showSubtitles, !currentText.isEmpty {
                    Text(currentText)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color.black.opacity(0.6))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .padding(.horizontal, 12)
                        .padding(.bottom, 10)
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .topTrailing) {
                if !cues.isEmpty {
                    Button { showSubtitles.toggle() } label: {
                        Image(systemName: showSubtitles ? "captions.bubble.fill" : "captions.bubble")
                            .font(.caption)
                            .padding(6)
                            .background(Color.black.opacity(0.5))
                            .foregroundStyle(.white)
                            .clipShape(Circle())
                    }
                    .padding(8)
                }
            }
            .task {
                guard !loaded else { return }
                loaded = true
                // Erstes Videobild als Poster erzeugen (Hintergrund-Thread).
                let vurl = url
                let img: UIImage? = await Task.detached(priority: .utility) { () -> UIImage? in
                    let gen = AVAssetImageGenerator(asset: AVAsset(url: vurl))
                    gen.appliesPreferredTrackTransform = true
                    gen.maximumSize = CGSize(width: 1200, height: 1200)
                    let t = CMTime(seconds: 0.1, preferredTimescale: 600)
                    if let cg = try? gen.copyCGImage(at: t, actualTime: nil) { return UIImage(cgImage: cg) }
                    return nil
                }.value
                if let img { poster = img }

                let sub = await NewsService.shared.subtitles(postId: postId, lang: lang)
                if let vtt = sub.vtt {
                    cues = parseVtt(vtt)
                } else if sub.quotaExhausted {
                    NewsQuotaStore.shared.hint = sub.hint ?? "news.aiBudgetHint".loc
                }
                let interval = CMTime(seconds: 0.2, preferredTimescale: 600)
                observer = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
                    // Sobald das Video läuft, Poster ausblenden (auch bei Start über die Player-Steuerung).
                    if player.rate > 0 && showPoster { showPoster = false }
                    let t = time.seconds
                    let txt = cues.first(where: { t >= $0.start && t <= $0.end })?.text ?? ""
                    if txt != currentText { currentText = txt }
                }
            }
            .onDisappear {
                if let o = observer { player.removeTimeObserver(o); observer = nil }
                player.pause()
            }
    }
}

// MARK: - Vollbild-Foto mit Pinch-to-Zoom
struct FSImage: Identifiable { let id = UUID(); let url: String }

/// Spielt ein YouTube-Video INLINE in Skipily ab (eingebetteter Player per
/// WKWebView, youtube-nocookie). Oeffnet NICHT die YouTube-App/Safari.
struct YouTubeInlinePlayer: UIViewRepresentable {
    let videoID: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: .zero, configuration: config)
        web.scrollView.isScrollEnabled = false
        web.isOpaque = false
        web.backgroundColor = .black
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        let html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>html,body{margin:0;background:#000;height:100%}iframe{border:0;width:100%;height:100%}</style>
        </head><body>
        <iframe src="https://www.youtube-nocookie.com/embed/\(videoID)?playsinline=1&rel=0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen></iframe>
        </body></html>
        """
        web.loadHTMLString(html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
    }
}

struct ZoomableImageView: View {
    let url: String
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            AsyncImage(url: URL(string: url)) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFit()
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(
                            SimultaneousGesture(
                                MagnificationGesture()
                                    .onChanged { v in scale = min(5, max(1, lastScale * v)) }
                                    .onEnded { _ in
                                        lastScale = scale
                                        if scale <= 1 { withAnimation { offset = .zero; lastOffset = .zero } }
                                    },
                                DragGesture()
                                    .onChanged { v in
                                        if scale > 1 {
                                            offset = CGSize(width: lastOffset.width + v.translation.width,
                                                            height: lastOffset.height + v.translation.height)
                                        }
                                    }
                                    .onEnded { _ in lastOffset = offset }
                            )
                        )
                        .onTapGesture(count: 2) {
                            withAnimation {
                                if scale > 1 { scale = 1; lastScale = 1; offset = .zero; lastOffset = .zero }
                                else { scale = 2.5; lastScale = 2.5 }
                            }
                        }
                case .failure:
                    Image(systemName: "photo").font(.largeTitle).foregroundStyle(.white.opacity(0.6))
                default:
                    ProgressView().tint(.white)
                }
            }
            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.headline).foregroundStyle(.white)
                            .padding(10).background(Color.white.opacity(0.15)).clipShape(Circle())
                    }
                    .padding()
                }
                Spacer()
            }
        }
    }
}

// MARK: - Compose (Eigner-Lösung)
struct NewsComposeView: View {
    var editPost: NewsPost? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var boatRef = ""
    @State private var equipmentRef = ""
    @State private var bodyText = ""
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var images: [UIImage] = []
    @State private var videoItems: [PhotosPickerItem] = []
    @State private var videoDatas: [Data] = []
    @State private var youtubeUrl = ""   // optionaler YouTube-Link (inline in Skipily)
    @State private var existingImages: [String] = []
    @State private var existingVideos: [String] = []
    @State private var isSaving = false
    @State private var resultStatus: String?
    @State private var errorText: String?
    @State private var didPrefill = false

    var body: some View {
        NavigationStack {
            Form {
                if let s = resultStatus {
                    Section {
                        switch s {
                        case "published": Label("news.resPublished".loc, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                        case "pending_review": Label("news.resPending".loc, systemImage: "clock.fill").foregroundStyle(.orange)
                        case "blocked": Label("news.resBlocked".loc, systemImage: "xmark.octagon.fill").foregroundStyle(.red)
                        default: Label("news.resError".loc, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
                        }
                    }
                } else {
                    Section("news.fTitle".loc) {
                        TextField("news.fTitlePh".loc, text: $title, axis: .vertical).lineLimit(1...3)
                    }
                    Section {
                        TextField("news.fBoat".loc, text: $boatRef)
                        TextField("news.fEquip".loc, text: $equipmentRef)
                    }
                    Section("news.fBody".loc) {
                        TextField("news.fBodyPh".loc, text: $bodyText, axis: .vertical).lineLimit(4...10)
                    }
                    Section(String(format: "news.fPhotos".loc, 5)) {
                        if existingImages.count + images.count < 5 {
                            PhotosPicker(selection: $photoItems, maxSelectionCount: 5 - existingImages.count - images.count, matching: .images) {
                                Label("news.addPhotos".loc, systemImage: "photo.badge.plus")
                            }
                            .onChange(of: photoItems) { _, items in
                                Task {
                                    for it in items {
                                        if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d), existingImages.count + images.count < 5 {
                                            images.append(img)
                                        }
                                    }
                                    photoItems = []
                                }
                            }
                        }
                        if !existingImages.isEmpty || !images.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack {
                                    ForEach(Array(existingImages.enumerated()), id: \.offset) { idx, url in
                                        ZStack(alignment: .topTrailing) {
                                            AsyncImage(url: URL(string: url)) { phase in
                                                if case .success(let img) = phase { img.resizable().scaledToFill() }
                                                else { Rectangle().fill(Color(.systemGray5)) }
                                            }
                                            .frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 8))
                                            Button { existingImages.remove(at: idx) } label: {
                                                Image(systemName: "xmark.circle.fill").foregroundStyle(.white, .black.opacity(0.6))
                                            }.offset(x: 4, y: -4)
                                        }
                                    }
                                    ForEach(Array(images.enumerated()), id: \.offset) { idx, img in
                                        ZStack(alignment: .topTrailing) {
                                            Image(uiImage: img).resizable().scaledToFill().frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 8))
                                            Button { images.remove(at: idx) } label: {
                                                Image(systemName: "xmark.circle.fill").foregroundStyle(.white, .black.opacity(0.6))
                                            }.offset(x: 4, y: -4)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Section(String(format: "news.fVideoSection".loc, 1)) {
                        if existingVideos.count + videoDatas.count < 1 {
                            PhotosPicker(selection: $videoItems, maxSelectionCount: 1, matching: .videos) {
                                Label("news.addVideo".loc, systemImage: "video.badge.plus")
                            }
                            .onChange(of: videoItems) { _, items in
                                Task {
                                    for it in items {
                                        if let d = try? await it.loadTransferable(type: Data.self), existingVideos.count + videoDatas.count < 1 {
                                            videoDatas.append(d)
                                        }
                                    }
                                    videoItems = []
                                }
                            }
                        }
                        ForEach(Array(existingVideos.enumerated()), id: \.offset) { idx, _ in
                            HStack {
                                Label("Video \(idx + 1)", systemImage: "film")
                                Spacer()
                                Button(role: .destructive) { existingVideos.remove(at: idx) } label: { Image(systemName: "xmark.circle.fill") }
                            }
                        }
                        if !videoDatas.isEmpty {
                            Text(String(format: "news.videoSelected".loc, videoDatas.count)).font(.caption).foregroundStyle(.secondary)
                        }
                        // YouTube-Link (wird inline in Skipily angezeigt).
                        TextField("news.youtubePlaceholder".loc, text: $youtubeUrl)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                            .keyboardType(.URL)
                        Text("news.youtubeHint".loc).font(.caption).foregroundStyle(.secondary)
                    }
                    if let e = errorText { Text(e).foregroundStyle(.red) }
                }
            }
            .onAppear {
                guard let e = editPost, !didPrefill else { return }
                title = e.title; boatRef = e.boatRef; equipmentRef = e.equipmentRef; bodyText = e.body
                existingImages = e.media.filter { $0.type == "image" }.map { $0.url }
                existingVideos = e.media.filter { $0.type == "video" }.map { $0.url }
                youtubeUrl = e.media.first(where: { $0.type == "youtube" })?.url ?? ""
                didPrefill = true
            }
            .navigationTitle(editPost == nil ? "news.create".loc : "news.edit".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("general.cancel".loc) { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    if resultStatus == nil {
                        Button(isSaving ? "news.saving".loc : "news.publish".loc) { Task { await submit() } }
                            .disabled(isSaving || title.trimmingCharacters(in: .whitespaces).isEmpty)
                            .fontWeight(.semibold)
                    } else {
                        Button("general.done".loc) { dismiss() }
                    }
                }
            }
        }
    }

    private func submit() async {
        errorText = nil; isSaving = true
        defer { isSaving = false }
        do {
            let r: NewsService.CreateResult
            if let e = editPost {
                r = try await NewsService.shared.updateSolution(
                    postId: e.id, title: title, boatRef: boatRef, equipmentRef: equipmentRef, body: bodyText,
                    keepImages: existingImages, keepVideos: existingVideos, newImages: images, newVideos: videoDatas,
                    youtubeUrl: youtubeUrl)
            } else {
                r = try await NewsService.shared.createSolution(
                    title: title, boatRef: boatRef, equipmentRef: equipmentRef, body: bodyText, images: images, videos: videoDatas,
                    youtubeUrl: youtubeUrl)
            }
            resultStatus = r.status
        } catch {
            AppLog.error("save news: \(error)")
            errorText = "news.resError".loc
        }
    }
}

// MARK: - Artikelfinder-Ergebnis
private struct PostPartsSheet: View {
    let loading: Bool
    let result: NewsService.PartsResult?
    var onUpgrade: () -> Void = {}
    @Environment(\.dismiss) private var dismiss
    @State private var copiedQuery: String?

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("news.findPartsLoading".loc).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let r = result, r.quotaExhausted {
                    upgradeBox(r.hint ?? "news.aiBudgetHint".loc)
                } else if let r = result, !r.items.isEmpty {
                    List {
                        ForEach(r.items) { item in
                            Section(item.query) {
                                if !item.matches.isEmpty {
                                    ForEach(item.matches) { m in matchRow(m) }
                                } else if let f = item.fallback {
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 8) {
                                            Text("news.findPartsNoShop".loc).font(.caption).foregroundStyle(.secondary)
                                            if f.installed_match == true || f.confidence == "high" {
                                                Text((f.installed_match == true ? "news.likelyInstalled" : "news.likelyArticle").loc)
                                                    .font(.caption2.weight(.bold))
                                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                                    .background(Capsule().fill(Color.green.opacity(0.15)))
                                                    .foregroundStyle(.green)
                                            }
                                        }
                                        if !f.article_number.isEmpty {
                                            Text("\("news.findPartsArticleNo".loc): \(f.article_number)").font(.subheadline.weight(.semibold))
                                        }
                                        if !f.description.isEmpty { Text(f.description).font(.subheadline) }
                                        Button {
                                            var lines = [item.query]
                                            if !f.article_number.isEmpty { lines.append("\("news.findPartsArticleNo".loc): \(f.article_number)") }
                                            if !f.description.isEmpty { lines.append(f.description) }
                                            UIPasteboard.general.string = lines.joined(separator: "\n")
                                            let q = item.query
                                            copiedQuery = q
                                            let gen = UINotificationFeedbackGenerator(); gen.notificationOccurred(.success)
                                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                                if copiedQuery == q { copiedQuery = nil }
                                            }
                                        } label: {
                                            Label(copiedQuery == item.query ? "news.copied".loc : "news.copy".loc,
                                                  systemImage: copiedQuery == item.query ? "checkmark" : "doc.on.doc")
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(copiedQuery == item.query ? .green : AppColors.primary)
                                        }
                                        .buttonStyle(.bordered)
                                        .padding(.top, 2)
                                    }
                                    .textSelection(.enabled)
                                } else {
                                    Text("news.findPartsNoShop".loc).font(.subheadline).foregroundStyle(.secondary)
                                }
                            }
                        }
                        if let hint = r.hint, !r.quotaExhausted {
                            Section { upgradeInline(hint) }
                        }
                    }
                } else {
                    ContentUnavailableView("news.findParts".loc, systemImage: "magnifyingglass",
                                           description: Text("news.findPartsEmpty".loc))
                }
            }
            .navigationTitle("news.findParts".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("general.done".loc) { dismiss() } }
            }
        }
    }

    @ViewBuilder
    private func matchRow(_ m: NewsService.PartMatch) -> some View {
        NavigationLink {
            if let pid = m.provider_id.flatMap({ UUID(uuidString: $0) }), let prod = UUID(uuidString: m.id) {
                ProviderShopSearchView(providerId: pid, providerName: "", searchTerm: m.name, pinnedProductIds: [prod])
            } else {
                ProviderShopSearchView(providerId: UUID(), providerName: "Alle", searchTerm: m.name)
            }
        } label: {
            HStack(spacing: 10) {
                if let img = m.image, let url = URL(string: img) {
                    AsyncImage(url: url) { phase in
                        if case .success(let i) = phase { i.resizable().scaledToFill() } else { Color(.systemGray5) }
                    }.frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    RoundedRectangle(cornerRadius: 8).fill(Color(.systemGray6))
                        .frame(width: 44, height: 44)
                        .overlay(Image(systemName: "shippingbox.fill").foregroundStyle(.secondary))
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(m.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                    let sub = [m.manufacturer, m.part_number].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                    if !sub.isEmpty { Text(sub).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                if let p = m.price { Text("\(p, specifier: "%.2f") \(m.currency ?? "€")").font(.caption.weight(.bold)) }
            }
        }
    }

    private func upgradeBox(_ text: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles").font(.largeTitle).foregroundStyle(AppColors.primary)
            Text(text).font(.callout).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("news.toSubscription".loc) { onUpgrade() }.buttonStyle(.borderedProminent)
        }.padding().frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func upgradeInline(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles").foregroundStyle(AppColors.primary)
            Text(text).font(.caption)
            Spacer()
            Button("news.toSubscription".loc) { onUpgrade() }.font(.caption.weight(.semibold))
        }
    }
}
