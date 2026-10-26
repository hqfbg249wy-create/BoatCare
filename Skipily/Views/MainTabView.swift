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
    case map, boats, maintenance, shop, news, favorites
}

enum ShopDestination: Hashable {
    case cart
    case orders
}

struct MainTabView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @Environment(CartManager.self) private var cartManager
    @State private var messagingService = MessagingService.shared
    @State private var inquiryService = InquiryService.shared
    @State private var offlineService = OfflineStorageService.shared
    @StateObject private var locationManagerForOffline = LocationManager()
    @ObservedObject private var announcements = AnnouncementStore.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var showAnnouncements = false
    @State private var detailAnnouncement: Announcement?

    @State private var selectedTab: AppTab = .map

    // NavigationPaths for tabs with controlled navigation
    @State private var shopNavigationPath = NavigationPath()
    @State private var favoritesNavigationPath = NavigationPath()

    // Reset IDs for tabs with internal NavigationStacks (Map, Boats)
    @State private var mapResetId = UUID()
    @State private var boatsResetId = UUID()

    var body: some View {
        // Eigene Tab-Leiste: ALLE 6 Hauptmenuepunkte gleichzeitig sichtbar
        // (die native TabView blendet ab 6 Tabs auf iPhone einen "Mehr"-Reiter ein).
        rootLayout
        .overlay(alignment: .top) {
            // Offline-Banner
            if !offlineService.isOnline {
                OfflineBanner(
                    cachedProviders: offlineService.cachedProviderCount,
                    cachedProducts: offlineService.cachedProductCount,
                    cacheAge: offlineService.cacheAge
                )
                .transition(.move(edge: .top).combined(with: .opacity))
            } else if let ann = announcements.banner {
                // Plattform-Ankuendigung (iOS-typisches In-App-Banner)
                AnnouncementBanner(
                    announcement: ann,
                    onTap: {
                        // Antippen -> Benachrichtigungen (Liste), wie im Profil.
                        Task { await announcements.markRead(ann.id) }
                        announcements.banner = nil
                        showAnnouncements = true
                    },
                    onDismiss: { Task { await announcements.dismiss(ann.id) } }
                )
                .padding(.top, 4)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: offlineService.isOnline)
        .animation(.easeInOut(duration: 0.3), value: announcements.banner)
        .sheet(isPresented: $showAnnouncements) {
            NavigationStack { AnnouncementsView() }
        }
        .sheet(item: $detailAnnouncement) { ann in
            NavigationStack { AnnouncementDetailView(announcement: ann) }
        }
        // Push-Tap auf eine Ankuendigung -> Volltext direkt oeffnen.
        .onChange(of: announcements.pendingDetail) { _, new in
            if let ann = new {
                detailAnnouncement = ann
                announcements.pendingDetail = nil
            }
        }
        // Push-Tap ohne konkrete Ankuendigung -> Benachrichtigungsliste oeffnen.
        .onChange(of: announcements.openList) { _, open in
            if open {
                showAnnouncements = true
                announcements.openList = false
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await announcements.refresh() } }
        }
        .task {
            // Start network monitoring + initial sync
            offlineService.start()
            locationManagerForOffline.requestPermission()
            await offlineService.syncIfNeeded()
            // Ungelesen-Zähler für den Kontakte-Badge laden
            if let uid = authService.currentUser?.id {
                await messagingService.loadConversations(userId: uid)
                await inquiryService.loadInquiries(ownerId: uid)
            }
            await announcements.refresh()
        }
        .onChange(of: locationManagerForOffline.location) { _, newLocation in
            if let loc = newLocation {
                Task {
                    await offlineService.detectCountry(from: loc)
                }
            }
        }
    }

    // Inhalt des aktiven Tabs.
    private var tabContent: some View {
        Group {
            switch selectedTab {
            case .map:         MapScreen().id(mapResetId)
            case .boats:       BoatDataScreen().id(boatsResetId)
            case .maintenance: NavigationStack { MaintenanceScreen() }
            case .shop:        shopTab
            case .news:        NewsScreen()
            case .favorites:
                NavigationStack(path: $favoritesNavigationPath) { POIScreen() }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // Liquid Glass: Die Tab-Leiste schwebt UEBER dem Inhalt (Karte & Co. laufen
    // darunter durch). Damit nichts verdeckt wird, heben die Screens ihre
    // Buttons/Listenenden gezielt an -> siehe TabBarMetrics / .aboveTabBar().
    private var rootLayout: some View {
        ZStack(alignment: .bottom) {
            tabContent
            customTabBar
        }
    }

    /// Beim Tab-Wechsel (oder erneutem Antippen) Navigation auf Root zuruecksetzen.
    private func switchTo(_ newTab: AppTab) {
        shopNavigationPath      = NavigationPath()
        favoritesNavigationPath = NavigationPath()
        if newTab != selectedTab {
            mapResetId = UUID()
            boatsResetId = UUID()
        }
        selectedTab = newTab
    }

    // Shop-Tab mit eigenem NavigationStack + Warenkorb/Bestellungen-Toolbar.
    private var shopTab: some View {
        NavigationStack(path: $shopNavigationPath) {
            ShopView()
                .navigationDestination(for: ShopDestination.self) { dest in
                    switch dest {
                    case .cart: CartView()
                    case .orders: OrdersView()
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { shopNavigationPath.append(ShopDestination.cart) } label: {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: "cart").font(.title3)
                                if cartManager.itemCount > 0 {
                                    Text("\(cartManager.itemCount)")
                                        .font(.caption2).fontWeight(.bold).foregroundStyle(.white)
                                        .padding(4).background(AppColors.primary).clipShape(Circle())
                                        .offset(x: 8, y: -8)
                                }
                            }
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { shopNavigationPath.append(ShopDestination.orders) } label: {
                            Image(systemName: "shippingbox").font(.title3)
                        }
                    }
                }
        }
    }

    // Eigene Tab-Leiste mit allen 6 Hauptmenuepunkten.
    // iOS 26+ (Liquid Glass): schwebende, abgerundete Glas-Leiste; sonst .bar.
    private var customTabBar: some View {
        let bar = HStack(spacing: 0) {
            tabBarButton(.map, "tab.map".loc, "map.fill")
            tabBarButton(.boats, "tab.boats".loc, "sailboat.fill")
            tabBarButton(.maintenance, "maintenance.title".loc, "wrench.and.screwdriver.fill")
            tabBarButton(.shop, "Shop", "storefront.fill", badge: cartManager.itemCount)
            tabBarButton(.news, "tab.news".loc, "newspaper.fill")
            tabBarButton(.favorites, "favorites.title".loc, "heart.fill",
                         badge: messagingService.unreadCount + inquiryService.unreadCount)
        }
        .padding(.top, 10)
        .padding(.bottom, 8)

        if #available(iOS 26.0, *) {
            return AnyView(
                bar
                    .padding(.horizontal, 6)
                    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .padding(.horizontal, 10)
                    .padding(.bottom, 2)
            )
        } else {
            return AnyView(
                VStack(spacing: 0) {
                    Divider()
                    bar.background(.bar)
                }
            )
        }
    }

    private func tabBarButton(_ tab: AppTab, _ title: String, _ systemImage: String, badge: Int = 0) -> some View {
        Button { switchTo(tab) } label: {
            VStack(spacing: 3) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: systemImage)
                        .font(.system(size: 24))
                        .symbolVariant(selectedTab == tab ? .fill : .none)
                    if badge > 0 {
                        Text(badge > 99 ? "99+" : "\(badge)")
                            .font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Color.red).clipShape(Capsule())
                            .offset(x: 12, y: -7)
                    }
                }
                Text(title).font(.system(size: 11, weight: .medium)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            // Schwarz (Tag) / Weiß (Nacht) für klaren Kontrast auf dem Glas;
            // der aktive Tab ist voll deckend, inaktive leicht abgeschwächt.
            .foregroundStyle(selectedTab == tab ? Color.primary : Color.primary.opacity(0.55))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                Text("offline.mode".loc)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                if let age = cacheAge {
                    Text(String(format: "offline.as_of".loc, age))
                        .font(.caption)
                }
            }
            HStack(spacing: 12) {
                Label(String(format: "offline.providers".loc, cachedProviders), systemImage: "building.2")
                    .font(.caption2)
                Label(String(format: "offline.products".loc, cachedProducts), systemImage: "shippingbox")
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

// MARK: - Abstand zur schwebenden Tab-Leiste (Liquid Glass)

/// Zentrale Hoehe, die die schwebende Glas-Tab-Leiste ueber dem Inhalt belegt.
/// EINE Stelle zum Nachjustieren fuer die ganze App.
enum TabBarMetrics {
    static let clearance: CGFloat = 76
}

extension View {
    /// Feste untere Leisten (Kauf-, Kassen-, Bezahl-Leiste): Buttons ueber die
    /// Glas-Leiste heben; der Hintergrund laeuft darunter weiter.
    func aboveTabBar() -> some View {
        padding(.bottom, TabBarMetrics.clearance)
    }

    /// Vertikale ScrollViews/Listen: letzter Eintrag laesst sich vollstaendig
    /// ueber die Glas-Leiste scrollen.
    func tabBarScrollClearance() -> some View {
        contentMargins(.bottom, TabBarMetrics.clearance, for: .scrollContent)
    }
}
