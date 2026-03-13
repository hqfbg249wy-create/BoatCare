//
//  MaintenanceScreen.swift
//  BoatCare
//

import SwiftUI
import Supabase

// MARK: - Maintenance Task Model (manuell erstellte Aufgaben)
struct MaintenanceTask: Identifiable, Codable {
    var id: UUID = UUID()
    var title: String
    var boatName: String
    var dueDate: Date
    var notes: String
    var isCompleted: Bool = false

    var status: TaskStatus {
        if isCompleted { return .completed }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: dueDate).day ?? 0
        if days < 0 { return .overdue }
        if days <= 60 { return .due }
        return .upcoming
    }

    enum TaskStatus {
        case completed, overdue, due, upcoming
        var color: Color {
            switch self {
            case .completed: return .green; case .overdue: return .red
            case .due: return .orange; case .upcoming: return .blue
            }
        }
        var label: String {
            switch self {
            case .completed: return "general.ok".loc
            case .overdue: return "maintenance.overdue".loc
            case .due: return "maintenance.due".loc
            case .upcoming: return "maintenance.upcoming".loc
            }
        }
    }
}

// MARK: - Equipment Maintenance Item (automatisch aus Equipment-Wartungszyklen)
struct EquipmentMaintenanceItem: Identifiable {
    let id: UUID          // equipment.id
    let equipmentName: String
    let boatName: String
    let category: String
    let nextMaintenanceDate: Date
    let cycleYears: Int?

    var status: MaintenanceTask.TaskStatus {
        let days = Calendar.current.dateComponents([.day], from: Date(), to: nextMaintenanceDate).day ?? 0
        if days < 0 { return .overdue }
        if days <= 60 { return .due }
        return .upcoming
    }
}

// MARK: - Unified Maintenance Row
enum MaintenanceEntry: Identifiable {
    case manual(MaintenanceTask)
    case equipment(EquipmentMaintenanceItem)

    var id: UUID {
        switch self {
        case .manual(let t): return t.id
        case .equipment(let e): return e.id
        }
    }
    var dueDate: Date {
        switch self {
        case .manual(let t): return t.dueDate
        case .equipment(let e): return e.nextMaintenanceDate
        }
    }
    var isCompleted: Bool {
        if case .manual(let t) = self { return t.isCompleted }
        return false
    }
    var statusColor: Color {
        switch self {
        case .manual(let t): return t.status.color
        case .equipment(let e): return e.status.color
        }
    }
    var statusLabel: String {
        switch self {
        case .manual(let t): return t.status.label
        case .equipment(let e): return e.status.label
        }
    }
}

