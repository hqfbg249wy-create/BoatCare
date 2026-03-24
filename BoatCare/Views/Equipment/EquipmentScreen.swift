//
//  EquipmentScreen.swift
//  BoatCare
//

import SwiftUI
import Supabase
import CoreLocation
import Combine

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
        case "anchor", "anker": return "anchor.fill"
        case "communication", "kommunikation": return "antenna.radiowaves.left.and.right"
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
        case "anchor", "anker": return .brown
        case "communication", "kommunikation": return .teal
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
    "navigation", "safety", "engine", "electrical", "rigging", "anchor", "communication", "other"
]

// MARK: - Equipment Navigation Target
enum EquipmentNavTarget: Hashable {
    case service(name: String, category: String)
    case spareParts(name: String, manufacturer: String, model: String, partNumber: String, dimensions: String)
    case aiAssistant(question: String)
}

// MARK: - Equipment Screen (Supabase)
struct EquipmentScreen: View {
    let boatId: UUID
    let boatName: String
    let onNavigate: ((EquipmentNavTarget) -> Void)?
    @EnvironmentObject var authService: AuthService

    @State private var items: [EquipmentItem] = []
    @State private var isLoading = false
    @State private var showingAdd = false
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
                            onNavigate: { target in
                                if let nav = onNavigate {
                                    nav(target)
                                }
                            },
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
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddEditEquipmentView(boatId: boatId, item: nil) { newItem in
                Task { await addItem(newItem) }
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
            Button { showingAdd = true } label: {
                Label("equipment.add".loc, systemImage: "plus.circle.fill")
            }.buttonStyle(.borderedProminent)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func catChip(_ cat: String?, label: String) -> some View {
        let isSel = selectedCategory == cat
        return Button { selectedCategory = cat } label: {
            Text(label).font(.subheadline)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(isSel ? Color.blue : Color(.systemGray6))
                .foregroundStyle(isSel ? .white : .primary).cornerRadius(16)
        }
    }

    // MARK: - Supabase CRUD
    private func loadItems() async {
        isLoading = true; defer { isLoading = false }
        do {
            let result: [EquipmentItem] = try await authService.supabase
                .from("equipment").select()
                .eq("boat_id", value: boatId.uuidString)
                .order("created_at", ascending: true)
                .execute().value
            items = result
        } catch {
            print("❌ Equipment laden: \(error)")
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
        } catch { print("❌ Equipment hinzufügen: \(error)") }
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
        } catch { print("❌ Equipment aktualisieren: \(error)") }
    }

