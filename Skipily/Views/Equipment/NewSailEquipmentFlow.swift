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
    let boatId: UUID
    let boatName: String
    /// Wird aufgerufen, wenn User "Anderes Segel" wählt — Parent soll
    /// dann das generische AddEditEquipmentView mit Kategorie "sails" öffnen.
    let onPickOther: () -> Void
    /// Wird aufgerufen, nachdem ein neues Sail-Equipment erfolgreich
    /// in die DB eingefügt wurde — damit der Parent seine Liste neu lädt.
    let onCreated: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var creatingType: SailType? = nil   // Inflight Insert
    @State private var measurementFor: MeasurementCtx? = nil
    @State private var errorMessage: String?

    private struct MeasurementCtx: Identifiable {
        let id: UUID
        let type: SailType
    }

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
                        if type == .other {
                            // Parent kümmert sich
                            dismiss()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                                onPickOther()
                            }
                        } else {
                            Task { await createSailEquipment(type: type) }
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
                            if creatingType == type {
                                ProgressView()
                            } else {
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .disabled(creatingType != nil)
                }
            }
            .navigationTitle("sail.select_type_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
            }
            .sheet(item: $measurementFor) { ctx in
                SailMeasurementFormView(sailType: ctx.type, equipmentId: ctx.id, boatName: boatName)
                    .onDisappear {
                        // Wenn Maßblatt-Sheet geschlossen wird → kompletten Flow zumachen
                        // damit der User wieder im Equipment-Screen landet.
                        measurementFor = nil
                        dismiss()
                        onCreated()
                    }
            }
            .alert("general.error".loc, isPresented: Binding(
                get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
            )) {
                Button("general.ok".loc, role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
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

    // MARK: - Insert

    private struct EquipmentInsertWithId: Encodable {
        let id: String
        let boat_id: String
        let name: String
        let category: String
    }

    private func createSailEquipment(type: SailType) async {
        let id = UUID()
        creatingType = type
        defer { creatingType = nil }

        let row = EquipmentInsertWithId(
            id: id.uuidString,
            boat_id: boatId.uuidString,
            name: type.displayName,   // wird beim Lesen via .loc lokalisiert dargestellt
            category: "sails"
        )

        do {
            try await SupabaseManager.shared.client
                .from("equipment")
                .insert(row)
                .execute()
            measurementFor = MeasurementCtx(id: id, type: type)
        } catch {
            AppLog.error("createSailEquipment: \(error)")
            errorMessage = error.localizedDescription
        }
    }
}
