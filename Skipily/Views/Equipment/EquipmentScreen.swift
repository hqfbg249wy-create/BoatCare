//
//  EquipmentScreen.swift
//  Skipily
//

import SwiftUI
import Supabase
import CoreLocation
import Combine
import PhotosUI

// MARK: - Equipment Model (Supabase-backed)
struct EquipmentItem: Identifiable, Codable {
    var id: UUID
    var boatId: UUID
    var name: String
    var category: String
    var manufacturer: String
    var model: String
    var serialNumber: String
    var installationDate: String?
    var warrantyExpiry: String?
    var notes: String
    var imageUrl: String?
    var lastMaintenanceDate: String?
    var nextMaintenanceDate: String?
    var maintenanceCycleYears: Int?
    var partNumber: String
    var locationOnBoat: String
    var dimensions: String
    var photoUrl: String?
    var itemDescription: String

    init(id: UUID = UUID(), boatId: UUID, name: String = "", category: String = "other",
         manufacturer: String = "", model: String = "", serialNumber: String = "",
         installationDate: String? = nil, warrantyExpiry: String? = nil, notes: String = "",
         imageUrl: String? = nil, lastMaintenanceDate: String? = nil, nextMaintenanceDate: String? = nil,
         maintenanceCycleYears: Int? = nil, partNumber: String = "", locationOnBoat: String = "",
         dimensions: String = "", photoUrl: String? = nil, itemDescription: String = "") {
        self.id = id; self.boatId = boatId; self.name = name; self.category = category
        self.manufacturer = manufacturer; self.model = model; self.serialNumber = serialNumber
        self.installationDate = installationDate; self.warrantyExpiry = warrantyExpiry
        self.notes = notes; self.imageUrl = imageUrl; self.lastMaintenanceDate = lastMaintenanceDate
        self.nextMaintenanceDate = nextMaintenanceDate; self.maintenanceCycleYears = maintenanceCycleYears
        self.partNumber = partNumber; self.locationOnBoat = locationOnBoat
        self.dimensions = dimensions; self.photoUrl = photoUrl; self.itemDescription = itemDescription
    }

    enum CodingKeys: String, CodingKey {
        case id, name, category, manufacturer, model, notes, dimensions
        case boatId               = "boat_id"
        case serialNumber         = "serial_number"
        case installationDate     = "installation_date"
        case warrantyExpiry       = "warranty_expiry"
        case imageUrl             = "image_url"
        case lastMaintenanceDate  = "last_maintenance_date"
        case nextMaintenanceDate  = "next_maintenance_date"
        case maintenanceCycleYears = "maintenance_cycle_years"
        case partNumber           = "part_number"
        case locationOnBoat       = "location_on_boat"
        case photoUrl             = "photo_url"
        case itemDescription      = "item_description"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id                    = try c.decode(UUID.self, forKey: .id)
        boatId                = try c.decode(UUID.self, forKey: .boatId)
        name                  = (try? c.decode(String.self, forKey: .name)) ?? ""
        category              = (try? c.decode(String.self, forKey: .category)) ?? "other"
        manufacturer          = (try? c.decode(String.self, forKey: .manufacturer)) ?? ""
        model                 = (try? c.decode(String.self, forKey: .model)) ?? ""
        serialNumber          = (try? c.decode(String.self, forKey: .serialNumber)) ?? ""
        notes                 = (try? c.decode(String.self, forKey: .notes)) ?? ""
        partNumber            = (try? c.decode(String.self, forKey: .partNumber)) ?? ""
        locationOnBoat        = (try? c.decode(String.self, forKey: .locationOnBoat)) ?? ""
        dimensions            = (try? c.decode(String.self, forKey: .dimensions)) ?? ""
        itemDescription       = (try? c.decode(String.self, forKey: .itemDescription)) ?? ""
        installationDate      = try? c.decode(String.self, forKey: .installationDate)
        warrantyExpiry        = try? c.decode(String.self, forKey: .warrantyExpiry)
        imageUrl              = try? c.decode(String.self, forKey: .imageUrl)
        lastMaintenanceDate   = try? c.decode(String.self, forKey: .lastMaintenanceDate)
        nextMaintenanceDate   = try? c.decode(String.self, forKey: .nextMaintenanceDate)
        photoUrl              = try? c.decode(String.self, forKey: .photoUrl)
        maintenanceCycleYears = try? c.decode(Int.self, forKey: .maintenanceCycleYears)
    }

    // Kategorie-Helpers
    var categoryIcon: String {
        switch category.lowercased() {
        case "navigation": return "location.north.fill"
        case "safety", "sicherheit": return "shield.fill"
        case "engine", "motor": return "engine.combustion.fill"
        case "electrical", "elektrik": return "bolt.fill"
        case "rigging", "rigg": return "arrow.up.and.down.and.arrow.left.and.right"
        case "sails", "segel": return "wind"
        case "anchor", "anker": return "scope"
        case "communication", "kommunikation": return "antenna.radiowaves.left.and.right"
        case "hvac", "heizung": return "thermometer.sun.fill"
        case "paint", "farben": return "paintbrush.fill"
        case "rope", "tauwerk": return "circle.and.line.horizontal.fill"
        default: return "shippingbox.fill"
        }
    }
    var categoryColor: Color {
        switch category.lowercased() {
        case "navigation": return .blue
        case "safety", "sicherheit": return .red
        case "engine", "motor": return .orange
        case "electrical", "elektrik": return .yellow
        case "rigging", "rigg": return .purple
        case "sails", "segel": return .cyan
        case "anchor", "anker": return .brown
        case "communication", "kommunikation": return .teal
        case "hvac", "heizung": return .orange
        case "paint", "farben": return .pink
        case "rope", "tauwerk": return .mint
        default: return .gray
        }
    }

    // Wartungsstatus
    var maintenanceStatus: MaintenanceStatus {
        guard let nextStr = nextMaintenanceDate,
              let next = Self.dateFormatter.date(from: nextStr) else { return .unknown }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: next).day ?? 0
        if days < 0 { return .overdue }
        if days <= 30 { return .dueSoon }
        return .ok
    }

    enum MaintenanceStatus {
        case ok, dueSoon, overdue, unknown
        var color: Color {
            switch self {
            case .ok: return .green; case .dueSoon: return .orange
            case .overdue: return .red; case .unknown: return .gray
            }
        }
        var label: String {
            switch self {
            case .ok: return "equipment.maintenance_ok".loc
            case .dueSoon: return "maintenance.due".loc
            case .overdue: return "maintenance.overdue".loc
            case .unknown: return ""
            }
        }
    }

    static let dateFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
    }()
}

// Insert/Update helpers
private struct EquipmentInsert: Encodable {
    let boat_id: String; let name: String; let category: String
    let manufacturer: String; let model: String; let serial_number: String
    let installation_date: String?; let warranty_expiry: String?
    let notes: String; let image_url: String?
    let last_maintenance_date: String?; let next_maintenance_date: String?
    let maintenance_cycle_years: Int?; let part_number: String
    let location_on_boat: String; let dimensions: String
    let photo_url: String?; let item_description: String
}

private struct EquipmentUpdate: Encodable {
    let name: String; let category: String
    let manufacturer: String; let model: String; let serial_number: String
    let installation_date: String?; let warranty_expiry: String?
    let notes: String; let image_url: String?
    let last_maintenance_date: String?; let next_maintenance_date: String?
    let maintenance_cycle_years: Int?; let part_number: String
    let location_on_boat: String; let dimensions: String
    let photo_url: String?; let item_description: String
}

private let equipmentCategories = [
    "navigation", "safety", "engine", "electrical", "rigging", "sails", "anchor", "communication",
    "hvac", "paint", "rope", "other"
]

/// Identifiable-Wrapper für .sheet(item:) — die id basiert auf der Kategorie,
/// so dass SwiftUI bei Wechsel der Kategorie das Sheet sauber neu mountet
/// und AddEditEquipmentView den neuen initialCategory-Wert tatsächlich sieht.
struct AddSheetTrigger: Identifiable {
    let id: String      // == category, eindeutig pro gewählter Kategorie
    let category: String
}

// MARK: - Equipment Navigation Target
enum EquipmentNavTarget: Hashable {
    case service(name: String, category: String, manufacturer: String)
    case spareParts(name: String, manufacturer: String, model: String, partNumber: String, dimensions: String)
    case aiAssistant(question: String)
}

// Per-row navigation state — using Identifiable wrapper for unique identity
struct EquipmentRowNav: Identifiable, Hashable {
    let id = UUID()
    let target: EquipmentNavTarget
}

// MARK: - Equipment Screen (Supabase)
struct EquipmentScreen: View {
    let boatId: UUID
    let boatName: String
    let onNavigate: ((EquipmentNavTarget) -> Void)?
    @EnvironmentObject var authService: AuthService

    @State private var items: [EquipmentItem] = []
    @State private var isLoading = false
    @State private var showingCategoryPicker = false
    /// Sheet-Trigger für Add-Form mit konkreter Kategorie.
    /// Wir nutzen .sheet(item:) statt isPresented, damit SwiftUI das Sheet
    /// beim Setzen frisch instanziert und die initiale Kategorie zuverlässig
    /// an AddEditEquipmentView weiterreicht (kein Race / Stale-State).
    @State private var addTrigger: AddSheetTrigger? = nil
    /// Spezialweg für Kategorie "sails": eigener Sub-Picker mit Maßblatt-Routing
    @State private var showingNewSailFlow = false
    @State private var showingSuggestions = false
    @State private var searchText = ""
    @State private var selectedCategory: String? = nil
    @State private var errorMessage: String?

    init(boatId: UUID, boatName: String, onNavigate: ((EquipmentNavTarget) -> Void)? = nil) {
        self.boatId = boatId
        self.boatName = boatName
        self.onNavigate = onNavigate
    }

    private var filtered: [EquipmentItem] {
        items.filter { item in
            let matchSearch = searchText.isEmpty
                || item.name.localizedCaseInsensitiveContains(searchText)
                || item.manufacturer.localizedCaseInsensitiveContains(searchText)
                || item.model.localizedCaseInsensitiveContains(searchText)
            let matchCat = selectedCategory == nil || item.category.lowercased() == selectedCategory
            return matchSearch && matchCat
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Category filter
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    catChip(nil, label: "equipment.all".loc)
                    ForEach(equipmentCategories, id: \.self) { cat in
                        catChip(cat, label: "equipment.cat.\(cat)".loc)
                    }
                }
                .padding(.horizontal).padding(.vertical, 8)
            }
            Divider()

