//
//  MainTabView.swift
//  BoatCare
//
//  Main tab navigation for the app
//

import SwiftUI

struct MainTabView: View {
    @Environment(CartManager.self) private var cartManager
    @State private var messagingService = MessagingService.shared

    var body: some View {
        TabView {
            Tab("Shop", systemImage: "storefront") {
                ShopView()
            }

            Tab("Warenkorb", systemImage: "cart") {
                CartView()
            }
            .badge(cartManager.itemCount)

            Tab("Bestellungen", systemImage: "shippingbox") {
                OrdersView()
            }

            Tab("Nachrichten", systemImage: "bubble.left.and.bubble.right") {
                ConversationsView()
            }
            .badge(messagingService.unreadCount)

            Tab("Profil", systemImage: "person.crop.circle") {
                ProfileView()
            }
        }
        .tint(AppColors.primary)
    }
}
