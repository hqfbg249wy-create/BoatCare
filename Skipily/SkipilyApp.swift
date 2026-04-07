//
//  SkipilyApp.swift
//  Skipily
//

import SwiftUI
import StripePaymentSheet

@main
struct SkipilyApp: App {
    // ObservableObject services (used by original screens via @EnvironmentObject)
    @StateObject private var authService = AuthService()
    @StateObject private var languageManager = LanguageManager.shared
    @StateObject private var favoritesManager = FavoritesManager()

    // @Observable services (used by shop screens via @Environment)
    @State private var cartManager = CartManager()

    init() {
        // Initialize Stripe SDK with publishable key
        StripeAPI.defaultPublishableKey = StripeConfig.publishableKey

        // Configure a generous shared URL cache so AsyncImage (and URLSession
        // based loaders) can reuse provider logos, boat photos and product
        // images across screens without re-downloading them every time.
        //   memory: 64 MB · disk: 512 MB
        let cache = URLCache(
            memoryCapacity: 64 * 1024 * 1024,
            diskCapacity: 512 * 1024 * 1024,
            directory: nil
        )
        URLCache.shared = cache
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authService)
                .environmentObject(languageManager)
                .environmentObject(favoritesManager)
                .environment(cartManager)
                .languageAware()
        }
    }
}

// MARK: - Root View (Auth Gate)

struct RootView: View {
    @EnvironmentObject var authService: AuthService
    @State private var showSplash = true

    var body: some View {
        if showSplash {
            SplashView()
                .task {
                    // Previously we slept a hard 1 s on top of the network
                    // restoreSession() which made cold starts feel sluggish.
                    // Now we dismiss as soon as the session is known, but
                    // keep a tiny 200 ms minimum so the splash doesn't flash.
                    async let restore: Void = authService.restoreSession()
                    async let minDisplay: Void = Task.sleep(nanoseconds: 200_000_000)
                    _ = try? await (restore, minDisplay)
                    withAnimation(.easeInOut(duration: 0.3)) {
                        showSplash = false
                    }
                }
        } else if authService.isAuthenticated {
            MainTabView()
        } else {
            LoginView()
        }
    }
}

// MARK: - Splash Screen

struct SplashView: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            // Deep navy background for brand feel
            Color(hex: 0x050D18).ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                SkipilyLogoView(
                    style: .dark,
                    layout: .vertical,
                    iconSize: 120,
                    showSlogan: true,
                    showSubtitle: true
                )

                Spacer()

                ProgressView()
                    .tint(.white.opacity(0.5))
                    .padding(.bottom, 60)
            }
        }
        .preferredColorScheme(.dark)
    }
}
