//
//  SchematicsScreen.swift
//  Skipily
//
//  Einstieg-Screen "Schaltpläne & Montagepläne" pro Boot.
//  - Liste vorhandener Pläne
//  - Erstellen via KI (Domäne + Freitext)
//  - Detail: Renderer + Validator-Warnings + verknüpfter Montageplan
//

import SwiftUI
import Supabase

struct SchematicsScreen: View {
    let boatID: UUID?
    let boatContext: AIChatBoat?

    @StateObject private var service = SchematicService.shared
    @State private var showCreate = false
    @State private var createMode: CreateMode = .schematic
    /// Boot-Kontext angereichert mit dem aus Supabase geladenen Equipment.
    @State private var enrichedContext: AIChatBoat?
    @State private var loadedEquipment: [EquipmentItem] = []
    @State private var loadingEquipment = false

    enum CreateMode { case schematic, installation }

    private var contextForAI: AIChatBoat? { enrichedContext ?? boatContext }

    var body: some View {
        List {
            if !service.schematics(forBoat: boatID).isEmpty {
                Section("Schaltpläne") {
                    ForEach(service.schematics(forBoat: boatID)) { s in
                        NavigationLink {
                            SchematicDetailView(schematic: s, boatContext: boatContext)
                        } label: {
                            schematicRow(s)
                        }
                    }
                    .onDelete { idx in
                        let items = service.schematics(forBoat: boatID)
                        idx.map { items[$0].id }.forEach(service.delete(schematic:))
                    }
                }
            }

            if !service.plans(forBoat: boatID).isEmpty {
                Section("Montagepläne") {
                    ForEach(service.plans(forBoat: boatID)) { p in
                        NavigationLink {
                            InstallationPlanView(plan: p)
                        } label: {
                            planRow(p)
                        }
                    }
                    .onDelete { idx in
                        let items = service.plans(forBoat: boatID)
                        idx.map { items[$0].id }.forEach(service.delete(plan:))
                    }
                }
            }

            if service.schematics(forBoat: boatID).isEmpty
                && service.plans(forBoat: boatID).isEmpty {
                Section {
                    emptyState
                }
            }
        }
        .navigationTitle("Schaltpläne")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        createMode = .schematic; showCreate = true
                    } label: {
                        Label("Schaltplan generieren", systemImage: "bolt.fill")
                    }
                    Button {
                        createMode = .installation; showCreate = true
                    } label: {
                        Label("Montageplan generieren", systemImage: "wrench.and.screwdriver.fill")
                    }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showCreate) {
            CreatePlanSheet(
                mode: createMode,
                boatID: boatID,
                boatContext: contextForAI,
                availableEquipment: loadedEquipment
            )
        }
        .task { await loadEquipment() }
    }

    /// Lädt das Equipment des Boots aus Supabase via EquipmentItem (selectAll),
    /// damit der AI-Kontext alle Geräte des Boots kennt.
    private func loadEquipment() async {
        guard let boatID, let base = boatContext else { return }
        loadingEquipment = true
        defer { loadingEquipment = false }
        do {
            let items: [EquipmentItem] = try await SupabaseManager.shared.client
                .from("equipment").select()
                .eq("boat_id", value: boatID.uuidString)
                .order("name")
                .execute()
                .value

            self.loadedEquipment = items
            let mapped: [AIChatEquipment] = items.map { e in
                AIChatEquipment(
                    name: e.name,
                    category: e.category,
                    manufacturer: e.manufacturer.isEmpty ? nil : e.manufacturer,
                    model: e.model.isEmpty ? nil : e.model,
                    installationDate: e.installationDate,
                    lastMaintenanceDate: e.lastMaintenanceDate,
                    nextMaintenanceDate: e.nextMaintenanceDate,
                    maintenanceCycleYears: e.maintenanceCycleYears,
                    serialNumber: e.serialNumber.isEmpty ? nil : e.serialNumber,
                    location: e.locationOnBoat.isEmpty ? nil : e.locationOnBoat
                )
            }

            self.enrichedContext = AIChatBoat(
                name: base.name,
                type: base.type,
                manufacturer: base.manufacturer,
                model: base.model,
                year: base.year,
                length: base.length,
                engine: base.engine,
                homePort: base.homePort,
                equipment: mapped
            )
            AppLog.info("SchematicsScreen: \(items.count) Equipment-Einträge geladen.")
        } catch {
            AppLog.error("SchematicsScreen.loadEquipment: \(error)")
        }
    }

    private func schematicRow(_ s: Schematic) -> some View {
        HStack {
            Image(systemName: s.domain.systemImage)
                .foregroundColor(.accentColor)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.title).font(.body)
                Text("\(s.domain.displayName) · \(s.nodes.count) Komponenten")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private func planRow(_ p: InstallationPlan) -> some View {
        HStack {
            Image(systemName: "wrench.and.screwdriver.fill")
                .foregroundColor(.orange)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(p.title).font(.body)
                Text("\(p.steps.count) Schritte · \(p.difficulty.displayName)")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 40))
                .foregroundColor(.accentColor)
            Text("Noch keine Pläne")
                .font(.headline)
            Text("Lass dir per KI einen Schaltplan oder Montageplan für dein Boot generieren — basierend auf deinem Equipment.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button {
                createMode = .schematic; showCreate = true
            } label: {
                Label("Plan generieren", systemImage: "wand.and.stars")
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}

// MARK: - Detail

struct SchematicDetailView: View {
    let schematic: Schematic
    let boatContext: AIChatBoat?

    @StateObject private var service = SchematicService.shared
    @State private var showInstallationSheet = false

    private var issues: [SchematicIssue] {
        SchematicValidator.validate(schematic)
    }

    var body: some View {
        VStack(spacing: 0) {
            disclaimerBanner

            SchematicCanvasView(
                schematic: schematic,
                highlightedNodeIDs: Set(issues.flatMap { $0.nodeIDs }),
                highlightedEdgeIDs: Set(issues.flatMap { $0.edgeIDs })
            )
            .frame(maxHeight: .infinity)

            if !issues.isEmpty {
                issuesPanel
                    .frame(maxHeight: 220)
            }
        }
        .navigationTitle(schematic.title)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        showInstallationSheet = true
                    } label: {
                        Label("Montageplan dazu erstellen", systemImage: "wrench.and.screwdriver.fill")
                    }
                    Button(role: .destructive) {
                        service.delete(schematic: schematic.id)
                    } label: {
                        Label("Löschen", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showInstallationSheet) {
            CreatePlanSheet(
                mode: .installation,
                boatID: schematic.boatID,
                boatContext: boatContext,
                relatedSchematic: schematic
            )
        }
    }

    private var disclaimerBanner: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.shield.fill")
                .foregroundColor(.orange)
            Text("KI-Vorschlag für eine mögliche Variante. Installation und Abnahme durch einen qualifizierten Fachbetrieb.")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color.orange.opacity(0.12))
    }

    private var issuesPanel: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                Text("Validator: \(issues.count) Befund\(issues.count == 1 ? "" : "e")")
                    .font(.subheadline.bold())
            }
            .padding(.horizontal)

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(issues) { issue in
                        HStack(alignment: .top, spacing: 8) {
                            Circle()
                                .fill(color(for: issue.severity))
                                .frame(width: 8, height: 8)
                                .padding(.top, 6)
                            Text(issue.message).font(.caption)
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 8)
        .background(Color(.secondarySystemGroupedBackground))
    }

    private func color(for sev: SchematicIssueSeverity) -> Color {
        switch sev {
        case .error: return .red
        case .warning: return .orange
        case .info: return .blue
        }
    }
}

