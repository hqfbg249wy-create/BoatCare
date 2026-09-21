//
//  SupabaseManager.swift
//  Skipily
//
//  Singleton Supabase client manager
//

import Foundation
import Supabase

@MainActor
final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private init() {
        // x-skipily-platform: markiert alle Requests als iOS (KI-/App-Nutzungs-Analytics).
        client = SupabaseClient(
            supabaseURL: SupabaseConfig.url,
            supabaseKey: SupabaseConfig.anonKey,
            options: .init(
                global: .init(headers: ["x-skipily-platform": "ios"])
            )
        )
    }
}
