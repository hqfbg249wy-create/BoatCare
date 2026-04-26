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
    /// Sammelfall für Sturmsegel, Spinnaker, exotische Vorsegel etc.
    /// Nutzt nicht das Maßblatt, sondern das generische Equipment-Formular.
    case other = "Anderes Segel"

    var id: String { rawValue }

    /// Lokalisierter Anzeigename — rawValue bleibt deutsch (DB-Mapping)
    var displayName: String {
        switch self {
        case .grosssegel: return "sail.type.grosssegel".loc
        case .vorsegel:   return "sail.type.vorsegel".loc
        case .gennaker:   return "sail.type.gennaker".loc
        case .code0:      return "sail.type.code0".loc
        case .other:      return "sail.type.other".loc
        }
    }

    var icon: String {
        switch self {
        case .grosssegel: return "wind"
        case .vorsegel: return "sailboat.fill"
        case .gennaker: return "wind.circle.fill"
        case .code0: return "wind.circle"
        case .other: return "ellipsis.circle.fill"
        }
    }

    /// Hat dieser Segeltyp ein vordefiniertes Maßblatt?
    /// `false` → User wird zur generischen Equipment-Eingabe geleitet.
    var hasMeasurementSheet: Bool { self != .other }
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
        case id
        case equipmentId = "equipment_id"
        case sailType = "sail_type"
        case date
        case sailNumber = "sail_number"
        case notes
        // Großsegel
        case gs_P = "gs_p"
        case gs_E = "gs_e"
        case gs_E1 = "gs_e1"
        case gs_A = "gs_a"
        case gs_G = "gs_g"
        case gs_AL = "gs_al"
        case gs_RB = "gs_rb"
        case gs_RU = "gs_ru"
        case gs_CB = "gs_cb"
        case gs_CU = "gs_cu"
        case gs_R1 = "gs_r1"
        case gs_R2 = "gs_r2"
        case gs_unterliekstau, gs_vorliekstau, gs_schothornrutscher, gs_mastrutscher
        case gs_einleinenreff
        case gs_weicherFussteil = "gs_weicher_fussteil"
        case gs_losesUnterliek = "gs_loses_unterliek"
        case gs_segelzeichen, gs_segelnummer, gs_farbe
        // Vorsegel
        case vs_I = "vs_i"
        case vs_I2 = "vs_i2"
        case vs_VST = "vs_vst"
        case vs_J = "vs_j"
        case vs_J2 = "vs_j2"
        case vs_VL = "vs_vl"
        case vs_AL1 = "vs_al1"
        case vs_AL2 = "vs_al2"
        case vs_T1 = "vs_t1"
        case vs_T2 = "vs_t2"
        case vs_W = "vs_w"
        case vs_Q = "vs_q"
        case vs_K = "vs_k"
        case vs_H = "vs_h"
        case vs_reffanlage, vs_vorliekstau
        case vs_rollreff, vs_fenster
        case vs_uvSchutz = "vs_uv_schutz"
        case vs_position, vs_farbe
        // Gennaker/Code0
        case gk_luffLength = "gk_luff_length"
        case gk_leechLength = "gk_leech_length"
        case gk_footLength = "gk_foot_length"
        case gk_midWidth = "gk_mid_width"
        case gk_tackHeight = "gk_tack_height"
        case gk_material, gk_farbe
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
                                Text("\("sail.form_title".loc) \(sailType.displayName)")
                                    .font(.headline)
                                Text(boatName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Text("sail.all_in_cm".loc)
                            .font(.caption2)
                            .foregroundStyle(AppColors.gray400)
                    }
                }

                // Common
                Section("sail.section_general".loc) {
                    TextField("sail.f.sail_number".loc, text: $measurement.sailNumber)
                    TextField("sail.f.notes".loc, text: $measurement.notes, axis: .vertical)
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
                case .other:
                    // SailMeasurementFormView wird für .other gar nicht
                    // aufgerufen — der Flow routet auf AddEditEquipmentView.
                    // Sicherheitshalber EmptyView, falls doch.
                    EmptyView()
                case .code0:
                    code0Form
                }
            }
            .navigationTitle("sail.form_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await saveMeasurement() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("general.save".loc).fontWeight(.semibold)
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .overlay(alignment: .top) {
                if showSaved {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("sail.saved".loc)
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
        .task { await loadExistingMeasurement() }
    }

    // MARK: - Großsegel Form

    @ViewBuilder
    private var grosssegelForm: some View {
        Section("sail.section_rigg".loc) {
            measureField("sail.f.luff_p".loc, value: $measurement.gs_P, unit: "cm")
            measureField("sail.f.foot_e".loc, value: $measurement.gs_E, unit: "cm")
            measureField("sail.f.mast_to_backstay".loc, value: $measurement.gs_E1, unit: "cm")
            measureField("sail.f.boom_to_feeder".loc, value: $measurement.gs_A, unit: "cm")
            measureField("sail.f.crutch_g".loc, value: $measurement.gs_G, unit: "cm")
            measureField("sail.f.halyard_to_boom_al".loc, value: $measurement.gs_AL, unit: "cm")
        }

        Section("sail.section_sail".loc) {
            measureField("sail.f.boom_to_feeder".loc, value: $measurement.gs_A, unit: "cm")
            measureField("sail.f.mast_to_reefhook_rb".loc, value: $measurement.gs_RB, unit: "cm")
            measureField("sail.f.boom_to_reefhook_ru".loc, value: $measurement.gs_RU, unit: "cm")
            measureField("sail.f.mast_to_attach_cb".loc, value: $measurement.gs_CB, unit: "cm")
            measureField("sail.f.boom_to_attach_cu".loc, value: $measurement.gs_CU, unit: "cm")
        }

        Section("sail.section_details".loc) {
            measureField("sail.f.boom_to_reef1_r1".loc, value: $measurement.gs_R1, unit: "cm")
            measureField("sail.f.boom_to_reef2_r2".loc, value: $measurement.gs_R2, unit: "cm")
            measureField("sail.f.foot_tape".loc, value: $measurement.gs_unterliekstau, unit: "mm")
            measureField("sail.f.luff_tape".loc, value: $measurement.gs_vorliekstau, unit: "mm")
            measureField("sail.f.clew_slide".loc, value: $measurement.gs_schothornrutscher, unit: "mm")
            TextField("sail.f.mast_slide".loc, text: $measurement.gs_mastrutscher)
        }

        Section("sail.section_extras".loc) {
            Toggle("sail.f.single_line_reef".loc, isOn: $measurement.gs_einleinenreff)
            Toggle("sail.soft_foot".loc, isOn: $measurement.gs_weicherFussteil)
            Toggle("sail.loose_foot".loc, isOn: $measurement.gs_losesUnterliek)
            Toggle("sail.f.sail_logo".loc, isOn: $measurement.gs_segelzeichen)
            Toggle("sail.f.sail_number_extra".loc, isOn: $measurement.gs_segelnummer)
            Picker("sail.f.color".loc, selection: $measurement.gs_farbe) {
                Text("sail.color_black".loc).tag("schwarz")
                Text("sail.color_grey".loc).tag("grau")
                Text("sail.color_blue".loc).tag("blau")
                Text("sail.color_red".loc).tag("rot")
                Text("sail.color_white".loc).tag("weiss")
            }
        }
    }

    // MARK: - Vorsegel Form

    @ViewBuilder
    private var vorsegelForm: some View {
        Section("sail.section_rigg".loc) {
            measureField("sail.f.fore_attach_i".loc, value: $measurement.vs_I, unit: "cm")
            measureField("sail.f.top_halyard_i2".loc, value: $measurement.vs_I2, unit: "cm")
            measureField("sail.f.forestay_len_vst".loc, value: $measurement.vs_VST, unit: "cm")
            measureField("sail.f.fore_to_mast_j".loc, value: $measurement.vs_J, unit: "cm")
            measureField("sail.f.bowsprit_to_mast_j2".loc, value: $measurement.vs_J2, unit: "cm")
        }

        Section("sail.section_sail".loc) {
            measureField("sail.f.luff_len_vl".loc, value: $measurement.vs_VL, unit: "cm")
            measureField("sail.f.halyard_car_start".loc, value: $measurement.vs_AL1, unit: "cm")
            measureField("sail.f.halyard_car_end".loc, value: $measurement.vs_AL2, unit: "cm")
            measureField("sail.f.forestay_start_t1".loc, value: $measurement.vs_T1, unit: "cm")
            measureField("sail.f.forestay_end_t2".loc, value: $measurement.vs_T2, unit: "cm")
            measureField("sail.f.forestay_to_shroud_w".loc, value: $measurement.vs_W, unit: "cm")
            measureField("sail.f.attach_height_q".loc, value: $measurement.vs_Q, unit: "cm")
            measureField("sail.f.clew_height_k".loc, value: $measurement.vs_K, unit: "cm")
        }

        Section("sail.section_details".loc) {
            measureField("sail.f.feeder_height_h".loc, value: $measurement.vs_H, unit: "cm")
            TextField("sail.f.reefing_system".loc, text: $measurement.vs_reffanlage)
            measureField("sail.f.luff_tape".loc, value: $measurement.vs_vorliekstau, unit: "mm")
        }

        Section("sail.section_extras".loc) {
            Toggle("sail.f.roller_reefing".loc, isOn: $measurement.vs_rollreff)
            Toggle("sail.f.window".loc, isOn: $measurement.vs_fenster)
            Toggle("sail.uv_protection".loc, isOn: $measurement.vs_uvSchutz)
            Picker("sail.f.position".loc, selection: $measurement.vs_position) {
                Text("sail.port".loc).tag("BB")
                Text("sail.starboard".loc).tag("STB")
            }
            Picker("sail.f.color".loc, selection: $measurement.vs_farbe) {
                Text("sail.color_grey".loc).tag("grau")
                Text("sail.color_blue".loc).tag("blau")
                Text("sail.color_white".loc).tag("weiss")
            }
        }
    }

    // MARK: - Gennaker Form

    @ViewBuilder
    private var gennakerForm: some View {
        Section("sail.section_dimensions".loc) {
            measureField("sail.f.luff_length".loc, value: $measurement.gk_luffLength, unit: "cm")
            measureField("sail.f.leech_length".loc, value: $measurement.gk_leechLength, unit: "cm")
            measureField("sail.f.foot_length".loc, value: $measurement.gk_footLength, unit: "cm")
            measureField("sail.f.mid_width".loc, value: $measurement.gk_midWidth, unit: "cm")
            measureField("sail.f.tack_height".loc, value: $measurement.gk_tackHeight, unit: "cm")
        }

        Section("sail.section_details".loc) {
            TextField("sail.f.material".loc, text: $measurement.gk_material)
            TextField("sail.f.color_design".loc, text: $measurement.gk_farbe)
        }
    }

    // MARK: - Code 0 Form

    @ViewBuilder
    private var code0Form: some View {
        Section("sail.section_dimensions".loc) {
            measureField("sail.f.luff_length".loc, value: $measurement.gk_luffLength, unit: "cm")
            measureField("sail.f.leech_length".loc, value: $measurement.gk_leechLength, unit: "cm")
            measureField("sail.f.foot_length".loc, value: $measurement.gk_footLength, unit: "cm")
            measureField("sail.f.mid_width".loc, value: $measurement.gk_midWidth, unit: "cm")
            measureField("sail.f.tack_height".loc, value: $measurement.gk_tackHeight, unit: "cm")
        }

        Section("sail.section_rigg_connect".loc) {
            measureField("sail.f.fore_attach_i".loc, value: $measurement.vs_I, unit: "cm")
            measureField("sail.f.bowsprit_to_mast_j2".loc, value: $measurement.vs_J2, unit: "cm")
        }

        Section("sail.section_details".loc) {
            TextField("sail.f.material".loc, text: $measurement.gk_material)
            Toggle("sail.furler".loc, isOn: $measurement.vs_rollreff)
            TextField("sail.f.color_design".loc, text: $measurement.gk_farbe)
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
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        measurement.date = df.string(from: Date())

        // Map sail type to DB enum value
        switch sailType {
        case .grosssegel: measurement.sailType = "grosssegel"
        case .vorsegel:   measurement.sailType = "vorsegel"
        case .gennaker:   measurement.sailType = "gennaker"
        case .code0:      measurement.sailType = "code0"
        case .other:      measurement.sailType = "other"
        }
        measurement.equipmentId = equipmentId

        do {
            // Check if measurement already exists for this equipment
            let existing: [SailMeasurement] = try await SupabaseManager.shared.client
                .from("sail_measurements")
                .select()
                .eq("equipment_id", value: equipmentId.uuidString)
                .execute()
                .value

            if let existingMeasurement = existing.first {
                // Update existing — keep the DB id
                measurement.id = existingMeasurement.id
                try await SupabaseManager.shared.client
                    .from("sail_measurements")
                    .update(measurement)
                    .eq("id", value: existingMeasurement.id.uuidString)
                    .execute()
            } else {
                // Insert new
                try await SupabaseManager.shared.client
                    .from("sail_measurements")
                    .insert(measurement)
                    .execute()
            }

            withAnimation { showSaved = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                dismiss()
            }
        } catch {
            AppLog.error("Save sail measurement error: \(error)")
        }

        isSaving = false
    }

    private func loadExistingMeasurement() async {
        do {
            let results: [SailMeasurement] = try await SupabaseManager.shared.client
                .from("sail_measurements")
                .select()
                .eq("equipment_id", value: equipmentId.uuidString)
                .execute()
                .value

            if let existing = results.first {
                await MainActor.run {
                    measurement = existing
                }
            }
        } catch {
            AppLog.error("Load sail measurement error: \(error)")
        }
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
                    Text("sail.select_type".loc)
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
                                Text(type.displayName)
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
            .navigationTitle("sail.select_type_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
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
        case .other: return "sail.type.other_hint".loc
        }
    }
}
