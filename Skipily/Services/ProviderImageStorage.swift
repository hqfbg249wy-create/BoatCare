//
//  ProviderImageStorage.swift
//  Skipily
//
//  Thin wrapper around the Supabase Storage bucket `provider-images` which
//  holds logos, cover photos and gallery images for ServiceProviders.
//
//  Path conventions (mirrors database/038_provider_images_bucket.sql):
//    logos/<providerId>.jpg
//    covers/<providerId>.jpg
//    gallery/<providerId>/<index>.jpg
//
//  The bucket is public, so reads can use getPublicURL(...) without auth.
//  Writes/updates/deletes are guarded by RLS: the authenticated user must
//  be the provider's owner_id.
//

import Foundation
import Supabase

@MainActor
final class ProviderImageStorage {
    static let shared = ProviderImageStorage()

    static let bucket = "provider-images"

    private var storage: SupabaseStorageClient {
        SupabaseManager.shared.client.storage
    }

    // MARK: - Path helpers

    static func logoPath(for providerId: UUID, ext: String = "jpg") -> String {
        "logos/\(providerId.uuidString.lowercased()).\(ext)"
    }

    static func coverPath(for providerId: UUID, ext: String = "jpg") -> String {
        "covers/\(providerId.uuidString.lowercased()).\(ext)"
    }

    static func galleryPath(for providerId: UUID, index: Int, ext: String = "jpg") -> String {
        "gallery/\(providerId.uuidString.lowercased())/\(index).\(ext)"
    }

    // MARK: - Reads (public bucket — no auth required)

    func publicURL(for path: String) throws -> URL {
        try storage.from(Self.bucket).getPublicURL(path: path)
    }

    func logoURL(for providerId: UUID) -> URL? {
        try? publicURL(for: Self.logoPath(for: providerId))
    }

    func coverURL(for providerId: UUID) -> URL? {
        try? publicURL(for: Self.coverPath(for: providerId))
    }

    // MARK: - Writes (owner-only)

    /// Upload a logo JPEG (compressed client-side). Returns the public URL.
    @discardableResult
    func uploadLogo(_ jpegData: Data, for providerId: UUID) async throws -> URL {
        let path = Self.logoPath(for: providerId)
        try await storage.from(Self.bucket)
            .upload(
                path,
                data: jpegData,
                options: FileOptions(
                    cacheControl: "3600",
                    contentType: "image/jpeg",
                    upsert: true
                )
            )
        return try publicURL(for: path)
    }

    @discardableResult
    func uploadCover(_ jpegData: Data, for providerId: UUID) async throws -> URL {
        let path = Self.coverPath(for: providerId)
        try await storage.from(Self.bucket)
            .upload(
                path,
                data: jpegData,
                options: FileOptions(
                    cacheControl: "3600",
                    contentType: "image/jpeg",
                    upsert: true
                )
            )
        return try publicURL(for: path)
    }

    @discardableResult
    func uploadGalleryImage(_ jpegData: Data, for providerId: UUID, index: Int) async throws -> URL {
        let path = Self.galleryPath(for: providerId, index: index)
        try await storage.from(Self.bucket)
            .upload(
                path,
                data: jpegData,
                options: FileOptions(
                    cacheControl: "3600",
                    contentType: "image/jpeg",
                    upsert: true
                )
            )
        return try publicURL(for: path)
    }

    // MARK: - Delete

    func deleteLogo(for providerId: UUID) async throws {
        _ = try await storage.from(Self.bucket).remove(paths: [Self.logoPath(for: providerId)])
    }

    func deleteCover(for providerId: UUID) async throws {
        _ = try await storage.from(Self.bucket).remove(paths: [Self.coverPath(for: providerId)])
    }

    // MARK: - Persistence of URL on the provider row

    /// After a successful upload, persist the new URL on service_providers.
    func persistLogoURL(_ url: URL, for providerId: UUID) async throws {
        try await SupabaseManager.shared.client
            .from("service_providers")
            .update(["logo_url": url.absoluteString])
            .eq("id", value: providerId.uuidString)
            .execute()
    }

    func persistCoverURL(_ url: URL, for providerId: UUID) async throws {
        try await SupabaseManager.shared.client
            .from("service_providers")
            .update(["cover_image_url": url.absoluteString])
            .eq("id", value: providerId.uuidString)
            .execute()
    }
}
