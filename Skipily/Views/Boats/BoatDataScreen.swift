//
//  BoatDataScreen.swift
//  Skipily
//

import SwiftUI
import Supabase
import PhotosUI

// MARK: - Boat Model
// Spiegelt das vollständige Supabase-Schema der Tabelle "boats" wider.
struct Boat: Identifiable, Codable {
    var id: UUID
    var ownerId: UUID?
    var name: String
    var boatType: String
    var manufacturer: String
    var model: String
    var year: Int?
    var yearBuilt: Int?
    var lengthMeters: Double?
    var width: Double?
    var draft: Double?
    var engine: String
    var homePort: String
    var registrationNumber: String
    var hin: String              // Hull Identification Number
    var imageUrl: String?

    // Computed helpers für UI
    var yearString: String {
        guard let y = year else { return "" }
        return String(y)
    }
    var yearBuiltString: String {
        guard let y = yearBuilt else { return "" }
        return String(y)
    }
    var lengthString: String {
        guard let l = lengthMeters else { return "" }
        return l.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(l)) : String(format: "%.1f", l)
    }
    var widthString: String {
        guard let w = width else { return "" }
        return w.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(w)) : String(format: "%.2f", w)
    }
    var draftString: String {
        guard let d = draft else { return "" }
        return d.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(d)) : String(format: "%.2f", d)
    }

    // Memberwise init
    init(id: UUID = UUID(), ownerId: UUID? = nil, name: String = "", boatType: String = "",
         manufacturer: String = "", model: String = "", year: Int? = nil, yearBuilt: Int? = nil,
         lengthMeters: Double? = nil, width: Double? = nil, draft: Double? = nil,
         engine: String = "", homePort: String = "", registrationNumber: String = "",
         hin: String = "", imageUrl: String? = nil) {
        self.id = id; self.ownerId = ownerId; self.name = name; self.boatType = boatType
        self.manufacturer = manufacturer; self.model = model; self.year = year
        self.yearBuilt = yearBuilt; self.lengthMeters = lengthMeters; self.width = width
        self.draft = draft; self.engine = engine; self.homePort = homePort
        self.registrationNumber = registrationNumber; self.hin = hin; self.imageUrl = imageUrl
    }

    enum CodingKeys: String, CodingKey {
        case id, name, manufacturer, model, year, engine, hin, width, draft
        case boatType           = "boat_type"
        case ownerId            = "owner_id"
        case homePort           = "home_port"
        case lengthMeters       = "length_meters"
        case yearBuilt          = "year_built"
        case registrationNumber = "registration_number"
        case imageUrl           = "image_url"
    }

    // Robuster Decoder — crasht nicht bei fehlenden/falschen Spaltentypen
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id                 = try c.decode(UUID.self, forKey: .id)
        ownerId            = try? c.decode(UUID.self, forKey: .ownerId)
        name               = (try? c.decode(String.self, forKey: .name)) ?? ""
        boatType           = (try? c.decode(String.self, forKey: .boatType)) ?? ""
        manufacturer       = (try? c.decode(String.self, forKey: .manufacturer)) ?? ""
        model              = (try? c.decode(String.self, forKey: .model)) ?? ""
        engine             = (try? c.decode(String.self, forKey: .engine)) ?? ""
        homePort           = (try? c.decode(String.self, forKey: .homePort)) ?? ""
        registrationNumber = (try? c.decode(String.self, forKey: .registrationNumber)) ?? ""
        hin                = (try? c.decode(String.self, forKey: .hin)) ?? ""
        imageUrl           = try? c.decode(String.self, forKey: .imageUrl)

        // Flexible Int-Felder (bigint oder text)
        year      = Self.decodeFlexibleInt(c, key: .year)
        yearBuilt = Self.decodeFlexibleInt(c, key: .yearBuilt)

        // Flexible Double-Felder (numeric)
        lengthMeters = Self.decodeFlexibleDouble(c, key: .lengthMeters)
        width        = Self.decodeFlexibleDouble(c, key: .width)
        draft        = Self.decodeFlexibleDouble(c, key: .draft)
    }

    private static func decodeFlexibleInt(_ c: KeyedDecodingContainer<CodingKeys>, key: CodingKeys) -> Int? {
        if let i = try? c.decode(Int.self, forKey: key) { return i }
        if let s = try? c.decode(String.self, forKey: key), let i = Int(s) { return i }
        return nil
    }
    private static func decodeFlexibleDouble(_ c: KeyedDecodingContainer<CodingKeys>, key: CodingKeys) -> Double? {
        if let d = try? c.decode(Double.self, forKey: key) { return d }
        if let i = try? c.decode(Int.self, forKey: key) { return Double(i) }
        if let s = try? c.decode(String.self, forKey: key), let d = Double(s) { return d }
        return nil
    }
}

