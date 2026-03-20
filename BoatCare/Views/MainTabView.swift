//
//  MainTabView.swift
//  BoatCare
//
//  Main tab navigation: 5 primary tabs
//  Every tab switch resets to root screen.
//

import SwiftUI
import CoreLocation

enum AppTab: Hashable {
    case map, boats, maintenance, shop, more
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
    @State private var maintenancePath = NavigationPath()
    @State private var shopNavigationPath = NavigationPath()
    @State private var moreNavigationPath = NavigationPath()

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

            // MARK: - Wartung (NavigationStack controlled from here)
            Tab("Wartung", systemImage: "wrench.and.screwdriver.fill", value: AppTab.maintenance) {
                NavigationStack(path: $maintenancePath) {
                    MaintenanceScreen(onNavigate: { target in
                        maintenancePath.append(target)
                    })
                    .navigationDestination(for: MaintenanceNavTarget.self) { target in
                        switch target {
                        case .service(let name, let cat):
                            ServiceSearchFromMaintenance(equipmentName: name, category: cat)
                        case .spareParts(let name):
                            ProviderShopSearchView(
                                providerId: UUID(),
                                providerName: "Alle",
                                searchTerm: name
                            )
                        case .aiAssistant(let question):
                            ChatScreen(initialQuestion: question)
                        }
                    }
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

            // MARK: - Mehr
            Tab("Mehr", systemImage: "ellipsis.circle.fill", value: AppTab.more) {
                NavigationStack(path: $moreNavigationPath) {
                    MoreMenuView()
                        .navigationDestination(for: MoreDestination.self) { dest in
                            switch dest {
                            case .favorites:
                                POIScreen()
                            case .assistant:
                                ChatScreen()
                            case .profile:
                                ProfileView()
                            }
                        }
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
                maintenancePath = NavigationPath()
                shopNavigationPath = NavigationPath()
                moreNavigationPath = NavigationPath()

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

// MARK: - More Menu Destinations
enum MoreDestination: Hashable {
    case favorites
    case assistant
    case profile
}

// MARK: - More Menu View
struct MoreMenuView: View {
    @EnvironmentObject var favoritesManager: FavoritesManager

    var body: some View {
        List {
            // Favoriten
            NavigationLink(value: MoreDestination.favorites) {
                Label {
                    VStack(alignment: .leading) {
                        Text("Favoriten")
                        if !favoritesManager.favoriteIDs.isEmpty {
                            Text("\(favoritesManager.favoriteIDs.count) gespeichert")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } icon: {
                    Image(systemName: "heart.fill")
                        .foregroundStyle(.pink)
                }
            }

            // Boots-Assistent
            NavigationLink(value: MoreDestination.assistant) {
                Label {
                    VStack(alignment: .leading) {
                        Text("Boots-Assistent")
                        Text("KI-Beratung fuer dein Boot")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "bubble.left.and.text.bubble.right.fill")
                        .foregroundStyle(.orange)
                }
            }

            // Profil
            NavigationLink(value: MoreDestination.profile) {
                Label {
                    VStack(alignment: .leading) {
                        Text("Profil")
                        Text("Konto & Einstellungen")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "person.crop.circle")
                        .foregroundStyle(.blue)
                }
            }
        }
        .navigationTitle("Mehr")
    }
}
