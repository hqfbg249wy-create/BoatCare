//
//  AnnouncementBanner.swift
//  Skipily
//
//  Kleines iOS-typisches Banner fuer eine Plattform-Ankuendigung, wenn die
//  App geoeffnet ist. Antippen -> mehr Informationen, X -> ausblenden.
//

import SwiftUI

struct AnnouncementBanner: View {
    let announcement: Announcement
    let onTap: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Farbkennzeichnung + Icon
            RoundedRectangle(cornerRadius: 3)
                .fill(announcement.accentColor)
                .frame(width: 5)

            Image(systemName: "megaphone.fill")
                .font(.title3)
                .foregroundStyle(announcement.accentColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(announcement.title)
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(AppColors.gray900)
                    .lineLimit(1)
                Text(announcement.body)
                    .font(.caption)
                    .foregroundStyle(AppColors.gray500)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption).fontWeight(.bold)
                    .foregroundStyle(AppColors.gray400)
                    .padding(8)
            }
            .accessibilityLabel("announcement.dismiss".loc)
        }
        .padding(.vertical, 10)
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.12), radius: 10, y: 3)
        .padding(.horizontal, 12)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}
