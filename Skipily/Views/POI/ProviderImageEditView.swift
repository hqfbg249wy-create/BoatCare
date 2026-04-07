//
//  ProviderImageEditView.swift
//  Skipily
//
//  Lets a provider owner replace logo and cover image for their own
//  ServiceProvider. Uploads go to the Supabase Storage bucket
//  `provider-images` (see migration 038). The edit view is only useful
//  to authenticated users — row-level security in the bucket makes sure
//  non-owners cannot actually persist anything.
//

import SwiftUI
import PhotosUI

struct ProviderImageEditView: View {
    let providerId: UUID
    let providerName: String
    var initialLogoUrl: String?
    var initialCoverUrl: String?

    @Environment(\.dismiss) private var dismiss

    // Logo state
    @State private var logoPickerItem: PhotosPickerItem?
    @State private var logoImage: UIImage?
    @State private var isUploadingLogo = false

    // Cover state
    @State private var coverPickerItem: PhotosPickerItem?
    @State private var coverImage: UIImage?
    @State private var isUploadingCover = false

    // Feedback
    @State private var errorMessage: String?
    @State private var successMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                header

                logoCard

                coverCard

                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 16)
                        .multilineTextAlignment(.center)
                }
                if let successMessage {
                    Label(successMessage, systemImage: "checkmark.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(.green)
                        .padding(.horizontal, 16)
                        .multilineTextAlignment(.center)
                }

                Text("Nur Provider-Inhaber können Bilder ändern. Uploads werden serverseitig geprüft und bei fehlender Berechtigung abgelehnt.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 20)
            }
        }
        .navigationTitle("Bilder bearbeiten")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 4) {
            Text(providerName)
                .font(.title3)
                .fontWeight(.semibold)
            Text("Logo und Titelbild ersetzen")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }

    // MARK: - Logo Card

    private var logoCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Logo", hint: "Quadratisch, mindestens 256×256, max 5 MB")

            HStack(spacing: 16) {
                logoPreview
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color(.systemGray4), lineWidth: 1)
                    )

                VStack(alignment: .leading, spacing: 10) {
                    PhotosPicker(selection: $logoPickerItem,
                                 matching: .images,
                                 photoLibrary: .shared()) {
                        Label("Foto wählen", systemImage: "photo.on.rectangle")
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }
                    .buttonStyle(.borderedProminent)

                    if let logoImage {
                        Button {
                            Task { await upload(kind: .logo, image: logoImage) }
                        } label: {
                            HStack {
                                if isUploadingLogo { ProgressView().tint(.white) }
                                else { Image(systemName: "icloud.and.arrow.up") }
                                Text("Logo hochladen")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(isUploadingLogo)
                    }
                }
            }
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 16)
        .onChange(of: logoPickerItem) { _, newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let ui = UIImage(data: data) {
                    self.logoImage = ui
                }
            }
        }
    }

    @ViewBuilder
    private var logoPreview: some View {
        if let logoImage {
            Image(uiImage: logoImage)
                .resizable().scaledToFill()
        } else if let url = initialLogoUrl.usableImageURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFill()
                default:
                    placeholder(icon: "building.2.fill")
                }
            }
        } else {
            placeholder(icon: "building.2.fill")
        }
    }

    // MARK: - Cover Card

    private var coverCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Titelbild", hint: "Querformat 16:9, min. 1200×675, max 5 MB")

            coverPreview
                .frame(height: 180)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color(.systemGray4), lineWidth: 1)
                )

            HStack(spacing: 10) {
                PhotosPicker(selection: $coverPickerItem,
                             matching: .images,
                             photoLibrary: .shared()) {
                    Label("Foto wählen", systemImage: "photo.on.rectangle")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                if let coverImage {
                    Button {
                        Task { await upload(kind: .cover, image: coverImage) }
                    } label: {
                        HStack {
                            if isUploadingCover { ProgressView().tint(.white) }
                            else { Image(systemName: "icloud.and.arrow.up") }
                            Text("Titelbild hochladen")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(isUploadingCover)
                }
            }
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 16)
        .onChange(of: coverPickerItem) { _, newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let ui = UIImage(data: data) {
                    self.coverImage = ui
                }
            }
        }
    }

    @ViewBuilder
    private var coverPreview: some View {
        if let coverImage {
            Image(uiImage: coverImage)
                .resizable().scaledToFill()
        } else if let url = initialCoverUrl.usableImageURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFill()
                default:
                    gradientPlaceholder
                }
            }
        } else {
            gradientPlaceholder
        }
    }

    private var gradientPlaceholder: some View {
        LinearGradient(
            colors: [Color.blue.opacity(0.3), Color.blue.opacity(0.1)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay(
            Image(systemName: "photo")
                .font(.system(size: 36))
                .foregroundStyle(.white.opacity(0.8))
        )
    }

    private func placeholder(icon: String) -> some View {
        ZStack {
            Color(.systemGray5)
            Image(systemName: icon)
                .font(.system(size: 34))
                .foregroundStyle(.secondary)
        }
    }

    private func sectionHeader(_ title: String, hint: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.headline)
            Text(hint)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Upload

    private enum ImageKind { case logo, cover }

    private func upload(kind: ImageKind, image: UIImage) async {
        errorMessage = nil
        successMessage = nil

        // Compress
        let maxDimension: CGFloat = (kind == .logo) ? 1024 : 1920
        let resized = image.resizedIfNeeded(maxDimension: maxDimension)
        guard let jpeg = resized.jpegData(compressionQuality: 0.85) else {
            errorMessage = "Bild konnte nicht komprimiert werden."
            return
        }
        if jpeg.count > 5 * 1024 * 1024 {
            errorMessage = "Bild ist größer als 5 MB. Bitte kleineres Foto wählen."
            return
        }

        switch kind {
        case .logo:  isUploadingLogo = true
        case .cover: isUploadingCover = true
        }

        do {
            let url: URL
            switch kind {
            case .logo:
                url = try await ProviderImageStorage.shared.uploadLogo(jpeg, for: providerId)
                try await ProviderImageStorage.shared.persistLogoURL(url, for: providerId)
                successMessage = "Logo erfolgreich aktualisiert."
            case .cover:
                url = try await ProviderImageStorage.shared.uploadCover(jpeg, for: providerId)
                try await ProviderImageStorage.shared.persistCoverURL(url, for: providerId)
                successMessage = "Titelbild erfolgreich aktualisiert."
            }
        } catch {
            errorMessage = "Upload fehlgeschlagen: \(error.localizedDescription)\n(Bist du als Owner dieses Providers angemeldet?)"
        }

        switch kind {
        case .logo:  isUploadingLogo = false
        case .cover: isUploadingCover = false
        }
    }
}

// MARK: - UIImage downscaling helper

private extension UIImage {
    func resizedIfNeeded(maxDimension: CGFloat) -> UIImage {
        let maxSide = max(size.width, size.height)
        guard maxSide > maxDimension else { return self }
        let scale = maxDimension / maxSide
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            self.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
