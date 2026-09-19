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

    /// DB-Enum-Wert fuer sail_measurements.sail_type.
    var dbValue: String {
        switch self {
        case .grosssegel: return "grosssegel"
        case .vorsegel:   return "vorsegel"
        case .gennaker:   return "gennaker"
        case .code0:      return "code0"
        case .other:      return "other"
        }
    }

    /// Aus dem DB-Enum-Wert zurueck auf den SailType.
    static func fromDBValue(_ v: String?) -> SailType {
        switch v {
        case "grosssegel": return .grosssegel
        case "vorsegel":   return .vorsegel
        case "gennaker":   return .gennaker
        case "code0":      return .code0
        default:            return .other
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
    // Segelflaeche + Einheit (m2 oder sqft) — in anderen Laendern wird die
    // Flaeche in Quadratfuss angegeben.
    var area: String = ""
    var areaUnit: String = "m2"   // "m2" | "sqft"

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
        case area
        case areaUnit = "area_unit"
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

    // MARK: - Codable mit String<->NUMERIC Bridging
    //
    // Die DB hat alle Maße als NUMERIC(10,2) — Swift hält sie als String,
    // damit das Form direkt mit TextField bindet. Ohne Custom-Codable
    // würde die DB jeden Insert mit String-Maßen ablehnen ("invalid
    // input syntax for type numeric: \"\"").
    //
    // Lösung: Beim Encoding String → Double|null; beim Decoding
    // Double|null → String. Beide Richtungen kennen die Liste der
    // numerischen Felder (NUMERIC_KEYS).

    private static let numericKeys: Set<CodingKeys> = [
        .gs_P, .gs_E, .gs_E1, .gs_A, .gs_G, .gs_AL,
        .gs_RB, .gs_RU, .gs_CB, .gs_CU, .gs_R1, .gs_R2,
        .vs_I, .vs_I2, .vs_VST, .vs_J, .vs_J2,
        .vs_VL, .vs_AL1, .vs_AL2, .vs_T1, .vs_T2,
        .vs_W, .vs_Q, .vs_K, .vs_H,
        .gk_luffLength, .gk_leechLength, .gk_footLength,
        .gk_midWidth, .gk_tackHeight,
        .area
    ]

    init() {
        self.equipmentId = UUID()
        self.sailType = "grosssegel"
    }

    /// Convenience-Init für neue Maßblätter ohne DB-Backing.
    init(equipmentId: UUID, sailType: String) {
        self.equipmentId = equipmentId
        self.sailType = sailType
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = (try? c.decode(UUID.self, forKey: .id)) ?? UUID()
        self.equipmentId = try c.decode(UUID.self, forKey: .equipmentId)
        self.sailType = try c.decode(String.self, forKey: .sailType)
        self.date = try? c.decode(String.self, forKey: .date)
        self.sailNumber = (try? c.decode(String.self, forKey: .sailNumber)) ?? ""
        self.notes = (try? c.decode(String.self, forKey: .notes)) ?? ""
        self.areaUnit = (try? c.decode(String.self, forKey: .areaUnit)) ?? "m2"

        // Numeric fields: Double|null → String
        func num(_ k: CodingKeys) -> String {
            if let d = try? c.decode(Double.self, forKey: k) {
                return d.truncatingRemainder(dividingBy: 1) == 0
                    ? String(Int(d))
                    : String(format: "%.2f", d)
            }
            return ""
        }
        self.gs_P = num(.gs_P); self.gs_E = num(.gs_E); self.gs_E1 = num(.gs_E1)
        self.gs_A = num(.gs_A); self.gs_G = num(.gs_G); self.gs_AL = num(.gs_AL)
        self.gs_RB = num(.gs_RB); self.gs_RU = num(.gs_RU)
        self.gs_CB = num(.gs_CB); self.gs_CU = num(.gs_CU)
        self.gs_R1 = num(.gs_R1); self.gs_R2 = num(.gs_R2)
        self.vs_I = num(.vs_I); self.vs_I2 = num(.vs_I2); self.vs_VST = num(.vs_VST)
        self.vs_J = num(.vs_J); self.vs_J2 = num(.vs_J2)
        self.vs_VL = num(.vs_VL)
        self.vs_AL1 = num(.vs_AL1); self.vs_AL2 = num(.vs_AL2)
        self.vs_T1 = num(.vs_T1); self.vs_T2 = num(.vs_T2)
        self.vs_W = num(.vs_W); self.vs_Q = num(.vs_Q); self.vs_K = num(.vs_K)
        self.vs_H = num(.vs_H)
        self.gk_luffLength = num(.gk_luffLength)
        self.gk_leechLength = num(.gk_leechLength)
        self.gk_footLength = num(.gk_footLength)
        self.gk_midWidth = num(.gk_midWidth)
        self.gk_tackHeight = num(.gk_tackHeight)

        // String / TEXT fields
        self.gs_unterliekstau   = (try? c.decode(String.self, forKey: .gs_unterliekstau)) ?? ""
        self.gs_vorliekstau     = (try? c.decode(String.self, forKey: .gs_vorliekstau)) ?? ""
        self.gs_schothornrutscher = (try? c.decode(String.self, forKey: .gs_schothornrutscher)) ?? ""
        self.gs_mastrutscher    = (try? c.decode(String.self, forKey: .gs_mastrutscher)) ?? ""
        self.gs_farbe           = (try? c.decode(String.self, forKey: .gs_farbe)) ?? "weiss"
        self.vs_reffanlage      = (try? c.decode(String.self, forKey: .vs_reffanlage)) ?? ""
        self.vs_vorliekstau     = (try? c.decode(String.self, forKey: .vs_vorliekstau)) ?? ""
        self.vs_position        = (try? c.decode(String.self, forKey: .vs_position)) ?? "BB"
        self.vs_farbe           = (try? c.decode(String.self, forKey: .vs_farbe)) ?? "weiss"
        self.gk_material        = (try? c.decode(String.self, forKey: .gk_material)) ?? ""
        self.gk_farbe           = (try? c.decode(String.self, forKey: .gk_farbe)) ?? ""

        self.area = num(.area)

        // Bool flags
        self.gs_einleinenreff   = (try? c.decode(Bool.self, forKey: .gs_einleinenreff)) ?? false
        self.gs_weicherFussteil = (try? c.decode(Bool.self, forKey: .gs_weicherFussteil)) ?? false
        self.gs_losesUnterliek  = (try? c.decode(Bool.self, forKey: .gs_losesUnterliek)) ?? false
        self.gs_segelzeichen    = (try? c.decode(Bool.self, forKey: .gs_segelzeichen)) ?? false
        self.gs_segelnummer     = (try? c.decode(Bool.self, forKey: .gs_segelnummer)) ?? false
        self.vs_rollreff        = (try? c.decode(Bool.self, forKey: .vs_rollreff)) ?? false
        self.vs_fenster         = (try? c.decode(Bool.self, forKey: .vs_fenster)) ?? false
        self.vs_uvSchutz        = (try? c.decode(Bool.self, forKey: .vs_uvSchutz)) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(equipmentId, forKey: .equipmentId)
        try c.encode(sailType, forKey: .sailType)
        try c.encodeIfPresent(date, forKey: .date)
        try c.encode(sailNumber, forKey: .sailNumber)
        try c.encode(notes, forKey: .notes)
        try c.encode(areaUnit, forKey: .areaUnit)

        // Numeric: leerer String → null, sonst als Double
        func putNum(_ s: String, _ k: CodingKeys) throws {
            let trimmed = s.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
            if let d = Double(trimmed) {
                try c.encode(d, forKey: k)
            } else {
                try c.encodeNil(forKey: k)
            }
        }
        try putNum(gs_P, .gs_P);  try putNum(gs_E, .gs_E);  try putNum(gs_E1, .gs_E1)
        try putNum(gs_A, .gs_A);  try putNum(gs_G, .gs_G);  try putNum(gs_AL, .gs_AL)
        try putNum(gs_RB, .gs_RB); try putNum(gs_RU, .gs_RU)
        try putNum(gs_CB, .gs_CB); try putNum(gs_CU, .gs_CU)
        try putNum(gs_R1, .gs_R1); try putNum(gs_R2, .gs_R2)
        try putNum(vs_I, .vs_I);  try putNum(vs_I2, .vs_I2); try putNum(vs_VST, .vs_VST)
        try putNum(vs_J, .vs_J);  try putNum(vs_J2, .vs_J2)
        try putNum(vs_VL, .vs_VL)
        try putNum(vs_AL1, .vs_AL1); try putNum(vs_AL2, .vs_AL2)
        try putNum(vs_T1, .vs_T1);  try putNum(vs_T2, .vs_T2)
        try putNum(vs_W, .vs_W);    try putNum(vs_Q, .vs_Q);  try putNum(vs_K, .vs_K)
        try putNum(vs_H, .vs_H)
        try putNum(gk_luffLength, .gk_luffLength)
        try putNum(gk_leechLength, .gk_leechLength)
        try putNum(gk_footLength, .gk_footLength)
        try putNum(gk_midWidth, .gk_midWidth)
        try putNum(gk_tackHeight, .gk_tackHeight)
        try putNum(area, .area)

        // Strings
        try c.encode(gs_unterliekstau, forKey: .gs_unterliekstau)
        try c.encode(gs_vorliekstau, forKey: .gs_vorliekstau)
        try c.encode(gs_schothornrutscher, forKey: .gs_schothornrutscher)
        try c.encode(gs_mastrutscher, forKey: .gs_mastrutscher)
        try c.encode(gs_farbe, forKey: .gs_farbe)
        try c.encode(vs_reffanlage, forKey: .vs_reffanlage)
        try c.encode(vs_vorliekstau, forKey: .vs_vorliekstau)
        try c.encode(vs_position, forKey: .vs_position)
        try c.encode(vs_farbe, forKey: .vs_farbe)
        try c.encode(gk_material, forKey: .gk_material)
        try c.encode(gk_farbe, forKey: .gk_farbe)

        // Bools
        try c.encode(gs_einleinenreff, forKey: .gs_einleinenreff)
        try c.encode(gs_weicherFussteil, forKey: .gs_weicherFussteil)
        try c.encode(gs_losesUnterliek, forKey: .gs_losesUnterliek)
        try c.encode(gs_segelzeichen, forKey: .gs_segelzeichen)
        try c.encode(gs_segelnummer, forKey: .gs_segelnummer)
        try c.encode(vs_rollreff, forKey: .vs_rollreff)
        try c.encode(vs_fenster, forKey: .vs_fenster)
        try c.encode(vs_uvSchutz, forKey: .vs_uvSchutz)
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

                // Allgemeine + typ-spezifische Messblatt-Felder (wiederverwendbar,
                // auch inline im Ausruestungs-Formular genutzt).
                SailMeasurementFields(measurement: $measurement, sailType: sailType)
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
