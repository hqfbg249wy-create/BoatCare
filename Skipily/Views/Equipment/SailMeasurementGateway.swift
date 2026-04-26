//
//  SailMeasurementGateway.swift
//  Skipily
//
//  Smart-Wrapper für den Maßblatt-Aufruf aus existierenden Sail-Equipment-
//  Einträgen: prüft, ob in sail_measurements bereits ein Eintrag für die
//  Equipment-ID existiert. Wenn ja → öffnet direkt das passende
//  SailMeasurementFormView mit dem gespeicherten sail_type. Wenn nein
//  (Legacy-Equipment ohne Maßblatt) → fällt auf den SailTypePicker zurück.
//
//  Vorher: User wurde bei jedem Edit nach dem Sail-Typ gefragt — auch
//  wenn er das Maßblatt schon ausgefüllt hatte.
//

import SwiftUI
import Supabase

struct SailMeasurementGateway: View {
    let equipmentId: UUID
    let boatName: String

    @State private var phase: Phase = .loading

    private enum Phase {
        case loading
        case existing(SailType)
        case picker
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .task { await resolve() }
            case .existing(let type):
                SailMeasurementFormView(sailType: type, equipmentId: equipmentId, boatName: boatName)
            case .picker:
                SailTypePicker(equipmentId: equipmentId, boatName: boatName)
            }
        }
    }

    private struct SailTypeOnly: Codable {
        let sail_type: String
    }

    private func resolve() async {
        do {
            let rows: [SailTypeOnly] = try await SupabaseManager.shared.client
                .from("sail_measurements")
                .select("sail_type")
                .eq("equipment_id", value: equipmentId.uuidString)
                .limit(1)
                .execute()
                .value

            if let saved = rows.first?.sail_type,
               let type = SailType(rawValueDB: saved) {
                phase = .existing(type)
            } else {
                phase = .picker
            }
        } catch {
            AppLog.error("SailMeasurementGateway.resolve: \(error)")
            phase = .picker
        }
    }
}

private extension SailType {
    /// DB speichert sail_type als kurzer Snake-Case-String, nicht als rawValue.
    init?(rawValueDB: String) {
        switch rawValueDB.lowercased() {
        case "grosssegel": self = .grosssegel
        case "vorsegel":   self = .vorsegel
        case "gennaker":   self = .gennaker
        case "code0":      self = .code0
        case "other":      self = .other
        default:           return nil
        }
    }
}
