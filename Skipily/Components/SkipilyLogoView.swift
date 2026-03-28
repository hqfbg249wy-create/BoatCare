//
//  SkipilyLogoView.swift
//  Skipily
//
//  Skipily brand logo — SwiftUI recreation of the SVG logo
//

import SwiftUI

// MARK: - Skipily Logo Icon (Boat in rounded rect)

struct SkipilyLogoIcon: View {
    let size: CGFloat

    // Brand colors matching the SVG
    private let bgGradient = LinearGradient(
        colors: [Color(hex: 0x1870C0), Color(hex: 0x0F3D70)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    private let hullGradient = LinearGradient(
        colors: [Color(hex: 0x6DD4FF), Color(hex: 0x2090E0)],
        startPoint: .top, endPoint: .bottom
    )
    private let sailGradient = LinearGradient(
        colors: [Color(hex: 0xFFB048), Color(hex: 0xF56200)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    private let waterGradient = LinearGradient(
        colors: [Color(hex: 0xF56200), Color(hex: 0xFF8B20)],
        startPoint: .leading, endPoint: .trailing
    )

    var body: some View {
        Canvas { context, canvasSize in
            let s = canvasSize.width // Square canvas
            let unit = s / 80.0     // SVG was 80x80

            // Background rounded rect
            let bgPath = RoundedRectangle(cornerRadius: 20 * unit, style: .continuous)
                .path(in: CGRect(origin: .zero, size: canvasSize))
            context.fill(bgPath, with: .linearGradient(
                Gradient(colors: [Color(hex: 0x1870C0), Color(hex: 0x0F3D70)]),
                startPoint: .zero, endPoint: CGPoint(x: s, y: s)
            ))

            // Inner highlight border
            context.stroke(bgPath, with: .color(.white.opacity(0.15)),
                           lineWidth: 1.5 * unit)

            // Water band
            let waterRect = CGRect(x: 0, y: 58 * unit, width: s, height: 22 * unit)
            context.fill(Path(waterRect), with: .linearGradient(
                Gradient(colors: [Color(hex: 0xF56200), Color(hex: 0xFF8B20)]),
                startPoint: CGPoint(x: 0, y: 58 * unit),
                endPoint: CGPoint(x: s, y: 58 * unit)
            ))

            // Wave overlay
            var wavePath = Path()
            wavePath.move(to: CGPoint(x: 0, y: 64 * unit))
            wavePath.addCurve(
                to: CGPoint(x: 40 * unit, y: 64 * unit),
                control1: CGPoint(x: 13 * unit, y: 57 * unit),
                control2: CGPoint(x: 27 * unit, y: 71 * unit)
            )
            wavePath.addCurve(
                to: CGPoint(x: 80 * unit, y: 64 * unit),
                control1: CGPoint(x: 53 * unit, y: 57 * unit),
                control2: CGPoint(x: 67 * unit, y: 71 * unit)
            )
            wavePath.addLine(to: CGPoint(x: 80 * unit, y: 80 * unit))
            wavePath.addLine(to: CGPoint(x: 0, y: 80 * unit))
            wavePath.closeSubpath()
            context.fill(wavePath, with: .color(.white.opacity(0.14)))

            // Hull
            var hullPath = Path()
            hullPath.move(to: CGPoint(x: 11 * unit, y: 48 * unit))
            hullPath.addLine(to: CGPoint(x: 40 * unit, y: 22 * unit))
            hullPath.addLine(to: CGPoint(x: 69 * unit, y: 48 * unit))
            hullPath.addLine(to: CGPoint(x: 63 * unit, y: 57 * unit))
            hullPath.addLine(to: CGPoint(x: 17 * unit, y: 57 * unit))
            hullPath.closeSubpath()
            context.fill(hullPath, with: .linearGradient(
                Gradient(colors: [Color(hex: 0x6DD4FF), Color(hex: 0x2090E0)]),
                startPoint: CGPoint(x: 40 * unit, y: 22 * unit),
                endPoint: CGPoint(x: 40 * unit, y: 57 * unit)
            ))

            // Hull highlight line
            var hullLine = Path()
            hullLine.move(to: CGPoint(x: 17 * unit, y: 48 * unit))
            hullLine.addLine(to: CGPoint(x: 40 * unit, y: 27 * unit))
            hullLine.addLine(to: CGPoint(x: 63 * unit, y: 48 * unit))
            context.stroke(hullLine, with: .color(.white.opacity(0.2)),
                           lineWidth: 1 * unit)

            // Mast
            var mastPath = Path()
            mastPath.move(to: CGPoint(x: 40 * unit, y: 22 * unit))
            mastPath.addLine(to: CGPoint(x: 40 * unit, y: 7 * unit))
            context.stroke(mastPath, with: .color(.white),
                           style: StrokeStyle(lineWidth: 2.4 * unit, lineCap: .round))

            // Main sail (orange)
            var mainSail = Path()
            mainSail.move(to: CGPoint(x: 40 * unit, y: 7 * unit))
            mainSail.addLine(to: CGPoint(x: 40 * unit, y: 26 * unit))
            mainSail.addLine(to: CGPoint(x: 63 * unit, y: 40 * unit))
            mainSail.closeSubpath()
            context.fill(mainSail, with: .linearGradient(
                Gradient(colors: [Color(hex: 0xFFB048), Color(hex: 0xF56200)]),
                startPoint: CGPoint(x: 40 * unit, y: 7 * unit),
                endPoint: CGPoint(x: 63 * unit, y: 40 * unit)
            ))

            // Jib sail (white/translucent)
            var jibSail = Path()
            jibSail.move(to: CGPoint(x: 40 * unit, y: 14 * unit))
            jibSail.addLine(to: CGPoint(x: 40 * unit, y: 26 * unit))
            jibSail.addLine(to: CGPoint(x: 20 * unit, y: 38 * unit))
            jibSail.closeSubpath()
            context.fill(jibSail, with: .linearGradient(
                Gradient(colors: [.white.opacity(0.82), Color(hex: 0xC8E6FF).opacity(0.35)]),
                startPoint: CGPoint(x: 40 * unit, y: 14 * unit),
                endPoint: CGPoint(x: 20 * unit, y: 38 * unit)
            ))

            // Compass point
            let compassCenter = CGPoint(x: 40 * unit, y: 58 * unit)
            context.fill(Circle().path(in: CGRect(
                x: compassCenter.x - 4.2 * unit,
                y: compassCenter.y - 4.2 * unit,
                width: 8.4 * unit, height: 8.4 * unit
            )), with: .color(.white))
            context.fill(Circle().path(in: CGRect(
                x: compassCenter.x - 2.2 * unit,
                y: compassCenter.y - 2.2 * unit,
                width: 4.4 * unit, height: 4.4 * unit
            )), with: .color(Color(hex: 0xF56200)))
            context.fill(Circle().path(in: CGRect(
                x: compassCenter.x - 0.8 * unit,
                y: compassCenter.y - 0.8 * unit,
                width: 1.6 * unit, height: 1.6 * unit
            )), with: .color(.white))
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.25, style: .continuous))
        .shadow(color: .black.opacity(0.2), radius: size * 0.1, x: 0, y: size * 0.04)
    }
}

// MARK: - Full Logo (Icon + Wordmark + Slogan)

struct SkipilyLogoView: View {
    enum Style { case dark, light }
    enum Layout { case horizontal, vertical }

    var style: Style = .dark
    var layout: Layout = .vertical
    var iconSize: CGFloat = 80
    var showSlogan: Bool = true
    var showSubtitle: Bool = false

    private var textColor: Color {
        style == .dark ? .white : Color(hex: 0x050D18)
    }

    private var sloganColor: Color {
        style == .dark ? .white.opacity(0.42) : Color(hex: 0x050D18).opacity(0.3)
    }

    var body: some View {
        if layout == .vertical {
            verticalLayout
        } else {
            horizontalLayout
        }
    }

    private var verticalLayout: some View {
        VStack(spacing: iconSize * 0.15) {
            SkipilyLogoIcon(size: iconSize)

            VStack(spacing: iconSize * 0.06) {
                Text("SKIPILY")
                    .font(.system(size: iconSize * 0.45, weight: .black, design: .default))
                    .tracking(iconSize * 0.04)
                    .foregroundStyle(textColor)

                // Orange accent bar
                RoundedRectangle(cornerRadius: 2)
                    .fill(LinearGradient(
                        colors: [Color(hex: 0xF56200), Color(hex: 0xFF8B20)],
                        startPoint: .leading, endPoint: .trailing
                    ))
                    .frame(width: iconSize * 2.2, height: iconSize * 0.04)

                if showSlogan {
                    Text("IMMER \u{00B7} SICHER \u{00B7} SEEKLAR")
                        .font(.system(size: iconSize * 0.13, weight: .semibold, design: .default))
                        .tracking(iconSize * 0.04)
                        .foregroundStyle(sloganColor)
                }

                if showSubtitle {
                    VStack(spacing: 2) {
                        Text("SERVICE & PRODUKTE")
                            .font(.system(size: iconSize * 0.16, weight: .bold, design: .default))
                            .tracking(1)
                            .foregroundStyle(textColor.opacity(0.8))
                        Text("FÜR DICH UND DEIN BOOT")
                            .font(.system(size: iconSize * 0.16, weight: .light, design: .default))
                            .tracking(1)
                            .foregroundStyle(textColor.opacity(0.48))
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    private var horizontalLayout: some View {
        HStack(spacing: iconSize * 0.2) {
            SkipilyLogoIcon(size: iconSize)

            VStack(alignment: .leading, spacing: iconSize * 0.05) {
                Text("SKIPILY")
                    .font(.system(size: iconSize * 0.55, weight: .black, design: .default))
                    .tracking(iconSize * 0.04)
                    .foregroundStyle(textColor)

                // Orange accent bar
                RoundedRectangle(cornerRadius: 2)
                    .fill(LinearGradient(
                        colors: [Color(hex: 0xF56200), Color(hex: 0xFF8B20)],
                        startPoint: .leading, endPoint: .trailing
                    ))
                    .frame(width: iconSize * 2.8, height: iconSize * 0.04)

                if showSlogan {
                    Text("IMMER \u{00B7} SICHER \u{00B7} SEEKLAR")
                        .font(.system(size: iconSize * 0.14, weight: .semibold, design: .default))
                        .tracking(iconSize * 0.04)
                        .foregroundStyle(sloganColor)
                }
            }
        }
    }
}

// MARK: - Color Hex Extension

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}

// MARK: - Preview

#Preview("Vertical Dark") {
    ZStack {
        Color(hex: 0x050D18).ignoresSafeArea()
        SkipilyLogoView(style: .dark, layout: .vertical, iconSize: 100, showSlogan: true)
    }
}

#Preview("Vertical Light") {
    ZStack {
        Color.white.ignoresSafeArea()
        SkipilyLogoView(style: .light, layout: .vertical, iconSize: 100, showSlogan: true)
    }
}

#Preview("Horizontal") {
    ZStack {
        Color(hex: 0x050D18).ignoresSafeArea()
        SkipilyLogoView(style: .dark, layout: .horizontal, iconSize: 60, showSlogan: true)
    }
}
