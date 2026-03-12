//
//  OrdersView.swift
//  BoatCare
//
//  Order history and tracking screen
//

import SwiftUI

struct OrdersView: View {
    @Environment(AuthService.self) private var authService

    @State private var orders: [Order] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedFilter: String? = nil

    private let filters = ["pending", "confirmed", "shipped", "delivered", "cancelled"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Status filter
                filterChips

                if isLoading {
                    ProgressView("Bestellungen laden...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredOrders.isEmpty {
                    emptyView
                } else {
                    orderList
                }
            }
            .navigationTitle("Bestellungen")
            .task {
                await loadOrders()
            }
            .refreshable {
                await loadOrders()
            }
        }
    }

    private var filteredOrders: [Order] {
        guard let filter = selectedFilter else { return orders }
        return orders.filter { $0.status == filter }
    }

    // MARK: - Filter Chips

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button {
                    selectedFilter = nil
                } label: {
                    Text("Alle")
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(selectedFilter == nil ? AppColors.primary : AppColors.gray100)
                        .foregroundStyle(selectedFilter == nil ? .white : AppColors.gray700)
                        .clipShape(Capsule())
                }

                ForEach(filters, id: \.self) { filter in
                    Button {
                        selectedFilter = selectedFilter == filter ? nil : filter
                    } label: {
                        Text(AppColors.statusLabel(for: filter))
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(selectedFilter == filter ? AppColors.statusColor(for: filter) : AppColors.gray100)
                            .foregroundStyle(selectedFilter == filter ? .white : AppColors.gray700)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Order List

    private var orderList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(filteredOrders) { order in
                    NavigationLink(value: order.id) {
                        orderCard(order)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .navigationDestination(for: UUID.self) { orderId in
            OrderDetailView(orderId: orderId)
        }
    }

    private func orderCard(_ order: Order) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(order.orderNumber ?? "Bestellung")
                        .font(.headline)
                    Text(order.displayDate)
                        .font(.caption)
                        .foregroundStyle(AppColors.gray500)
                }

                Spacer()

                StatusBadgeView(status: order.status)
            }

            // Provider
            if let provider = order.provider {
                HStack(spacing: 4) {
                    Image(systemName: "building.2")
                        .font(.caption2)
                    Text(provider.companyName ?? "")
                        .font(.caption)
                }
                .foregroundStyle(AppColors.gray500)
            }

            // Items summary
            if let items = order.items {
                ForEach(items.prefix(3)) { item in
                    HStack {
                        Text("\(item.quantity)x")
                            .font(.caption)
                            .foregroundStyle(AppColors.gray500)
                        Text(item.productName)
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        Text(item.displayTotal)
                            .font(.subheadline)
                    }
                }
                if items.count > 3 {
                    Text("+ \(items.count - 3) weitere Artikel")
                        .font(.caption)
                        .foregroundStyle(AppColors.gray400)
                }
            }

            Divider()

            // Total & tracking
            HStack {
                if let tracking = order.trackingNumber {
                    HStack(spacing: 4) {
                        Image(systemName: "shippingbox")
                            .font(.caption2)
                        Text(tracking)
                            .font(.caption)
                    }
                    .foregroundStyle(AppColors.info)
                }

                Spacer()

                Text(order.displayTotal)
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(AppColors.primary)
            }
        }
        .padding(16)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    }

    // MARK: - Empty View

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "shippingbox")
                .font(.system(size: 48))
                .foregroundStyle(AppColors.gray300)
            Text("Keine Bestellungen")
                .font(.title3)
                .fontWeight(.semibold)
            Text("Deine Bestellungen erscheinen hier,\nsobald Du etwas bestellst")
                .font(.callout)
                .foregroundStyle(AppColors.gray500)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Data Loading

    private func loadOrders() async {
        guard let userId = authService.currentUser?.id else {
            isLoading = false
            return
        }

        do {
            orders = try await OrderService.shared.fetchOrders(buyerId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
