//
//  SailMeasurementFormView.swift
//  Skipily
//
//  Sail measurement forms for Großsegel, Genua/Vorsegel, Gennaker, Code0
//  Based on OneSails measurement sheets
//

import SwiftUI
import Supabase

// MARK: - Sail Type

enum SailType: String, CaseIterable, Identifiable {
    case grosssegel = "Großsegel"
    case vorsegel = "Vorsegel / Genua"
    case gennaker = "Gennaker"
    case code0 = "Code 0"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .grosssegel: return "wind"
        case .vorsegel: return "sailboat.fill"
        case .gennaker: return "wind.circle.fill"
        case .code0: return "wind.circle"
        }
    }
}

// MARK: - Sail Measurement Data

struct SailMeasurement: Codable, Identifiable {
    var id: UUID = UUID()
    var equipmentId: UUID
    var sailType: String
    var date: String?

    // Common fields
    var sailNumber: String = ""
    var notes: String = ""

    // Großsegel Rigg
    var gs_P: String = ""          // Vorliek
    var gs_E: String = ""          // Unterliek
    var gs_E1: String = ""         // Abstand Mast-Achterstag
    var gs_A: String = ""          // Baumoberkante bis Keep/Einfädler
    var gs_G: String = ""          // Galgen: Masthinterkante bis Bolzen Achterstag
    var gs_AL: String = ""         // Großfallauslass bis Oberkante waagrechter Baum

    // Großsegel Segel
    var gs_RB: String = ""         // Masthinterkante bis Reffhaken
    var gs_RU: String = ""         // Baumoberkante bis Reffhaken
    var gs_CB: String = ""         // Masthinterkante bis Anschlagpunkt
    var gs_CU: String = ""         // Baumoberrkante bis Anschlagpunkt

    // Großsegel Details
    var gs_R1: String = ""         // Baumoberkante bis Reff 1
    var gs_R2: String = ""         // Baumoberkante bis Reff 2
    var gs_unterliekstau: String = ""  // mm
    var gs_vorliekstau: String = ""    // mm
    var gs_schothornrutscher: String = "" // mm
    var gs_mastrutscher: String = ""

    // Großsegel Extras
    var gs_einleinenreff: Bool = false
    var gs_weicherFussteil: Bool = false
    var gs_losesUnterliek: Bool = false
    var gs_segelzeichen: Bool = false
    var gs_segelnummer: Bool = false
    var gs_farbe: String = "weiss"

    // Vorsegel Rigg
    var vs_I: String = ""          // Vorstaganschlagpunkt
    var vs_I2: String = ""         // Top-Fallauslass
    var vs_VST: String = ""        // Länge Vorstag
    var vs_J: String = ""          // Vorstaganschlagpunkt bis Mastvorderkante
    var vs_J2: String = ""         // Bugspriet bis Mastvorderkante

    // Vorsegel Segel
    var vs_VL: String = ""         // Vorliekslänge
    var vs_AL1: String = ""        // Fallschlitten – Anfang Schiene
    var vs_AL2: String = ""        // Fallschlitten – Ende Schiene
    var vs_T1: String = ""         // Vorstag – Anfang Schiene
    var vs_T2: String = ""         // Vorstag – Ende Schiene
    var vs_W: String = ""          // Vorstag bis Want
    var vs_Q: String = ""          // Höhe Anschlagpunkt über Deck
    var vs_K: String = ""          // Höhe Schothorn über Deck

    // Vorsegel Details
    var vs_H: String = ""          // Höhe Einfädler
    var vs_reffanlage: String = "" // Typ/Modell
    var vs_vorliekstau: String = "" // mm

    // Vorsegel Extras
    var vs_rollreff: Bool = false
    var vs_fenster: Bool = false
    var vs_uvSchutz: Bool = false
    var vs_position: String = "BB" // BB oder STB
    var vs_farbe: String = "weiss"

    // Gennaker / Code0
    var gk_luffLength: String = ""   // Vorliekslänge
    var gk_leechLength: String = ""  // Achterliekslänge
    var gk_footLength: String = ""   // Unterliekslänge
    var gk_midWidth: String = ""     // Mittelbreite
    var gk_tackHeight: String = ""   // Halshöhe über Deck
    var gk_material: String = ""
    var gk_farbe: String = ""