// MARK: - Maintenance Screen
struct MaintenanceScreen: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var favoritesManager: FavoritesManager

    @State private var tasks: [MaintenanceTask] = []
    @State private var equipmentItems: [EquipmentMaintenanceItem] = []
    @State private var completingEquipmentIds: Set<UUID> = []
    @State private var showingAdd = false
    @State private var savedBoatNames: [String] = []

    private var entries: [MaintenanceEntry] {
        var all: [MaintenanceEntry] = tasks.map { .manual($0) }
        all += equipmentItems.map { .equipment($0) }
        return all.sorted { a, b in
            if a.isCompleted != b.isCompleted { return !a.isCompleted }
            return a.dueDate < b.dueDate
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if entries.isEmpty {
                    emptyState
                } else {
                    List {

                        // Alle Einträge
                        Section("maintenance.tasks".loc) {
                            ForEach(entries) { entry in
                                switch entry {
                                case .manual(let task):
                                    MaintenanceTaskRow(task: task) { toggleTask(task) }
                                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                            Button(role: .destructive) {
                                                deleteManualTask(task)
                                            } label: {
                                                Label("Löschen", systemImage: "trash")
                                            }
                                        }
                                case .equipment(let item):
                                    EquipmentMaintenanceRow(item: item, isCompleting: completingEquipmentIds.contains(item.id)) {
                                        Task { await completeEquipmentMaintenance(item) }
                                    }
                                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                        Button {
                                            Task { await completeEquipmentMaintenance(item) }
                                        } label: {
                                            Label("Erledigt", systemImage: "checkmark.circle.fill")
                                        }
                                        .tint(.green)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("maintenance.title".loc)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddMaintenanceTaskView(boatNames: savedBoatNames) { newTask in
                    tasks.append(newTask); saveTasks()
                }
            }
        }
        .onAppear { loadTasks(); loadBoatNames() }
        .task { await loadEquipmentMaintenance() }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.system(size: 60)).foregroundStyle(.orange.opacity(0.3))
            Text("maintenance.no_tasks".loc).font(.headline).foregroundStyle(.secondary)
            if savedBoatNames.isEmpty {
                Text("maintenance.no_boats_hint".loc)
                    .font(.caption).foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center).padding(.horizontal, 32)
            }
            Button { showingAdd = true } label: {
                Label("maintenance.add_task".loc, systemImage: "plus.circle.fill")
            }.buttonStyle(.borderedProminent)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Load Equipment Maintenance
    private func loadEquipmentMaintenance() async {
        guard authService.isAuthenticated, let userId = authService.currentUser?.id else { return }
        do {
            // Erst alle Boote des Users laden
            let boats: [Boat] = try await authService.supabase
                .from("boats").select()
                .eq("owner_id", value: userId.uuidString)
                .execute().value

            var allItems: [EquipmentMaintenanceItem] = []
            let df = EquipmentItem.dateFormatter

            for boat in boats {
                let equipment: [EquipmentItem] = try await authService.supabase
                    .from("equipment").select()
                    .eq("boat_id", value: boat.id.uuidString)
                    .execute().value

                for eq in equipment {
                    // Wartungszyklus AUS → im Wartungsscreen nicht anzeigen
                    guard let cycle = eq.maintenanceCycleYears, cycle > 0 else { continue }
                    guard let nextStr = eq.nextMaintenanceDate,
                          let nextDate = df.date(from: nextStr) else { continue }

                    allItems.append(EquipmentMaintenanceItem(
                        id: eq.id,
                        equipmentName: eq.name,
                        boatName: boat.name,
                        category: eq.category,
                        nextMaintenanceDate: nextDate,
                        cycleYears: cycle
                    ))
                }
            }
            await MainActor.run { equipmentItems = allItems.sorted(by: { $0.nextMaintenanceDate < $1.nextMaintenanceDate }) }
        } catch {
            print("❌ Equipment-Wartung laden: \(error)")
        }
    }

    

    // MARK: - Complete Equipment Maintenance (restart cycle)
    private struct EquipmentMaintenanceCompletionUpdate: Encodable {
        let last_maintenance_date: String
        let next_maintenance_date: String
    }

    private func completeEquipmentMaintenance(_ item: EquipmentMaintenanceItem) async {
        guard authService.isAuthenticated else { return }
        guard let cycle = item.cycleYears, cycle > 0 else { return }

        await MainActor.run { completingEquipmentIds.insert(item.id) }

        let df = EquipmentItem.dateFormatter
        let now = Calendar.current.startOfDay(for: Date())
        let next = Calendar.current.date(byAdding: .year, value: cycle, to: now) ?? now

        let upd = EquipmentMaintenanceCompletionUpdate(
            last_maintenance_date: df.string(from: now),
            next_maintenance_date: df.string(from: next)
        )

        do {
            try await authService.supabase
                .from("equipment")
                .update(upd)
                .eq("id", value: item.id.uuidString)
                .execute()

            await loadEquipmentMaintenance()
        } catch {
            print("❌ Equipment-Wartung abschließen: \(error)")
        }

        await MainActor.run { completingEquipmentIds.remove(item.id) }
    }
// MARK: - Boat Names
    private func loadBoatNames() {
        if authService.isAuthenticated, let userId = authService.currentUser?.id {
            Task {
                do {
                    let boats: [Boat] = try await authService.supabase
                        .from("boats").select()
                        .eq("owner_id", value: userId.uuidString)
                        .execute().value
                    await MainActor.run { savedBoatNames = boats.map { $0.name } }
                } catch { loadBoatNamesFromUserDefaults() }
            }
        } else { loadBoatNamesFromUserDefaults() }
    }

    private func loadBoatNamesFromUserDefaults() {
        guard let data = UserDefaults.standard.data(forKey: "savedBoats"),
              let boats = try? JSONDecoder().decode([Boat].self, from: data) else { return }
        savedBoatNames = boats.map { $0.name }
    }

    // MARK: - Manual Tasks CRUD
    private func toggleTask(_ task: MaintenanceTask) {
        if let idx = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[idx].isCompleted.toggle(); saveTasks()
        }
    }

    private func deleteEntry(at offsets: IndexSet) {
        let sorted = entries
        let idsToDelete = offsets.compactMap { idx -> UUID? in
            if case .manual(let t) = sorted[idx] { return t.id }
            return nil // Equipment-Einträge können nicht gelöscht werden
        }
        tasks.removeAll { idsToDelete.contains($0.id) }
        saveTasks()
    }

        private func deleteManualTask(_ task: MaintenanceTask) {
        tasks.removeAll { $0.id == task.id }
        saveTasks()
    }

private func saveTasks() {
        if let data = try? JSONEncoder().encode(tasks) {
            UserDefaults.standard.set(data, forKey: "maintenanceTasks")
        }
    }

    private func loadTasks() {
        guard let data = UserDefaults.standard.data(forKey: "maintenanceTasks"),
              let loaded = try? JSONDecoder().decode([MaintenanceTask].self, from: data) else { return }
        tasks = loaded
    }
}

