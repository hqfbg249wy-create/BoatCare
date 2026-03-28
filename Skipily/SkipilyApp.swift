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
                    await authService.restoreSession()
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    withAnimation(.easeInOut(duration: 0.4)) {
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