    enum CodingKeys: String, CodingKey {
        case id, sailType, date, sailNumber, notes, equipmentId
        case gs_P, gs_E, gs_E1, gs_A, gs_G, gs_AL
        case gs_RB, gs_RU, gs_CB, gs_CU
        case gs_R1, gs_R2, gs_unterliekstau, gs_vorliekstau, gs_schothornrutscher, gs_mastrutscher
        case gs_einleinenreff, gs_weicherFussteil, gs_losesUnterliek, gs_segelzeichen, gs_segelnummer, gs_farbe
        case vs_I, vs_I2, vs_VST, vs_J, vs_J2
        case vs_VL, vs_AL1, vs_AL2, vs_T1, vs_T2, vs_W, vs_Q, vs_K
        case vs_H, vs_reffanlage, vs_vorliekstau
        case vs_rollreff, vs_fenster, vs_uvSchutz, vs_position, vs_farbe
        case gk_luffLength, gk_leechLength, gk_footLength, gk_midWidth, gk_tackHeight, gk_material, gk_farbe

        var stringValue: String {
            // Convert to snake_case for Supabase
            rawValue.replacingOccurrences(of: "([A-Z])", with: "_$1", options: .regularExpression).lowercased()
        }
    }
}

// MARK: - Sail Measurement Form View

struct SailMeasurementFormView: View {
    let sailType: SailType
    let equipmentId: UUID
    let boatName: String
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authService: AuthService

    @State private var measurement: SailMeasurement
    @State private var isSaving = false
    @State private var showSaved = false

    init(sailType: SailType, equipmentId: UUID, boatName: String, existing: SailMeasurement? = nil) {
        self.sailType = sailType
        self.equipmentId = equipmentId
        self.boatName = boatName
        _measurement = State(initialValue: existing ?? SailMeasurement(equipmentId: equipmentId, sailType: sailType.rawValue))
    }

