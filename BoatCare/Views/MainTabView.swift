//
//  MainTabView.swift
//  BoatCare
//
//  Main tab navigation: original screens + Shop + Profile
//

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @Environment(CartManager.self) private var cartManager
    @State private var messagingService = MessagingService.shared

    var body: some View {
        TabView {
            // MARK: - Karte (Original)
            Tab("Karte", systemImage: "map.fill") {
                MapScreen()
            }

            // MARK: - Boote (Original)
            Tab("Boote", systemImage: "sailboat.fill") {
                BoatDataScreen()
            }

            // MARK: - Wartung (Original)
            Tab("Wartung", systemImage: "wrench.and.screwdriver.fill") {
                MaintenanceScreen()
            }

            // MARK: - Shop (Neu)
            Tab("Shop", systemImage: "storefront.fill") {
                NavigationStack {
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

            // MARK: - Markt (Original)
            Tab("Markt", systemImage: "tag.fill") {
                MarketplaceScreen()
            }

            // MARK: - Favoriten (Original)
            Tab("Favoriten", systemImage: "heart.fill") {
                POIScreen()
            }

            // MARK: - Chat (Neu)
            Tab("Chat", systemImage: "message.fill") {
                NavigationStack {
                    ConversationsView()
                }
            }
            .badge(messagingService.unreadCount)

            // MARK: - Profil (Neu)
            Tab("Profil", systemImage: "person.crop.circle") {
                NavigationStack {
                    ProfileView()
                }
            }
        }
        .tint(AppColors.primary)
    }
}
