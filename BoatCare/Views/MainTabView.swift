//
//  MainTabView.swift
//  BoatCare
//
//  Main tab navigation – integrates the Shop into the existing app navigation.
//  After merge with main, replace placeholder views with actual screens
//  (MapScreen, BoatDataScreen, MaintenanceScreen, etc.)
//

import SwiftUI

struct MainTabView: View {
    @Environment(AuthService.self) private var authService
    @Environment(CartManager.self) private var cartManager
    @State private var messagingService = MessagingService.shared

    var body: some View {
        TabView {
            // MARK: - Existing App Tabs (placeholders until merge with main)

            Tab("Karte", systemImage: "map.fill") {
                placeholderView(
                    icon: "map.fill",
                    title: "Karte",
                    subtitle: "Service-Provider in deiner Nähe finden"
                )
            }

            Tab("Boote", systemImage: "sailboat.fill") {
                placeholderView(
                    icon: "sailboat.fill",
                    title: "Meine Boote",
                    subtitle: "Bootsdaten & Ausrüstung verwalten"
                )
            }

            Tab("Wartung", systemImage: "wrench.and.screwdriver.fill") {
                placeholderView(
                    icon: "wrench.and.screwdriver.fill",
                    title: "Wartung",
                    subtitle: "Wartungsintervalle & Aufgaben"
                )
            }

            // MARK: - Shop Tab (NEW)

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

            // MARK: - Existing App Tabs (continued)

            Tab("Markt", systemImage: "tag.fill") {
                placeholderView(
                    icon: "tag.fill",
                    title: "Marktplatz",
                    subtitle: "Gebrauchtes Zubehör kaufen & verkaufen"
                )
            }

            Tab("Favoriten", systemImage: "heart.fill") {
                placeholderView(
                    icon: "heart.fill",
                    title: "Favoriten",
                    subtitle: "Gespeicherte Provider & Produkte"
                )
            }

            Tab("Chat", systemImage: "message.fill") {
                NavigationStack {
                    ConversationsView()
                }
            }
            .badge(messagingService.unreadCount)
        }
        .tint(AppColors.primary)
    }

    // MARK: - Placeholder for tabs that exist in main branch

    private func placeholderView(icon: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(AppColors.gray300)

            Text(title)
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundStyle(AppColors.gray700)

            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(AppColors.gray500)
                .multilineTextAlignment(.center)

            Text("Verfügbar nach Merge mit main")
                .font(.caption)
                .foregroundStyle(AppColors.gray300)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}
