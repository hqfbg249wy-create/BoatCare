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
                    if p.summary.equipmentSkipped > 0 { summaryRow("equip.import.skipped".loc, "\(p.summary.equipmentSkipped)", .orange) }
                    if p.summary.sails > 0 { summaryRow("equip.import.sails".loc, "\(p.summary.sails)", .green) }
                    if p.summary.ropes > 0 { summaryRow("equip.import.ropes".loc, "\(p.summary.ropes)", .green) }
                    if p.summary.unlinked > 0 { summaryRow("equip.import.unlinked".loc, "\(p.summary.unlinked)", .orange) }
                }

                if !p.equipment.isEmpty {
                    Section("equip.import.equipment".loc) {
                        ForEach(p.equipment) { e in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: e.dup ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                                    .foregroundStyle(e.dup ? .orange : .green)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(e.name).font(.subheadline).fontWeight(.medium)
                                    if e.dup, let r = e.reason {
                                        Text(dupText(reason: r, matched: e.matchedName))
                                            .font(.caption).foregroundStyle(.orange)
                                    } else if let s = e.serialNumber, !s.isEmpty {
                                        Text(String(format: "equip.import.serial".loc, s)).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
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
                    Button {
                        Task { await doCommit() }
                    } label: {
                        HStack {
                            if busy { ProgressView().padding(.trailing, 4) }
                            Text(busy ? "equip.import.importing".loc : "equip.import.import".loc)
                        }
                    }
                    .disabled(busy)
                }
            }
        }
    }

    // Duplikat-Hinweis. Der Grund kommt serverseitig als "Seriennummer"/"Name"
    // (DE) und wird hier lokalisiert; typografische Anführungszeichen (kein ASCII-").
    private func dupText(reason: String, matched: String?) -> String {
        let reasonLoc = reason == "Seriennummer" ? "equip.import.bySerial".loc
                      : reason == "Name" ? "equip.import.byName".loc : reason
        var s = String(format: "equip.import.dupReason".loc, reasonLoc)
        if let m = matched, !m.isEmpty { s += ": \u{201E}\(m)\u{201C}" }
        return s
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
                if s.equipmentSkipped > 0 { summaryRow("equip.import.skipped".loc, "\(s.equipmentSkipped)", .orange) }
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
        busy = true; preview = nil; errorMessage = nil
        do {
            let b64 = try EquipmentImportService.base64(from: url)
            fileBase64 = b64
            preview = try await EquipmentImportService.shared.preview(fileBase64: b64, boatId: boatId)
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    private func doCommit() async {
        guard let b64 = fileBase64 else { return }
        busy = true; errorMessage = nil
        do {
            let res = try await EquipmentImportService.shared.commit(fileBase64: b64, boatId: boatId)
            result = res.summary
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }
}
