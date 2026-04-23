import SwiftUI
import Supabase

struct BoatDataScreen: View {
    @EnvironmentObject var authService: AuthService
    @State private var boats: [Boat] = []
    @State private var showAddBoat = false
    @State private var isLoading = false
    
    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    ProgressView()
                } else if boats.isEmpty {
                    emptyStateView
                } else {
                    boatListView
                }
            }
            .navigationTitle("Bootsdaten")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showAddBoat = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddBoat) {
                AddBoatView(onBoatAdded: {
                    loadBoats()
                })
            }
            .onAppear {
                loadBoats()
            }
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "sailboat.fill")
                .font(.system(size: 60))
                .foregroundColor(.blue)
            
            Text("Noch keine Boote")
                .font(.title2)
                .fontWeight(.bold)
            
            Text("Lege dein erstes Boot an, um loszulegen.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)
            
            Button("Boot hinzufügen") {
                showAddBoat = true
            }
            .buttonStyle(.borderedProminent)
        }
    }
    
    private var boatListView: some View {
        List {
            ForEach(boats) { boat in
                NavigationLink {
                    BoatDetailView(boat: boat)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(boat.name)
                            .font(.headline)
                        
                        if let manufacturer = boat.manufacturer, let model = boat.model {
                            Text("\(manufacturer) \(model)")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        
                        if let yearBuilt = boat.yearBuilt {
                            Text("Baujahr: \(String(yearBuilt))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .onDelete(perform: deleteBoats)
        }
        .refreshable {
            loadBoats()
        }
    }
    
    private func loadBoats() {
        guard let userId = authService.currentUser?.id else { return }
        
        isLoading = true
        
        Task {
            do {
                let fetchedBoats: [Boat] = try await authService.supabase
                    .from("boats")
                    .select()
                    .eq("owner_id", value: userId.uuidString)
                    .execute()
                    .value
                
                boats = fetchedBoats
            } catch {
                print("Fehler beim Laden der Boote: \(error)")
            }
            
            isLoading = false
        }
    }
    
    private func deleteBoats(at offsets: IndexSet) {
        Task {
            for index in offsets {
                let boat = boats[index]
                
                do {
                    try await authService.supabase
                        .from("boats")
                        .delete()
                        .eq("id", value: boat.id.uuidString)
                        .execute()
                    
                    boats.remove(at: index)
                } catch {
                    print("Fehler beim Löschen: \(error)")
                }
            }
        }
    }
}

// MARK: - Add Boat View

struct AddBoatView: View {
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss
    
    let onBoatAdded: () -> Void
    
    @State private var name = ""
    @State private var manufacturer = ""
    @State private var model = ""
    @State private var yearBuilt = ""
    @State private var boatType = "Segelboot"
    @State private var length = ""
    @State private var width = ""
    @State private var draft = ""
    @State private var hin = ""
    
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""
    
    let boatTypes = ["Segelboot", "Motorboot", "Yacht", "Jolle", "Schlauchboot"]
    
    var body: some View {
        NavigationView {
            Form {
                Section("Grunddaten") {
                    TextField("Name *", text: $name)
                    TextField("Hersteller", text: $manufacturer)
                    TextField("Modell", text: $model)
                    TextField("Baujahr", text: $yearBuilt)
                        .keyboardType(.numberPad)
                }
                
                Section("Bootsart") {
                    Picker("Typ", selection: $boatType) {
                        ForEach(boatTypes, id: \.self) { type in
                            Text(type).tag(type)
                        }
                    }
                }
                
                Section("Abmessungen (Meter)") {
                    TextField("Länge", text: $length)
                        .keyboardType(.decimalPad)
                    TextField("Breite", text: $width)
                        .keyboardType(.decimalPad)
                    TextField("Tiefgang", text: $draft)
                        .keyboardType(.decimalPad)
                }
                
                Section("HIN") {
                    TextField("Hull Identification Number", text: $hin)
                }
            }
            .navigationTitle("Boot hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") {
                        saveBoat()
                    }
                    .disabled(name.isEmpty || isSaving)
                }
            }
            .alert("Fehler", isPresented: $showError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(errorMessage)
            }
        }
    }
    
    private func saveBoat() {
        guard let userId = authService.currentUser?.id else { return }
        
        isSaving = true
        
        Task {
            do {
                // Erstelle ein BoatInsert Struct
                struct BoatInsert: Encodable {
                    let owner_id: String
                    let name: String
                    let boat_type: String
                    let manufacturer: String?
                    let model: String?
                    let year_built: Int?
                    let length: Double?
                    let width: Double?
                    let draft: Double?
                    let hin: String?
                }
                
                let boatInsert = BoatInsert(
                    owner_id: userId.uuidString,
                    name: name,
                    boat_type: boatType,
                    manufacturer: manufacturer.isEmpty ? nil : manufacturer,
                    model: model.isEmpty ? nil : model,
                    year_built: yearBuilt.isEmpty ? nil : Int(yearBuilt),
                    length: length.isEmpty ? nil : Double(length.replacingOccurrences(of: ",", with: ".")),
                    width: width.isEmpty ? nil : Double(width.replacingOccurrences(of: ",", with: ".")),
                    draft: draft.isEmpty ? nil : Double(draft.replacingOccurrences(of: ",", with: ".")),
                    hin: hin.isEmpty ? nil : hin
                )
                
                try await authService.supabase
                    .from("boats")
                    .insert(boatInsert)
                    .execute()
                
                dismiss()
                onBoatAdded()
            } catch {
                errorMessage = "Boot konnte nicht gespeichert werden: \(error.localizedDescription)"
                showError = true
            }
            
            isSaving = false
        }
    }
}

// MARK: - Boat Detail View

struct BoatDetailView: View {
    let boat: Boat
    
    var body: some View {
        List {
            Section("Grunddaten") {
                LabeledContent("Name", value: boat.name)
                
                if let manufacturer = boat.manufacturer, !manufacturer.isEmpty {
                    LabeledContent("Hersteller", value: manufacturer)
                }
                
                if let model = boat.model, !model.isEmpty {
                    LabeledContent("Modell", value: model)
                }
                
                if let yearBuilt = boat.yearBuilt {
                    LabeledContent("Baujahr", value: String(yearBuilt))
                }
                
                if let boatType = boat.boatType, !boatType.isEmpty {
                    LabeledContent("Typ", value: boatType)
                }
            }
            
            Section("Abmessungen") {
                if let length = boat.length {
                    LabeledContent("Länge", value: "\(String(format: "%.2f", length)) m")
                }
                
                if let width = boat.width {
                    LabeledContent("Breite", value: "\(String(format: "%.2f", width)) m")
                }
                
                if let draft = boat.draft {
                    LabeledContent("Tiefgang", value: "\(String(format: "%.2f", draft)) m")
                }
            }
            
            if let hin = boat.hin, !hin.isEmpty {
                Section("HIN") {
                    Text(hin)
                        .font(.system(.body, design: .monospaced))
                }
            }
            
            Section("Erstellt") {
                if let createdAt = boat.createdAt {
                    Text(createdAt, style: .date)
                }
            }
        }
        .navigationTitle(boat.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
