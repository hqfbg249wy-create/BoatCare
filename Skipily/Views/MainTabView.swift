//
//  MainTabView.swift
//  Skipily
//
//  Main tab navigation: 5 primary tabs
//  Every tab switch resets to root screen.
//

import SwiftUI
import CoreLocation

enum AppTab: Hashable {
    case map, boats, maintenance, shop, favorites
}

struct MainTabView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @Environment(CartManager.self) private var cartManager
    @State private var messagingService = MessagingService.shared
    @State private var offlineService = OfflineStorageService.shared
    @StateObject private var locationManagerForOffline = LocationManager()

    @State private var selectedTab: AppTab = .map

    // NavigationPaths for tabs with controlled navigation
    @State private var shopNavigationPath = NavigationPath()
    @State private var favoritesNavigationPath = NavigationPath()

    // Reset IDs for tabs with internal NavigationStacks (Map, Boats)
    @State private var mapResetId = UUID()
    @State private var boatsResetId = UUID()

    var body: some View {
        TabView(selection: tabSelection) {
            // MARK: - Karte
            Tab("Karte", systemImage: "map.fill", value: AppTab.map) {
                MapScreen()
                    .id(mapResetId)
            }

            // MARK: - Boote
            Tab("Boote", systemImage: "sailboat.fill", value: AppTab.boats) {
                BoatDataScreen()
                    .id(boatsResetId)
            }

            // MARK: - Wartung
            Tab("Wartung", systemImage: "wrench.and.screwdriver.fill", value: AppTab.maintenance) {
                NavigationStack {
                    MaintenanceScreen()
                }
            }

            // MARK: - Shop
            Tab("Shop", systemImage: "storefront.fill", value: AppTab.shop) {
                NavigationStack(path: $shopNavigationPath) {
                    ShopView()
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                NavigationLink(destination: CartView()) {
                                    ZStack(alignment: .topTrailing) {
                                        Image(systemName: "cart")
                                            .font(.title3)
                                        if cartManager.itemCount > 0 {
                                            Text("\(cartManager.itemCount)")
                                                .font(.caption2)
                                                .fontWeight(.bold)
                                                .foregroundStyle(.white)
                                                .padding(4)
                                                .background(AppColors.primary)
                                                .clipShape(Circle())
                                                .offset(x: 8, y: -8)
                                        }
                                    }
                                }
                            }

                            ToolbarItem(placement: .topBarTrailing) {
                                NavigationLink(destination: OrdersView()) {
                                    Image(systemName: "shippingbox")
                                        .font(.title3)
                                }
                            }
                        }
                }
            }
            .badge(cartManager.itemCount)

            // MARK: - Favoriten
            Tab("Favoriten", systemImage: "heart.fill", value: AppTab.favorites) {
                NavigationStack(path: $favoritesNavigationPath) {
                    POIScreen()
                }
            }
        }
        .tint(AppColors.primary)
        .overlay(alignment: .top) {
            // Offline-Banner
            if !offlineService.isOnline {
                OfflineBanner(
                    cachedProviders: offlineService.cachedProviderCount,
                    cachedProducts: offlineService.cachedProductCount,
                    cacheAge: offlineService.cacheAge
                )
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: offlineService.isOnline)
        .task {
            // Start network monitoring + initial sync
            offlineService.start()
            locationManagerForOffline.requestPermission()
            await offlineService.syncIfNeeded()
        }
        .onChange(of: locationManagerForOffline.location) { _, newLocation in
            if let loc = newLocation {
                Task {
                    await offlineService.detectCountry(from: loc)
                }
            }
        }
    }

    /// Custom binding: ALWAYS reset navigation to root when switching or re-tapping a tab
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { selectedTab },
            set: { newTab in
                // Reset ALL navigation paths to root
                shopNavigationPath = NavigationPath()
                favoritesNavigationPath = NavigationPath()

                // Reset tabs with internal NavigationStacks via id change
                if newTab != selectedTab {
                    mapResetId = UUID()
                    boatsResetId = UUID()
                }

                selectedTab = newTab
            }
        )
    }
}

// MARK: - Offline Banner
struct OfflineBanner: View {
    let cachedProviders: Int
    let cachedProducts: Int
    let cacheAge: String?

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                    .font(.subheadline)
                Text("Offline-Modus")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                if let age = cacheAge {
                    Text("Stand: \(age)")
                        .font(.caption)
                }
            }
            HStack(spacing: 12) {
                Label("\(cachedProviders) Anbieter", systemImage: "building.2")
                    .font(.caption2)
                Label("\(cachedProducts) Produkte", systemImage: "shippingbox")
                    .font(.caption2)
                Spacer()
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .padding(.top, 48) // Below dynamic island / status bar
        .background(Color.orange.opacity(0.9))
    }
}