// MARK: - Create Sheet

struct CreatePlanSheet: View {
    let mode: SchematicsScreen.CreateMode
    let boatID: UUID?
    let boatContext: AIChatBoat?
    var relatedSchematic: Schematic? = nil
    var availableEquipment: [EquipmentItem] = []

    @Environment(\.dismiss) private var dismiss
    @StateObject private var service = SchematicService.shared

    private enum Step { case input, equipmentSelection }

    @State private var step: Step = .input
    @State private var domain: SchematicDomain = .electrical12V
    @State private var prompt: String = ""
    @State private var task: String = ""

    // Equipment-Auswahl (Stufe 2)
    @State private var suggestion: SchematicService.EquipmentSuggestion?
    @State private var selectedExisting: Set<String> = []
    @State private var selectedMissing: Set<String> = []
    @State private var customAddition: String = ""

    @State private var working = false
    @State private var workingLabel: String = "KI arbeitet …"
    @State private var error: String?
    @State private var rawDebug: String?

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .input: inputForm
                case .equipmentSelection: selectionForm
                }
            }
            .navigationTitle(mode == .schematic ? "Schaltplan" : "Montageplan")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }.disabled(working)
                }
                ToolbarItem(placement: .primaryAction) {
                    switch step {
                    case .input:
                        Button(working ? "…" : "Weiter") { Task { await goToSelection() } }
                            .disabled(working || isInputEmpty)
                    case .equipmentSelection:
                        Button(working ? "Generiere…" : "Generieren") { generate() }
                            .disabled(working)
                    }
                }
                if step == .equipmentSelection {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { step = .input } label: {
                            Label("Zurück", systemImage: "chevron.left")
                        }.disabled(working)
                    }
                }
            }
            .overlay {
                if working {
                    ProgressView(workingLabel)
                        .padding()
                        .background(.thinMaterial)
                        .cornerRadius(12)
                }
            }
        }
    }

    // MARK: - Stufe 1: Eingabe

    private var inputForm: some View {
        Form {
            if mode == .schematic {
                Section("Domäne") {
                    Picker("Bereich", selection: $domain) {
                        ForEach(SchematicDomain.allCases) { d in
                            Label(d.displayName, systemImage: d.systemImage).tag(d)
                        }
                    }
                    .pickerStyle(.menu)
                }
                Section("Was soll geplant werden?") {
                    TextField(
                        "z. B. 12V-Anlage mit 2× 200Ah Lithium, Solar 300W, Bilgepumpe, Plotter",
                        text: $prompt, axis: .vertical
                    )
                    .lineLimit(3...8)
                }
            } else {
                Section("Aufgabe / Einbau") {
                    TextField(
                        "z. B. Bilgepumpe Rule Mate 1100 nachrüsten, automatisch geschaltet",
                        text: $task, axis: .vertical
                    )
                    .lineLimit(3...8)
                }
                if let s = relatedSchematic {
                    Section("Bezug Schaltplan") {
                        Label(s.title, systemImage: s.domain.systemImage)
                    }
                }
            }

            if let boat = boatContext {
                Section("Boot-Kontext") {
                    Text("\(boat.manufacturer ?? "") \(boat.model ?? "") · \(boat.equipment.count) Equipment-Einträge")
                        .font(.caption).foregroundColor(.secondary)
                }
            }

            disclaimerSection
            errorSection
        }
    }

    // MARK: - Stufe 2: Equipment-Auswahl

    private var selectionForm: some View {
        Form {
            Section {
                Text("Wähle die Geräte, die im Plan vorkommen sollen. Die KI hat passende Geräte aus deinem Equipment vorausgewählt und schlägt typische fehlende Komponenten vor.")
                    .font(.caption).foregroundColor(.secondary)
            }

            // Vorhandenes Equipment (aus Boot, KI-vorgefiltert)
            if let s = suggestion {
                let existing = matchedExistingEquipment(names: s.relevantExistingNames)
                if !existing.isEmpty {
                    Section("Aus deinem Equipment") {
                        ForEach(existing) { item in
                            equipmentCheckRow(
                                title: item.name,
                                subtitle: [item.manufacturer, item.model]
                                    .filter { !$0.isEmpty }.joined(separator: " "),
                                isSelected: selectedExisting.contains(item.name),
                                icon: "shippingbox.fill",
                                tint: .purple
                            ) {
                                toggle(&selectedExisting, item.name)
                            }
                        }
                    }
                }

                let other = availableEquipment
                    .filter { item in !existing.contains(where: { $0.id == item.id }) }
                if !other.isEmpty {
                    Section("Weiteres vorhandenes Equipment (optional)") {
                        ForEach(other) { item in
                            equipmentCheckRow(
                                title: item.name,
                                subtitle: [item.manufacturer, item.model]
                                    .filter { !$0.isEmpty }.joined(separator: " "),
                                isSelected: selectedExisting.contains(item.name),
                                icon: "shippingbox",
                                tint: .secondary
                            ) {
                                toggle(&selectedExisting, item.name)
                            }
                        }
                    }
                }

                if !s.suggestedMissing.isEmpty {
                    Section {
                        ForEach(s.suggestedMissing) { miss in
                            equipmentCheckRow(
                                title: miss.name,
                                subtitle: miss.reason,
                                isSelected: selectedMissing.contains(miss.name),
                                icon: "sparkles",
                                tint: .orange
                            ) {
                                toggle(&selectedMissing, miss.name)
                            }
                        }
                    } header: {
                        Text("KI-Vorschlag: fehlt vermutlich")
                    } footer: {
                        Text("Diese Komponenten sind in der Domäne üblich, aber noch nicht in deinem Equipment hinterlegt.")
                            .font(.caption2)
                    }
                }
            }

            Section("Zusätzlich (optional)") {
                TextField(
                    "Eigene Ergänzungen, z. B. „SeatalkNG-Backbone 4 m, Raynet-Switch HS5\"",
                    text: $customAddition, axis: .vertical
                )
                .lineLimit(2...5)
            }

            disclaimerSection
            errorSection
        }
    }

    // MARK: - Bausteine

    private var disclaimerSection: some View {
        Section {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.shield.fill")
                    .foregroundColor(.orange)
                Text("Hinweis: Der erzeugte Plan ist nur ein Vorschlag für eine mögliche Variante. Die Installation muss von einem qualifizierten Fachbetrieb ausgeführt und abgenommen werden.")
                    .font(.caption)
            }
        }
    }

    @ViewBuilder
    private var errorSection: some View {
        if let error = error {
            Section {
                Text(error).foregroundColor(.red)
                if let raw = rawDebug, !raw.isEmpty {
                    DisclosureGroup("KI-Antwort anzeigen") {
                        ScrollView {
                            Text(raw)
                                .font(.system(.caption2, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(maxHeight: 220)
                    }
                    .font(.caption)
                }
            }
        }
    }

    private func equipmentCheckRow(
        title: String,
        subtitle: String,
        isSelected: Bool,
        icon: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? .accentColor : .secondary)
                Image(systemName: icon)
                    .foregroundColor(tint)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundColor(.primary)
                    if !subtitle.isEmpty {
                        Text(subtitle).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private var isInputEmpty: Bool {
        switch mode {
        case .schematic: return prompt.trimmingCharacters(in: .whitespaces).isEmpty
        case .installation: return task.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    private var taskText: String {
        mode == .schematic ? prompt : task
    }

    private var domainForSuggestion: SchematicDomain {
        if mode == .schematic { return domain }
        if let s = relatedSchematic { return s.domain }
        return .other
    }

    private func matchedExistingEquipment(names: [String]) -> [EquipmentItem] {
        let lower = Set(names.map { $0.lowercased() })
        return availableEquipment.filter { lower.contains($0.name.lowercased()) }
    }

    private func toggle(_ set: inout Set<String>, _ value: String) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }

    // MARK: - Actions

    @MainActor
    private func goToSelection() async {
        // Wenn kein Equipment vorhanden ist: KI-Suggestion trotzdem holen
        // (KI schlägt dann nur "fehlende" Items vor), ansonsten direkt anzeigen.
        working = true; workingLabel = "KI sucht passendes Equipment …"; error = nil
        defer { working = false }
        do {
            let s = try await service.suggestEquipment(
                for: domainForSuggestion,
                task: taskText,
                boat: boatContext
            )
            self.suggestion = s
            // Vorauswahl: alle KI-Treffer aus dem vorhandenen Equipment + alle Missing
            self.selectedExisting = Set(s.relevantExistingNames)
            self.selectedMissing = Set(s.suggestedMissing.map { $0.name })
            self.step = .equipmentSelection
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "Equipment-Vorschlag fehlgeschlagen: \(error.localizedDescription)"
            if let sErr = error as? SchematicError, let raw = sErr.rawResponse {
                self.rawDebug = raw
            } else {
                self.rawDebug = service.lastRawResponse
            }
        }
    }

    private func generate() {
        working = true; workingLabel = "KI generiert Plan …"; error = nil
        Task {
            do {
                let existingNames = Array(selectedExisting)
                var missingNames = Array(selectedMissing)
                if !customAddition.trimmingCharacters(in: .whitespaces).isEmpty {
                    missingNames.append(customAddition.trimmingCharacters(in: .whitespaces))
                }

                switch mode {
                case .schematic:
                    var s = try await service.generateSchematic(
                        domain: domain,
                        boat: boatContext,
                        userPrompt: prompt,
                        selectedExistingNames: existingNames,
                        selectedMissingNames: missingNames
                    )
                    s.boatID = boatID
                    service.save(s)
                case .installation:
                    let enrichedTask = task
                        + (existingNames.isEmpty ? "" : "\nVerwende: \(existingNames.joined(separator: ", "))")
                        + (missingNames.isEmpty ? "" : "\nErgänze: \(missingNames.joined(separator: ", "))")
                    var p = try await service.generateInstallationPlan(
                        task: enrichedTask, boat: boatContext, relatedSchematic: relatedSchematic
                    )
                    p.boatID = boatID
                    service.save(p)
                }
                working = false
                dismiss()
            } catch {
                working = false
                self.error = (error as? LocalizedError)?.errorDescription
                    ?? "KI-Generierung fehlgeschlagen: \(error.localizedDescription)"
                if let sErr = error as? SchematicError, let raw = sErr.rawResponse {
                    self.rawDebug = raw
                } else {
                    self.rawDebug = service.lastRawResponse
                }
            }
        }
    }
}
