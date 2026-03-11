//
//  MainTabView.swift
//  BoatCare
//
//  Main tab navigation for the app
//

import SwiftUI

struct MainTabView: View {
    @Environment(CartManager.self) private var cartManager

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

            Tab("Profil", systemImage: "person.crop.circle") {
                ProfileView()
            }
        }
        .tint(AppColors.primary)
    }
}
