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

// Vollständige Einzel-Ansicht einer Ankündigung (direkt aus dem Banner geöffnet).
// Ältere Meldungen sind von hier mit einem Klick erreichbar.
struct AnnouncementDetailView: View {
    let announcement: Announcement
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var showOlder = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "megaphone.fill").foregroundStyle(announcement.accentColor)
                    Text(announcement.displayDate).font(.caption).foregroundStyle(AppColors.gray500)
                }
                Text(announcement.displayTitle)
                    .font(.title2.bold())
                    .foregroundStyle(AppColors.gray900)
                    .fixedSize(horizontal: false, vertical: true)
                Text(announcement.displayBody)
                    .font(.body)
                    .foregroundStyle(AppColors.gray700)
                    .fixedSize(horizontal: false, vertical: true)
                if let s = announcement.actionURL, let url = URL(string: s) {
                    Button { openURL(url) } label: {
                        Label("announcement.more".loc, systemImage: "arrow.up.right.square")
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .navigationTitle("announcement.title".loc)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("general.done".loc) { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("announcement.older".loc) { showOlder = true }
            }
        }
        .sheet(isPresented: $showOlder) {
            NavigationStack { AnnouncementsView() }
        }
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
                Text(announcement.displayTitle)
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(AppColors.gray900)
                Spacer()
                if !announcement.isRead {
                    Circle().fill(announcement.accentColor).frame(width: 8, height: 8)
                }
            }
            Text(announcement.displayBody)
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
