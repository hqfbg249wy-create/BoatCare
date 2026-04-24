//
//  BoatCareApp.swift
//  BoatCare
//

import SwiftUI

@main
struct BoatCareApp: App {
    @StateObject private var authService = AuthService()
    @StateObject private var languageManager = LanguageManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authService)
                .environmentObject(languageManager)
                .languageAware()
        }
    }
}

struct RootView: View {
    @EnvironmentObject var authService: AuthService
    @State private var showSplash = true

    var body: some View {
        if showSplash {
            SplashView()
                .task {
                    // Session während der Splash-Sekunde wiederherstellen
                    await authService.restoreSession()
                    try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 Sekunde
                    withAnimation(.easeInOut(duration: 0.4)) {
                        showSplash = false
                    }
                }
        } else {
            MainContainerView()
        }
    }
}

// MARK: - Splash Screen
struct SplashView: View {
    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 20) {
                Image("AppIconDisplay")
                    .resizable()
                    .frame(width: 140, height: 140)
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .shadow(color: .black.opacity(0.15), radius: 20, x: 0, y: 8)
            }
        }
    }
}