            if isLoading {
                ProgressView("general.loading".loc)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filtered.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(filtered) { item in
                        EquipmentExpandableRow(
                            item: item,
                            boatName: boatName,
                            onUpdate: { updated in Task { await updateItem(updated) } },
                            onDelete: { Task { await deleteItem(item) } }
                        )
                        .environmentObject(authService)
                    }
                    .onDelete { offsets in
                        let toDelete = offsets.map { filtered[$0] }
                        for item in toDelete { Task { await deleteItem(item) } }
                    }
                }
            }
        }
        .navigationTitle("equipment.title".loc)
        .searchable(text: $searchText, prompt: "general.search".loc)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button { showingSuggestions = true } label: {
                        Image(systemName: "sparkles")
                    }
                    .accessibilityLabel("equipment.suggestions_title".loc)
                    Button {
                        // Wenn die Liste schon nach einer Kategorie gefiltert ist,
                        // den CategoryPicker überspringen und direkt das Formular
                        // mit dieser Kategorie vorbelegt öffnen.
                        if let preselected = selectedCategory {
                            if preselected.lowercased() == "sails" {
                                showingNewSailFlow = true
                            } else {
                                addTrigger = AddSheetTrigger(id: preselected, category: preselected)
                            }
                        } else {
                            showingCategoryPicker = true
                        }
                    } label: { Image(systemName: "plus") }
                }
            }
        }
        .sheet(isPresented: $showingCategoryPicker) {
            EquipmentCategoryPickerSheet { chosen in
                showingCategoryPicker = false
                if chosen == "sails" {
                    // Spezialweg: Sail-Type-Sub-Picker → Maßblatt
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        showingNewSailFlow = true
                    }
                } else {
                    // .sheet(item:) triggert zuverlässig — Kategorie wird
                    // 1:1 an AddEditEquipmentView weitergegeben.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        addTrigger = AddSheetTrigger(id: chosen, category: chosen)
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $addTrigger) { trigger in
            AddEditEquipmentView(boatId: boatId, item: nil, initialCategory: trigger.category) { newItem in
                Task { await addItem(newItem) }
            }
        }
        .sheet(isPresented: $showingNewSailFlow) {
            NewSailEquipmentFlow(
                boatId: boatId,
                boatName: boatName,
                onPickOther: {
                    // Anderes Segel → generischer Equipment-Flow mit Kategorie sails
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        addTrigger = AddSheetTrigger(id: "sails", category: "sails")
                    }
                },
                onCreated: {
                    Task { await loadItems() }
                }
            )
        }
        .sheet(isPresented: $showingSuggestions) {
            EquipmentSuggestionsSheet(boatId: boatId, boatName: boatName) {
                Task { await loadItems() }
            }
        }
        .alert("general.error".loc, isPresented: Binding(
            get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
        )) { Button("general.ok".loc, role: .cancel) {} } message: { Text(errorMessage ?? "") }
        .task { await loadItems() }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "shippingbox.fill")
                .font(.system(size: 60)).foregroundStyle(.purple.opacity(0.3))
            Text("equipment.no_items".loc).font(.headline).foregroundStyle(.secondary)
            Button { showingCategoryPicker = true } label: {
                Label("equipment.add".loc, systemImage: "plus.circle.fill")
            }.buttonStyle(.borderedProminent)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func catChip(_ cat: String?, label: String) -> some View {
        let isSel = selectedCategory == cat
        let icon: String? = if let cat {
            EquipmentItem(id: UUID(), boatId: UUID(), name: "", category: cat).categoryIcon
        } else { nil as String? }
        return Button { selectedCategory = cat } label: {
            HStack(spacing: 4) {
                if let icon { Image(systemName: icon).font(.caption) }
                Text(label).font(.subheadline)
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(isSel ? Color.blue : Color(.systemGray6))
            .foregroundStyle(isSel ? .white : .primary).cornerRadius(16)
        }
    }

    // MARK: - Supabase CRUD
    private func loadItems() async {
        isLoading = true; defer { isLoading = false }
        AppLog.debug("Equipment laden für boat_id=\(boatId.uuidString) (\(boatName))")
        do {
            let result: [EquipmentItem] = try await authService.supabase
                .from("equipment").select()
                .eq("boat_id", value: boatId.uuidString)
                .order("created_at", ascending: true)
                .execute().value
            items = result
            AppLog.debug("Equipment geladen: \(result.count) Items für \(boatName)")
        } catch {
            AppLog.error("Equipment laden für \(boatName) (\(boatId.uuidString)) fehlgeschlagen: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    private func addItem(_ item: EquipmentItem) async {
        let ins = EquipmentInsert(
            boat_id: boatId.uuidString, name: item.name, category: item.category,
            manufacturer: item.manufacturer, model: item.model, serial_number: item.serialNumber,
            installation_date: item.installationDate, warranty_expiry: item.warrantyExpiry,
            notes: item.notes, image_url: item.imageUrl,
            last_maintenance_date: item.lastMaintenanceDate,
            next_maintenance_date: item.nextMaintenanceDate,
            maintenance_cycle_years: item.maintenanceCycleYears,
            part_number: item.partNumber, location_on_boat: item.locationOnBoat,
            dimensions: item.dimensions, photo_url: item.photoUrl,
            item_description: item.itemDescription
        )
        do {
            try await authService.supabase.from("equipment").insert(ins).execute()
            await loadItems()
        } catch { AppLog.error("Equipment hinzufügen: \(error)") }
    }

    private func updateItem(_ item: EquipmentItem) async {
        let upd = EquipmentUpdate(
            name: item.name, category: item.category,
            manufacturer: item.manufacturer, model: item.model, serial_number: item.serialNumber,
            installation_date: item.installationDate, warranty_expiry: item.warrantyExpiry,
            notes: item.notes, image_url: item.imageUrl,
            last_maintenance_date: item.lastMaintenanceDate,
            next_maintenance_date: item.nextMaintenanceDate,
            maintenance_cycle_years: item.maintenanceCycleYears,
            part_number: item.partNumber, location_on_boat: item.locationOnBoat,
            dimensions: item.dimensions, photo_url: item.photoUrl,
            item_description: item.itemDescription
        )
        do {
            try await authService.supabase.from("equipment")
                .update(upd).eq("id", value: item.id.uuidString).execute()
            await loadItems()
        } catch { AppLog.error("Equipment aktualisieren: \(error)") }
    }

    private func deleteItem(_ item: EquipmentItem) async {
        items.removeAll { $0.id == item.id }
        do {
            try await authService.supabase.from("equipment")
                .delete().eq("id", value: item.id.uuidString).execute()
        } catch { AppLog.error("Equipment löschen: \(error)") }
    }
}

// MARK: - Equipment Row
struct EquipmentRow: View {
    let item: EquipmentItem
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: item.categoryIcon)
                .font(.title2).foregroundStyle(item.categoryColor)
                .frame(width: 44, height: 44)
                .background(item.categoryColor.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(item.name).font(.headline)
                    if item.maintenanceStatus == .overdue {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red).font(.caption)
                    } else if item.maintenanceStatus == .dueSoon {
                        Image(systemName: "clock.badge.exclamationmark")
                            .foregroundStyle(.orange).font(.caption)
                    }
                }
                if !item.manufacturer.isEmpty || !item.model.isEmpty {
                    Text([item.manufacturer, item.model].filter { !$0.isEmpty }.joined(separator: " "))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if !item.locationOnBoat.isEmpty {
                    Text(item.locationOnBoat).font(.caption).foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if item.maintenanceStatus != .unknown {
                Text(item.maintenanceStatus.label)
                    .font(.caption2).fontWeight(.semibold)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(item.maintenanceStatus.color.opacity(0.15))
                    .foregroundStyle(item.maintenanceStatus.color)
                    .cornerRadius(4)
            }
        }.padding(.vertical, 4)
    }
}