// MARK: - Task Row (manuell)
struct MaintenanceTaskRow: View {
    let task: MaintenanceTask
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button { onToggle() } label: {
                Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.title2).foregroundStyle(task.isCompleted ? .green : .gray)
            }.buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title).font(.headline)
                    .strikethrough(task.isCompleted)
                    .foregroundStyle(task.isCompleted ? .secondary : .primary)
                if !task.boatName.isEmpty {
                    Text(task.boatName).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(task.status.label).font(.caption2).fontWeight(.semibold)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(task.status.color.opacity(0.15))
                    .foregroundStyle(task.status.color).cornerRadius(4)
                Text(task.dueDate, style: .date).font(.caption2).foregroundStyle(.tertiary)
            }
        }.padding(.vertical, 6)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .stroke(taskBorderColor(for: task.dueDate) ?? .clear,
                        lineWidth: taskBorderColor(for: task.dueDate) == nil ? 0 : 2)
        )
    }

    private func taskBorderColor(for due: Date) -> Color? {
        let today = Calendar.current.startOfDay(for: Date())
        let d = Calendar.current.startOfDay(for: due)
        if d < today { return .red }
        if let limit = Calendar.current.date(byAdding: .month, value: 2, to: today), d <= limit { return .yellow }
        return nil
    }
}

// MARK: - Equipment Maintenance Row (automatisch)
struct EquipmentMaintenanceRow: View {
    let item: EquipmentMaintenanceItem
    let isCompleting: Bool
    let onComplete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "gearshape.2.fill")
                .font(.title2).foregroundStyle(.purple)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.equipmentName).font(.headline)
                HStack(spacing: 4) {
                    Text(item.boatName).font(.caption).foregroundStyle(.secondary)
                    if let cy = item.cycleYears {
                        Text("(\(cy) " + "equipment.years".loc + ")")
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 6) {
                Text(item.status.label).font(.caption2).fontWeight(.semibold)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(item.status.color.opacity(0.15))
                    .foregroundStyle(item.status.color).cornerRadius(4)
                Text(item.nextMaintenanceDate, style: .date).font(.caption2).foregroundStyle(.tertiary)
            }

            // ✅ Wartung erledigt → neuen Zyklus starten
            if isCompleting {
                ProgressView().controlSize(.small)
                    .padding(.leading, 6)
            } else {
                Button(action: onComplete) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .accessibilityLabel(Text("Erledigt"))
                }
                .buttonStyle(.plain)
                .padding(.leading, 6)
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 10)
                // Equipment: Markierung bezieht sich auf die *nächste* Wartung
                .stroke(borderColor(for: item.nextMaintenanceDate) ?? .clear,
                        lineWidth: borderColor(for: item.nextMaintenanceDate) == nil ? 0 : 2)
        )
    }

    private func borderColor(for due: Date) -> Color? {
        let today = Calendar.current.startOfDay(for: Date())
        let d = Calendar.current.startOfDay(for: due)
        if d < today { return .red }
        if let limit = Calendar.current.date(byAdding: .month, value: 2, to: today), d <= limit { return .yellow }
        return nil
    }
}


 // MARK: - Add Maintenance Task
struct AddMaintenanceTaskView: View {
    let boatNames: [String]
    let onSave: (MaintenanceTask) -> Void
    @Environment(\.dismiss) var dismiss

    @State private var title = ""
    @State private var boatName = ""
    @State private var selectedBoatName = ""
    @State private var dueDate = Date().addingTimeInterval(30 * 24 * 3600)
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("maintenance.task_title".loc, text: $title)
                    if boatNames.isEmpty {
                        TextField("boats.name".loc, text: $boatName)
                    } else {
                        Picker("boats.name".loc, selection: $selectedBoatName) {
                            Text("—").tag("")
                            ForEach(boatNames, id: \.self) { name in Text(name).tag(name) }
                        }
                    }
                }
                Section {
                    DatePicker("maintenance.due".loc, selection: $dueDate, displayedComponents: .date)
                }
                Section {
                    TextField("equipment.notes".loc, text: $notes, axis: .vertical).lineLimit(3...6)
                }
            }
            .navigationTitle("maintenance.add_task".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("general.cancel".loc) { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("general.save".loc) {
                        let finalName = boatNames.isEmpty ? boatName : selectedBoatName
                        onSave(MaintenanceTask(title: title, boatName: finalName, dueDate: dueDate, notes: notes))
                        dismiss()
                    }
                    .disabled(title.isEmpty).fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            if let first = boatNames.first { selectedBoatName = first }
        }
    }
}
