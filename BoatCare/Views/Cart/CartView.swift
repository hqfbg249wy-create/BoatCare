//
//  CartView.swift
//  BoatCare
//
//  Shopping cart view grouped by provider
//

import SwiftUI

struct CartView: View {
    @Environment(CartManager.self) private var cartManager
    @State private var showCheckout = false

    var body: some View {
        NavigationStack {
            Group {
                if cartManager.isEmpty {
                    emptyCartView
                } else {
                    cartContent
                }
            }
            .navigationTitle("Warenkorb")
            .navigationDestination(isPresented: $showCheckout) {
                CheckoutView()
            }
        }
    }

    // MARK: - Empty Cart

    private var emptyCartView: some View {
        VStack(spacing: 16) {
            Image(systemName: "cart")
                .font(.system(size: 60))
                .foregroundStyle(AppColors.gray300)

            Text("Dein Warenkorb ist leer")
                .font(.title3)
                .fontWeight(.semibold)

            Text("Stöbere im Shop und füge\nProdukte hinzu")
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Cart Content

    private var cartContent: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 16) {
                    ForEach(cartManager.groupedByProvider) { group in
                        providerGroupView(group)
                    }
                }
                .padding(16)
            }

            // Bottom bar with total and checkout
            checkoutBar
        }
    }

    // MARK: - Provider Group

    private func providerGroupView(_ group: CartGroup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Provider header
            HStack {
                Image(systemName: "building.2")
                    .font(.caption)
                    .foregroundStyle(AppColors.primary)
                Text(group.providerName)
                    .font(.headline)
                if let city = group.providerCity {
                    Text("(\(city))")
                        .font(.caption)
                        .foregroundStyle(AppColors.gray500)
                }
            }

            Divider()

            // Items
            ForEach(group.items) { item in
                cartItemRow(item)
            }

            // Subtotals
            VStack(spacing: 4) {
                HStack {
                    Text("Zwischensumme")
                        .font(.subheadline)
                        .foregroundStyle(AppColors.gray500)
                    Spacer()
                    Text(group.displaySubtotal)
                        .font(.subheadline)
                }
                HStack {
                    Text("Versand")
                        .font(.subheadline)
                        .foregroundStyle(AppColors.gray500)
                    Spacer()
                    Text(group.displayShipping)
                        .font(.subheadline)
                        .foregroundStyle(group.shippingCost == 0 ? AppColors.success : AppColors.gray700)
                }
                Divider()
                HStack {
                    Text("Gesamt")
                        .font(.headline)
                    Spacer()
                    Text(group.displayTotal)
                        .font(.headline)
                        .foregroundStyle(AppColors.primary)
                }
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    }

    // MARK: - Cart Item Row

    @ViewBuilder
    private func cartItemRow(_ item: CartItem) -> some View {
        @Bindable var cart = cartManager

        HStack(spacing: 12) {
            // Product image
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(AppColors.gray100)
                if let url = item.product.firstImageURL {
                    AsyncImage(url: url) { phase in
                        if case .success(let image) = phase {
                            image.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            Image(systemName: "shippingbox")
                                .foregroundStyle(AppColors.gray300)
                        }
                    }
                } else {
                    Image(systemName: "shippingbox")
                        .foregroundStyle(AppColors.gray300)
                }
            }
            .frame(width: 60, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(item.product.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(2)

                Text(item.product.displayPrice)
                    .font(.caption)
                    .foregroundStyle(AppColors.gray500)
            }

            Spacer()

            // Quantity & Remove
            VStack(alignment: .trailing, spacing: 8) {
                Button {
                    cartManager.removeFromCart(productId: item.product.id)
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(AppColors.error)
                }

                HStack(spacing: 8) {
                    Button {
                        cartManager.updateQuantity(
                            productId: item.product.id,
                            quantity: item.quantity - 1
                        )
                    } label: {
                        Image(systemName: "minus.circle")
                            .foregroundStyle(AppColors.gray500)
                    }

                    Text("\(item.quantity)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .frame(minWidth: 24)

                    Button {
                        cartManager.updateQuantity(
                            productId: item.product.id,
                            quantity: item.quantity + 1
                        )
                    } label: {
                        Image(systemName: "plus.circle")
                            .foregroundStyle(AppColors.primary)
                    }
                }

                Text(item.displayLineTotal)
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }
        }
    }

    // MARK: - Checkout Bar

    private var checkoutBar: some View {
        VStack(spacing: 12) {
            Divider()

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Gesamtbetrag")
                        .font(.caption)
                        .foregroundStyle(AppColors.gray500)
                    Text(cartManager.displayGrandTotal)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(AppColors.primary)
                }

                Spacer()

                Button {
                    showCheckout = true
                } label: {
                    HStack(spacing: 6) {
                        Text("Zur Kasse")
                            .fontWeight(.semibold)
                        Image(systemName: "arrow.right")
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 14)
                    .background(AppColors.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .background(Color(.systemBackground))
    }
}