// MARK: - Supabase Insert/Update Helpers
private struct BoatInsert: Encodable {
    let owner_id: String
    let name: String
    let boat_type: String
    let manufacturer: String
    let model: String
    let year: Int?
    let year_built: Int?
    let length_meters: Double?
    let width: Double?
    let draft: Double?
    let engine: String
    let home_port: String
    let registration_number: String
    let hin: String
    let image_url: String?
}

private struct BoatUpdate: Encodable {
    let name: String
    let boat_type: String
    let manufacturer: String
    let model: String
    let year: Int?
    let year_built: Int?
    let length_meters: Double?
    let width: Double?
    let draft: Double?
    let engine: String
    let home_port: String
    let registration_number: String
    let hin: String
    let image_url: String?
}

private func makeInsert(userId: UUID, boat: Boat) -> BoatInsert {
    BoatInsert(owner_id: userId.uuidString, name: boat.name, boat_type: boat.boatType,
               manufacturer: boat.manufacturer, model: boat.model, year: boat.year,
               year_built: boat.yearBuilt, length_meters: boat.lengthMeters,
               width: boat.width, draft: boat.draft, engine: boat.engine,
               home_port: boat.homePort, registration_number: boat.registrationNumber,
               hin: boat.hin, image_url: boat.imageUrl)
}

private func makeUpdate(boat: Boat) -> BoatUpdate {
    BoatUpdate(name: boat.name, boat_type: boat.boatType,
               manufacturer: boat.manufacturer, model: boat.model, year: boat.year,
               year_built: boat.yearBuilt, length_meters: boat.lengthMeters,
               width: boat.width, draft: boat.draft, engine: boat.engine,
               home_port: boat.homePort, registration_number: boat.registrationNumber,
               hin: boat.hin, image_url: boat.imageUrl)
}

