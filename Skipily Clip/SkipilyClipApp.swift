//
//  SkipilyClipApp.swift
//  Skipily Clip
//
//  Standalone App-Clip-Target. Bewusst KEIN Shared Code mit dem Haupt-App-
//  Target — das haelt den Clip unter 15 MB (Apple-Cap). Supabase wird via
//  reines URLSession + REST API angesprochen (kein supabase-swift SDK),
//  Stripe ist hier nicht enthalten, da der Clip nicht kaufen soll —
//  Discovery only.
//
//  Invocation:
//    https://skipily.app/clip                  → Standard: Karte + Provider-Liste
//    https://skipily.app/clip?marina=<slug>    → vorzentriert auf Marina
//    https://skipily.app/clip/provider/<uuid>  → direkt Provider-Detail (Phase 2)
//

import SwiftUI

@main
struct SkipilyClipApp: App {
    /// Activity, ueber den iOS uns die Invocation-URL liefert.
    /// Wir parsen sie und reichen sie an ContentView weiter.
    @State private var invocationURL: URL?

    var body: some Scene {
        WindowGroup {
            ClipRootView(invocationURL: invocationURL)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    invocationURL = activity.webpageURL
                }
        }
    }
}
