//
//  BoatCareApp.swift
//  BoatCare
//

import SwiftUI
import StripePaymentSheet

@main
struct BoatCareApp: App {
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
    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 20) {
                // Try custom app icon, fall back to SF Symbol
                if UIImage(named: "AppIconDisplay") != nil {
                    Image("AppIconDisplay")
                        .resizable()
                        .frame(width: 140, height: 140)
                        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                        .shadow(color: .black.opacity(0.15), radius: 20, x: 0, y: 8)
                } else {
                    Image(systemName: "sailboat.fill")
                        .font(.system(size: 80))
                        .foregroundStyle(AppColors.primary)
                }

                Text("BoatCare")
                    .font(.title)
                    .fontWeight(.bold)

                ProgressView()
                    .padding(.top, 8)
            }
        }
    }
}
