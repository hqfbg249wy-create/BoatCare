//
//  OrderDetailView.swift
//  Skipily
//
//  Detailed view for a single order with status tracking
//

import SwiftUI
struct OrderDetailView: View {
    let orderId: UUID

    @EnvironmentObject var authService: AuthService

    @State private var order: Order?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showChat = false
    @State private var chatConversation: Conversation?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("orders.loading_detail".loc)
            } else if let order {
                orderContent(order)
            } else if let error = errorMessage {
                Text(error)
                    .foregroundStyle(AppColors.error)
            }
        }
        .navigationTitle(order?.orderNumber ?? "Bestellung")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadOrder()
        }
    }

    private func orderContent(_ order: Order) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Status timeline
                statusTimeline(order)

                // Tracking
                if let tracking = order.trackingNumber {
                    trackingSection(tracking: tracking, url: order.trackingUrl)
                }

                Divider()

                // Items
                itemsSection(order)

                Divider()

                // Price breakdown
                priceSection(order)

                Divider()

                // Shipping address
                addressSection(order)

                // Provider info
                if let provider = order.provider {
                    providerSection(provider)
                }
            }
            .padding(16)
        }
    }

    // MARK: - Status Timeline

    private func statusTimeline(_ order: Order) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("orders.status".loc)
                .font(.headline)
                .padding(.bottom, 12)

            let steps = ["pending", "confirmed", "shipped", "delivered"]
            let currentIndex = steps.firstIndex(of: order.status) ?? 0

            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(spacing: 12) {
                    VStack(spacing: 0) {
                        Circle()
                            .fill(index <= currentIndex ? AppColors.statusColor(for: step) : AppColors.gray200)
                            .frame(width: 24, height: 24)
                            .overlay {
                                if index < currentIndex {
                                    Image(systemName: "checkmark")
                                        .font(.caption2)
                                        .fontWeight(.bold)
                                        .foregroundStyle(.white)
                                } else if index == currentIndex {
                                    Circle()
                                        .fill(.white)
                                        .frame(width: 8, height: 8)
                                }
                            }

                        if index < steps.count - 1 {
                            Rectangle()
                                .fill(index < currentIndex ? AppColors.statusColor(for: step) : AppColors.gray200)
                                .frame(width: 2, height: 32)
                        }
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(AppColors.statusLabel(for: step))
                            .font(.subheadline)
                            .fontWeight(index == currentIndex ? .semibold : .regular)
                            .foregroundStyle(index <= currentIndex ? AppColors.gray900 : AppColors.gray400)

                        if step == "shipped", let date = order.shippedAt {
                            Text(date)
                                .font(.caption2)
                                .foregroundStyle(AppColors.gray400)
                        }
                        if step == "delivered", let date = order.deliveredAt {
                            Text(date)
                                .font(.caption2)
                                .foregroundStyle(AppColors.gray400)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(AppColors.gray50)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Tracking

    private func trackingSection(tracking: String, url: String?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("orders.tracking".loc)
                .font(.headline)

            HStack {
                Image(systemName: "shippingbox")
                    .foregroundStyle(AppColors.info)
                Text(tracking)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Spacer()

                if let urlString = url, let trackingURL = URL(string: urlString) {
                    Link(destination: trackingURL) {
                        Text("Verfolgen")
                            .font(.caption)
                            .foregroundStyle(AppColors.primary)
                    }
                }
            }
        }
    }

    // MARK: - Items

    private func itemsSection(_ order: Order) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Artikel")
                .font(.headline)

            if let items = order.items {
                ForEach(items) { item in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.productName)
                                .font(.subheadline)
                            if let manufacturer = item.productManufacturer {
                                Text(manufacturer)
                                    .font(.caption)
                                    .foregroundStyle(AppColors.gray500)
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(item.quantity)x \(item.displayPrice)")
                                .font(.subheadline)
                            Text(item.displayTotal)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Price

    private func priceSection(_ order: Order) -> some View {
        VStack(spacing: 6) {
            HStack {
                Text("cart.subtotal".loc)
                    .foregroundStyle(AppColors.gray500)
                Spacer()
                Text(String(format: "%.2f €", order.subtotal).replacingOccurrences(of: ".", with: ","))
            }
            .font(.subheadline)

            if let shipping = order.shippingCost {
                HStack {
                    Text("cart.shipping".loc)
                        .foregroundStyle(AppColors.gray500)
                    Spacer()
                    Text(shipping == 0 ? "Kostenlos" : String(format: "%.2f €", shipping).replacingOccurrences(of: ".", with: ","))
                        .foregroundStyle(shipping == 0 ? AppColors.success : .primary)
                }
                .font(.subheadline)
            }

            Divider()

            HStack {
                Text("cart.total".loc)
                    .font(.headline)
                Spacer()
                Text(order.displayTotal)
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(AppColors.primary)
            }
        }
    }

    // MARK: - Address

    private func addressSection(_ order: Order) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("checkout.delivery_address".loc)
                .font(.headline)
            Group {
                if let name = order.shippingName { Text(name) }
                if let street = order.shippingStreet { Text(street) }
                if let postal = order.shippingPostalCode, let city = order.shippingCity {
                    Text("\(postal) \(city)")
                }
                if let country = order.shippingCountry { Text(country) }
            }
            .font(.subheadline)
            .foregroundStyle(AppColors.gray700)
        }
    }

    // MARK: - Provider

    private func providerSection(_ provider: ServiceProviderBasic) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Anbieter")
                .font(.headline)

            HStack {
                Image(systemName: "building.2")
                    .foregroundStyle(AppColors.primary)
                VStack(alignment: .leading) {
                    Text(provider.companyName ?? "")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    if let city = provider.city {
                        Text(city)
                            .font(.caption)
                            .foregroundStyle(AppColors.gray500)
                    }
                }

                Spacer()

                Button {
                    Task { await openChat() }
                } label: {
                    Label("Kontaktieren", systemImage: "bubble.left")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(AppColors.primary)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
            }
        }
        .sheet(isPresented: $showChat) {
            if let conv = chatConversation {
                NavigationStack {
                    ChatView(conversation: conv)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("general.close".loc) { showChat = false }
                            }
                        }
                }
            }
        }
    }

    // MARK: - Chat

    private func openChat() async {
        guard let userId = authService.currentUser?.id, let order else { return }
        do {
            let conv = try await MessagingService.shared.getOrCreateConversation(
                userId: userId,
                providerId: order.providerId
            )
            chatConversation = conv
            showChat = true
        } catch {
            AppLog.error("Open chat error: \(error)")
        }
    }

    // MARK: - Data Loading

    private func loadOrder() async {
        do {
            order = try await OrderService.shared.fetchOrder(id: orderId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
