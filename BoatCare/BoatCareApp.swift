//
//  BoatCareApp.swift
//  BoatCare
//
//  Created by Ekkehart Padberg on 17.12.25.
//

import SwiftUI

@main
struct BoatCareApp: App {
    @State private var authService = AuthService()
    @State private var cartManager = CartManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authService)
                .environment(cartManager)
        }
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var authService

    var body: some View {
        Group {
            if authService.isLoading {
                splashView
            } else if authService.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authService.isAuthenticated)
        .animation(.easeInOut(duration: 0.3), value: authService.isLoading)
    }

    private var splashView: some View {
        VStack(spacing: 16) {
            Image(systemName: "sailboat.fill")
                .font(.system(size: 60))
                .foregroundStyle(AppColors.primary)

            Text("BoatCare")
                .font(.largeTitle)
                .fontWeight(.bold)

            ProgressView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