    private func deleteItem(_ item: EquipmentItem) async {
        items.removeAll { $0.id == item.id }
        do {
            try await authService.supabase.from("equipment")
                .delete().eq("id", value: item.id.uuidString).execute()
        } catch { print("❌ Equipment löschen: \(error)") }
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
    let onNavigate: ((EquipmentNavTarget) -> Void)?
    let onUpdate: (EquipmentItem) -> Void
    let onDelete: () -> Void
    @EnvironmentObject var authService: AuthService
    @State private var showActions = false
    @State private var showingEdit = false
    @State private var showingService = false
    @State private var showingParts = false
    @State private var showingAI = false

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

            // Action buttons (expandable) — like Maintenance screen
            if showActions {
                HStack(spacing: 8) {
                    // Service suchen
                    Button {
                        if let nav = onNavigate {
                            nav(.service(name: item.name, category: item.category))
                        } else {
                            showingService = true
                        }
                    } label: {
                        EquipmentActionButton(title: "Service", icon: "wrench.and.screwdriver.fill", color: .orange)
                    }
                    .buttonStyle(.plain)

                    // Ersatzteile suchen
                    Button {
                        if let nav = onNavigate {
                            nav(.spareParts(
                                name: item.name, manufacturer: item.manufacturer,
                                model: item.model, partNumber: item.partNumber, dimensions: item.dimensions
                            ))
                        } else {
                            showingParts = true
                        }
                    } label: {
                        EquipmentActionButton(title: "Ersatzteile", icon: "cart.fill", color: .purple)
                    }
                    .buttonStyle(.plain)

                    // KI-Assistent
                    Button {
                        let details = [
                            item.name,
                            item.manufacturer.isEmpty ? "" : "Hersteller: \(item.manufacturer)",
                            item.model.isEmpty ? "" : "Modell: \(item.model)",
                            item.dimensions.isEmpty ? "" : "Abmessungen: \(item.dimensions)",
                            item.locationOnBoat.isEmpty ? "" : "Ort: \(item.locationOnBoat)",
                            item.itemDescription.isEmpty ? "" : item.itemDescription
                        ].filter { !$0.isEmpty }.joined(separator: ", ")
                        let question = "Ich brauche Hilfe mit meinem Ausruestungsgegenstand auf der \(boatName): \(details). Kategorie: \(item.category). Was empfiehlst du?"
                        if let nav = onNavigate {
                            nav(.aiAssistant(question: question))
                        } else {
                            showingAI = true
                        }
                    } label: {
                        EquipmentActionButton(title: "KI-Assistent", icon: "bubble.left.fill", color: .blue)
                    }
                    .buttonStyle(.plain)

                    // Bearbeiten (statt Erledigt)
                    Button { showingEdit = true } label: {
                        EquipmentActionButton(title: "Bearbeiten", icon: "pencil.circle.fill", color: .green)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 8)
                .padding(.top, 4)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .sheet(isPresented: $showingEdit) {
            AddEditEquipmentView(boatId: item.boatId, item: item) { updated in
                onUpdate(updated)
            }
        }
        .sheet(isPresented: $showingService) {
            NavigationStack {
                ServiceSearchFromMaintenance(equipmentName: item.name, category: item.category)
                    .environmentObject(authService)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Schliessen") { showingService = false }
                        }
                    }
            }
        }
        .sheet(isPresented: $showingParts) {
            NavigationStack {
                EquipmentPartsSearchView(
                    name: item.name, manufacturer: item.manufacturer,
                    model: item.model, partNumber: item.partNumber, dimensions: item.dimensions
                )
                .environmentObject(authService)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Schliessen") { showingParts = false }
                    }
                }
            }
        }
        .sheet(isPresented: $showingAI) {
            NavigationStack {
                ChatScreen(initialQuestion: aiQuestion)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Schliessen") { showingAI = false }
                        }
                    }
            }
        }
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

    var body: some View {
        List {
            // Header
            Section {
                HStack(spacing: 16) {
                    if let url = item.photoUrl ?? item.imageUrl, let imgURL = URL(string: url) {
                        AsyncImage(url: imgURL) { phase in
                            if case .success(let img) = phase {
                                img.resizable().scaledToFill()
                                    .frame(width: 70, height: 70)
                                    .clipShape(RoundedRectangle(cornerRadius: 16))
                            } else { catIcon }
                        }
                    } else { catIcon }
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

            // Aktionen: Service suchen + Metashop suchen
            Section("equipment.actions".loc) {
                NavigationLink {
                    ServiceSearchFromEquipment(item: item)
                        .environmentObject(authService)
                } label: {
                    Label("equipment.find_service".loc, systemImage: "wrench.and.screwdriver")
                        .foregroundStyle(.blue)
                }
                NavigationLink {
                    MetashopSearchFromEquipment(item: item)
                        .environmentObject(authService)
                } label: {
                    Label("equipment.find_parts".loc, systemImage: "cart")
                        .foregroundStyle(.purple)
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
    let onSave: (EquipmentItem) -> Void
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var category = "other"
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

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("equipment.name".loc, text: $name)
                    Picker("equipment.category".loc, selection: $category) {
                        ForEach(equipmentCategories, id: \.self) { cat in
                            Text("equipment.cat.\(cat)".loc).tag(cat)
                        }
                    }
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
                Section {
                    TextField("equipment.photo_url".loc, text: $photoUrl)
                        .keyboardType(.URL).autocapitalization(.none)
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
                        let df = EquipmentItem.dateFormatter
                        let cycle = Int(cycleText.trimmingCharacters(in: .whitespaces))
                        let lastMD = hasLastMaintenance ? df.string(from: lastMaintenance) : item?.lastMaintenanceDate
                        // Berechne nächste Wartung automatisch
                        var nextMD = item?.nextMaintenanceDate
                        if let lastStr = lastMD, let lastDate = df.date(from: lastStr), let cy = cycle {
                            if let next = Calendar.current.date(byAdding: .year, value: cy, to: lastDate) {
                                nextMD = df.string(from: next)
                            }
                        }
                        let saved = EquipmentItem(
                            id: item?.id ?? UUID(), boatId: boatId,
                            name: name, category: category, manufacturer: manufacturer,
                            model: model, serialNumber: serialNumber,
                            installationDate: hasInstallationDate ? df.string(from: installationDate) : nil,
                            warrantyExpiry: hasWarrantyExpiry ? df.string(from: warrantyExpiry) : nil,
                            notes: notes, imageUrl: item?.imageUrl,
                            lastMaintenanceDate: lastMD, nextMaintenanceDate: nextMD,
                            maintenanceCycleYears: cycle, partNumber: partNumber,
                            locationOnBoat: locationOnBoat, dimensions: dimensions,
                            photoUrl: photoUrl.isEmpty ? nil : photoUrl,
                            itemDescription: itemDescription
                        )
                        onSave(saved); dismiss()
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
}

// MARK: - Service-Suche aus Equipment heraus (mit Standort + Radius)
struct ServiceSearchFromEquipment: View {
    let item: EquipmentItem
    @EnvironmentObject var authService: AuthService
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
                        Text("Standort nicht verfügbar – Entfernungen können nicht angezeigt werden. Bitte Ortungsdienste aktivieren.")
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
                                        .environmentObject(FavoritesManager())
                                        .environmentObject(authService)
                                } label: {
                                    serviceRow(entry)
                                }
                            }
                        } header: {
                            Label("Kategorie & Marke passend", systemImage: "checkmark.seal.fill")
                                .font(.caption).fontWeight(.semibold)
                                .foregroundStyle(.orange)
                        }
                    }
                    if !otherMatches.isEmpty {
                        Section {
                            ForEach(otherMatches, id: \.provider.id) { entry in
                                NavigationLink {
                                    ServiceProviderDetailView(provider: toServiceProvider(entry.provider))
                                        .environmentObject(FavoritesManager())
                                        .environmentObject(authService)
                                } label: {
                                    serviceRow(entry)
                                }
                            }
                        } header: {
                            if !bestMatches.isEmpty {
                                Label("Weitere Anbieter", systemImage: "building.2.fill")
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
                if let logoUrl = entry.provider.logo_url, let url = URL(string: logoUrl) {
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
        } catch { print("❌ Service-Suche: \(error)") }
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
                            Text("Art.-Nr.:").font(.caption2).foregroundStyle(.tertiary)
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
            print("❌ Metashop-Suche: \(error)")
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
    @State private var exactParts: [MetashopProduct] = []
    @State private var accessories: [MetashopProduct] = []
    @State private var isSearching = false
    @State private var hasSearched = false

    var body: some View {
        VStack(spacing: 0) {
            // Search criteria header
            VStack(alignment: .leading, spacing: 8) {
                Text("Ersatzteile & Zubehoer fuer:")
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
            } else if exactParts.isEmpty && accessories.isEmpty && hasSearched {
                VStack(spacing: 16) {
                    Image(systemName: "cart.badge.questionmark")
                        .font(.system(size: 48)).foregroundStyle(.purple.opacity(0.3))
                    Text("equipment.no_shop_found".loc)
                        .font(.subheadline).foregroundStyle(.secondary)

                    // Fallback: Google search
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
                            .background(Color.purple).foregroundStyle(.white).cornerRadius(10)
                    }
                    .padding(.horizontal, 32)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    // Section 1: Exact replacement parts
                    if !exactParts.isEmpty {
                        Section {
                            ForEach(exactParts) { product in
                                partsProductRow(product)
                            }
                        } header: {
                            Label("Passende Ersatzteile", systemImage: "checkmark.seal.fill")
                                .font(.subheadline).fontWeight(.semibold)
                                .foregroundStyle(.purple)
                        }
                    }

                    // Section 2: Matching accessories
                    if !accessories.isEmpty {
                        Section {
                            ForEach(accessories) { product in
                                partsProductRow(product)
                            }
                        } header: {
                            Label("Passendes Zubehoer", systemImage: "plus.circle.fill")
                                .font(.subheadline).fontWeight(.semibold)
                                .foregroundStyle(.blue)
                        }
                    }
                }
            }
        }
        .navigationTitle("Ersatzteile")
        .task { await searchProducts() }
    }

    // MARK: - Search Logic
    private func searchProducts() async {
        isSearching = true
        defer { isSearching = false; hasSearched = true }

        let searchTerms = [name, manufacturer, model, partNumber]
            .filter { !$0.isEmpty }
        guard !searchTerms.isEmpty else { return }

        // Split name into individual words for broader matching
        let nameWords = name.lowercased().split(separator: " ").map(String.init).filter { $0.count >= 3 }

        do {
            let allProducts: [MetashopProduct] = try await authService.supabase
                .from("metashop_products").select()
                .execute().value

            var exact: [MetashopProduct] = []
            var accessory: [MetashopProduct] = []
            let usedIds = Set<UUID>()

            for product in allProducts {
                let pName = product.name.lowercased()
                let pMfg = product.manufacturer.lowercased()
                let pPart = product.partNumber.lowercased()
                let pDesc = product.description.lowercased()
                let pCat = product.category.lowercased()

                // Exact part match: part number, or (manufacturer + name/model match)
                let partMatch = !partNumber.isEmpty && !pPart.isEmpty
                    && pPart.localizedCaseInsensitiveContains(partNumber)

                let mfgMatch = !manufacturer.isEmpty && !pMfg.isEmpty
                    && pMfg.localizedCaseInsensitiveContains(manufacturer)

                let nameMatch = searchTerms.contains { term in
                    pName.localizedCaseInsensitiveContains(term)
                }

                let modelMatch = !model.isEmpty
                    && pName.localizedCaseInsensitiveContains(model)

                // Strong matches → exact parts (replacement)
                if partMatch || (mfgMatch && (nameMatch || modelMatch)) {
                    exact.append(product)
                    continue
                }

                // Weaker matches → accessories (related products)
                // Match if any name word appears in product name/description/category
                let wordMatch = nameWords.contains { word in
                    pName.contains(word) || pDesc.contains(word) || pCat.contains(word)
                }

                // Dimension-based matching for ropes, sails, chains etc.
                let dimMatch = !dimensions.isEmpty && !pDesc.isEmpty
                    && pDesc.localizedCaseInsensitiveContains(dimensions)

                if wordMatch || dimMatch || (mfgMatch && !nameMatch) {
                    if !usedIds.contains(product.id) {
                        accessory.append(product)
                    }
                }
            }

            // Sort: in-stock first, then by price
            let sortFn: (MetashopProduct, MetashopProduct) -> Bool = { a, b in
                if a.inStock != b.inStock { return a.inStock }
                let aP = a.price ?? Double.greatestFiniteMagnitude
                let bP = b.price ?? Double.greatestFiniteMagnitude
                return aP < bP
            }

            exactParts = exact.sorted(by: sortFn)
            accessories = accessory.sorted(by: sortFn)

            // Remove duplicates from accessories that appear in exactParts
            let exactIds = Set(exactParts.map { $0.id })
            accessories = accessories.filter { !exactIds.contains($0.id) }

        } catch {
            print("❌ Equipment Parts Search: \(error)")
        }
    }

    @ViewBuilder
    private func partsProductRow(_ product: MetashopProduct) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                if let imgUrl = product.imageUrl, let url = URL(string: imgUrl) {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                        } else {
                            Image(systemName: "shippingbox.fill").foregroundStyle(.purple)
                        }
                    }
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Image(systemName: "shippingbox.fill")
                        .font(.title3).foregroundStyle(.purple)
                        .frame(width: 56, height: 56)
                        .background(Color.purple.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(product.name).font(.subheadline).fontWeight(.semibold).lineLimit(2)
                    if !product.manufacturer.isEmpty {
                        Text(product.manufacturer).font(.caption).foregroundStyle(.secondary)
                    }
                    if !product.partNumber.isEmpty {
                        Text("Art.-Nr.: \(product.partNumber)").font(.caption2).foregroundStyle(.tertiary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    if let priceStr = product.formattedPrice {
                        Text(priceStr).font(.headline).fontWeight(.bold)
                    }
                    HStack(spacing: 3) {
                        Circle().fill(product.inStock ? .green : .red).frame(width: 6, height: 6)
                        Text(product.inStock ? "Auf Lager" : "Nicht verfuegbar")
                            .font(.caption2).foregroundStyle(product.inStock ? .green : .red)
                    }
                }
            }

            // Shop button
            if !product.shopUrl.isEmpty {
                Button {
                    var urlStr = product.shopUrl
                    if !urlStr.hasPrefix("http") { urlStr = "https://" + urlStr }
                    if let url = URL(string: urlStr) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Zum Shop", systemImage: "cart.fill")
                        .font(.caption).fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(Color.purple).foregroundStyle(.white).cornerRadius(6)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func searchTag(_ text: String) -> some View {
        Text(text)
            .font(.caption).fontWeight(.medium)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color.purple.opacity(0.1))
            .foregroundStyle(.purple).cornerRadius(6)
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