    var body: some View {
        NavigationStack {
            Form {
                // Header
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 12) {
                            Image(systemName: sailType.icon)
                                .font(.title)
                                .foregroundStyle(AppColors.primary)
                            VStack(alignment: .leading) {
                                Text("Maßblatt \(sailType.rawValue)")
                                    .font(.headline)
                                Text(boatName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Text("Alle Angaben in cm (Durchmesser in mm)")
                            .font(.caption2)
                            .foregroundStyle(AppColors.gray400)
                    }
                }

                // Common
                Section("Allgemein") {
                    TextField("Segel-Nr.", text: $measurement.sailNumber)
                    TextField("Besonderes / Notizen", text: $measurement.notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                // Type-specific sections
                switch sailType {
                case .grosssegel:
                    grosssegelForm
                case .vorsegel:
                    vorsegelForm
                case .gennaker:
                    gennakerForm
                case .code0:
                    code0Form
                }
            }
            .navigationTitle("Maßblatt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await saveMeasurement() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("Speichern").fontWeight(.semibold)
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .overlay(alignment: .top) {
                if showSaved {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Maßblatt gespeichert")
                            .fontWeight(.medium)
                    }
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(AppColors.success)
                    .clipShape(Capsule())
                    .shadow(radius: 8)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
    }

    // MARK: - Großsegel Form

    @ViewBuilder
    private var grosssegelForm: some View {
        Section("Rigg") {
            measureField("Vorliek (P)", value: $measurement.gs_P, unit: "cm")
            measureField("Unterliek (E)", value: $measurement.gs_E, unit: "cm")
            measureField("Abstand Mast-Achterstag (E1)", value: $measurement.gs_E1, unit: "cm")
            measureField("Baumoberkante bis Keep/Einfädler (A)", value: $measurement.gs_A, unit: "cm")
            measureField("Galgen: Masthinterkante bis Bolzen (G)", value: $measurement.gs_G, unit: "cm")
            measureField("Großfallauslass bis Oberkante Baum (AL)", value: $measurement.gs_AL, unit: "cm")
        }

        Section("Segel") {
            measureField("Baumoberkante bis Keep/Einfädler (A)", value: $measurement.gs_A, unit: "cm")
            measureField("Masthinterkante bis Reffhaken (RB)", value: $measurement.gs_RB, unit: "cm")
            measureField("Baumoberkante bis Reffhaken (RU)", value: $measurement.gs_RU, unit: "cm")
            measureField("Masthinterkante bis Anschlagpunkt (CB)", value: $measurement.gs_CB, unit: "cm")
            measureField("Baumoberkante bis Anschlagpunkt (CU)", value: $measurement.gs_CU, unit: "cm")
        }

        Section("Details") {
            measureField("Baumoberkante bis Reff 1 (R1)", value: $measurement.gs_R1, unit: "cm")
            measureField("Baumoberkante bis Reff 2 (R2)", value: $measurement.gs_R2, unit: "cm")
            measureField("Unterliekstau Ø", value: $measurement.gs_unterliekstau, unit: "mm")
            measureField("Vorliekstau Ø", value: $measurement.gs_vorliekstau, unit: "mm")
            measureField("Schothorn-Rutscher Ø", value: $measurement.gs_schothornrutscher, unit: "mm")
            TextField("Mastrutscher (Typ)", text: $measurement.gs_mastrutscher)
        }

        Section("Extras") {
            Toggle("Einleinenreff", isOn: $measurement.gs_einleinenreff)
            Toggle("Weicher Fußteil", isOn: $measurement.gs_weicherFussteil)
            Toggle("Loses Unterliek", isOn: $measurement.gs_losesUnterliek)
            Toggle("Segelzeichen", isOn: $measurement.gs_segelzeichen)
            Toggle("Segelnummer", isOn: $measurement.gs_segelnummer)
            Picker("Farbe", selection: $measurement.gs_farbe) {
                Text("Schwarz").tag("schwarz")
                Text("Grau").tag("grau")
                Text("Blau").tag("blau")
                Text("Rot").tag("rot")
                Text("Weiß").tag("weiss")
            }
        }
    }

    // MARK: - Vorsegel Form

    @ViewBuilder
    private var vorsegelForm: some View {
        Section("Rigg") {
            measureField("Vorstaganschlagpunkt (I)", value: $measurement.vs_I, unit: "cm")
            measureField("Top-Fallauslass (I2)", value: $measurement.vs_I2, unit: "cm")
            measureField("Länge Vorstag (VST)", value: $measurement.vs_VST, unit: "cm")
            measureField("Vorstaganschlagpunkt bis Mast (J)", value: $measurement.vs_J, unit: "cm")
            measureField("Bugspriet bis Mastvorderkante (J2)", value: $measurement.vs_J2, unit: "cm")
        }

        Section("Segel") {
            measureField("Vorliekslänge (VL)", value: $measurement.vs_VL, unit: "cm")
            measureField("Fallschlitten – Anfang Schiene (AL1)", value: $measurement.vs_AL1, unit: "cm")
            measureField("Fallschlitten – Ende Schiene (AL2)", value: $measurement.vs_AL2, unit: "cm")
            measureField("Vorstag – Anfang Schiene (T1)", value: $measurement.vs_T1, unit: "cm")
            measureField("Vorstag – Ende Schiene (T2)", value: $measurement.vs_T2, unit: "cm")
            measureField("Vorstag bis Want (W)", value: $measurement.vs_W, unit: "cm")
            measureField("Höhe Anschlagpunkt über Deck (Q)", value: $measurement.vs_Q, unit: "cm")
            measureField("Höhe Schothorn über Deck (K)", value: $measurement.vs_K, unit: "cm")
        }

        Section("Details") {
            measureField("Höhe Einfädler (H)", value: $measurement.vs_H, unit: "cm")
            TextField("Reffanlage (Typ/Modell)", text: $measurement.vs_reffanlage)
            measureField("Vorliekstau Ø", value: $measurement.vs_vorliekstau, unit: "mm")
        }

        Section("Extras") {
            Toggle("Rollreff", isOn: $measurement.vs_rollreff)
            Toggle("Fenster", isOn: $measurement.vs_fenster)
            Toggle("UV Schutz", isOn: $measurement.vs_uvSchutz)
            Picker("Position", selection: $measurement.vs_position) {
                Text("Backbord").tag("BB")
                Text("Steuerbord").tag("STB")
            }
            Picker("Farbe", selection: $measurement.vs_farbe) {
                Text("Grau").tag("grau")
                Text("Blau").tag("blau")
                Text("Weiß").tag("weiss")
            }
        }
    }

    // MARK: - Gennaker Form

    @ViewBuilder
    private var gennakerForm: some View {
        Section("Maße") {
            measureField("Vorliekslänge (Luff)", value: $measurement.gk_luffLength, unit: "cm")
            measureField("Achterliekslänge (Leech)", value: $measurement.gk_leechLength, unit: "cm")
            measureField("Unterliekslänge (Foot)", value: $measurement.gk_footLength, unit: "cm")
            measureField("Mittelbreite", value: $measurement.gk_midWidth, unit: "cm")
            measureField("Halshöhe über Deck", value: $measurement.gk_tackHeight, unit: "cm")
        }

        Section("Details") {
            TextField("Material", text: $measurement.gk_material)
            TextField("Farbe / Design", text: $measurement.gk_farbe)
        }
    }

    // MARK: - Code 0 Form

    @ViewBuilder
    private var code0Form: some View {
        Section("Maße") {
            measureField("Vorliekslänge (Luff)", value: $measurement.gk_luffLength, unit: "cm")
            measureField("Achterliekslänge (Leech)", value: $measurement.gk_leechLength, unit: "cm")
            measureField("Unterliekslänge (Foot)", value: $measurement.gk_footLength, unit: "cm")
            measureField("Mittelbreite", value: $measurement.gk_midWidth, unit: "cm")
            measureField("Halshöhe über Deck", value: $measurement.gk_tackHeight, unit: "cm")
        }

        Section("Rigg-Anbindung") {
            measureField("Vorstaganschlagpunkt (I)", value: $measurement.vs_I, unit: "cm")
            measureField("Bugspriet bis Mastvorderkante (J2)", value: $measurement.vs_J2, unit: "cm")
        }

        Section("Details") {
            TextField("Material", text: $measurement.gk_material)
            Toggle("Rollbar (Furler)", isOn: $measurement.vs_rollreff)
            TextField("Farbe / Design", text: $measurement.gk_farbe)
        }
    }

    // MARK: - Helpers

    private func measureField(_ label: String, value: Binding<String>, unit: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .lineLimit(2)
            Spacer()
            TextField("0", text: value)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 70)
            Text(unit)
                .font(.caption)
                .foregroundStyle(AppColors.gray400)
                .frame(width: 28)
        }
    }

    // MARK: - Save

    private func saveMeasurement() async {
        isSaving = true
        measurement.date = ISO8601DateFormatter().string(from: Date())

        do {
            // Save as JSON in equipment notes or a separate table
            let jsonData = try JSONEncoder().encode(measurement)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? ""

            // Store in equipment item's notes field with prefix
            // In a production app this would go to a dedicated sail_measurements table
            try await SupabaseManager.shared.client
                .from("equipment")
                .update(["notes": "SAIL_MEASUREMENT:\(jsonString)"])
                .eq("id", value: equipmentId.uuidString)
                .execute()

            withAnimation { showSaved = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                dismiss()
            }
        } catch {
            print("Save sail measurement error: \(error)")
        }

        isSaving = false
    }
}

// MARK: - Sail Type Picker (used in EquipmentScreen)

struct SailTypePicker: View {
    let equipmentId: UUID
    let boatName: String
    @Environment(\.dismiss) var dismiss
    @State private var selectedSailType: SailType?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Wähle den Segeltyp für das Maßblatt:")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ForEach(SailType.allCases) { type in
                    Button {
                        selectedSailType = type
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: type.icon)
                                .font(.title2)
                                .foregroundStyle(AppColors.primary)
                                .frame(width: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(type.rawValue)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text(sailTypeDescription(type))
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
            .navigationTitle("Segeltyp wählen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Abbrechen") { dismiss() }
                }
            }
            .sheet(item: $selectedSailType) { type in
                SailMeasurementFormView(sailType: type, equipmentId: equipmentId, boatName: boatName)
            }
        }
    }

    private func sailTypeDescription(_ type: SailType) -> String {
        switch type {
        case .grosssegel: return "Rigg, Segel, Reff, Mastrutscher"
        case .vorsegel: return "Vorstag, Schiene, Rollreff, UV-Schutz"
        case .gennaker: return "Luff, Leech, Foot, Material"
        case .code0: return "Luff, Leech, Foot, Furler"
        }
    }
}
