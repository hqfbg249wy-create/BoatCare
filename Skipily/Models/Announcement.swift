//
//  Announcement.swift
//  Skipily
//
//  Plattform-Ankuendigungen (Broadcast vom Admin). Werden als farbig
//  gekennzeichneter Eintrag unter Nachrichten/Kontakte gelistet und als
//  In-App-Banner angekuendigt. Quelle: RPC list_my_announcements.
//

import SwiftUI
import Combine
import Supabase

struct Announcement: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let body: String
    let accent: String?
    let category: String?
    let actionURL: String?
    /// { "de": {"title","body"}, "en": {...}, ... } — serverseitig uebersetzt.
    let translations: [String: [String: String]]?
    let createdAt: String?
    let readAt: String?
    let dismissedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, body, accent, category, translations
        case actionURL = "action_url"
        case createdAt = "created_at"
        case readAt = "read_at"
        case dismissedAt = "dismissed_at"
    }

    var isRead: Bool { readAt != nil }
    var isDismissed: Bool { dismissedAt != nil }

    /// Titel/Text in der aktuellen UI-Sprache (Fallback: Originaltext).
    func localizedTitle(_ lang: String) -> String { translations?[lang]?["title"] ?? title }
    func localizedBody(_ lang: String) -> String { translations?[lang]?["body"] ?? body }
    var lang: String { LanguageManager.shared.currentLanguage.code }
    var displayTitle: String { localizedTitle(lang) }
    var displayBody: String { localizedBody(lang) }

    /// Farbe zur Unterscheidung von Provider-Nachrichten.
    var accentColor: Color {
        switch (accent ?? "blue").lowercased() {
        case "green":  return Color(red: 0.086, green: 0.639, blue: 0.290)
        case "orange": return Color(red: 0.976, green: 0.451, blue: 0.086)
        case "purple": return Color(red: 0.486, green: 0.227, blue: 0.929)
        case "red":    return Color(red: 0.863, green: 0.149, blue: 0.149)
        default:        return Color(red: 0.149, green: 0.388, blue: 0.922) // blue
        }
    }

    var displayDate: String {
        guard let createdAt else { return "" }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: createdAt)
            ?? { let i = ISO8601DateFormatter(); i.formatOptions = [.withInternetDateTime]; return i.date(from: createdAt) }()
        guard let date else { return "" }
        let f = DateFormatter()
        f.dateStyle = .medium; f.timeStyle = .short
        f.locale = Locale(identifier: "de_DE")
        return f.string(from: date)
    }
}

@MainActor
final class AnnouncementStore: ObservableObject {
    static let shared = AnnouncementStore()
    private init() {}

    @Published private(set) var items: [Announcement] = []
    /// Aktuell als Banner anzuzeigende Ankuendigung (neueste ungelesene).
    @Published var banner: Announcement?
    /// Vom Push-Tap gesetzt: Ankuendigung, die direkt im Volltext geoeffnet
    /// werden soll (MainTabView zeigt dafuer AnnouncementDetailView).
    @Published var pendingDetail: Announcement?
    /// Vom Push-Tap gesetzt, wenn keine konkrete Ankuendigung gefunden wurde:
    /// die vollstaendige Benachrichtigungsliste oeffnen.
    @Published var openList = false

    var unreadCount: Int { items.filter { !$0.isRead }.count }

    private var client: SupabaseClient { SupabaseManager.shared.client }

    /// Lädt die für den Nutzer sichtbaren Ankuendigungen und bestimmt das Banner.
    func refresh() async {
        guard (try? await client.auth.session) != nil else { return }
        do {
            let rows: [Announcement] = try await client
                .rpc("list_my_announcements").execute().value
            self.items = rows
            // Banner = neueste, noch nicht ausgeblendete und ungelesene Ankuendigung.
            if banner == nil {
                self.banner = rows.first { !$0.isDismissed && !$0.isRead }
            }
        } catch {
            AppLog.warning("list_my_announcements fehlgeschlagen: \(error)")
        }
    }

    func markRead(_ id: UUID) async {
        await callVoid("mark_announcement_read", id)
        markReadLocally(id)
    }

    func dismiss(_ id: UUID) async {
        if banner?.id == id { banner = nil }
        await callVoid("dismiss_announcement", id)
        await refresh()
    }

    /// Von der Push-Verarbeitung aufgerufen.
    /// - openDetail=false (App im Vordergrund): eigenes In-App-Banner zeigen.
    /// - openDetail=true  (Nutzer hat die Push-Nachricht angetippt, z. B. vom
    ///   Sperrbildschirm): die Ankuendigung direkt im Volltext oeffnen; ohne
    ///   konkrete ID die Benachrichtigungsliste.
    func handlePush(announcementId: String?, openDetail: Bool = false) async {
        await refresh()
        let hit: Announcement? = {
            guard let announcementId, let uuid = UUID(uuidString: announcementId) else { return nil }
            return items.first(where: { $0.id == uuid })
        }()
        if openDetail {
            if let hit { self.pendingDetail = hit } else { self.openList = true }
        } else if let hit {
            self.banner = hit
        }
    }

    private func callVoid(_ fn: String, _ id: UUID) async {
        do { try await client.rpc(fn, params: ["p_id": id.uuidString]).execute() }
        catch { AppLog.warning("\(fn) fehlgeschlagen: \(error)") }
    }

    // Lokale Aktualisierung des Lesestatus (ohne Reload), damit die UI sofort reagiert.
    private func markReadLocally(_ id: UUID) {
        guard let i = items.firstIndex(where: { $0.id == id }), items[i].readAt == nil else { return }
        let a = items[i]
        let nowIso = ISO8601DateFormatter().string(from: Date())
        items[i] = Announcement(
            id: a.id, title: a.title, body: a.body, accent: a.accent, category: a.category,
            actionURL: a.actionURL, translations: a.translations, createdAt: a.createdAt,
            readAt: nowIso, dismissedAt: a.dismissedAt)
    }
}
