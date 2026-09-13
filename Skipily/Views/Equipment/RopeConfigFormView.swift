//
//  RopeConfigFormView.swift
//  Skipily
//
//  Tauwerk-Konfigurator (Spleiß-/Takelarbeiten), analog zum Segel-Maßblatt an
//  ein Equipment gebunden. Der Nutzer wählt Produkt (Artikelnummer), Länge,
//  Material, Stärke und je Ende eine standardisierte Option. Beim Speichern
//  wird die Artikelnummer gegen den Shop (metashop_products) gematcht — der
//  spätere Kauf/Deal läuft über den Vendorshop (Phase 2), nie per Direkt-Mail.
//

import SwiftUI
import Supabase

// MARK: - Standardisierter Options-Katalog (Basis fürs 1:1-Matching)

enum RopeEndOption: String, CaseIterable, Identifiable {
    case glattAbgeschnitten          = "glatt_abgeschnitten"
    case takling                     = "takling"
    case augspleissIndivMitSchamfil  = "augspleiss_indiv_mit_schamfil"
    case augspleissIndivOhneSchamfil = "augspleiss_indiv_ohne_schamfil"
    case augspleiss35                = "augspleiss_3_5"
    case augspleiss68                = "augspleiss_6_8"
    case augspleiss912               = "augspleiss_9_12"
    case augspleissLowFriction       = "augspleiss_low_friction"
    case augspleissKauschEdelstahl   = "augspleiss_kausch_edelstahl"
    case augspleissKauschVerzinkt    = "augspleiss_kausch_verzinkt"
    case augspleissZubehoer          = "augspleiss_zubehoer"

    var id: String { rawValue }
    var label: String { "rope.end.\(rawValue)".loc }

    /// Individueller Augspleiß → Auglänge (cm) relevant.
    var needsEyeLength: Bool {
        self == .augspleissIndivMitSchamfil || self == .augspleissIndivOhneSchamfil
    }
}

enum RopeMaterial: String, CaseIterable, Identifiable {
    case geschlagen           = "geschlagen"
    case kernMantel           = "kern_mantel"
    case squareline           = "squareline"
    case pesDyneema           = "pes_dyneema"
    case dyneemaHohlgeflecht  = "dyneema_hohlgeflecht"

    var id: String { rawValue }
    var label: String { "rope.material.\(rawValue)".loc }
}

// MARK: - Form View

struct RopeConfigFormView: View {
    let equipmentId: UUID
    let boatName: String
    @Environment(\.dismiss) private var dismiss

    @State private var articleNumber = ""
    @State private var lengthM = ""
    @State private var material = ""
    @State private var diameterMm = ""
    @State private var color = ""
    @State private var end1 = ""
    @State private var end1Eye = ""
    @State private var end2 = ""
    @State private var end2Eye = ""
    @State private var accessoryArticle = ""
    @State private var notes = ""

    @State private var existingId: UUID?
    @State private var isSaving = false
    @State private var statusMessage: String?
    @State private var matchedProductName: String?

