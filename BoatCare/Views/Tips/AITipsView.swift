//
//  AITipsView.swift
//  BoatCare
//

import SwiftUI

struct AITipsView: View {
    @EnvironmentObject var authService: AuthService
    @StateObject private var service = AIRecommendationService()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()

                if service.isLoading {
                    loadingView
                } else if let error = service.errorMessage {
                    errorView(error)
                } else {
                    tipsListView
                }
            }
            .navigationTitle("tips.title".loc)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .font(.title3)
                    }
                }
            }
            .task {
                if let userId = authService.currentUser?.id {
                    await service.generateRecommendations(for: userId)
                }
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)
            Text("tips.analyzing".loc)
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("tips.analyzing_hint".loc)
                .font(.subheadline)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }

    // MARK: - Error View

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.icloud")
                .font(.system(size: 50))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.headline)
                .foregroundStyle(.secondary)
            Button {
                Task {
                    if let userId = authService.currentUser?.id {
                        await service.generateRecommendations(for: userId)
                    }
                }
            } label: {
                Label("general.retry".loc, systemImage: "arrow.clockwise")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
        }
    }

    // MARK: - Tips List

    private var tipsListView: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Header card
                headerCard

                // Group by priority
                let urgent = service.recommendations.filter { $0.priority == .urgent }
                let important = service.recommendations.filter { $0.priority == .important }
                let suggestions = service.recommendations.filter { $0.priority == .suggestion }

                if !urgent.isEmpty {
                    sectionHeader("tips.section_urgent".loc, color: .red)
                    ForEach(urgent) { tip in
                        TipCard(recommendation: tip)
                    }
                }

                if !important.isEmpty {
                    sectionHeader("tips.section_important".loc, color: .orange)
                    ForEach(important) { tip in
                        TipCard(recommendation: tip)
                    }
                }

                if !suggestions.isEmpty {
                    sectionHeader("tips.section_suggestions".loc, color: .blue)
                    ForEach(suggestions) { tip in
                        TipCard(recommendation: tip)
                    }
                }

                // Footer with timestamp
                if let lastUpdated = service.lastUpdated {
                    Text(String(format: "tips.last_updated".loc, Self.timeFormatter.string(from: lastUpdated)))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 8)
                }

                Spacer(minLength: 40)
            }
            .padding(.horizontal)
            .padding(.top, 8)
        }
        .refreshable {
            if let userId = authService.currentUser?.id {
                await service.generateRecommendations(for: userId)
            }
        }
    }

    // MARK: - Header Card

    private var headerCard: some View {
        HStack(spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 28))
                .foregroundStyle(.blue)

            VStack(alignment: .leading, spacing: 4) {
                Text("tips.header_title".loc)
                    .font(.headline)
                Text("tips.header_subtitle".loc)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.blue.opacity(0.08))
        )
    }

    // MARK: - Section Header

    private func sectionHeader(_ title: String, color: Color) -> some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.top, 8)
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .short
        return f
    }()
}

// MARK: - Tip Card

struct TipCard: View {
    let recommendation: AIRecommendation

    @State private var isExpanded = false

    private var priorityColor: Color {
        switch recommendation.priority {
        case .urgent: return .red
        case .important: return .orange
        case .suggestion: return .blue
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                // Icon
                Image(systemName: recommendation.icon)
                    .font(.system(size: 22))
                    .foregroundStyle(priorityColor)
                    .frame(width: 36, height: 36)
                    .background(priorityColor.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                // Title
                VStack(alignment: .leading, spacing: 2) {
                    Text(recommendation.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(isExpanded ? nil : 2)

                    Text(recommendation.priority.label)
                        .font(.caption2)
                        .foregroundStyle(priorityColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(priorityColor.opacity(0.1))
                        .clipShape(Capsule())
                }

                Spacer()

                // Chevron
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .foregroundStyle(.tertiary)
                    .font(.caption)
            }

            if isExpanded {
                Text(recommendation.text)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(.secondarySystemGroupedBackground))
                .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        )
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.25)) {
                isExpanded.toggle()
            }
        }
    }
}
