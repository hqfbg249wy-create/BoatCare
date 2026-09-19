//
//  NewSailEquipmentFlow.swift
//  Skipily
//
//  Sail-spezifischer Anlege-Flow vom Equipment-Kategorie-Picker:
//  1. User hat "Sails" gewählt
//  2. Diese View zeigt die 5 Sail-Typen (Großsegel, Vorsegel/Genua,
//     Gennaker, Code 0, Anderes Segel)
//  3. Auswahl:
//     - Bekannter Typ: Equipment wird mit vorgenerierter UUID +
//       Kategorie "sails" + Name = type.displayName (DB-Mapping in DE)
//       in die equipment-Tabelle insertet, dann öffnet sich direkt das
//       SailMeasurementFormView mit dieser ID.
//     - "Anderes Segel": dismiss → Parent öffnet das generische
//       AddEditEquipmentView mit Kategorie sails (frei benennbar).
//

import SwiftUI
import Supabase

struct NewSailEquipmentFlow: View {
    let boatName: String
    /// Bekannter Segeltyp gewählt — Parent öffnet das generische
    /// AddEditEquipmentView mit Kategorie "sails" + diesem Typ (Messblatt inline).
    let onPickType: (SailType) -> Void
    /// Wird aufgerufen, wenn User "Anderes Segel" wählt — Parent soll
    /// dann das generische AddEditEquipmentView mit Kategorie "sails" öffnen.
    let onPickOther: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("sail.select_type".loc)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ForEach(SailType.allCases) { type in
                    Button {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                            if type == .other { onPickOther() } else { onPickType(type) }
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: type.icon)
                                .font(.title2)
                                .foregroundStyle(AppColors.primary)
                                .frame(width: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(type.displayName)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text(typeHint(type))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("sail.select_type_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
            }
        }
    }

    private func typeHint(_ t: SailType) -> String {
        switch t {
        case .grosssegel: return "Rigg, Segel, Reff, Mastrutscher"
        case .vorsegel:   return "Vorstag, Schiene, Rollreff, UV-Schutz"
        case .gennaker:   return "Luff, Leech, Foot, Material"
        case .code0:      return "Luff, Leech, Foot, Furler"
        case .other:      return "sail.type.other_hint".loc
        }
    }
}
