//
//  SailMeasurementFields.swift
//  Skipily
//
//  Wiederverwendbare Messblatt-Felder (allgemeine + typ-spezifische Sektionen).
//  Genutzt vom eigenstaendigen SailMeasurementFormView UND inline im
//  Ausruestungs-Formular (AddEditEquipmentView), damit das Segelmessblatt wie
//  die Tauwerk-Konfiguration direkt im Formular erscheint.
//
//  Rendert nur Form-`Section`s (kein eigener Form/NavigationStack) und bindet
//  an eine externe `SailMeasurement`. Speichern/Laden liegt beim jeweiligen
//  Eltern-View.
//

import SwiftUI

struct SailMeasurementFields: View {
    @Binding var measurement: SailMeasurement
    let sailType: SailType

    var body: some View {
        // Allgemein
        Section("sail.section_general".loc) {
            TextField("sail.f.sail_number".loc, text: $measurement.sailNumber)
            // Segelflaeche mit Einheiten-Wahl (m2 / Quadratfuss).
            HStack {
                TextField("sail.f.area".loc, text: $measurement.area)
                    .keyboardType(.decimalPad)
                Picker("", selection: $measurement.areaUnit) {
                    Text("m²").tag("m2")
                    Text("sq ft").tag("sqft")
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            TextField("sail.f.notes".loc, text: $measurement.notes, axis: .vertical)
                .lineLimit(3...6)
        }

        // Typ-spezifisch
        switch sailType {
        case .grosssegel: grosssegelForm
        case .vorsegel:   vorsegelForm
        case .gennaker:   gennakerForm
        case .code0:      code0Form
        case .other:      EmptyView()
        }
    }

    // MARK: - Großsegel

    @ViewBuilder
    private var grosssegelForm: some View {
        Section("sail.section_rigg".loc) {
            measureField("sail.f.luff_p".loc, value: $measurement.gs_P, unit: "cm")
            measureField("sail.f.foot_e".loc, value: $measurement.gs_E, unit: "cm")
            measureField("sail.f.mast_to_backstay".loc, value: $measurement.gs_E1, unit: "cm")
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

    // MARK: - Vorsegel

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

    // MARK: - Gennaker

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

    // MARK: - Code 0

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

    // MARK: - Helper

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
}
