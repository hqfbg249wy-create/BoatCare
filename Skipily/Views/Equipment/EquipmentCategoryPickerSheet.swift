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
    // Kategorien aus der serverseitigen Quelle (DB) mit Offline-Fallback/Cache.
    @ObservedObject private var catalog = EquipmentCategoryCatalog.shared
    private var lang: String { LanguageManager.shared.currentLanguage.code }

    var body: some View {
        NavigationStack {
            ScrollView {
                // Hinweis zur Eingabe-Qualitaet — Eigner sieht das hier zum
                // ersten Mal, bevor er ein neues Equipment anlegt.
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "lightbulb.fill")
                        .foregroundStyle(.orange)
                        .padding(.top, 2)
                    Text("data_quality.hint".loc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.orange.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color.orange.opacity(0.25), lineWidth: 1)
                        )
                )
                .padding(.horizontal, 16)
                .padding(.top, 12)

                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(catalog.keys, id: \.self) { cat in
                        Button {
                            onPick(cat)
                        } label: {
                            VStack(spacing: 10) {
                                Image(systemName: catalog.iconIOS(cat))
                                    .font(.system(size: 32))
                                    .foregroundStyle(catalog.color(cat))
                                    .frame(height: 40)
                                Text(catalog.label(cat, lang: lang))
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
                                    .stroke(catalog.color(cat).opacity(0.25), lineWidth: 1)
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
            .task { await catalog.refresh() }
        }
    }
}

#Preview {
    EquipmentCategoryPickerSheet(onPick: { _ in })
}
