//
//  AnnouncementsView.swift
//  Skipily
//
//  Liste der Plattform-Ankuendigungen ("Skipily"-Kontakt unter Nachrichten).
//  Farbig gekennzeichnet zur Unterscheidung von Provider-Nachrichten.
//

import SwiftUI

struct AnnouncementsView: View {
    @ObservedObject private var store = AnnouncementStore.shared
    @Environment(\.openURL) private var openURL

    var body: some View {
        Group {
            if store.items.isEmpty {
                ContentUnavailableView("announcement.empty.title".loc,
                                       systemImage: "megaphone",
                                       description: Text("announcement.empty.body".loc))
            } else {
                List(store.items) { a in
                    AnnouncementRow(announcement: a, openURL: { url in openURL(url) })
                        .onAppear { if !a.isRead { Task { await store.markRead(a.id) } } }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("announcement.title".loc)
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.refresh() }
    }
}

private struct AnnouncementRow: View {
    let announcement: Announcement
    let openURL: (URL) -> Void
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "megaphone.fill")
                    .font(.footnote)
                    .foregroundStyle(announcement.accentColor)
                Text(announcement.title)
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(AppColors.gray900)
                Spacer()
                if !announcement.isRead {
                    Circle().fill(announcement.accentColor).frame(width: 8, height: 8)
                }
            }
            Text(announcement.body)
                .font(.callout)
                .foregroundStyle(AppColors.gray700)
                .lineLimit(expanded ? nil : 3)

            HStack {
                Text(announcement.displayDate)
                    .font(.caption2)
                    .foregroundStyle(AppColors.gray400)
                Spacer()
                if let s = announcement.actionURL, let url = URL(string: s) {
                    Button("announcement.more".loc) { openURL(url) }
                        .font(.caption).fontWeight(.semibold)
                        .foregroundStyle(announcement.accentColor)
                }
            }
        }
        .padding(.vertical, 6)
        .overlay(alignment: .leading) {
            Rectangle().fill(announcement.accentColor)
                .frame(width: 3)
                .padding(.vertical, 2)
                .offset(x: -16)
        }
        .contentShape(Rectangle())
        .onTapGesture { withAnimation { expanded.toggle() } }
    }
}
