//
//  EquipmentImportSheet.swift
//  Skipily
//
//  Import einer Excel-/CSV-Datei (Ausrüstung + Segelmessblatt + Tauwerk) für
//  EIN Boot. Zeigt eine Vorschau mit Duplikat-Erkennung (grün = neu, gelb =
//  bereits vorhanden → wird übersprungen, Historie bleibt erhalten) und
//  schreibt nach Bestätigung über die Edge Function `import-equipment-xlsx`.
//

import SwiftUI
import UniformTypeIdentifiers

struct EquipmentImportSheet: View {
    let boatId: UUID
    let boatName: String
    var onImported: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var showingPicker = false
    @State private var fileName = ""
    @State private var fileBase64: String?
    @State private var preview: EquipmentImportService.PreviewResponse?
    @State private var result: EquipmentImportService.Summary?
    @State private var busy = false
    @State private var errorMessage: String?
    /// Konfliktauflösung pro Zeile (key → action). Vorbelegt: exakt=merge, ähnlich=offen.
    @State private var decisions: [String: String] = [:]

    private var allowedTypes: [UTType] {
        var types: [UTType] = [.commaSeparatedText, .spreadsheet]
        if let xlsx = UTType(filenameExtension: "xlsx") { types.insert(xlsx, at: 0) }
        return types
    }