// MARK: - Expandable Equipment Row (like Maintenance)
struct EquipmentExpandableRow: View {
    let item: EquipmentItem
    let boatName: String
    let onUpdate: (EquipmentItem) -> Void
    let onDelete: () -> Void
    @EnvironmentObject var authService: AuthService
    @State private var showActions = false
    @State private var showingEdit = false
    @State private var showingSailForm = false
    @State private var rowNavigation: EquipmentRowNav?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Main row — tap to expand/collapse actions
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showActions.toggle() }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: item.categoryIcon)
                        .font(.title2).foregroundStyle(item.categoryColor)
                        .frame(width: 44, height: 44)
                        .background(item.categoryColor.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(item.name).font(.headline).foregroundStyle(.primary)
                            if item.maintenanceStatus == .overdue {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.red).font(.caption)
                            } else if item.maintenanceStatus == .dueSoon {
                                Image(systemName: "clock.badge.exclamationmark")
                                    .foregroundStyle(.orange).font(.caption)
                            }
                        }
                        if !item.manufacturer.isEmpty || !item.model.isEmpty {
                            Text([item.manufacturer, item.model].filter { !$0.isEmpty }.joined(separator: " "))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        if !item.locationOnBoat.isEmpty {
                            Text(item.locationOnBoat).font(.caption).foregroundStyle(.tertiary)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 4) {
                        if item.maintenanceStatus != .unknown {
                            Text(item.maintenanceStatus.label)
                                .font(.caption2).fontWeight(.semibold)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(item.maintenanceStatus.color.opacity(0.15))
                                .foregroundStyle(item.maintenanceStatus.color)
                                .cornerRadius(4)
                        }
                    }

                    Image(systemName: showActions ? "chevron.up" : "chevron.down")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)
            .padding(.vertical, 4)

            // Action buttons (expandable) — state-driven navigation per row
            if showActions {
                HStack(spacing: 8) {
                    // Service suchen
                    Button {
                        rowNavigation = EquipmentRowNav(target:
                            .service(name: item.name, category: item.category, manufacturer: item.manufacturer))
                    } label: {
                        EquipmentActionButton(title: "equipment.action_service".loc, icon: "wrench.and.screwdriver.fill", color: .orange)
                    }
                    .buttonStyle(.borderless)

                    // Ersatzteile suchen
                    Button {
                        rowNavigation = EquipmentRowNav(target:
                            .spareParts(name: item.name, manufacturer: item.manufacturer,
                                        model: item.model, partNumber: item.partNumber,
                                        dimensions: item.dimensions))
                    } label: {
                        EquipmentActionButton(title: "equipment.action_spare_parts".loc, icon: "cart.fill", color: .purple)
                    }
                    .buttonStyle(.borderless)

                    // KI-Assistent
                    Button {
                        rowNavigation = EquipmentRowNav(target: .aiAssistant(question: aiQuestion))
                    } label: {
                        EquipmentActionButton(title: "equipment.action_ai".loc, icon: "bubble.left.fill", color: .blue)
                    }
                    .buttonStyle(.borderless)

                    // Maßblatt (nur für Segel-Kategorie)
                    if isSailCategory {
                        Button { showingSailForm = true } label: {
                            EquipmentActionButton(title: "equipment.action_sail_form".loc, icon: "doc.text.fill", color: .teal)
                        }
                        .buttonStyle(.borderless)
                    }

                    // Bearbeiten (statt Erledigt)
                    Button { showingEdit = true } label: {
                        EquipmentActionButton(title: "equipment.action_edit".loc, icon: "pencil.circle.fill", color: .green)
                    }
                    .buttonStyle(.borderless)
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 8)
                .padding(.top, 4)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationDestination(item: $rowNavigation) { nav in
            switch nav.target {
            case .service(let name, let category, let manufacturer):
                ServiceSearchFromMaintenance(equipmentName: name, category: category, manufacturer: manufacturer)
                    .environmentObject(authService)
            case .spareParts(let name, let manufacturer, let model, let partNumber, let dimensions):
                // Neue Zwei-Sektionen-Ansicht mit Match-Konfidenz
                // (1:1-Ersatzteile zuerst, dann Alternativen & Zubehör)
                EquipmentPartsSearchView(
                    name: name,
                    manufacturer: manufacturer,
                    model: model,
                    partNumber: partNumber,
                    dimensions: dimensions
                )
                .environmentObject(authService)
            case .aiAssistant(let question):
                ChatScreen(initialQuestion: question)
            }
        }
        .sheet(isPresented: $showingEdit) {
            AddEditEquipmentView(boatId: item.boatId, item: item) { updated in
                onUpdate(updated)
            }
        }
        .sheet(isPresented: $showingSailForm) {
            SailMeasurementGateway(equipmentId: item.id, boatName: boatName)
        }
    }

    private var isSailCategory: Bool {
        let cat = item.category.lowercased()
        let name = item.name.lowercased()
        return cat.contains("segel") || cat.contains("sail") || cat.contains("rigg")
            || name.contains("segel") || name.contains("genua") || name.contains("gennaker")
            || name.contains("code 0") || name.contains("code0") || name.contains("spinnaker")
            || name.contains("fock") || name.contains("großsegel") || name.contains("vorsegel")
    }

    private var aiQuestion: String {
        let details = [
            item.name,
            item.manufacturer.isEmpty ? "" : "Hersteller: \(item.manufacturer)",
            item.model.isEmpty ? "" : "Modell: \(item.model)",
            item.dimensions.isEmpty ? "" : "Abmessungen: \(item.dimensions)",
            item.locationOnBoat.isEmpty ? "" : "Ort: \(item.locationOnBoat)",
            item.itemDescription.isEmpty ? "" : item.itemDescription
        ].filter { !$0.isEmpty }.joined(separator: ", ")
        return "Ich brauche Hilfe mit meinem Ausruestungsgegenstand auf der \(boatName): \(details). Kategorie: \(item.category). Was empfiehlst du?"
    }
}

// MARK: - Uniform Action Button for Equipment Row
struct EquipmentActionButton: View {
    let title: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(color)
                .clipShape(Circle())
            Text(title)
                .font(.system(size: 10))
                .fontWeight(.medium)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Equipment Detail View
struct EquipmentDetailView: View {
    let item: EquipmentItem
    let boatName: String
    let onUpdate: (EquipmentItem) -> Void
    let onDelete: () -> Void
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss
    @State private var showingEdit = false
    @State private var showingDeleteConfirm = false
    @State private var showingBriefing = false
    @State private var selectedPhotoIndex = 0

    private var photoURLs: [URL] {
        let raw = item.photoUrl ?? item.imageUrl ?? ""
        return raw.components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .compactMap { URL(string: $0) }
    }

    var body: some View {
        List {
            // Photo Gallery
            if !photoURLs.isEmpty {
                Section {
                    VStack(spacing: 0) {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 0) {
                                ForEach(Array(photoURLs.enumerated()), id: \.offset) { index, url in
                                    AsyncImage(url: url) { phase in
                                        if case .success(let img) = phase {
                                            img.resizable().scaledToFill()
                                                .frame(height: 220)
                                                .clipped()
                                        } else if case .failure = phase {
                                            catIcon
                                        } else {
                                            ProgressView()
                                                .frame(height: 220)
                                        }
                                    }
                                    .containerRelativeFrame(.horizontal)
                                    .id(index)
                                }
                            }
                            .scrollTargetLayout()
                        }
                        .scrollTargetBehavior(.paging)
                        .frame(height: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .scrollPosition(id: Binding(
                            get: { selectedPhotoIndex as Int? },
                            set: { if let v = $0 { selectedPhotoIndex = v } }
                        ))

                        if photoURLs.count > 1 {
                            HStack(spacing: 6) {
                                ForEach(0..<photoURLs.count, id: \.self) { i in
                                    Circle()
                                        .fill(i == selectedPhotoIndex ? Color.primary : Color.secondary.opacity(0.4))
                                        .frame(width: 7, height: 7)
                                }
                            }
                            .padding(.top, 8)
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                }
            }

            // Header Info
            Section {
                HStack(spacing: 16) {
                    if photoURLs.isEmpty { catIcon }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(.title3).fontWeight(.bold)
                        Text("equipment.cat.\(item.category)".loc)
                            .font(.subheadline).foregroundStyle(.secondary)
                        if item.maintenanceStatus != .unknown {
                            HStack(spacing: 4) {
                                Circle().fill(item.maintenanceStatus.color).frame(width: 8, height: 8)
                                Text(item.maintenanceStatus.label)
                                    .font(.caption).foregroundStyle(item.maintenanceStatus.color)
                            }
                        }
                    }
                }.padding(.vertical, 6)
            }

            // Stammdaten
            Section("equipment.details".loc) {
                if !item.manufacturer.isEmpty { LabeledContent("boats.manufacturer".loc, value: item.manufacturer) }
                if !item.model.isEmpty { LabeledContent("boats.model".loc, value: item.model) }
                if !item.serialNumber.isEmpty { LabeledContent("equipment.serial".loc, value: item.serialNumber) }
                if !item.partNumber.isEmpty { LabeledContent("equipment.part_number".loc, value: item.partNumber) }
                if !item.dimensions.isEmpty { LabeledContent("equipment.dimensions".loc, value: item.dimensions) }
                if !item.locationOnBoat.isEmpty { LabeledContent("equipment.location".loc, value: item.locationOnBoat) }
            }

            // Beschreibung
            if !item.itemDescription.isEmpty {
                Section("equipment.description".loc) {
                    Text(item.itemDescription).foregroundStyle(.secondary)
                }
            }

            // Daten
            Section("equipment.dates".loc) {
                if let d = item.installationDate { LabeledContent("equipment.installation_date".loc, value: d) }
                if let d = item.warrantyExpiry { LabeledContent("equipment.warranty_expiry".loc, value: d) }
            }

            // Wartung
            Section("equipment.maintenance".loc) {
                if let cycle = item.maintenanceCycleYears {
                    LabeledContent("equipment.cycle".loc, value: "\(cycle) " + "equipment.years".loc)
                }
                if let d = item.lastMaintenanceDate {
                    LabeledContent("equipment.last_maintenance".loc, value: d)
                }
                if let d = item.nextMaintenanceDate {
                    LabeledContent("equipment.next_maintenance".loc, value: d)
                }
            }

            // Aktionen: Service suchen + Metashop suchen + Briefing
            Section("equipment.actions".loc) {
                NavigationLink {
                    ServiceSearchFromEquipment(item: item)
                        .environmentObject(authService)
                } label: {
                    Label("equipment.find_service".loc, systemImage: "wrench.and.screwdriver")
                        .foregroundStyle(.blue)
                }
                NavigationLink {
                    EquipmentPartsSearchView(
                        name: item.name,
                        manufacturer: item.manufacturer,
                        model: item.model,
                        partNumber: item.partNumber,
                        dimensions: item.dimensions
                    )
                    .environmentObject(authService)
                } label: {
                    Label("equipment.find_parts".loc, systemImage: "cart")
                        .foregroundStyle(.purple)
                }
                Button {
                    showingBriefing = true
                } label: {
                    Label("Service-Anfrage senden", systemImage: "paperplane.fill")
                        .foregroundStyle(.green)
                }
            }

            // Notizen
            if !item.notes.isEmpty {
                Section("equipment.notes".loc) {
                    Text(item.notes).foregroundStyle(.secondary)
                }
            }

            // Löschen
            Section {
                Button(role: .destructive) { showingDeleteConfirm = true } label: {
                    Label("general.delete".loc, systemImage: "trash")
                }
            }
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("general.edit".loc) { showingEdit = true }
            }
        }
        .sheet(isPresented: $showingEdit) {
            AddEditEquipmentView(boatId: item.boatId, item: item) { updated in
                onUpdate(updated)
            }
        }
        .sheet(isPresented: $showingBriefing) {
            ServiceRequestFlow(equipmentId: item.id, boatId: item.boatId)
                .environmentObject(authService)
        }
        .confirmationDialog("equipment.delete_confirm".loc, isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("general.delete".loc, role: .destructive) { onDelete(); dismiss() }
            Button("general.cancel".loc, role: .cancel) {}
        }
    }

