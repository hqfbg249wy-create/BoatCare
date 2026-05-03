//
//  AppTourView.swift
//  Skipily
//
//  Kurze Funktions-Führung für neue User. Wird einmalig nach dem ersten
//  Login angezeigt und merkt sich via @AppStorage, dass der User die
//  Tour gesehen hat. Über "Tour erneut starten" in den Einstellungen
//  wieder aufrufbar.
//

import SwiftUI

struct AppTourStep: Identifiable {
    let id = UUID()
    let icon: String
    let titleKey: String
    let bodyKey: String
    let tint: Color
}

struct AppTourView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0

    private let steps: [AppTourStep] = [
        .init(icon: "map.fill",                 titleKey: "tour.step1.title", bodyKey: "tour.step1.body", tint: .blue),
        .init(icon: "sailboat.fill",            titleKey: "tour.step2.title", bodyKey: "tour.step2.body", tint: .teal),
        .init(icon: "wrench.and.screwdriver.fill", titleKey: "tour.step3.title", bodyKey: "tour.step3.body", tint: .orange),
        .init(icon: "bell.badge.fill",          titleKey: "tour.step4.title", bodyKey: "tour.step4.body", tint: .red),
        .init(icon: "cart.fill",                titleKey: "tour.step5.title", bodyKey: "tour.step5.body", tint: .purple),
        .init(icon: "sparkles",                 titleKey: "tour.step6.title", bodyKey: "tour.step6.body", tint: .indigo),
    ]

    var body: some View {
        ZStack {
            // Hintergrund mit Markenfarbe, dezenter Blur darüber
            LinearGradient(
                colors: [Color(hex: 0x050D18), Color(hex: 0x0A2540)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Überspringen oben rechts
                HStack {
                    Spacer()
                    Button("tour.skip".loc) { finish() }
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(.white.opacity(0.12), in: Capsule())
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                // Step-Carousel – feste Höhe, damit die Buttons darunter
                // nicht verdeckt werden und Touches erhalten.
                TabView(selection: $index) {
                    ForEach(Array(steps.enumerated()), id: \.element.id) { idx, step in
                        stepView(step)
                            .tag(idx)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                Spacer(minLength: 16)

                // Indicator + Buttons
                HStack(spacing: 8) {
                    ForEach(0..<steps.count, id: \.self) { i in
                        Circle()
                            .fill(i == index ? Color.white : Color.white.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                }
                .padding(.bottom, 18)

                HStack(spacing: 12) {
                    if index > 0 {
                        Button("tour.back".loc) {
                            withAnimation { index -= 1 }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundStyle(.white)
                        .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))
                    }

                    Button(index == steps.count - 1 ? "tour.start".loc : "tour.next".loc) {
                        if index == steps.count - 1 {
                            finish()
                        } else {
                            withAnimation { index += 1 }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(Color(hex: 0x050D18))
                    .background(.white, in: RoundedRectangle(cornerRadius: 14))
                    .fontWeight(.semibold)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 30)
            }
        }
    }

    private func stepView(_ step: AppTourStep) -> some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .fill(step.tint.opacity(0.2))
                    .frame(width: 160, height: 160)
                Image(systemName: step.icon)
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundStyle(step.tint)
            }
            .shadow(color: step.tint.opacity(0.3), radius: 24, y: 8)

            Text(step.titleKey.loc)
                .font(.title.bold())
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            Text(step.bodyKey.loc)
                .font(.body)
                .foregroundStyle(.white.opacity(0.85))
                .multilineTextAlignment(.center)
                .lineLimit(nil)
                .padding(.horizontal, 32)
        }
    }

    private func finish() {
        UserDefaults.standard.set(true, forKey: AppTourView.seenKey)
        dismiss()
    }

    static let seenKey = "appTourSeen_v1"

    static var hasSeen: Bool {
        UserDefaults.standard.bool(forKey: seenKey)
    }

    static func reset() {
        UserDefaults.standard.removeObject(forKey: seenKey)
    }
}

#Preview {
    AppTourView()
}
