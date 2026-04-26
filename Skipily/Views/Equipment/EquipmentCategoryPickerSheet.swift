//
//  EquipmentCategoryPickerSheet.swift
//  Skipily
//
//  Wird beim "+ Equipment"-Button gezeigt: erst Kategorie wählen, dann
//  routet der Caller zum eigentlichen Add-Equipment-Formular mit der
//  vorgewählten Kategorie. Damit ist der Equipment-Typ ab dem ersten
//  Schritt eindeutig — keine handgetippten Kategorien wie "Großsegel"
//  als Equipment-Name mehr, die später nicht mehr übersetzt werden.
//

import SwiftUI

struct EquipmentCategoryPickerSheet: View {
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    /// Reihenfolge in der UI — typische / häufige zuerst
    private let categories: [String] = [
        "engine", "sails", "rigging", "navigation", "communication",
        "electrical", "safety", "anchor", "hvac", "paint", "rope", "other",
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(categories, id: \.self) { cat in
                        Button {
                            onPick(cat)
                        } label: {
                            VStack(spacing: 10) {
                                Image(systemName: iconFor(cat))
                                    .font(.system(size: 32))
                                    .foregroundStyle(colorFor(cat))
                                    .frame(height: 40)
                                Text("equipment.cat.\(cat)".loc)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .padding(.horizontal, 8)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(colorFor(cat).opacity(0.25), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
            .navigationTitle("equipment.pick_category".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
            }
        }
    }

    // MARK: - Mapping zu Icons / Farben (parallel zu EquipmentItem.categoryIcon/-Color)

    private func iconFor(_ cat: String) -> String {
        switch cat {
        case "engine":        return "engine.combustion.fill"
        case "sails":         return "wind"
        case "rigging":       return "arrow.up.and.down"
        case "navigation":    return "location.north.line.fill"
        case "communication": return "antenna.radiowaves.left.and.right"
        case "electrical":    return "bolt.fill"
        case "safety":        return "shield.fill"
        case "anchor":        return "anchor.circle.fill"
        case "hvac":          return "thermometer.sun.fill"
        case "paint":         return "paintbrush.fill"
        case "rope":          return "scribble.variable"
        case "other":         return "shippingbox.fill"
        default:              return "shippingbox.fill"
        }
    }

    private func colorFor(_ cat: String) -> Color {
        switch cat {
        case "engine":        return .orange
        case "sails":         return .cyan
        case "rigging":       return .indigo
        case "navigation":    return .blue
        case "communication": return .teal
        case "electrical":    return .yellow
        case "safety":        return .red
        case "anchor":        return .gray
        case "hvac":          return .pink
        case "paint":         return .purple
        case "rope":          return .brown
        case "other":         return .secondary
        default:              return .secondary
        }
    }
}

#Preview {
    EquipmentCategoryPickerSheet(onPick: { _ in })
}
