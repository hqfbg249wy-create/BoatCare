// Boots

import SwiftUI
import SwiftData

struct EquipmentDetailView: View {
    @Bindable var equipment: Equipment
    @Environment(\.modelContext) private var modelContext
    @Query private var serviceProviders: [ServiceProvider]
    
    @State private var showingServiceProviders = false
    @State private var showingShopSearch = false
    
    var relevantServiceProviders: [ServiceProvider] {
        serviceProviders.filter { provider in
            let services = provider.services.lowercased()
            let category = equipment.category.lowercased()
            return services.contains(category) ||
                   services.contains("reparatur") ||
                   services.contains("wartung")
        }
    }
    
    var body: some View {
        List {
            Section("Grunddaten") {
                LabeledContent("Bezeichnung", value: equipment.name)
                LabeledContent("Kategorie", value: equipment.category)
                if !equipment.manufacturer.isEmpty {
                    LabeledContent("Hersteller", value: equipment.manufacturer)
                }
                if !equipment.model.isEmpty {
                    LabeledContent("Modell", value: equipment.model)
                }
                if !equipment.serialNumber.isEmpty {
                    LabeledContent("Seriennummer", value: equipment.serialNumber)
                }
                if !equipment.partNumber.isEmpty {
                    LabeledContent("Teilenummer", value: equipment.partNumber)
                }
                if !equipment.locationOnBoat.isEmpty {
                    LabeledContent("Ort im Boot", value: equipment.locationOnBoat)
                }
                if !equipment.dimensions.isEmpty {
                    LabeledContent("Abmessungen", value: equipment.dimensions)
                }
            }
            
            if let photoData = equipment.photoData, let uiImage = UIImage(data: photoData) {
                Section("Foto") {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity)
                }
            }
            
            Section("Wartung") {
                LabeledContent("Wartungszyklus", value: "\(equipment.maintenanceCycleYears) Jahr(e)")
                
                if let last = equipment.lastMaintenance {
                    LabeledContent("Letzte Wartung", value: last.formatted(date: .abbreviated, time: .omitted))
                }
                
                if let next = equipment.nextMaintenance {
                    HStack {
                        Text("Nächste Wartung")
                        Spacer()
                        Text(next.formatted(date: .abbreviated, time: .omitted))
                            .foregroundStyle(equipment.maintenanceDue ? .orange : .primary)
                    }
                    
                    if let days = equipment.daysUntilMaintenance {
                        if days < 0 {
                            Label("Überfällig seit \(-days) Tagen", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        } else if days <= 30 {
                            Label("Fällig in \(days) Tagen", systemImage: "clock.fill")
                                .foregroundStyle(.orange)
                        } else {
                            Text("Fällig in \(days) Tagen")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            
            if !equipment.itemDescription.isEmpty {
                Section("Beschreibung") {
                    Text(equipment.itemDescription)
                }
            }
            
            Section("Service & Bestellung") {
                Button {
                    showingServiceProviders = true
                } label: {
                    Label("Servicebetrieb in der Nähe suchen", systemImage: "map.fill")
                }
                
                Button {
                    showingShopSearch = true
                } label: {
                    Label("Preise in Shops vergleichen", systemImage: "cart.fill")
                }
                
                Button {
                    if let url = URL(string: "https://www.google.com/search?q=\(equipment.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Im Internet suchen", systemImage: "magnifyingglass")
                }
            }
        }
        .navigationTitle(equipment.name)
        .sheet(isPresented: $showingServiceProviders) {
            ServiceProviderSearchView(equipment: equipment, providers: relevantServiceProviders)
        }
        .sheet(isPresented: $showingShopSearch) {
            ShopSearchView(equipment: equipment)
        }
    }
}

#Preview {
    NavigationStack {
        EquipmentDetailView(equipment: Equipment(name: "Großsegel", category: .sails, serialNumber: "SAIL-2023-456", maintenanceCycleYears: 2))
    }
    .modelContainer(for: Equipment.self)
}