// MARK: - Boat Data Screen
struct BoatDataScreen: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager

    @State private var boats: [Boat] = []
    @State private var equipmentCounts: [UUID: Int] = [:]
    @State private var showingAddBoat = false
    @State private var isLoading = false
    @State private var showingLoginRequired = false
    @State private var showingLogin = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("general.loading".loc)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if boats.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(boats) { boat in
                                VStack(spacing: 0) {
                                    BoatCardView(
                                        boat: boat,
                                        onUpdate: { updated in Task { await updateBoat(updated) } },
                                        onDelete: { Task { await deleteBoatById(boat.id) } }
                                    )
                                    .environmentObject(authService)

                                    // Equipment-Button direkt unter der Karte
                                    NavigationLink {
                                        EquipmentScreen(boatId: boat.id, boatName: boat.name)
                                            .environmentObject(authService)
                                    } label: {
                                        HStack(spacing: 8) {
                                            Image(systemName: "wrench.and.screwdriver")
                                                .foregroundStyle(.orange)
                                            if let count = equipmentCounts[boat.id], count > 0 {
                                                Text("\(count) " + "equipment.title".loc)
                                                    .foregroundStyle(.primary)
                                            } else {
                                                Text("equipment.title".loc)
                                                    .foregroundStyle(.primary)
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.caption)
                                                .foregroundStyle(.tertiary)
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 12)
                                        .background(Color(.systemBackground))
                                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 1)
                                    }
                                    .buttonStyle(.plain)
                                    .padding(.top, 6)
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 8)
                    }
                }
            }
            .navigationTitle("boats.title".loc)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if authService.isAuthenticated {
                            showingAddBoat = true
                        } else {
                            showingLoginRequired = true
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddBoat) {
                AddEditBoatView(boat: nil) { newBoat in
                    Task { await addBoat(newBoat) }
                }
                .environmentObject(authService)
            }
            .sheet(isPresented: $showingLogin) {
                LoginView()
            }
            .alert("map.login_required".loc, isPresented: $showingLoginRequired) {
                Button("general.cancel".loc, role: .cancel) { }
                Button("auth.login".loc) { showingLogin = true }
            } message: {
                Text("boats.login_required".loc)
            }
            .alert("general.error".loc, isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("general.ok".loc, role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
        .task { await waitForSessionAndLoad() }
        .onAppear {
            // Beim Zurückkehren aus DetailView Boote aktualisieren (z.B. nach Bild-Upload)
            if authService.isAuthenticated && !boats.isEmpty {
                Task { await loadFromSupabase() }
            }
        }
        .onChange(of: authService.currentUser) { _, newUser in
            if let _ = newUser {
                Task {
                    await loadFromSupabase()
                    await loadEquipmentCounts()
                }
            } else {
                boats = []
                equipmentCounts = [:]
                loadFromUserDefaults()
            }
        }
    }

    private func waitForSessionAndLoad() async {
        var waited = 0
        while !authService.sessionRestored && waited < 50 {
            try? await Task.sleep(nanoseconds: 100_000_000)
            waited += 1
        }
        loadBoats()
        await loadEquipmentCounts()
    }

    private func loadEquipmentCounts() async {
        guard authService.isAuthenticated else { return }
        for boat in boats {
            do {
                let items: [EquipmentItem] = try await authService.supabase
                    .from("equipment_items").select()
                    .eq("boat_id", value: boat.id.uuidString)
                    .execute().value
                equipmentCounts[boat.id] = items.count
            } catch {
                equipmentCounts[boat.id] = 0
            }
        }
    }

    private func deleteBoatById(_ id: UUID) async {
        boats.removeAll { $0.id == id }
        if authService.isAuthenticated {
            try? await authService.supabase.from("boats")
                .delete().eq("id", value: id.uuidString).execute()
        } else {
            saveToUserDefaults()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "ferry.fill")
                .font(.system(size: 60))
                .foregroundStyle(.blue.opacity(0.3))
            Text("boats.no_boats".loc)
                .font(.headline)
                .foregroundStyle(.secondary)
            if !authService.isAuthenticated {
                Text("boats.login_required".loc)
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            Button {
                if authService.isAuthenticated { showingAddBoat = true }
                else { showingLoginRequired = true }
            } label: {
                Label("boats.add".loc, systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Load
    private func loadBoats() {
        if authService.isAuthenticated {
            Task { await loadFromSupabase() }
        } else {
            loadFromUserDefaults()
        }
    }

    private func loadFromUserDefaults() {
        guard let data = UserDefaults.standard.data(forKey: "savedBoats"),
              let loaded = try? JSONDecoder().decode([Boat].self, from: data) else { return }
        boats = loaded
    }

    private func loadFromSupabase() async {
        guard let userId = authService.currentUser?.id else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let result: [Boat] = try await authService.supabase
                .from("boats").select()
                .eq("owner_id", value: userId.uuidString)
                .order("created_at", ascending: true)
                .execute().value
            boats = result
            await migrateLocalBoatsIfNeeded(userId: userId)
        } catch {
            AppLog.error("Error loading boats: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    private func migrateLocalBoatsIfNeeded(userId: UUID) async {
        let key = "boatsMigratedToSupabase_\(userId.uuidString)"
        guard !UserDefaults.standard.bool(forKey: key),
              let data = UserDefaults.standard.data(forKey: "savedBoats"),
              let localBoats = try? JSONDecoder().decode([Boat].self, from: data),
              !localBoats.isEmpty else {
            UserDefaults.standard.set(true, forKey: key); return
        }
        let inserts = localBoats.map { makeInsert(userId: userId, boat: $0) }
        do {
            try await authService.supabase.from("boats").insert(inserts).execute()
            UserDefaults.standard.set(true, forKey: key)
            await loadFromSupabase()
        } catch { AppLog.error("Migration failed: \(error)") }
    }

    // MARK: - CRUD
    private func addBoat(_ boat: Boat) async {
        guard let userId = authService.currentUser?.id else { return }
        do {
            try await authService.supabase.from("boats").insert(makeInsert(userId: userId, boat: boat)).execute()
            await loadFromSupabase()
        } catch { AppLog.error("Error adding boat: \(error)") }
    }

    private func updateBoat(_ boat: Boat) async {
        do {
            try await authService.supabase.from("boats")
                .update(makeUpdate(boat: boat))
                .eq("id", value: boat.id.uuidString).execute()
            await loadFromSupabase()
        } catch { AppLog.error("Error updating boat: \(error)") }
    }

    private func saveToUserDefaults() {
        if let data = try? JSONEncoder().encode(boats) {
            UserDefaults.standard.set(data, forKey: "savedBoats")
        }
    }
}

// MARK: - Boat Card View (kompakte Karten-Darstellung)
struct BoatCardView: View {
    let boat: Boat
    let onUpdate: (Boat) -> Void
    let onDelete: () -> Void
    @EnvironmentObject var authService: AuthService

    /// SF Symbol passend zum Bootstyp
    private var boatTypeIcon: String {
        let t = boat.boatType.lowercased()
        if t.contains("segel") || t.contains("sail") { return "sailboat.fill" }
        if t.contains("motor") || t.contains("power") { return "ferry.fill" }
        if t.contains("katamaran") || t.contains("catamaran") { return "sailboat.fill" }
        if t.contains("schlauch") || t.contains("inflat") || t.contains("rib") { return "figure.water.fitness" }
        if t.contains("kajak") || t.contains("kayak") || t.contains("kanu") { return "kayak" }
        return "ferry.fill"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Bootsbild als prominenter Header
            NavigationLink {
                BoatDetailView(boat: boat, onUpdate: onUpdate)
                    .environmentObject(authService)
            } label: {
                if let url = boat.imageUrl, !url.isEmpty, let imageURL = URL(string: url) {
                    AsyncImage(url: imageURL) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                                .frame(height: 180)
                                .frame(maxWidth: .infinity)
                                .clipped()
                                .overlay(alignment: .bottomLeading) {
                                    // Name-Overlay auf dem Bild
                                    LinearGradient(
                                        colors: [.clear, .black.opacity(0.6)],
                                        startPoint: .top, endPoint: .bottom
                                    )
                                    .frame(height: 70)
                                }
                        case .failure:
                            boatHeaderPlaceholder
                        case .empty:
                            ZStack {
                                Color(.systemGray5)
                                ProgressView()
                            }
                            .frame(height: 180)
                        @unknown default:
                            boatHeaderPlaceholder
                        }
                    }
                } else {
                    boatHeaderPlaceholder
                }
            }
            .buttonStyle(.plain)

            // Karten-Inhalt
            VStack(alignment: .leading, spacing: 0) {
                // Oberer Bereich: NavigationLink zum BoatDetailView
                NavigationLink {
                    BoatDetailView(boat: boat, onUpdate: onUpdate)
                        .environmentObject(authService)
                } label: {
                    VStack(alignment: .leading, spacing: 12) {
                        // Zeile 1: Name + Chevron
                        HStack {
                            Text(boat.name)
                                .font(.title3)
                                .fontWeight(.bold)
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }

                        // Zeile 2: Bootstyp-Icon + Typ + Jahr
                        HStack(spacing: 6) {
                            Image(systemName: boatTypeIcon)
                                .foregroundStyle(.blue)
                            Text(boat.boatType.isEmpty ? "boats.type".loc : boat.boatType)
                                .font(.subheadline)
                                .foregroundStyle(.blue)
                            if let year = boat.year {
                                Text("•")
                                    .foregroundStyle(.secondary)
                                Text(String(year))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Divider()

                        // Zeile 3: Kompakte Daten (3 Spalten)
                        HStack(spacing: 0) {
                            boatStatColumn(
                                label: "boats.length".loc,
                                value: boat.lengthMeters != nil ? "\(boat.lengthString) m" : "–"
                            )
                            boatStatColumn(
                                label: "boats.width".loc,
                                value: boat.width != nil ? "\(boat.widthString) m" : "–"
                            )
                            boatStatColumn(
                                label: "boats.draft".loc,
                                value: boat.draft != nil ? "\(boat.draftString) m" : "–"
                            )
                        }
                    }
                }
                .buttonStyle(.plain)

            }
            .padding(16)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
        .contextMenu {
            Button(role: .destructive) {
                onDelete()
            } label: {
                Label("general.delete".loc, systemImage: "trash")
            }
        }
    }

    private var boatHeaderPlaceholder: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue.opacity(0.15), Color.blue.opacity(0.05)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            VStack(spacing: 8) {
                Image(systemName: boatTypeIcon)
                    .font(.system(size: 40))
                    .foregroundStyle(.blue.opacity(0.4))
                Text("boats.tap_hint".loc)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(height: 180)
        .frame(maxWidth: .infinity)
    }

    private func boatStatColumn(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Boat Detail View
struct BoatDetailView: View {
    let boat: Boat
    let onUpdate: (Boat) -> Void
    @EnvironmentObject var authService: AuthService
    @State private var showingEdit = false

    var body: some View {
        List {
            // Header
            Section {
                VStack(spacing: 12) {
                    if let url = boat.imageUrl, !url.isEmpty, let imageURL = URL(string: url) {
                        AsyncImage(url: imageURL) { phase in
                            switch phase {
                            case .success(let img):
                                img.resizable().scaledToFill()
                                    .frame(height: 180).clipped()
                                    .cornerRadius(12)
                            case .failure:
                                VStack(spacing: 6) {
                                    headerIcon
                                    Text("boats.image_load_error".loc)
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                            default:
                                headerIcon
                            }
                        }
                    } else {
                        headerIcon
                    }
                    Text(boat.name).font(.title2).fontWeight(.bold)
                    if !boat.boatType.isEmpty {
                        Text(boat.boatType)
                            .font(.subheadline).foregroundStyle(.blue)
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(Color.blue.opacity(0.1)).cornerRadius(6)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            // Stammdaten
            Section("boats.details".loc) {
                if !boat.manufacturer.isEmpty { LabeledContent("boats.manufacturer".loc, value: boat.manufacturer) }
                if !boat.model.isEmpty { LabeledContent("boats.model".loc, value: boat.model) }
                if let y = boat.year { LabeledContent("boats.year".loc, value: String(y)) }
                if let yb = boat.yearBuilt { LabeledContent("boats.year_built".loc, value: String(yb)) }
                if !boat.engine.isEmpty { LabeledContent("boats.engine".loc, value: boat.engine) }
            }

            // Maße
            if boat.lengthMeters != nil || boat.width != nil || boat.draft != nil {
                Section("boats.dimensions".loc) {
                    if let l = boat.lengthMeters { LabeledContent("boats.length".loc, value: "\(boat.lengthString) m") }
                    if let w = boat.width { LabeledContent("boats.width".loc, value: "\(boat.widthString) m") }
                    if let d = boat.draft { LabeledContent("boats.draft".loc, value: "\(boat.draftString) m") }
                }
            }

            // Registrierung
            if !boat.registrationNumber.isEmpty || !boat.hin.isEmpty || !boat.homePort.isEmpty {
                Section("boats.registration".loc) {
                    if !boat.homePort.isEmpty { LabeledContent("boats.home_port".loc, value: boat.homePort) }
                    if !boat.registrationNumber.isEmpty { LabeledContent("boats.registration_number".loc, value: boat.registrationNumber) }
                    if !boat.hin.isEmpty { LabeledContent("boats.hin".loc, value: boat.hin) }
                }
            }

            // Equipment-Link
            Section {
                NavigationLink {
                    EquipmentScreen(boatId: boat.id, boatName: boat.name)
                        .environmentObject(authService)
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("equipment.title".loc).font(.headline)
                            Text("equipment.manage_hint".loc)
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "shippingbox.fill")
                            .foregroundStyle(.purple)
                    }
                }
            }
        }
        .navigationTitle(boat.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("general.edit".loc) { showingEdit = true }
            }
        }
        .sheet(isPresented: $showingEdit) {
            AddEditBoatView(boat: boat) { updated in
                onUpdate(updated)
            }
            .environmentObject(authService)
        }
    }

    private var headerIcon: some View {
        Image(systemName: "ferry.fill")
            .font(.system(size: 48)).foregroundStyle(.blue.opacity(0.4))
            .frame(height: 100)
    }
}

// MARK: - Add / Edit Boat View
struct AddEditBoatView: View {
    let boat: Boat?
    let onSave: (Boat) -> Void
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var boatType = ""
    @State private var manufacturer = ""
    @State private var model = ""
    @State private var yearText = ""
    @State private var yearBuiltText = ""
    @State private var lengthText = ""
    @State private var widthText = ""
    @State private var draftText = ""
    @State private var engine = ""
    @State private var homePort = ""
    @State private var registrationNumber = ""
    @State private var hinText = ""
    @State private var imageUrl = ""

    // Foto-Auswahl
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var selectedImage: UIImage?
    @State private var isUploading = false
    @State private var showingImageSource = false
    @State private var showingCamera = false
    @State private var uploadError: String?

    var body: some View {
        NavigationStack {
            Form {
                // Foto-Sektion
                Section {
                    VStack(spacing: 12) {
                        // Vorschau
                        if let img = selectedImage {
                            Image(uiImage: img)
                                .resizable().scaledToFill()
                                .frame(height: 160)
                                .frame(maxWidth: .infinity)
                                .clipped()
                                .cornerRadius(12)
                        } else if let url = boat?.imageUrl, !url.isEmpty, let imageURL = URL(string: url) {
                            AsyncImage(url: imageURL) { phase in
                                switch phase {
                                case .success(let image):
                                    image.resizable().scaledToFill()
                                        .frame(height: 160)
                                        .frame(maxWidth: .infinity)
                                        .clipped()
                                        .cornerRadius(12)
                                default:
                                    boatPhotoPlaceholder
                                }
                            }
                        } else {
                            boatPhotoPlaceholder
                        }

                        // Buttons: Mediathek + Kamera
                        HStack(spacing: 12) {
                            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                                Label("boats.photo_library".loc, systemImage: "photo.on.rectangle")
                                    .font(.subheadline)
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .tint(.blue)

                            Button {
                                showingCamera = true
                            } label: {
                                Label("boats.take_photo".loc, systemImage: "camera")
                                    .font(.subheadline)
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .tint(.blue)
                        }

                        if isUploading {
                            ProgressView("boats.uploading_photo".loc)
                                .font(.caption)
                        }

                        if let err = uploadError {
                            HStack(spacing: 6) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.red)
                                Text(err)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .lineLimit(3)
                            }
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(8)
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                } header: {
                    Text("boats.photo".loc)
                }

                Section("boats.name".loc) {
                    TextField("boats.name".loc, text: $name)
                    TextField("boats.type".loc, text: $boatType)
                }
                Section("boats.details".loc) {
                    TextField("boats.manufacturer".loc, text: $manufacturer)
                    TextField("boats.model".loc, text: $model)
                    TextField("boats.year".loc, text: $yearText)
                        .keyboardType(.numberPad)
                    TextField("boats.year_built".loc, text: $yearBuiltText)
                        .keyboardType(.numberPad)
                    TextField("boats.engine".loc, text: $engine)
                }
                Section("boats.dimensions".loc) {
                    TextField("boats.length".loc, text: $lengthText)
                        .keyboardType(.decimalPad)
                    TextField("boats.width".loc, text: $widthText)
                        .keyboardType(.decimalPad)
                    TextField("boats.draft".loc, text: $draftText)
                        .keyboardType(.decimalPad)
                }
                Section("boats.registration".loc) {
                    TextField("boats.home_port".loc, text: $homePort)
                    TextField("boats.registration_number".loc, text: $registrationNumber)
                    TextField("boats.hin".loc, text: $hinText)
                }
            }
            .navigationTitle(boat == nil ? "boats.add".loc : "general.edit".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("general.cancel".loc) { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("general.save".loc) {
                        Task { await saveBoat() }
                    }
                    .disabled(name.isEmpty || isUploading)
                    .fontWeight(.semibold)
                }
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    if let data = try? await newItem.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: data) {
                        selectedImage = uiImage
                    }
                }
            }
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPickerView(image: $selectedImage)
                    .ignoresSafeArea()
            }
        }
        .onAppear {
            if let b = boat {
                name               = b.name
                boatType           = b.boatType
                manufacturer       = b.manufacturer
                model              = b.model
                yearText           = b.yearString
                yearBuiltText      = b.yearBuiltString
                lengthText         = b.lengthString
                widthText          = b.widthString
                draftText          = b.draftString
                engine             = b.engine
                homePort           = b.homePort
                registrationNumber = b.registrationNumber
                hinText            = b.hin
                imageUrl           = b.imageUrl ?? ""
            }
        }
    }

    private var boatPhotoPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "photo.badge.plus")
                .font(.system(size: 36))
                .foregroundStyle(.blue.opacity(0.4))
            Text("boats.add_photo".loc)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(height: 120)
        .frame(maxWidth: .infinity)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func saveBoat() async {
        // Stabile ID — bei neuem Boot einmal erzeugen und für Upload + Insert verwenden
        let boatId = boat?.id ?? UUID()

        // Falls neues Bild ausgewählt: hochladen
        var finalImageUrl = imageUrl
        if let image = selectedImage {
            isUploading = true
            uploadError = nil
            if let uploadedUrl = await uploadBoatImage(image, boatId: boatId) {
                finalImageUrl = uploadedUrl
                AppLog.debug("Boat image uploaded: \(uploadedUrl)")
            } else {
                // Upload fehlgeschlagen — Fehlermeldung anzeigen und NICHT speichern,
                // damit der User den Retry-Button sieht. Sonst landet ein Boot ohne
                // Foto in der Liste und der User wundert sich.
                isUploading = false
                return
            }
            isUploading = false
        }

        let saved = Boat(
            id:                 boatId,
            name:               name,
            boatType:           boatType,
            manufacturer:       manufacturer,
            model:              model,
            year:               parseIntField(yearText),
            yearBuilt:          parseIntField(yearBuiltText),
            lengthMeters:       parseDoubleField(lengthText),
            width:              parseDoubleField(widthText),
            draft:              parseDoubleField(draftText),
            engine:             engine,
            homePort:           homePort,
            registrationNumber: registrationNumber,
            hin:                hinText,
            imageUrl:           finalImageUrl.isEmpty ? nil : finalImageUrl
        )
        onSave(saved)
        dismiss()
    }

    private func uploadBoatImage(_ image: UIImage, boatId: UUID) async -> String? {
        guard let jpegData = image.jpegData(compressionQuality: 0.7) else {
            await MainActor.run { uploadError = "boats.upload_encode_failed".loc }
            return nil
        }
        let fileName = "boats/\(boatId.uuidString)/photo_\(Int(Date().timeIntervalSince1970)).jpg"

        do {
            try await authService.supabase.storage
                .from("boat-images")
                .upload(fileName, data: jpegData, options: .init(contentType: "image/jpeg", upsert: true))

            let publicUrl = try authService.supabase.storage
                .from("boat-images")
                .getPublicURL(path: fileName)

            // Cache-Busting: verhindert dass AsyncImage das alte Bild aus dem
            // URLCache zieht, wenn derselbe Dateiname in einer anderen Session
            // ersetzt wurde.
            let busted = publicUrl.absoluteString + "?t=\(Int(Date().timeIntervalSince1970))"
            return busted
        } catch {
            AppLog.error("Boat-Image Upload-Fehler: \(error)")
            await MainActor.run {
                uploadError = String(format: "boats.upload_failed".loc, error.localizedDescription)
            }
            return nil
        }
    }

    private func parseIntField(_ text: String) -> Int? {
        Int(text.trimmingCharacters(in: .whitespaces))
    }
    private func parseDoubleField(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces))
    }
}

// MARK: - Camera Picker (UIImagePickerController-Wrapper)
struct CameraPickerView: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    @Environment(\.dismiss) var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPickerView
        init(_ parent: CameraPickerView) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage {
                parent.image = img
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