    private var end1NeedsEye: Bool { RopeEndOption(rawValue: end1)?.needsEyeLength ?? false }
    private var end2NeedsEye: Bool { RopeEndOption(rawValue: end2)?.needsEyeLength ?? false }
    private var canSave: Bool {
        !articleNumber.trimmingCharacters(in: .whitespaces).isEmpty
            && !lengthM.trimmingCharacters(in: .whitespaces).isEmpty
            && !end1.isEmpty && !end2.isEmpty && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("rope.form_title".loc).font(.headline)
                        Text(boatName).font(.caption).foregroundStyle(.secondary)
                        Text("rope.intro".loc).font(.caption2).foregroundStyle(.secondary)
                    }
                }

                Section("rope.section_product".loc) {
                    TextField("rope.f.article".loc, text: $articleNumber)
                        .autocorrectionDisabled()
                    if let m = matchedProductName {
                        Label(m, systemImage: "checkmark.seal.fill")
                            .font(.caption).foregroundStyle(.green)
                    }
                    // Material als Freitext + Vorschläge → Tauwerk-Arten
                    // lassen sich manuell ergänzen (es gibt mehr als die 5).
                    TextField("rope.f.material".loc, text: $material)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(RopeMaterial.allCases) { m in
                                Button {
                                    material = m.label
                                } label: {
                                    Text(m.label)
                                        .font(.caption)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 5)
                                        .background(material == m.label ? AppColors.primary.opacity(0.15) : Color(.systemGray6))
                                        .foregroundStyle(material == m.label ? AppColors.primary : .secondary)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 8))
                    measureField("rope.f.length".loc, value: $lengthM, unit: "m")
                    measureField("rope.f.diameter".loc, value: $diameterMm, unit: "mm")
                    TextField("rope.f.color".loc, text: $color)
                }

                Section("rope.section_end1".loc) {
                    endPicker(selection: $end1)
                    if end1NeedsEye {
                        measureField("rope.f.eye_length".loc, value: $end1Eye, unit: "cm")
                    }
                }

                Section("rope.section_end2".loc) {
                    endPicker(selection: $end2)
                    if end2NeedsEye {
                        measureField("rope.f.eye_length".loc, value: $end2Eye, unit: "cm")
                    }
                }

                Section("rope.section_accessory".loc) {
                    TextField("rope.f.accessory_article".loc, text: $accessoryArticle)
                        .autocorrectionDisabled()
                    TextField("rope.f.notes".loc, text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                if let msg = statusMessage {
                    Section { Text(msg).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("rope.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving { ProgressView() } else { Text("rope.submit".loc).fontWeight(.semibold) }
                    }
                    .disabled(!canSave)
                }
            }
            .task { await loadExisting() }
        }
    }

    private func endPicker(selection: Binding<String>) -> some View {
        Picker("rope.f.end".loc, selection: selection) {
            Text("rope.end.none".loc).tag("")
            ForEach(RopeEndOption.allCases) { Text($0.label).tag($0.rawValue) }
        }
    }

    private func measureField(_ label: String, value: Binding<String>, unit: String) -> some View {
        HStack {
            Text(label).font(.subheadline).lineLimit(2)
            Spacer()
            TextField("0", text: value)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            Text(unit).font(.caption).foregroundStyle(AppColors.gray400).frame(width: 30)
        }
    }

    // MARK: - Persistence

    private struct RopeRow: Decodable {
        let id: UUID
        let article_number: String?
        let length_m: Double?
        let material: String?
        let diameter_mm: Double?
        let color: String?
        let end1: String?
        let end1_eye_length_cm: Double?
        let end2: String?
        let end2_eye_length_cm: Double?
        let accessory_article_number: String?
        let notes: String?
    }

    private struct RopeUpsert: Encodable {
        let equipment_id: String
        let article_number: String
        let matched_product_id: String?
        let length_m: Double?
        let material: String
        let diameter_mm: Double?
        let color: String
        let end1: String?
        let end1_eye_length_cm: Double?
        let end2: String?
        let end2_eye_length_cm: Double?
        let accessory_article_number: String
        let notes: String
        let status: String
    }

    private func num(_ s: String) -> Double? {
        Double(s.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces))
    }

    private func loadExisting() async {
        do {
            let rows: [RopeRow] = try await SupabaseManager.shared.client
                .from("rope_configurations")
                .select()
                .eq("equipment_id", value: equipmentId.uuidString)
                .order("created_at", ascending: false)
                .limit(1)
                .execute().value
            guard let r = rows.first else { return }
            existingId = r.id
            articleNumber = r.article_number ?? ""
            lengthM = r.length_m.map { fmt($0) } ?? ""
            material = r.material ?? ""
            diameterMm = r.diameter_mm.map { fmt($0) } ?? ""
            color = r.color ?? ""
            end1 = r.end1 ?? ""
            end1Eye = r.end1_eye_length_cm.map { fmt($0) } ?? ""
            end2 = r.end2 ?? ""
            end2Eye = r.end2_eye_length_cm.map { fmt($0) } ?? ""
            accessoryArticle = r.accessory_article_number ?? ""
            notes = r.notes ?? ""
        } catch {
            AppLog.warning("RopeConfig load: \(error)")
        }
    }

    private func fmt(_ d: Double) -> String {
        d.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(d)) : String(format: "%.2f", d)
    }

    /// Kurz-Zusammenfassung der Maße fürs Equipment-Feld `dimensions` — landet in
    /// der Kopfzeile der Ersatzteilsuche. Länge in m, Stärke in mm (Ø).
    private func ropeDimsSummary() -> String {
        var parts: [String] = []
        if let l = num(lengthM) { parts.append("\(fmt(l)) m") }
        if let d = num(diameterMm) { parts.append("Ø \(fmt(d)) mm") }
        return parts.joined(separator: " · ")
    }

    /// Sucht ein Shop-Produkt mit passender Artikelnummer (part_number/sku).
    private func matchProduct() async -> UUID? {
        let art = articleNumber.trimmingCharacters(in: .whitespaces)
        guard !art.isEmpty else { return nil }
        struct P: Decodable { let id: UUID; let name: String }
        do {
            let rows: [P] = try await SupabaseManager.shared.client
                .from("metashop_products")
                .select("id, name")
                .or("part_number.eq.\(art),sku.eq.\(art)")
                .limit(1)
                .execute().value
            if let p = rows.first {
                matchedProductName = p.name
                return p.id
            }
        } catch {
            AppLog.warning("RopeConfig match: \(error)")
        }
        matchedProductName = nil
        return nil
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        let matchedId = await matchProduct()
        // Match → in den Shop-Fluss übergeben; kein Match → als Shop-Angebot ablegen.
        let status = matchedId != nil ? "in_cart" : "offer_requested"

        let payload = RopeUpsert(
            equipment_id: equipmentId.uuidString,
            article_number: articleNumber.trimmingCharacters(in: .whitespaces),
            matched_product_id: matchedId?.uuidString,
            length_m: num(lengthM),
            material: material,
            diameter_mm: num(diameterMm),
            color: color.trimmingCharacters(in: .whitespaces),
            end1: end1.isEmpty ? nil : end1,
            end1_eye_length_cm: end1NeedsEye ? num(end1Eye) : nil,
            end2: end2.isEmpty ? nil : end2,
            end2_eye_length_cm: end2NeedsEye ? num(end2Eye) : nil,
            accessory_article_number: accessoryArticle.trimmingCharacters(in: .whitespaces),
            notes: notes,
            status: status
        )

        do {
            if let id = existingId {
                try await SupabaseManager.shared.client
                    .from("rope_configurations")
                    .update(payload).eq("id", value: id.uuidString).execute()
            } else {
                try await SupabaseManager.shared.client
                    .from("rope_configurations")
                    .insert(payload).execute()
            }

            // Tauwerk-Art als Kategorie + Maße (für die Ersatzteilsuche-Kopfzeile)
            // ans Equipment übernehmen. Länge in m, Stärke in mm.
            var eqUpdate: [String: String] = [:]
            if !material.isEmpty { eqUpdate["rope_type"] = material }
            let dims = ropeDimsSummary()
            if !dims.isEmpty { eqUpdate["dimensions"] = dims }
            if !eqUpdate.isEmpty {
                try? await SupabaseManager.shared.client
                    .from("equipment")
                    .update(eqUpdate)
                    .eq("id", value: equipmentId.uuidString)
                    .execute()
            }

            statusMessage = matchedId != nil ? "rope.saved_matched".loc : "rope.saved_offer".loc
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { dismiss() }
        } catch {
            AppLog.error("RopeConfig save: \(error)")
            statusMessage = "rope.save_error".loc
        }
    }
}