    private var catIcon: some View {
        Image(systemName: item.categoryIcon)
            .font(.system(size: 36)).foregroundStyle(item.categoryColor)
            .frame(width: 70, height: 70)
            .background(item.categoryColor.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: - Add/Edit Equipment
struct AddEditEquipmentView: View {
    let boatId: UUID
    let item: EquipmentItem?
    /// Wenn beim Anlegen schon eine Kategorie aus dem Picker mitgegeben
    /// wurde — vorausgewählt + nicht weiter änderbar (klare UX).
    let initialCategory: String?
    /// Beim Anlegen: schon hochgeladene Foto-URLs (z.B. aus einer
    /// Foto-Diagnose im KI-Chat) als bestehende Bilder vorbefüllen.
    let initialPhotoUrls: [String]?
    let onSave: (EquipmentItem) -> Void
    @Environment(\.dismiss) var dismiss

    init(boatId: UUID, item: EquipmentItem?, initialCategory: String? = nil,
         initialPhotoUrls: [String]? = nil,
         onSave: @escaping (EquipmentItem) -> Void) {
        self.boatId = boatId
        self.item = item
        self.initialCategory = initialCategory
        self.initialPhotoUrls = initialPhotoUrls
        self.onSave = onSave
        // initiale Kategorie für @State setzen — Reihenfolge: bestehendes Item ▸ Picker ▸ "other"
        let cat = item?.category ?? initialCategory ?? "other"
        self._category = State(initialValue: cat)
        // Vorbelegte Foto-URLs (nur beim Anlegen sinnvoll, beim Edit kommen
        // sie aus item.photoUrl)
        if item == nil, let urls = initialPhotoUrls, !urls.isEmpty {
            self._existingPhotoUrls = State(initialValue: urls)
            self._photoUrl = State(initialValue: urls.joined(separator: ","))
        }
    }

    @State private var name = ""
    @State private var category: String
    @State private var manufacturer = ""
    @State private var model = ""
    @State private var serialNumber = ""
    @State private var partNumber = ""
    @State private var locationOnBoat = ""
    @State private var dimensions = ""
    @State private var itemDescription = ""
    @State private var notes = ""
    @State private var installationDate: Date = Date()
    @State private var hasInstallationDate = false
    @State private var warrantyExpiry: Date = Date()
    @State private var hasWarrantyExpiry = false
    @State private var lastMaintenance: Date = Date()
    @State private var hasLastMaintenance = false
    @State private var cycleText = ""
    @State private var photoUrl = ""

    // Multi-Photo support (max 5)
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var selectedImages: [UIImage] = []
    @State private var existingPhotoUrls: [String] = []
    @State private var isUploadingPhotos = false

    // Sail measurement
    @State private var showingSailForm = false
    @State private var headerPhotoIndex = 0

    private var allDisplayPhotos: [(id: String, source: PhotoSource)] {
        var result: [(String, PhotoSource)] = []
        for (i, url) in existingPhotoUrls.enumerated() {
            result.append(("existing_\(i)", .url(url)))
        }
        for (i, img) in selectedImages.enumerated() {
            result.append(("new_\(i)", .image(img)))
        }
        return result
    }

    private enum PhotoSource {
        case url(String)
        case image(UIImage)
    }

    var body: some View {
        NavigationStack {
            Form {
                // Photo header gallery
                if !allDisplayPhotos.isEmpty {
                    Section {
                        VStack(spacing: 0) {
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(spacing: 0) {
                                    ForEach(Array(allDisplayPhotos.enumerated()), id: \.element.id) { index, photo in
                                        Group {
                                            switch photo.source {
                                            case .url(let urlStr):
                                                AsyncImage(url: URL(string: urlStr)) { phase in
                                                    if case .success(let img) = phase {
                                                        img.resizable().scaledToFill()
                                                    } else {
                                                        Rectangle().fill(Color(.systemGray5))
                                                            .overlay { ProgressView() }
                                                    }
                                                }
                                            case .image(let uiImage):
                                                Image(uiImage: uiImage)
                                                    .resizable().scaledToFill()
                                            }
                                        }
                                        .frame(height: 200)
                                        .clipped()
                                        .containerRelativeFrame(.horizontal)
                                        .id(index)
                                    }
                                }
                                .scrollTargetLayout()
                            }
                            .scrollTargetBehavior(.paging)
                            .frame(height: 200)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .scrollPosition(id: Binding(
                                get: { headerPhotoIndex as Int? },
                                set: { if let v = $0 { headerPhotoIndex = v } }
                            ))

                            // Page dots + delete button below gallery
                            HStack {
                                if allDisplayPhotos.count > 1 {
                                    HStack(spacing: 5) {
                                        ForEach(0..<allDisplayPhotos.count, id: \.self) { i in
                                            Circle()
                                                .fill(i == headerPhotoIndex ? Color.primary : Color.secondary.opacity(0.4))
                                                .frame(width: 7, height: 7)
                                        }
                                    }
                                }

                                Spacer()

                                Button {
                                    let idx = min(headerPhotoIndex, allDisplayPhotos.count - 1)
                                    if idx < existingPhotoUrls.count {
                                        existingPhotoUrls.remove(at: idx)
                                    } else {
                                        let newIdx = idx - existingPhotoUrls.count
                                        if newIdx < selectedImages.count {
                                            selectedImages.remove(at: newIdx)
                                        }
                                    }
                                    if headerPhotoIndex >= allDisplayPhotos.count {
                                        headerPhotoIndex = max(0, allDisplayPhotos.count - 1)
                                    }
                                } label: {
                                    Label("equipment.photo_delete".loc, systemImage: "trash")
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                }
                            }
                            .padding(.top, 8)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    }
                }

                Section {
                    TextField("equipment.name".loc, text: $name)
                    // Picker bleibt immer als Picker — beim Anlegen mit vorgewählter
                    // Kategorie ist er deaktiviert (Wert klar sichtbar, aber nicht
                    // versehentlich änderbar). Beim Editieren bestehender Items
                    // sowie beim Anlegen ohne Vorauswahl ist er frei.
                    let isLocked = (initialCategory != nil && item == nil)
                    Picker("equipment.category".loc, selection: $category) {
                        ForEach(equipmentCategories, id: \.self) { cat in
                            Text("equipment.cat.\(cat)".loc).tag(cat)
                        }
                    }
                    .disabled(isLocked)
                }
                Section("equipment.details".loc) {
                    TextField("boats.manufacturer".loc, text: $manufacturer)
                    TextField("boats.model".loc, text: $model)
                    TextField("equipment.serial".loc, text: $serialNumber)
                    TextField("equipment.part_number".loc, text: $partNumber)
                    TextField("equipment.location".loc, text: $locationOnBoat)
                    TextField("equipment.dimensions".loc, text: $dimensions)
                }
                Section("equipment.description".loc) {
                    TextField("equipment.description".loc, text: $itemDescription, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section("equipment.dates".loc) {
                    Toggle("equipment.has_installation_date".loc, isOn: $hasInstallationDate)
                    if hasInstallationDate {
                        DatePicker("equipment.installation_date".loc, selection: $installationDate, displayedComponents: .date)
                    }
                    Toggle("equipment.has_warranty".loc, isOn: $hasWarrantyExpiry)
                    if hasWarrantyExpiry {
                        DatePicker("equipment.warranty_expiry".loc, selection: $warrantyExpiry, displayedComponents: .date)
                    }
                }
                Section("equipment.maintenance".loc) {
                    TextField("equipment.cycle".loc, text: $cycleText).keyboardType(.numberPad)
                    Toggle("equipment.has_last_maintenance".loc, isOn: $hasLastMaintenance)
                    if hasLastMaintenance {
                        DatePicker("equipment.last_maintenance".loc, selection: $lastMaintenance, displayedComponents: .date)
                    }
                }
                // Fotos (max 5)
                Section(String(format: "equipment.photos_section".loc, 5)) {
                    let totalPhotos = existingPhotoUrls.count + selectedImages.count
                    if totalPhotos < 5 {
                        PhotosPicker(
                            selection: $selectedPhotoItems,
                            maxSelectionCount: 5 - totalPhotos,
                            matching: .images
                        ) {
                            Label(String(format: "equipment.add_photos".loc, totalPhotos, 5), systemImage: "photo.badge.plus")
                                .font(.subheadline)
                        }
                        .onChange(of: selectedPhotoItems) { _, newItems in
                            Task {
                                for item in newItems {
                                    if let data = try? await item.loadTransferable(type: Data.self),
                                       let uiImage = UIImage(data: data) {
                                        let total = existingPhotoUrls.count + selectedImages.count
                                        if total < 5 {
                                            selectedImages.append(uiImage)
                                        }
                                    }
                                }
                                selectedPhotoItems = []
                            }
                        }
                    } else {
                        Text("equipment.max_photos".loc)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if isUploadingPhotos {
                        ProgressView("equipment.uploading_photos".loc)
                            .font(.caption)
                    }
                }
                // Maßblatt für Segel
                if isSailCategoryInForm {
                    Section("equipment.sail_form_section".loc) {
                        if let existingItem = item {
                            Button {
                                showingSailForm = true
                            } label: {
                                Label("equipment.sail_form_edit".loc, systemImage: "doc.text.fill")
                                    .foregroundStyle(.teal)
                            }
                            .sheet(isPresented: $showingSailForm) {
                                SailMeasurementGateway(equipmentId: existingItem.id, boatName: existingItem.name)
                            }
                        } else {
                            Text("equipment.sail_form_save_first".loc)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Section("equipment.notes".loc) {
                    TextField("equipment.notes".loc, text: $notes, axis: .vertical).lineLimit(3...6)
                }
            }
            .navigationTitle(item == nil ? "equipment.add".loc : "general.edit".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("general.cancel".loc) { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("general.save".loc) {
                        Task { await saveWithPhotos() }
                    }
                    .disabled(name.isEmpty).fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            guard let e = item else { return }
            let df = EquipmentItem.dateFormatter
            name = e.name; category = e.category; manufacturer = e.manufacturer
            model = e.model; serialNumber = e.serialNumber; partNumber = e.partNumber
            locationOnBoat = e.locationOnBoat; dimensions = e.dimensions
            itemDescription = e.itemDescription; notes = e.notes
            photoUrl = e.photoUrl ?? ""
            // Load existing photos from photoUrl (comma-separated)
            if let urls = e.photoUrl, !urls.isEmpty {
                existingPhotoUrls = urls.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            }
            if let d = e.installationDate, let date = df.date(from: d) {
                installationDate = date; hasInstallationDate = true
            }
            if let d = e.warrantyExpiry, let date = df.date(from: d) {
                warrantyExpiry = date; hasWarrantyExpiry = true
            }
            if let d = e.lastMaintenanceDate, let date = df.date(from: d) {
                lastMaintenance = date; hasLastMaintenance = true
            }
            if let c = e.maintenanceCycleYears { cycleText = String(c) }
        }
    }

    private var isSailCategoryInForm: Bool {
        let cat = category.lowercased()
        let n = name.lowercased()
        return cat.contains("segel") || cat.contains("sail") || cat.contains("rigg")
            || n.contains("segel") || n.contains("genua") || n.contains("gennaker")
            || n.contains("code 0") || n.contains("code0") || n.contains("spinnaker")
            || n.contains("fock") || n.contains("großsegel") || n.contains("vorsegel")
    }

    private func saveWithPhotos() async {
        isUploadingPhotos = true
        var allPhotoUrls = existingPhotoUrls

        // Upload new photos to Supabase storage
        let equipId = item?.id ?? UUID()
        for (idx, image) in selectedImages.enumerated() {
            guard let jpegData = image.jpegData(compressionQuality: 0.7) else { continue }
            let path = "equipment/\(boatId.uuidString)/\(equipId.uuidString)_\(allPhotoUrls.count + idx).jpg"
            do {
                try await SupabaseManager.shared.client.storage
                    .from("user-photos")
                    .upload(path, data: jpegData, options: .init(contentType: "image/jpeg", upsert: true))
                let publicURL = try SupabaseManager.shared.client.storage
                    .from("user-photos")
                    .getPublicURL(path: path)
                allPhotoUrls.append(publicURL.absoluteString)
            } catch {
                AppLog.error("Photo upload error: \(error)")
            }
        }

        let finalPhotoUrl = allPhotoUrls.isEmpty ? nil : allPhotoUrls.joined(separator: ",")

        let df = EquipmentItem.dateFormatter
        let cycle = Int(cycleText.trimmingCharacters(in: .whitespaces))
        let lastMD = hasLastMaintenance ? df.string(from: lastMaintenance) : item?.lastMaintenanceDate
        var nextMD = item?.nextMaintenanceDate
        if let lastStr = lastMD, let lastDate = df.date(from: lastStr), let cy = cycle {
            if let next = Calendar.current.date(byAdding: .year, value: cy, to: lastDate) {
                nextMD = df.string(from: next)
            }
        }
        let saved = EquipmentItem(
            id: equipId, boatId: boatId,
            name: name, category: category, manufacturer: manufacturer,
            model: model, serialNumber: serialNumber,
            installationDate: hasInstallationDate ? df.string(from: installationDate) : nil,
            warrantyExpiry: hasWarrantyExpiry ? df.string(from: warrantyExpiry) : nil,
            notes: notes, imageUrl: item?.imageUrl,
            lastMaintenanceDate: lastMD, nextMaintenanceDate: nextMD,
            maintenanceCycleYears: cycle, partNumber: partNumber,
            locationOnBoat: locationOnBoat, dimensions: dimensions,
            photoUrl: finalPhotoUrl,
            itemDescription: itemDescription
        )
        isUploadingPhotos = false
        onSave(saved)
        dismiss()
    }
}

// MARK: - Service-Suche aus Equipment heraus (mit Standort + Radius)
struct ServiceSearchFromEquipment: View {
    let item: EquipmentItem
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager
    @StateObject private var locationManager = EquipmentSearchLocationManager()
    @State private var bestMatches: [(provider: BoatServiceProvider, distanceKm: Double)] = []
    @State private var otherMatches: [(provider: BoatServiceProvider, distanceKm: Double)] = []
    @State private var isSearching = false
    @State private var locationText = ""
    @State private var selectedRadius: Double = 50
    @State private var useCurrentLocation = true
    @State private var hasSearched = false

    private let radiusOptions: [Double] = [10, 25, 50, 100, 200]

    // Mapping: Equipment-Kategorie → Suchbegriffe für DB-Kategorie (sprachunabhängig, contains-Match)
    private let categoryMatchTerms: [String: [String]] = [
        "engine":        ["werkstatt", "motor", "repair", "werft", "atelier", "cantiere", "taller", "werkplaats"],
        "motor":         ["werkstatt", "motor", "repair", "werft", "atelier", "cantiere", "taller", "werkplaats"],
        "rigging":       ["rigg", "gréement", "attrezzatura", "aparejo", "tuigage", "tauwerk"],
        "rigg":          ["rigg", "gréement", "attrezzatura", "aparejo", "tuigage", "tauwerk"],
        "electrical":    ["instrument", "elektron", "navigation", "électronique", "elettronica", "electrónica"],
        "elektrik":      ["instrument", "elektron", "navigation", "électronique", "elettronica", "electrónica"],
        "navigation":    ["instrument", "elektron", "navigation", "électronique", "elettronica", "electrónica"],
        "communication": ["instrument", "elektron", "navigation", "kommunikation", "communication"],
        "kommunikation": ["instrument", "elektron", "navigation", "kommunikation", "communication"],
        "safety":        ["zubehör", "supplies", "accastillage", "accessori", "accesorios", "benodigdheden", "chandl", "sicherheit", "safety"],
        "sicherheit":    ["zubehör", "supplies", "accastillage", "accessori", "accesorios", "benodigdheden", "chandl", "sicherheit", "safety"],
        "anchor":        ["zubehör", "supplies", "accastillage", "accessori", "accesorios", "benodigdheden", "anker", "anchor"],
        "anker":         ["zubehör", "supplies", "accastillage", "accessori", "accesorios", "benodigdheden", "anker", "anchor"],
        "other":         ["werkstatt", "zubehör", "repair", "supplies", "motor", "service"]
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Suchkriterien-Header
            VStack(alignment: .leading, spacing: 8) {
                Text("equipment.service_search_hint".loc)
                    .font(.caption).foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        criteriaTag(
                            icon: "folder.fill",
                            label: "equipment.cat.\(item.category)".loc,
                            color: .blue
                        )
                        if !item.manufacturer.isEmpty {
                            criteriaTag(
                                icon: "tag.fill",
                                label: item.manufacturer,
                                color: .orange
                            )
                        }
                    }
                }
            }
            .padding(.horizontal).padding(.vertical, 8)
            .background(Color(.systemGray6))

            // Standort + Radius
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    Button {
                        useCurrentLocation = true
                        locationText = ""
                        Task { await search() }
                    } label: {
                        Label("equipment.my_location".loc, systemImage: "location.fill")
                            .font(.caption).lineLimit(1)
                            .padding(.horizontal, 8).padding(.vertical, 6)
                            .background(useCurrentLocation ? Color.blue : Color(.systemGray5))
                            .foregroundStyle(useCurrentLocation ? .white : .primary)
                            .cornerRadius(8)
                    }

                    TextField("equipment.enter_location".loc, text: $locationText, onCommit: {
                        useCurrentLocation = false
                        Task { await search() }
                    })
                    .textFieldStyle(.roundedBorder)
                    .font(.subheadline)
                    .onTapGesture { useCurrentLocation = false }
                }

                // Radius-Auswahl – einzeilig mit ScrollView
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        Text("equipment.radius".loc)
                            .font(.caption).foregroundStyle(.secondary)
                        ForEach(radiusOptions, id: \.self) { r in
                            Button {
                                selectedRadius = r
                                Task { await search() }
                            } label: {
                                Text("\(Int(r)) km")
                                    .font(.caption).fontWeight(.medium)
                                    .padding(.horizontal, 8).padding(.vertical, 4)
                                    .background(selectedRadius == r ? Color.blue : Color(.systemGray5))
                                    .foregroundStyle(selectedRadius == r ? .white : .primary)
                                    .cornerRadius(6)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal).padding(.vertical, 8)
            .background(Color(.systemGray6).opacity(0.5))

            Divider()

            // Ergebnis-Anzahl + Standort-Hinweis
            if !bestMatches.isEmpty || !otherMatches.isEmpty {
                HStack {
                    Text("\(bestMatches.count + otherMatches.count) " + "equipment.results_found".loc)
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal).padding(.vertical, 6)

                // Hinweis wenn kein Standort verfügbar
                if locationManager.currentLocation == nil && hasSearched {
                    HStack(spacing: 8) {
                        Image(systemName: "location.slash.fill")
                            .foregroundStyle(.orange)
                        Text("equipment.location_unavailable".loc)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(10)
                    .background(Color.orange.opacity(0.08))
                    .cornerRadius(8)
                    .padding(.horizontal)
                }
            }

            // Ergebnisse
            if isSearching {
                ProgressView("general.loading".loc)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if bestMatches.isEmpty && otherMatches.isEmpty && hasSearched {
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 40)).foregroundStyle(.secondary.opacity(0.5))
                    Text("equipment.no_service_found".loc)
                        .font(.subheadline).foregroundStyle(.secondary)
                    Text("equipment.try_larger_radius".loc)
                        .font(.caption).foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    if !bestMatches.isEmpty {
                        Section {
                            ForEach(bestMatches, id: \.provider.id) { entry in
                                NavigationLink {
                                    ServiceProviderDetailView(provider: toServiceProvider(entry.provider))
                                        .environmentObject(favoritesManager)
                                        .environmentObject(authService)
                                } label: {
                                    serviceRow(entry)
                                }
                            }
                        } header: {
                            Label("equipment.matching_brand".loc, systemImage: "checkmark.seal.fill")
                                .font(.caption).fontWeight(.semibold)
                                .foregroundStyle(.orange)
                        }
                    }
                    if !otherMatches.isEmpty {
                        Section {
                            ForEach(otherMatches, id: \.provider.id) { entry in
                                NavigationLink {
                                    ServiceProviderDetailView(provider: toServiceProvider(entry.provider))
                                        .environmentObject(favoritesManager)
                                        .environmentObject(authService)
                                } label: {
                                    serviceRow(entry)
                                }
                            }
                        } header: {
                            if !bestMatches.isEmpty {
                                Label("equipment.other_providers".loc, systemImage: "building.2.fill")
                                    .font(.caption).fontWeight(.semibold)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("equipment.find_service".loc)
        .task {
            // Wait briefly for location fix before first search
            for _ in 0..<20 {
                if locationManager.currentLocation != nil { break }
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            await search()
        }
        .onReceive(locationManager.$currentLocation) { loc in
            // Re-search when location arrives and results still show 0 distance
            guard loc != nil, hasSearched,
                  bestMatches.allSatisfy({ $0.distanceKm == 0 }) && otherMatches.allSatisfy({ $0.distanceKm == 0 })
            else { return }
            Task { await search() }
        }
    }

    // MARK: - Service-Zeile
    @ViewBuilder
    private func serviceRow(_ entry: (provider: BoatServiceProvider, distanceKm: Double)) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                // Logo
                if let url = entry.provider.logo_url.usableImageURL {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                        } else {
                            Image(systemName: "building.2.fill").foregroundStyle(.gray)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Image(systemName: "building.2.fill")
                        .foregroundStyle(.blue)
                        .frame(width: 44, height: 44)
                        .background(Color.blue.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.provider.name).font(.headline).lineLimit(1)
                    if let city = entry.provider.city {
                        HStack(spacing: 4) {
                            Image(systemName: "mappin").font(.caption2)
                            Text(city).font(.caption)
                        }
                        .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                // Entfernung (nur anzeigen wenn bekannt)
                if entry.distanceKm >= 0 {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(formatDistance(entry.distanceKm))
                            .font(.headline).fontWeight(.bold)
                            .foregroundStyle(.blue)
                        Text("equipment.distance".loc)
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }

            // Matching-Info: Marken + Services
            HStack(spacing: 10) {
                // Marken-Match anzeigen
                if !item.manufacturer.isEmpty, let brands = entry.provider.brands {
                    let matching = brands.filter { $0.localizedCaseInsensitiveContains(item.manufacturer) }
                    if !matching.isEmpty {
                        HStack(spacing: 3) {
                            Image(systemName: "tag.fill").font(.caption2).foregroundStyle(.orange)
                            Text(matching.joined(separator: ", ")).font(.caption).foregroundStyle(.orange)
                        }
                    }
                }

                // Kategorie
                HStack(spacing: 3) {
                    Image(systemName: "folder.fill").font(.caption2).foregroundStyle(.blue)
                    Text(entry.provider.category).font(.caption).foregroundStyle(.secondary)
                }
            }

            // Passende Services
            if let svcs = entry.provider.services {
                let modelTerms = [item.model, item.manufacturer, item.name].filter { !$0.isEmpty }
                let matching = svcs.filter { svc in
                    modelTerms.contains { term in svc.localizedCaseInsensitiveContains(term) }
                }
                if !matching.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(matching.prefix(4), id: \.self) { svc in
                                HStack(spacing: 3) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.caption2).foregroundStyle(.green)
                                    Text(svc).font(.caption2)
                                }
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.green.opacity(0.1)).cornerRadius(4)
                            }
                        }
                    }
                } else {
                    // Allgemeine Services anzeigen
                    Text(svcs.prefix(3).joined(separator: ", "))
                        .font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func search() async {
        isSearching = true
        defer { isSearching = false; hasSearched = true }

        // Standort ermitteln
        let searchLocation: CLLocation?
        if useCurrentLocation {
            searchLocation = locationManager.currentLocation
        } else if !locationText.isEmpty {
            searchLocation = await geocode(locationText)
        } else {
            searchLocation = locationManager.currentLocation
        }

        // Suchbegriffe für diese Equipment-Kategorie (sprachunabhängig, contains-Match)
        let matchTerms = categoryMatchTerms[item.category.lowercased()] ?? ["werkstatt", "repair", "service"]

        do {
            let allProviders: [BoatServiceProvider] = try await authService.supabase
                .from("service_providers").select()
                .execute().value

            // Für jeden Provider: Kategorie-Match und Marken-Match separat berechnen
            var best: [(BoatServiceProvider, Double)] = []
            var other: [(BoatServiceProvider, Double)] = []

            for p in allProviders {
                // Provider mit ungültigen Koordinaten (0,0) überspringen
                guard abs(p.latitude) > 0.1 || abs(p.longitude) > 0.1 else { continue }

                // 1. Kategorie-Match: pruefe alle Kategorien des Providers
                let catMatch = p.allCategories.contains { cat in
                    let lower = cat.lowercased()
                    return matchTerms.contains { term in lower.contains(term) }
                }

                // 2. Hersteller-Match (Equipment-Hersteller in Betrieb-Marken)
                let brandsMatch = !item.manufacturer.isEmpty && (p.brands ?? []).contains {
                    $0.localizedCaseInsensitiveContains(item.manufacturer)
                }

                guard catMatch || brandsMatch else { continue }

                // Entfernung berechnen (-1 = unbekannt wenn kein Standort)
                var distKm: Double = -1
                if let loc = searchLocation {
                    let pLoc = CLLocation(latitude: p.latitude, longitude: p.longitude)
                    distKm = loc.distance(from: pLoc) / 1000
                    guard distKm <= selectedRadius else { continue }
                }

                if catMatch && brandsMatch {
                    best.append((p, distKm))
                } else {
                    other.append((p, distKm))
                }
            }

            // Sortierung: bei bekannter Entfernung nach Nähe, sonst alphabetisch
            let hasLocation = searchLocation != nil
            if hasLocation {
                bestMatches = best.sorted { $0.1 < $1.1 }
                otherMatches = other.sorted { $0.1 < $1.1 }
            } else {
                bestMatches = best.sorted { $0.0.name < $1.0.name }
                // Ohne Standort: "Weitere Anbieter" auf max. 20 begrenzen
                otherMatches = Array(other.sorted { $0.0.name < $1.0.name }.prefix(20))
            }
        } catch { AppLog.error("Service-Suche: \(error)") }
    }

    private func geocode(_ address: String) async -> CLLocation? {
        let geocoder = CLGeocoder()
        let placemarks = try? await geocoder.geocodeAddressString(address)
        guard let loc = placemarks?.first?.location else { return nil }
        return loc
    }

    private func formatDistance(_ km: Double) -> String {
        if km < 0 { return "—" }
        if km < 1 { return String(format: "%.0f m", km * 1000) }
        return String(format: "%.1f km", km)
    }

    private func criteriaTag(icon: String, label: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.caption2)
            Text(label).font(.caption).fontWeight(.medium)
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(color.opacity(0.12))
        .foregroundStyle(color).cornerRadius(6)
    }

    private func toServiceProvider(_ p: BoatServiceProvider) -> ServiceProvider {
        ServiceProvider(
            id: p.id, user_id: nil, name: p.name, category: p.category,
            category2: p.category2, category3: p.category3,
            street: p.street, city: p.city, postalCode: p.postal_code,
            country: p.country, latitude: p.latitude, longitude: p.longitude,
            phone: p.phone, email: p.email, website: p.website,
            description: p.description, logoUrl: p.logo_url,
            coverImageUrl: p.cover_image_url, galleryUrls: nil, slogan: nil,
            rating: p.rating, reviewCount: p.review_count,
            services: p.services, products: p.products, brands: p.brands,
            openingHours: p.opening_hours,
            createdAt: nil, updatedAt: nil,
            currentPromotion: p.current_promotion, shopUrl: p.shop_url
        )
    }
}

// MARK: - Metashop-Produkt (Supabase-Tabelle metashop_products)
struct MetashopProduct: Identifiable, Codable {
    var id: UUID
    var providerId: UUID?
    var name: String
    var manufacturer: String
    var partNumber: String
    var price: Double?
    var currency: String
    var shopName: String
    var shopUrl: String
    var imageUrl: String?
    var inStock: Bool
    var shippingCost: Double?
    var deliveryDays: Int?
    var rating: Double?
    var reviewCount: Int
    var description: String
    var category: String
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, manufacturer, price, currency, description, category, rating
        case providerId    = "provider_id"
        case partNumber    = "part_number"
        case shopName      = "shop_name"
        case shopUrl       = "shop_url"
        case imageUrl      = "image_url"
        case inStock       = "in_stock"
        case shippingCost  = "shipping_cost"
        case deliveryDays  = "delivery_days"
        case reviewCount   = "review_count"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id            = try c.decode(UUID.self, forKey: .id)
        providerId    = try? c.decode(UUID.self, forKey: .providerId)
        name          = (try? c.decode(String.self, forKey: .name)) ?? ""
        manufacturer  = (try? c.decode(String.self, forKey: .manufacturer)) ?? ""
        partNumber    = (try? c.decode(String.self, forKey: .partNumber)) ?? ""
        price         = try? c.decode(Double.self, forKey: .price)
        currency      = (try? c.decode(String.self, forKey: .currency)) ?? "EUR"
        shopName      = (try? c.decode(String.self, forKey: .shopName)) ?? ""
        shopUrl       = (try? c.decode(String.self, forKey: .shopUrl)) ?? ""
        imageUrl      = try? c.decode(String.self, forKey: .imageUrl)
        inStock       = (try? c.decode(Bool.self, forKey: .inStock)) ?? true
        shippingCost  = try? c.decode(Double.self, forKey: .shippingCost)
        deliveryDays  = try? c.decode(Int.self, forKey: .deliveryDays)
        rating        = try? c.decode(Double.self, forKey: .rating)
        reviewCount   = (try? c.decode(Int.self, forKey: .reviewCount)) ?? 0
        description   = (try? c.decode(String.self, forKey: .description)) ?? ""
        category      = (try? c.decode(String.self, forKey: .category)) ?? ""
        createdAt     = try? c.decode(String.self, forKey: .createdAt)
        updatedAt     = try? c.decode(String.self, forKey: .updatedAt)
    }

    // Preis formatiert anzeigen
    var formattedPrice: String? {
        guard let price = price else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: NSNumber(value: price))
    }
}

// MARK: - Metashop/Ersatzteil-Suche aus Equipment heraus (Supabase metashop_products)
struct MetashopSearchFromEquipment: View {
    let item: EquipmentItem
    @EnvironmentObject var authService: AuthService
    @State private var results: [MetashopProduct] = []
    @State private var isSearching = false
    @State private var hasSearched = false

    var body: some View {
        VStack(spacing: 0) {
            // Suchkriterien-Header
            VStack(alignment: .leading, spacing: 8) {
                Text("equipment.metashop_hint".loc)
                    .font(.caption).foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        searchTag(item.name)
                        if !item.manufacturer.isEmpty { searchTag(item.manufacturer) }
                        if !item.model.isEmpty { searchTag(item.model) }
                        if !item.partNumber.isEmpty { searchTag(item.partNumber) }
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemGray6))

            Divider()

            // Ergebnisse
            if isSearching {
                ProgressView("general.loading".loc)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if results.isEmpty && hasSearched {
                VStack(spacing: 16) {
                    Image(systemName: "cart.badge.questionmark")
                        .font(.system(size: 48)).foregroundStyle(.purple.opacity(0.3))
                    Text("equipment.no_shop_found".loc)
                        .font(.subheadline).foregroundStyle(.secondary)

                    // Fallback: Online suchen – spezifisch mit allen Artikeldetails
                    Button {
                        let query = [item.name, item.manufacturer, item.model, item.partNumber, "kaufen", "marine"]
                            .filter { !$0.isEmpty }.joined(separator: " ")
                        if let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                           let url = URL(string: "https://www.google.com/search?q=\(encoded)") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Label("equipment.search_online".loc, systemImage: "safari")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Color.purple).foregroundStyle(.white).cornerRadius(10)
                    }
                    .padding(.horizontal, 32)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(results) { product in
                        productRow(product)
                    }
                }
            }
        }
        .navigationTitle("equipment.find_parts".loc)
        .task { await searchProducts() }
    }

    // MARK: - Produkt-Zeile
    @ViewBuilder
    private func productRow(_ product: MetashopProduct) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                // Produktbild
                if let imgUrl = product.imageUrl, let url = URL(string: imgUrl) {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                        } else {
                            Image(systemName: "shippingbox.fill").foregroundStyle(.purple)
                        }
                    }
                    .frame(width: 60, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Image(systemName: "shippingbox.fill")
                        .font(.title2).foregroundStyle(.purple)
                        .frame(width: 60, height: 60)
                        .background(Color.purple.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(product.name).font(.headline).lineLimit(2)

                    if !product.manufacturer.isEmpty {
                        Text(product.manufacturer)
                            .font(.subheadline).foregroundStyle(.secondary)
                    }

                    if !product.partNumber.isEmpty {
                        HStack(spacing: 4) {
                            Text("equipment.article_no".loc).font(.caption2).foregroundStyle(.tertiary)
                            Text(product.partNumber).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer()

                // Preis
                VStack(alignment: .trailing, spacing: 2) {
                    if let priceStr = product.formattedPrice {
                        Text(priceStr)
                            .font(.headline).fontWeight(.bold)
                            .foregroundStyle(.primary)
                    }
                    // Verfuegbarkeit
                    HStack(spacing: 3) {
                        Circle()
                            .fill(product.inStock ? Color.green : Color.red)
                            .frame(width: 7, height: 7)
                        Text(product.inStock ? "equipment.in_stock".loc : "equipment.out_of_stock".loc)
                            .font(.caption2)
                            .foregroundStyle(product.inStock ? .green : .red)
                    }
                }
            }

            // Details-Zeile: Shop, Versand, Bewertung
            HStack(spacing: 12) {
                if !product.shopName.isEmpty {
                    HStack(spacing: 3) {
                        Image(systemName: "storefront.fill").font(.caption2).foregroundStyle(.purple)
                        Text(product.shopName).font(.caption).foregroundStyle(.secondary)
                    }
                }

                if let shipping = product.shippingCost {
                    HStack(spacing: 3) {
                        Image(systemName: "shippingbox").font(.caption2).foregroundStyle(.blue)
                        Text(shipping == 0 ? "equipment.free_shipping".loc :
                                String(format: "%.2f \(product.currency)", shipping))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }

                if let days = product.deliveryDays {
                    HStack(spacing: 3) {
                        Image(systemName: "clock").font(.caption2).foregroundStyle(.orange)
                        Text("\(days) " + "equipment.days".loc)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }

                if let rating = product.rating, rating > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill").font(.caption2).foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating)).font(.caption).fontWeight(.semibold)
                        if product.reviewCount > 0 {
                            Text("(\(product.reviewCount))").font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                }
            }

            // Shop-Button
            if !product.shopUrl.isEmpty {
                Button {
                    var urlStr = product.shopUrl
                    if !urlStr.hasPrefix("http") { urlStr = "https://" + urlStr }
                    if let url = URL(string: urlStr) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("equipment.to_shop".loc, systemImage: "cart.fill")
                        .font(.caption).fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(Color.purple).foregroundStyle(.white).cornerRadius(6)
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Suche in metashop_products
    private func searchProducts() async {
        isSearching = true
        defer { isSearching = false; hasSearched = true }

        // Suchbegriffe aus dem Equipment-Item
        let searchTerms = [item.name, item.manufacturer, item.model, item.partNumber]
            .filter { !$0.isEmpty }

        guard !searchTerms.isEmpty else { return }

        do {
            // Alle Metashop-Produkte laden
            let allProducts: [MetashopProduct] = try await authService.supabase
                .from("metashop_products").select()
                .execute().value

            // Lokal filtern: Name, Hersteller, Artikelnummer, Kategorie
            results = allProducts.filter { product in
                // 1. Exakter Artikelnummer-Match
                let partMatch = !item.partNumber.isEmpty && !product.partNumber.isEmpty
                    && product.partNumber.localizedCaseInsensitiveContains(item.partNumber)

                // 2. Hersteller-Match
                let mfgMatch = !item.manufacturer.isEmpty && !product.manufacturer.isEmpty
                    && product.manufacturer.localizedCaseInsensitiveContains(item.manufacturer)

                // 3. Name/Modell-Match
                let nameMatch = searchTerms.contains { term in
                    product.name.localizedCaseInsensitiveContains(term)
                }

                // 4. Beschreibung-Match
                let descMatch = searchTerms.contains { term in
                    product.description.localizedCaseInsensitiveContains(term)
                }

                // Artikelnummer ist stärkster Match, dann Hersteller+Name
                return partMatch || (mfgMatch && nameMatch) || (mfgMatch && descMatch) || nameMatch
            }
            .sorted { a, b in
                // Sortierung: 1. Auf Lager, 2. Preis aufsteigend (günstig → teuer)
                if a.inStock != b.inStock { return a.inStock }
                let aPrice = a.price ?? Double.greatestFiniteMagnitude
                let bPrice = b.price ?? Double.greatestFiniteMagnitude
                return aPrice < bPrice
            }
        } catch {
            AppLog.error("Metashop-Suche: \(error)")
        }
    }

    private func searchTag(_ text: String) -> some View {
        Text(text)
            .font(.caption).fontWeight(.medium)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color.purple.opacity(0.1))
            .foregroundStyle(.purple).cornerRadius(6)
    }
}

// MARK: - Equipment Parts Search with two sections (Exact Parts + Accessories)
struct EquipmentPartsSearchView: View {
    let name: String
    let manufacturer: String
    let model: String
    let partNumber: String
    let dimensions: String
    @EnvironmentObject var authService: AuthService

    @State private var originals: [MatchedProduct] = []     // Score 100 (Artikelnummer-Match)
    @State private var derivates: [MatchedProduct] = []     // Score 60–99 (Hersteller+Modell)
    @State private var related:   [MatchedProduct] = []     // Score < 60 (passende Ergänzung)
    @State private var isSearching = false
    @State private var hasSearched = false

    private let productService = ProductService.shared

    /// Produkt + erklärender Match-Grund.
    struct MatchedProduct: Identifiable {
        let product: Product
        let reason: String
        let confidence: Confidence
        var id: UUID { product.id }
        enum Confidence { case original, derivate, related }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Suchkriterien-Header
            VStack(alignment: .leading, spacing: 8) {
                Text("equipment.spare_parts_for".loc)
                    .font(.caption).foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        searchTag(name)
                        if !manufacturer.isEmpty { searchTag(manufacturer) }
                        if !model.isEmpty { searchTag(model) }
                        if !partNumber.isEmpty { searchTag("Art.\(partNumber)") }
                        if !dimensions.isEmpty { searchTag(dimensions) }
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemGray6))

            Divider()

            if isSearching {
                ProgressView("general.loading".loc)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if originals.isEmpty && derivates.isEmpty && related.isEmpty && hasSearched {
                VStack(spacing: 16) {
                    Image(systemName: "cart.badge.questionmark")
                        .font(.system(size: 48))
                        .foregroundStyle(AppColors.info.opacity(0.4))
                    Text("equipment.no_shop_found".loc)
                        .font(.subheadline).foregroundStyle(.secondary)

                    // Fallback: Online-Suche
                    Button {
                        let query = [name, manufacturer, model, partNumber, "kaufen", "marine"]
                            .filter { !$0.isEmpty }.joined(separator: " ")
                        if let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                           let url = URL(string: "https://www.google.com/search?q=\(encoded)") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Label("equipment.search_online".loc, systemImage: "safari")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(AppColors.info).foregroundStyle(.white).cornerRadius(10)
                    }
                    .padding(.horizontal, 32)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    // Sektion 1: Originalteile (Artikelnummer-Match) — grüner Rahmen
                    if !originals.isEmpty {
                        section(title: "parts.section_originals".loc,
                                icon: "checkmark.seal.fill",
                                color: AppColors.success,
                                items: originals,
                                footer: "parts.footer_originals".loc)
                    }

                    // Sektion 2: 1:1 passende Derivate (Hersteller + Modell) — blauer Rahmen
                    if !derivates.isEmpty {
                        section(title: "parts.section_derivates".loc,
                                icon: "checkmark.circle.fill",
                                color: AppColors.info,
                                items: derivates,
                                footer: "parts.footer_derivates".loc)
                    }

                    // Sektion 3: Weitere passende Ausrüstung (orange Akzentfarbe)
                    if !related.isEmpty {
                        section(title: "parts.section_related".loc,
                                icon: "plus.circle.fill",
                                color: AppColors.primary,
                                items: related,
                                footer: "parts.footer_related".loc)
                    }
                }
            }
        }
        .navigationTitle("equipment.spare_parts_title".loc)
        .task { await searchProducts() }
    }

    @ViewBuilder
    private func section(title: String, icon: String, color: Color,
                         items: [MatchedProduct], footer: String) -> some View {
        Section {
            ForEach(items) { match in
                NavigationLink {
                    ProductDetailView(product: match.product)
                        .environmentObject(authService)
                } label: {
                    partsProductRow(match)
                }
                .buttonStyle(.plain)
            }
        } header: {
            HStack(spacing: 6) {
                Image(systemName: icon).foregroundStyle(color)
                Text(title).fontWeight(.semibold).foregroundStyle(color)
                Text("(\(items.count))").foregroundStyle(.secondary)
                Spacer()
            }
            .font(.subheadline)
            .textCase(nil)
        } footer: {
            Text(footer).font(.caption2)
        }
    }

    // MARK: - Search Logic
    //
    // Bucket-Klassifikation mit Begründung — drei Sektionen:
    //   ORIGINAL  (Artikelnummer-Match)        → grün
    //   DERIVATE  (Hersteller + Modell)        → blau
    //   RELATED   (Wort-Match, Modul-Familie)  → neutral
    //
    private func searchProducts() async {
        isSearching = true
        defer { isSearching = false; hasSearched = true }

        let searchTerms = [name, manufacturer, model, partNumber]
            .filter { !$0.isEmpty }
        guard !searchTerms.isEmpty else { return }

        let nameWords = name.lowercased().split(separator: " ")
            .map(String.init).filter { $0.count >= 3 }
        let normPart  = partNumber.trimmingCharacters(in: .whitespaces).lowercased()
        let normMfg   = manufacturer.trimmingCharacters(in: .whitespaces).lowercased()
        let normModel = model.trimmingCharacters(in: .whitespaces).lowercased()

        do {
            // Breite Volltextsuche über den ProductService → liefert Product
            // mit allen In-App-Feldern und ermöglicht NavigationLink zu ProductDetailView.
            let query = [manufacturer, model, name].filter { !$0.isEmpty }.joined(separator: " ")
            let allProducts: [Product] = try await productService.searchProductsBroad(query: query, limit: 80)

            struct Scored { let product: Product; var score: Int; var reason: String }
            var scored: [Scored] = []

            for product in allProducts {
                let pName = product.name.lowercased()
                let pMfg  = (product.manufacturer ?? "").lowercased()
                let pPart = (product.partNumber ?? "").lowercased()
                let pDesc = (product.description ?? "").lowercased()
                let pCat  = (product.category?.nameDe ?? "").lowercased()
                let pTags = (product.tags ?? []).map { $0.lowercased() }

                var score = 0
                var reason = ""

                // ORIGINAL: Exakter Artikelnummer-Match
                if !normPart.isEmpty && !pPart.isEmpty
                    && (pPart == normPart || pPart.contains(normPart) || normPart.contains(pPart)) {
                    score = 100
                    reason = "parts.reason_part_match".loc
                }

                let mfgMatch   = !normMfg.isEmpty && pMfg.contains(normMfg)
                let modelMatch = !normModel.isEmpty
                                 && (pName.contains(normModel) || pDesc.contains(normModel))
                let nameMatch  = nameWords.contains { pName.contains($0) }

                // DERIVATE (80): Hersteller + Modell + Name passen alle
                if mfgMatch && modelMatch && nameMatch && score < 80 {
                    score = 80
                    reason = "parts.reason_mfg_model_name".loc
                }
                // DERIVATE (60): Hersteller + Modell
                if mfgMatch && modelMatch && score < 60 {
                    score = 60
                    reason = "parts.reason_mfg_model".loc
                }

                // RELATED (40): Gleicher Hersteller, gleiche Kategorie (Modul-Familie)
                if mfgMatch && nameWords.contains(where: { pCat.contains($0) }) && score < 40 {
                    score = 40
                    reason = "parts.reason_product_family".loc
                }
                // RELATED (30): Gleicher Hersteller, kein Modell-Match (anderes Produkt derselben Marke)
                if mfgMatch && score == 0 {
                    score = 30
                    reason = "parts.reason_same_mfg".loc
                }

                // RELATED (20): Wort-Match in Name/Beschreibung/Kategorie/Tags
                let wordMatch = nameWords.contains { word in
                    pName.contains(word) || pDesc.contains(word)
                        || pCat.contains(word) || pTags.contains(where: { $0.contains(word) })
                }
                if wordMatch && score == 0 {
                    score = 20
                    reason = "parts.reason_possible_match".loc
                }

                // Maße-Match (Seile, Ketten, Segel): dezenter Bonus
                if !dimensions.isEmpty && !pDesc.isEmpty
                    && pDesc.localizedCaseInsensitiveContains(dimensions) {
                    score += 10
                    let dimLabel = "parts.reason_dimensions".loc
                    reason = reason.isEmpty ? dimLabel : reason + " · \(dimLabel)"
                }

                if score > 0 {
                    scored.append(.init(product: product, score: score, reason: reason))
                }
            }

            // Sortierung: Score absteigend, dann auf Lager, dann Preis
            scored.sort { a, b in
                if a.score != b.score { return a.score > b.score }
                let aStock = a.product.inStock ?? false
                let bStock = b.product.inStock ?? false
                if aStock != bStock { return aStock }
                let aP = a.product.price ?? Double.greatestFiniteMagnitude
                let bP = b.product.price ?? Double.greatestFiniteMagnitude
                return aP < bP
            }

            // Drei Buckets
            originals = scored.filter { $0.score >= 100 }
                .map { MatchedProduct(product: $0.product, reason: $0.reason, confidence: .original) }
            derivates = scored.filter { $0.score >= 60 && $0.score < 100 }
                .map { MatchedProduct(product: $0.product, reason: $0.reason, confidence: .derivate) }
            related   = scored.filter { $0.score < 60 }
                .map { MatchedProduct(product: $0.product, reason: $0.reason, confidence: .related) }

        } catch {
            AppLog.error("Equipment Parts Search: \(error)")
        }
    }

    @ViewBuilder
    private func partsProductRow(_ match: MatchedProduct) -> some View {
        let product = match.product
        let mc = matchColor(for: match.confidence)

        VStack(alignment: .leading, spacing: 8) {
            // Match-Grund als kleine Überschrift
            HStack(spacing: 6) {
                Image(systemName: matchIcon(for: match.confidence))
                    .font(.caption).fontWeight(.bold)
                    .foregroundStyle(.white)
                Text(match.reason.isEmpty ? "parts.reason_fallback".loc : match.reason)
                    .font(.caption).fontWeight(.bold)
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(mc)
            .clipShape(Capsule())

            HStack(spacing: 12) {
                // Produkt-Bild
                let imgString = product.images?.first ?? product.imageUrl
                if let imgString, let url = URL(string: imgString) {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                        } else {
                            Image(systemName: "shippingbox.fill")
                                .foregroundStyle(AppColors.info)
                        }
                    }
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Image(systemName: "shippingbox.fill")
                        .font(.title3).foregroundStyle(AppColors.info)
                        .frame(width: 56, height: 56)
                        .background(AppColors.info.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(product.name).font(.subheadline).fontWeight(.semibold).lineLimit(2)
                    if let mfg = product.manufacturer, !mfg.isEmpty {
                        Text(mfg).font(.caption).foregroundStyle(textColor(for: match.confidence))
                    }
                    if let part = product.partNumber, !part.isEmpty {
                        Text("equipment.article_no".loc + " \(part)")
                            .font(.caption2).foregroundStyle(textColor(for: match.confidence).opacity(0.75))
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(product.displayPrice).font(.headline).fontWeight(.bold)
                    let stock = product.inStock ?? false
                    HStack(spacing: 3) {
                        Circle()
                            .fill(stock ? AppColors.success : AppColors.error)
                            .frame(width: 6, height: 6)
                        Text(stock ? "equipment.in_stock".loc : "equipment.out_of_stock".loc)
                            .font(.caption2)
                            .foregroundStyle(stock ? AppColors.success : AppColors.error)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        // Rahmen je nach Klasse:
        //   .original → grün, .derivate → blau, .related → kein Rahmen
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(frameColor(for: match.confidence) ?? .clear,
                        lineWidth: frameColor(for: match.confidence) == nil ? 0 : 1.5)
        )
    }

    private func searchTag(_ text: String) -> some View {
        Text(text)
            .font(.caption).fontWeight(.medium)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(AppColors.info.opacity(0.10))
            .foregroundStyle(AppColors.info).cornerRadius(6)
    }

    // MARK: - Match-Konfidenz: Icon, Pillenfarbe, Rahmenfarbe
    private func matchIcon(for c: MatchedProduct.Confidence) -> String {
        switch c {
        case .original: return "checkmark.seal.fill"
        case .derivate: return "checkmark.circle.fill"
        case .related:  return "plus.circle.fill"
        }
    }
    /// Pillenfarbe (Match-Reason-Chip + "Vom selben Hersteller"-Chip):
    ///   Original → grün, Derivat → blau, Related → orange
    /// (KEIN grau! Grau wirkt wie "nicht verfügbar".)
    private func matchColor(for c: MatchedProduct.Confidence) -> Color {
        switch c {
        case .original: return AppColors.success
        case .derivate: return AppColors.info
        case .related:  return AppColors.primary
        }
    }

    /// Rahmenfarbe um die Produkt-Karte:
    ///   Original → grün, Derivat → blau, Related → orange
    /// Alle drei Stufen bekommen jetzt einen sichtbaren Rahmen.
    private func frameColor(for c: MatchedProduct.Confidence) -> Color? {
        switch c {
        case .original: return AppColors.success
        case .derivate: return AppColors.info
        case .related:  return AppColors.primary
        }
    }

    /// Textfarbe für Hersteller / Artikelnummer im Karten-Body:
    ///   Original → grün, Derivat → blau, Related → orange
    private func textColor(for c: MatchedProduct.Confidence) -> Color {
        switch c {
        case .original: return AppColors.success
        case .derivate: return AppColors.info
        case .related:  return AppColors.primary
        }
    }
}

// MARK: - Standort-Manager für Equipment-Suche
@MainActor
class EquipmentSearchLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var currentLocation: CLLocation?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            currentLocation = loc
            manager.stopUpdatingLocation()
        }
    }
}