    var body: some View {
        NavigationStack {
            Group {
                if let result {
                    resultView(result)
                } else {
                    formView
                }
            }
            .navigationTitle("equip.import.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("equip.import.close".loc) { dismiss() }
                }
            }
            .fileImporter(isPresented: $showingPicker, allowedContentTypes: allowedTypes) { res in
                handlePicked(res)
            }
        }
    }

    // MARK: - Formular / Vorschau

    private var formView: some View {
        List {
            Section {
                Text(String(format: "equip.import.intro".loc, boatName))
                    .font(.subheadline).foregroundStyle(.secondary)
                Button {
                    showingPicker = true
                } label: {
                    Label(fileName.isEmpty ? "equip.import.pick".loc : fileName,
                          systemImage: "tray.and.arrow.down")
                }
            }

            if busy && preview == nil {
                Section { HStack { ProgressView(); Text("equip.import.reading".loc).foregroundStyle(.secondary) } }
            }

            if let p = preview {
                Section("equip.import.summary".loc) {
                    summaryRow("equip.import.new".loc, "\(p.summary.equipmentNew)", .green)
                    if let u = p.summary.equipmentUpdated, u > 0 { summaryRow("equip.import.updated".loc, "\(u)", .blue) }
                    if p.summary.sails > 0 { summaryRow("equip.import.sails".loc, "\(p.summary.sails)", .green) }
                    if p.summary.ropes > 0 { summaryRow("equip.import.ropes".loc, "\(p.summary.ropes)", .green) }
                    if p.summary.unlinked > 0 { summaryRow("equip.import.unlinked".loc, "\(p.summary.unlinked)", .orange) }
                }

                if !p.equipment.isEmpty {
                    Section("equip.import.equipment".loc) {
                        ForEach(p.equipment) { e in equipmentRow(e) }
                    }
                }

                if !p.ropes.isEmpty || !p.sails.isEmpty {
                    Section("equip.import.linkSection".loc) {
                        ForEach(p.sails) { s in linkRow(s.equipment, String(format: "equip.import.sailPrefix".loc, s.sailType), s.linked) }
                        ForEach(p.ropes) { r in linkRow(r.equipment, "equip.import.ropes".loc + (r.articleNumber.map { " · \($0)" } ?? ""), r.linked) }
                    }
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
            }

            if preview != nil {
                Section {
                    if unresolvedFuzzy {
                        Text("equip.import.resolveFirst".loc)
                            .font(.caption).foregroundStyle(.orange)
                    }
                    Button {
                        Task { await doCommit() }
                    } label: {
                        HStack {
                            if busy { ProgressView().padding(.trailing, 4) }
                            Text(busy ? "equip.import.importing".loc : "equip.import.import".loc)
                        }
                    }
                    .disabled(busy || unresolvedFuzzy)
                }
            }
        }
    }

    // MARK: - Zeile mit Konfliktauflösung

    /// exakter Treffer → Default „Zusammenführen" (änderbar); ähnlicher Treffer →
    /// Wahl erzwungen; kein Treffer → neu (grün, keine Auswahl).
    @ViewBuilder
    private func equipmentRow(_ e: EquipmentImportService.EqPreview) -> some View {
        let type = e.matchType ?? (e.dup ? "exact" : "none")
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: type == "none" ? "checkmark.circle.fill" : "arrow.triangle.2.circlepath.circle.fill")
                    .foregroundStyle(type == "none" ? .green : (type == "fuzzy" ? .orange : .blue))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(e.name).font(.subheadline).fontWeight(.medium)
                        if let q = e.quantity, q > 1 { Text("×\(q)").font(.caption).foregroundStyle(.secondary) }
                    }
                    if type == "none" {
                        if let s = e.serialNumber, !s.isEmpty {
                            Text(String(format: "equip.import.serial".loc, s)).font(.caption).foregroundStyle(.secondary)
                        }
                    } else {
                        Text(matchText(e, type: type))
                            .font(.caption).foregroundStyle(type == "fuzzy" ? .orange : .secondary)
                    }
                }
            }
            if type != "none", let key = e.key {
                Picker("equip.import.chooseAction".loc,
                       selection: actionBinding(key: key, defaultAction: type == "exact" ? "merge" : "")) {
                    if type == "fuzzy" { Text("equip.import.chooseAction".loc).tag("") }
                    Text("equip.import.action.merge".loc).tag("merge")
                    Text("equip.import.action.replace".loc).tag("replace")
                    Text("equip.import.action.addStock".loc).tag("add_stock")
                    Text("equip.import.action.new".loc).tag("new")
                }
                .pickerStyle(.menu)
                .font(.caption)
            }
        }
    }

    private func matchText(_ e: EquipmentImportService.EqPreview, type: String) -> String {
        let m = e.matchedName ?? ""
        if type == "fuzzy" { return String(format: "equip.import.fuzzyMatch".loc, m) }
        return String(format: "equip.import.exactMatch".loc, m)
    }

    private func actionBinding(key: String, defaultAction: String) -> Binding<String> {
        Binding(get: { decisions[key] ?? defaultAction },
                set: { decisions[key] = $0 })
    }

    /// Es gibt noch ähnliche Treffer ohne getroffene Wahl.
    private var unresolvedFuzzy: Bool {
        guard let p = preview else { return false }
        return p.equipment.contains { $0.matchType == "fuzzy" && (decisions[$0.key ?? ""] ?? "").isEmpty }
    }

    private func summaryRow(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack { Text(label); Spacer(); Text(value).fontWeight(.semibold).foregroundStyle(color) }
    }

    private func linkRow(_ equipment: String, _ detail: String, _ linked: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: linked ? "link.circle.fill" : "questionmark.circle.fill")
                .foregroundStyle(linked ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(equipment).font(.subheadline)
                Text(linked ? detail : "\(detail) · " + "equip.import.noMatch".loc)
                    .font(.caption).foregroundStyle(linked ? Color.secondary : Color.orange)
            }
        }
    }

    // MARK: - Ergebnis

    private func resultView(_ s: EquipmentImportService.Summary) -> some View {
        List {
            Section {
                Label("equip.import.doneTitle".loc, systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green).font(.headline)
                summaryRow("equip.import.equipmentNew".loc, "\(s.equipmentNew)", .green)
                if let u = s.equipmentUpdated, u > 0 { summaryRow("equip.import.updated".loc, "\(u)", .blue) }
                if let st = s.equipmentStock, st > 0 { summaryRow("equip.import.stockAdded".loc, "\(st)", .blue) }
                if s.sails > 0 { summaryRow("equip.import.sails".loc, "\(s.sails)", .green) }
                if s.ropes > 0 { summaryRow("equip.import.ropes".loc, "\(s.ropes)", .green) }
                if s.unlinked > 0 { summaryRow("equip.import.unlinked".loc, "\(s.unlinked)", .orange) }
            }
            Section {
                Button("equip.import.done".loc) { onImported(); dismiss() }
            }
        }
    }

    // MARK: - Aktionen

    private func handlePicked(_ res: Result<URL, Error>) {
        errorMessage = nil
        switch res {
        case .failure(let e):
            errorMessage = e.localizedDescription
        case .success(let url):
            fileName = url.lastPathComponent
            Task { await loadPreview(url) }
        }
    }

    private func loadPreview(_ url: URL) async {
        busy = true; preview = nil; errorMessage = nil; decisions = [:]
        do {
            let b64 = try EquipmentImportService.base64(from: url)
            fileBase64 = b64
            let p = try await EquipmentImportService.shared.preview(fileBase64: b64, boatId: boatId)
            preview = p
            // Exakte Treffer mit Default „Zusammenführen" vorbelegen; ähnliche offen lassen.
            var d: [String: String] = [:]
            for e in p.equipment where e.matchType == "exact" { if let k = e.key { d[k] = "merge" } }
            decisions = d
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    private func doCommit() async {
        guard let b64 = fileBase64, let p = preview else { return }
        busy = true; errorMessage = nil
        // Entscheidungen je matchbarer Zeile zusammenstellen.
        let decs: [EquipmentImportService.Decision] = p.equipment.compactMap { e in
            guard let key = e.key else { return nil }
            let action = decisions[key] ?? (e.matchType == "exact" ? "merge" : (e.matchType == "none" ? "new" : ""))
            guard !action.isEmpty else { return nil }
            return .init(key: key, action: action, matchedId: e.matchedId)
        }
        do {
            let res = try await EquipmentImportService.shared.commit(fileBase64: b64, boatId: boatId, decisions: decs)
            result = res.summary
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }
}
