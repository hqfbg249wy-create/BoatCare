//
//  InquiryComposeView.swift
//  Skipily
//
//  Formular zum Erstellen und Bearbeiten von Service-Anfragen.
//  Wird als Sheet präsentiert – sowohl vom Anbieter-Detail als auch
//  aus der Anfragen-Historie heraus (zum Bearbeiten von Entwürfen).
//

import SwiftUI
import Supabase
import PostgREST
import PhotosUI
import MessageUI

struct InquiryComposeView: View {
    // Wenn nil → neue Anfrage; wenn gesetzt → Entwurf bearbeiten
    let editing: ServiceInquiry?
    // Anbieter-Info wenn neue Anfrage direkt vom Anbieterprofil geöffnet
    var providerId: UUID?
    var providerName: String?
    var providerEmail: String?
    // Wenn aus Ausrüstung-Detail geöffnet: dieses Equipment vorauswählen
    var preselectedEquipmentId: UUID?

    var onSave: (() async -> Void)?

    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) var dismiss

    @State private var subject: String = ""
    @State private var message: String = ""
    @State private var notes: String = ""
    @State private var selectedBoatId: UUID? = nil
    @State private var boats: [BoatPickerItem] = []
    @State private var isSaving = false
    @State private var errorMessage: String? = nil
    @FocusState private var focusedField: Field?

    // Boot- & Equipment-Anhang (analog zu ProviderBriefingView, jetzt integriert)
    @State private var equipmentByBoat: [UUID: [EquipmentPickerItem]] = [:]
    @State private var selectedEquipment: Set<UUID> = []
    @State private var isLoadingEquipment: Bool = true
    // Kategorie-Vorfilter für die Ausrüstungs-Liste
    @State private var selectedCategoryFilter: String? = nil

    // Vorschau-Sheet vor dem Senden
    @State private var previewText: String? = nil
    @State private var showingPreview: Bool = false
    @State private var isBuildingPreview: Bool = false

    // Fotos zum Problem (Mediathek + Kamera)
    @State private var photos: [UIImage] = []
    @State private var photoPickerItems: [PhotosPickerItem] = []
    @State private var showCamera: Bool = false
    // Mail-Composer (für Fotos & PDFs als Anhang beim Senden)
    @State private var showMailComposer: Bool = false
    // PDF-Maßblätter (Segel) — werden beim Versand generiert
    @State private var sailPDFs: [(data: Data, name: String, mime: String)] = []
    // Sail-Maßblatt-Status pro Equipment (true = Maßblatt in DB vorhanden)
    @State private var sailMeasurementExists: [UUID: Bool] = [:]
    // Pro Segel: PDF anhängen (Default: an, wenn Maßblatt vorhanden)
    @State private var attachMeasurement: [UUID: Bool] = [:]

    // Provider-Override (User wählt anderen Anbieter über Suchsheet)
    @State private var pickedProvider: PickedProvider? = nil
    @State private var showProviderPicker: Bool = false

    struct PickedProvider: Equatable {
        let id: UUID
        let name: String
        let email: String?
    }

    enum Field { case subject, message, notes }

    // Derived
    private var effectiveProviderId: UUID? {
        pickedProvider?.id ?? editing?.providerId ?? providerId
    }

    private var effectiveProviderName: String {
        pickedProvider?.name ?? editing?.provider?.name ?? providerName ?? ""
    }

    private var effectiveProviderEmail: String? {
        let raw = pickedProvider?.email ?? editing?.provider?.email ?? providerEmail
        guard let r = raw?.trimmingCharacters(in: .whitespaces), !r.isEmpty else { return nil }
        return r
    }

    private var hasProviderEmail: Bool { effectiveProviderEmail != nil }

    /// Wie viele ausgewählte Equipment-Items sind Segel (Heuristik)?
    private var selectedSailCount: Int { selectedSailItems.count }

    /// Ausgewählte Segel-Equipment-Items (für die Maßblatt-Section).
    fileprivate var selectedSailItems: [EquipmentPickerItem] {
        var out: [EquipmentPickerItem] = []
        for (_, items) in equipmentByBoat {
            for item in items where selectedEquipment.contains(item.id) {
                if Self.isSailCategory(category: item.category, name: item.name) {
                    out.append(item)
                }
            }
        }
        return out.sorted { ($0.name ?? "") < ($1.name ?? "") }
    }

    /// Welche Boote werden tatsächlich angezeigt — bei gesetztem Bootsfilter
    /// (z. B. wenn aus Ausrüstung gestartet) nur das eine Boot, sonst alle.
    private var visibleBoats: [BoatPickerItem] {
        if let bid = selectedBoatId {
            return boats.filter { $0.id == bid }
        }
        return boats
    }

    /// Liste der Kategorien aus allen sichtbaren Equipment-Items (für Filter-Chips).
    private var availableCategories: [String] {
        var seen = Set<String>()
        var out: [String] = []
        for boat in visibleBoats {
            for eq in equipmentByBoat[boat.id] ?? [] {
                if let c = eq.category, !c.isEmpty, !seen.contains(c) {
                    seen.insert(c)
                    out.append(c)
                }
            }
        }
        return out.sorted()
    }

    private func filteredEquipment(for boatId: UUID) -> [EquipmentPickerItem] {
        let items = equipmentByBoat[boatId] ?? []
        guard let cat = selectedCategoryFilter else { return items }
        return items.filter { ($0.category ?? "") == cat }
    }

    private func categoryLabel(_ key: String) -> String {
        let translated = "equipment.cat.\(key)".loc
        // Fallback: wenn der Loc-Key nicht existiert, gibt .loc den Schlüssel zurück.
        return translated == "equipment.cat.\(key)" ? key.replacingOccurrences(of: "_", with: " ").capitalized : translated
    }

    var body: some View {
        NavigationStack {
            Form {
                // Provider info — antippbar zum Wechseln
                Section {
                    Button {
                        showProviderPicker = true
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(AppColors.info.opacity(0.12))
                                    .frame(width: 40, height: 40)
                                Image(systemName: "building.2.fill")
                                    .font(.system(size: 16))
                                    .foregroundStyle(AppColors.info)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text("inquiry.to".loc)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(effectiveProviderName.isEmpty ? "inquiry.pick_provider_title".loc : effectiveProviderName)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(.primary)
                                if let email = effectiveProviderEmail {
                                    Text(email)
                                        .font(.caption)
                                        .foregroundStyle(AppColors.info)
                                }
                            }
                            Spacer()
                            Image(systemName: "magnifyingglass")
                                .font(.subheadline)
                                .foregroundStyle(AppColors.info)
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                } footer: {
                    Text("inquiry.pick_provider_hint".loc)
                        .font(.caption2)
                }

                // E-Mail-Warnung wenn Provider keine Adresse hat
                if !hasProviderEmail {
                    Section {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                                .font(.body)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("inquiry.no_email".loc)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                Text("inquiry.no_email_hint".loc)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(Color.orange.opacity(0.08))
                }

                // Boot auswählen
                if !boats.isEmpty {
                    Section("inquiry.boat_optional".loc) {
                        Picker("inquiry.boat_label".loc, selection: $selectedBoatId) {
                            Text("inquiry.boat_none".loc).tag(UUID?.none)
                            ForEach(boats) { b in
                                Label(b.name, systemImage: "sailboat").tag(UUID?.some(b.id))
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                // Betreff + Nachricht
                Section {
                    TextField("inquiry.subject_required".loc, text: $subject)
                        .focused($focusedField, equals: .subject)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .message }

                    ZStack(alignment: .topLeading) {
                        if message.isEmpty {
                            Text("inquiry.message_placeholder".loc)
                                .foregroundStyle(.tertiary)
                                .font(.body)
                                .padding(.top, 8)
                                .padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $message)
                            .focused($focusedField, equals: .message)
                            .frame(minHeight: 120)
                    }
                } header: {
                    Text("inquiry.message_required".loc)
                }

                // Boot- & Equipment-Auswahl (Briefing-Struktur)
                if isLoadingEquipment {
                    Section {
                        HStack {
                            ProgressView().scaleEffect(0.8)
                            Text("inquiry.loading_equipment".loc).foregroundStyle(.secondary).font(.subheadline)
                        }
                    } header: {
                        Text("inquiry.boat_and_equipment".loc)
                    }
                } else if !equipmentByBoat.isEmpty {

                    // Kategorie-Vorfilter (Chips, einzeilig scrollbar)
                    if availableCategories.count > 1 {
                        Section {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    categoryChip(label: "equipment.all".loc, selected: selectedCategoryFilter == nil) {
                                        selectedCategoryFilter = nil
                                    }
                                    ForEach(availableCategories, id: \.self) { cat in
                                        categoryChip(label: categoryLabel(cat),
                                                     selected: selectedCategoryFilter == cat) {
                                            selectedCategoryFilter = (selectedCategoryFilter == cat) ? nil : cat
                                        }
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                            .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 0))
                        } header: {
                            Text("inquiry.category".loc)
                        }
                    }

                    ForEach(visibleBoats) { boat in
                        let items = filteredEquipment(for: boat.id)
                        if !items.isEmpty {
                            Section {
                                ForEach(items) { eq in
                                    equipmentRow(eq)
                                }
                            } header: {
                                HStack {
                                    Image(systemName: "sailboat")
                                        .foregroundStyle(AppColors.info)
                                    Text(boat.name).lineLimit(1)
                                    Spacer()
                                    let count = items.filter { selectedEquipment.contains($0.id) }.count
                                    if count > 0 {
                                        Text(String(format: "inquiry.selected_count".loc, count))
                                            .font(.caption2).fontWeight(.semibold)
                                            .foregroundStyle(AppColors.info)
                                            .lineLimit(1).fixedSize()
                                    }
                                }
                            }
                        }
                    }
                } else if !boats.isEmpty {
                    Section {
                        Text("inquiry.no_equipment".loc)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } header: {
                        Text("inquiry.boat_and_equipment".loc)
                    }
                }

                // Maßblatt-Anhang (nur wenn Segel ausgewählt)
                if !selectedSailItems.isEmpty {
                    Section {
                        ForEach(selectedSailItems) { sail in
                            sailMeasurementRow(sail)
                        }
                    } header: {
                        Label("inquiry.attach_measurement".loc, systemImage: "doc.text.fill")
                    } footer: {
                        Text("inquiry.attach_measurement_hint".loc)
                    }
                }

                // Fotos zum Problem
                Section {
                    if !photos.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Array(photos.enumerated()), id: \.offset) { idx, img in
                                    ZStack(alignment: .topTrailing) {
                                        Image(uiImage: img)
                                            .resizable().scaledToFill()
                                            .frame(width: 84, height: 84)
                                            .clipShape(RoundedRectangle(cornerRadius: 10))
                                        Button {
                                            photos.remove(at: idx)
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundStyle(.white, .black.opacity(0.6))
                                                .font(.title3)
                                        }
                                        .padding(4)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    HStack(spacing: 12) {
                        PhotosPicker(selection: $photoPickerItems,
                                     maxSelectionCount: 5,
                                     matching: .images) {
                            Label("inquiry.photo_library".loc, systemImage: "photo.on.rectangle")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(AppColors.info.opacity(0.12))
                                .foregroundStyle(AppColors.info)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        Button {
                            showCamera = true
                        } label: {
                            Label("inquiry.camera".loc, systemImage: "camera.fill")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(AppColors.success.opacity(0.12))
                                .foregroundStyle(AppColors.success)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                    }
                    .buttonStyle(.plain)
                } header: {
                    Label("inquiry.photos_label".loc, systemImage: "camera")
                } footer: {
                    Text("inquiry.photos_hint".loc)
                }
                .onChange(of: photoPickerItems) { _, newItems in
                    Task { await loadPhotosFromPicker(newItems) }
                }

                // Private Notizen
                Section {
                    ZStack(alignment: .topLeading) {
                        if notes.isEmpty {
                            Text("inquiry.notes_placeholder".loc)
                                .foregroundStyle(.tertiary)
                                .font(.body)
                                .padding(.top, 8)
                                .padding(.leading, 4)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $notes)
                            .focused($focusedField, equals: .notes)
                            .frame(minHeight: 60)
                    }
                } header: {
                    Text("inquiry.notes_label".loc)
                } footer: {
                    Text("inquiry.notes_hint".loc)
                }

                if let err = errorMessage {
                    Section {
                        Text(err)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle(editing != nil ? "inquiry.title_edit".loc : "inquiry.title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("general.cancel".loc) { dismiss() }
                }

                ToolbarItemGroup(placement: .confirmationAction) {
                    // Entwurf speichern
                    Button {
                        Task { await save(send: false) }
                    } label: {
                        if isSaving {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Label("inquiry.draft".loc, systemImage: "clock")
                                .labelStyle(.titleAndIcon)
                        }
                    }
                    .disabled(isSaving || subject.trimmingCharacters(in: .whitespaces).isEmpty)

                    // Senden → öffnet zuerst Vorschau
                    Button {
                        Task { await openPreview() }
                    } label: {
                        if isBuildingPreview {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Label("inquiry.send".loc, systemImage: "paperplane.fill")
                                .labelStyle(.titleAndIcon)
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(
                        isSaving || isBuildingPreview ||
                        !hasProviderEmail ||
                        subject.trimmingCharacters(in: .whitespaces).isEmpty ||
                        message.trimmingCharacters(in: .whitespaces).isEmpty
                    )
                    .tint(AppColors.info)
                }

                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Fertig") { focusedField = nil }
                }
            }
            .onAppear {
                prefill()
                Task {
                    await loadBoats()
                    await loadEquipment()
                    applyPreselection()
                    await loadSailMeasurementStatus()
                }
            }
            .sheet(isPresented: $showingPreview) {
                previewSheet
            }
            .sheet(isPresented: $showProviderPicker) {
                InquiryProviderPickerSheet { picked in
                    pickedProvider = picked
                }
                .environmentObject(authService)
            }
            .fullScreenCover(isPresented: $showCamera) {
                InquiryCameraPicker { img in
                    if let img = img, photos.count < 5 { photos.append(img) }
                }
            }
            .sheet(isPresented: $showMailComposer) {
                if let email = effectiveProviderEmail {
                    let photoAttachments = photos.enumerated().compactMap { idx, img -> (data: Data, name: String, mime: String)? in
                        guard let data = img.jpegData(compressionQuality: 0.8) else { return nil }
                        return (data: data, name: "foto_\(idx + 1).jpg", mime: "image/jpeg")
                    }
                    InquiryMailComposer(
                        recipient: email,
                        subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
                        body: previewText ?? "",
                        attachments: photoAttachments + sailPDFs,
                        onComplete: { sent in
                            if sent {
                                Task { await save(send: true, prebuiltMessage: previewText) }
                            }
                        }
                    )
                }
            }
        }
    }

    // MARK: - Prefill (editing)

    private func prefill() {
        guard let inq = editing else { return }
        subject = inq.subject
        message = inq.message
        notes   = inq.ownerNotes ?? ""
        selectedBoatId = inq.boatId
    }

    /// Photos vom PhotosPicker laden und zur Liste hinzufügen.
    private func loadPhotosFromPicker(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                if photos.count < 5 { photos.append(img) }
            }
        }
        photoPickerItems = []
    }

    /// Wird nach dem Laden der Ausrüstungs-Daten angewendet, um ein vom Aufrufer
    /// vorgegebenes Equipment automatisch anzukreuzen und das passende Boot zu setzen.
    private func applyPreselection() {
        guard let preId = preselectedEquipmentId else { return }
        selectedEquipment.insert(preId)
        // Boot des Equipments suchen und vorauswählen
        for (boatId, items) in equipmentByBoat {
            if items.contains(where: { $0.id == preId }) {
                if selectedBoatId == nil { selectedBoatId = boatId }
                break
            }
        }
    }

    // MARK: - Vorschau

    @ViewBuilder
    private var previewSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    // Empfänger-Block
                    HStack(spacing: 10) {
                        Image(systemName: "envelope.fill")
                            .foregroundStyle(AppColors.info)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\("inquiry.to".loc): \(effectiveProviderName)")
                                .font(.subheadline).fontWeight(.semibold)
                            if let email = effectiveProviderEmail {
                                Text(email).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(AppColors.info.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    // Betreff
                    VStack(alignment: .leading, spacing: 4) {
                        Text("inquiry.subject".loc).font(.caption).foregroundStyle(.secondary)
                        Text(subject.trimmingCharacters(in: .whitespacesAndNewlines))
                            .font(.subheadline).fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    // Nachricht
                    VStack(alignment: .leading, spacing: 4) {
                        Text("inquiry.message".loc).font(.caption).foregroundStyle(.secondary)
                        Text(previewText ?? "")
                            .font(.callout)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(14)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Hinweis
                    Label {
                        Text("inquiry.send_hint".loc)
                            .font(.caption).foregroundStyle(.secondary)
                    } icon: {
                        Image(systemName: "info.circle").foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)

                    // Foto-Anhänge
                    if !photos.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(String(format: (photos.count == 1 ? "inquiry.photo_attached".loc : "inquiry.photos_attached".loc), photos.count), systemImage: "paperclip")
                                .font(.caption).foregroundStyle(.secondary)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(Array(photos.enumerated()), id: \.offset) { _, img in
                                        Image(uiImage: img)
                                            .resizable().scaledToFill()
                                            .frame(width: 64, height: 64)
                                            .clipShape(RoundedRectangle(cornerRadius: 8))
                                    }
                                }
                            }
                        }
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    // Hinweis auf Maßblatt-PDFs (wird beim Senden generiert)
                    if selectedSailCount > 0 {
                        HStack(spacing: 8) {
                            Image(systemName: "doc.text.fill")
                                .foregroundStyle(AppColors.info)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(String(format: (selectedSailCount == 1 ? "inquiry.measurement_pdf".loc : "inquiry.measurement_pdfs".loc), selectedSailCount))
                                    .font(.subheadline).fontWeight(.semibold)
                                Text("inquiry.measurement_pdf_hint".loc)
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(12)
                        .background(AppColors.info.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    if !notes.trimmingCharacters(in: .whitespaces).isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("inquiry.notes_private".loc, systemImage: "lock.fill")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(notes.trimmingCharacters(in: .whitespacesAndNewlines))
                                .font(.callout)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(12)
                        .background(Color.orange.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(16)
            }
            .navigationTitle("inquiry.preview_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("inquiry.edit".loc) {
                        showingPreview = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await confirmSend() }
                    } label: {
                        if isSaving {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Label("inquiry.send".loc, systemImage: "paperplane.fill")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(isSaving)
                    .tint(AppColors.info)
                }
            }
        }
    }

    private func openPreview() async {
        let trimmedSubject = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedSubject.isEmpty else {
            errorMessage = "inquiry.subject_empty".loc; return
        }
        guard !trimmedMessage.isEmpty else {
            errorMessage = "inquiry.message_empty".loc; return
        }

        isBuildingPreview = true
        errorMessage = nil
        var finalMessage = trimmedMessage
        if let attachment = await buildAttachment() {
            finalMessage = finalMessage + "\n\n" + attachment
        }
        previewText = finalMessage
        isBuildingPreview = false
        showingPreview = true
    }

    private func confirmSend() async {
        showingPreview = false

        // Segel-Maßblätter aus den ausgewählten Equipment-Items generieren
        sailPDFs = await buildSailMeasurementPDFs()

        // IMMER über das System-Mailprogramm gehen, wenn:
        //   - Provider eine E-Mail hat
        //   - das Gerät überhaupt Mail senden kann
        // So sieht der User die fertige Mail vor dem Senden und kann sie
        // im Mailprogramm noch bearbeiten (Anhänge sind ebenfalls dabei).
        // Fallback (keine E-Mail / kein Mailprogramm): in DB speichern,
        // Edge-Function verschickt.
        if effectiveProviderEmail != nil,
           MFMailComposeViewController.canSendMail() {
            showMailComposer = true
        } else {
            await save(send: true, prebuiltMessage: previewText)
        }
    }

    // MARK: - Maßblatt-Row

    @ViewBuilder
    private func sailMeasurementRow(_ sail: EquipmentPickerItem) -> some View {
        let has = sailMeasurementExists[sail.id] ?? false
        HStack(spacing: 12) {
            Image(systemName: has ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(has ? AppColors.success : AppColors.warning)
                .imageScale(.large)
            VStack(alignment: .leading, spacing: 2) {
                Text(sail.name ?? "equipment.cat.sails".loc)
                    .font(.subheadline).fontWeight(.medium)
                Text(has ? "inquiry.sail_measurement_ok".loc : "inquiry.sail_measurement_missing".loc)
                    .font(.caption)
                    .foregroundStyle(has ? AppColors.success : AppColors.warning)
            }
            Spacer()
            Toggle("", isOn: Binding(
                get: { (attachMeasurement[sail.id] ?? false) && has },
                set: { newVal in attachMeasurement[sail.id] = newVal }
            ))
            .labelsHidden()
            .disabled(!has)
        }
    }

    // MARK: - Category chip

    private func categoryChip(label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption).fontWeight(selected ? .semibold : .regular)
                .lineLimit(1).fixedSize()
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(selected ? AppColors.info : Color(.tertiarySystemBackground))
                .foregroundStyle(selected ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Equipment row UI

    private func equipmentRow(_ eq: EquipmentPickerItem) -> some View {
        let isSelected = selectedEquipment.contains(eq.id)
        return Button {
            if isSelected { selectedEquipment.remove(eq.id) }
            else { selectedEquipment.insert(eq.id) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? AppColors.info : .secondary)
                    .imageScale(.large)
                VStack(alignment: .leading, spacing: 2) {
                    Text(eq.name ?? "Ausrüstung").foregroundStyle(.primary)
                    let detail = [eq.manufacturer, eq.model]
                        .compactMap { $0?.isEmpty == false ? $0 : nil }
                        .joined(separator: " ")
                    if !detail.isEmpty {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Load boats

    private func loadBoats() async {
        guard let uid = authService.currentUser?.id else { return }
        do {
            let data: [BoatPickerItem] = try await SupabaseManager.shared.client
                .from("boats")
                .select("id, name")
                .eq("owner_id", value: uid.uuidString)
                .order("name")
                .execute()
                .value
            boats = data
            // Vorauswahl übernehmen wenn editing
            if selectedBoatId == nil, let editBoat = editing?.boatId {
                selectedBoatId = editBoat
            }
        } catch {
            AppLog.error("InquiryComposeView.loadBoats: \(error)")
        }
    }

    // MARK: - Sail-Maßblatt Status

    /// Prüft pro Segel-Equipment, ob in der DB ein Maßblatt-Eintrag existiert.
    /// Setzt gleichzeitig `attachMeasurement` als Default = true.
    private func loadSailMeasurementStatus() async {
        let sailIds = equipmentByBoat.values.flatMap { $0 }
            .filter { Self.isSailCategory(category: $0.category, name: $0.name) }
            .map { $0.id }
        guard !sailIds.isEmpty else { return }
        do {
            struct Row: Codable { let equipment_id: UUID }
            let rows: [Row] = try await SupabaseManager.shared.client
                .from("sail_measurements")
                .select("equipment_id")
                .in("equipment_id", values: sailIds.map { $0.uuidString })
                .execute()
                .value
            let existing = Set(rows.map { $0.equipment_id })
            for id in sailIds {
                sailMeasurementExists[id] = existing.contains(id)
                if attachMeasurement[id] == nil {
                    attachMeasurement[id] = existing.contains(id)
                }
            }
        } catch {
            AppLog.error("loadSailMeasurementStatus: \(error)")
        }
    }

    // MARK: - Load equipment

    private func loadEquipment() async {
        guard !boats.isEmpty else { return }
        isLoadingEquipment = true
        defer { isLoadingEquipment = false }
        do {
            let all: [EquipmentPickerItem] = try await SupabaseManager.shared.client
                .from("equipment")
                .select("id, boat_id, name, category, manufacturer, model")
                .in("boat_id", values: boats.map { $0.id.uuidString })
                .order("name")
                .execute()
                .value
            equipmentByBoat = Dictionary(grouping: all, by: { $0.boat_id })
        } catch {
            AppLog.error("InquiryComposeView.loadEquipment: \(error)")
        }
    }

    // MARK: - Save

    private func save(send: Bool, prebuiltMessage: String? = nil) async {
        let trimmedSubject = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        var trimmedMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedNotes   = notes.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedSubject.isEmpty else {
            errorMessage = "Bitte einen Betreff eingeben."; return
        }
        if send && trimmedMessage.isEmpty {
            errorMessage = "Bitte eine Nachricht eingeben."; return
        }

        isSaving = true
        errorMessage = nil

        // Wenn aus der Vorschau kommend → vorgebauten Text verwenden.
        // Beim einfachen Entwurf-Speichern: Equipment NICHT anhängen
        // (sonst würde es beim erneuten Bearbeiten doppelt eingefügt).
        // Anhang wird erst beim tatsächlichen Senden über die Vorschau erzeugt.
        if let pre = prebuiltMessage {
            trimmedMessage = pre
        }

        do {
            if let inq = editing {
                // Update existing draft
                try await InquiryService.shared.updateInquiry(
                    id: inq.id,
                    subject: trimmedSubject,
                    message: trimmedMessage,
                    boatId: selectedBoatId,
                    notes: trimmedNotes.isEmpty ? nil : trimmedNotes
                )
                if send {
                    try await InquiryService.shared.sendInquiry(id: inq.id)
                    // Anfrage zusätzlich als Konversation spiegeln, damit sie im
                    // Provider-Portal (Nachrichten) erscheint. Fehler nicht fatal.
                    if let uid = authService.currentUser?.id {
                        try? await InquiryService.shared.mirrorInquiryToConversation(
                            ownerId: uid, providerId: inq.providerId,
                            subject: trimmedSubject, message: trimmedMessage)
                    }
                }
            } else {
                // New inquiry
                guard let uid = authService.currentUser?.id,
                      let pid = effectiveProviderId else {
                    errorMessage = "Bitte einen Anbieter wählen."; isSaving = false; return
                }
                try await InquiryService.shared.createInquiry(
                    ownerId: uid,
                    providerId: pid,
                    boatId: selectedBoatId,
                    subject: trimmedSubject,
                    message: trimmedMessage,
                    notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
                    send: send
                )
                if send {
                    // Anfrage als Konversation spiegeln → im Provider-Portal sichtbar.
                    try? await InquiryService.shared.mirrorInquiryToConversation(
                        ownerId: uid, providerId: pid,
                        subject: trimmedSubject, message: trimmedMessage)
                }
            }
            await onSave?()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    // MARK: - Build attachment text (Markdown)

    /// Erzeugt den Anhang-Text mit Boots- und Ausrüstungsdaten.
    /// Reuse von EquipmentBriefingBuilder, wenn Ausrüstung ausgewählt wurde —
    /// sonst eine Kurzfassung nur mit dem ausgewählten Boot.
    private func buildAttachment() async -> String? {
        // Fall 1: Ausrüstung wurde ausgewählt → vollständiges Markdown-Briefing
        if !selectedEquipment.isEmpty {
            do {
                let lang = LanguageManager.shared.currentLanguage.code
                let text = try await EquipmentBriefingBuilder.buildMulti(
                    equipmentIds: Array(selectedEquipment),
                    providerName: effectiveProviderName,
                    lang: lang
                )
                return "---\n\n" + text
            } catch {
                AppLog.error("InquiryComposeView.buildAttachment briefing: \(error)")
                return nil
            }
        }

        // Fall 2: Nur Bootsdaten (wenn ein Boot ausgewählt ist)
        guard let boatId = selectedBoatId else { return nil }
        do {
            let rows: [BoatDetail] = try await SupabaseManager.shared.client
                .from("boats")
                .select("name, boat_type, manufacturer, model, year, length_meters, home_port, engine, registration_number, hin")
                .eq("id", value: boatId.uuidString)
                .limit(1)
                .execute()
                .value
            guard let b = rows.first else { return nil }

            var lines: [String] = ["---", "", "Bootsdaten:"]
            if let v = b.name, !v.isEmpty            { lines.append("- Name: \(v)") }
            if let v = b.boat_type, !v.isEmpty       { lines.append("- Typ: \(v)") }
            if let m = b.manufacturer, !m.isEmpty {
                let mod = b.model.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
                lines.append("- Hersteller/Modell: \(m)\(mod)")
            }
            if let y = b.year                        { lines.append("- Baujahr: \(y)") }
            if let l = b.length_meters               { lines.append("- Länge: \(String(format: "%.2f", l)) m") }
            if let v = b.home_port, !v.isEmpty       { lines.append("- Heimathafen: \(v)") }
            if let v = b.engine, !v.isEmpty          { lines.append("- Motor: \(v)") }
            if let v = b.registration_number, !v.isEmpty { lines.append("- Kennzeichen: \(v)") }
            if let v = b.hin, !v.isEmpty             { lines.append("- HIN: \(v)") }
            return lines.joined(separator: "\n")
        } catch {
            AppLog.error("InquiryComposeView.buildAttachment boat: \(error)")
            return nil
        }
    }
}

// MARK: - Minimal Boat picker model

private struct BoatPickerItem: Codable, Identifiable {
    let id: UUID
    let name: String
}

private struct EquipmentPickerItem: Codable, Identifiable {
    let id: UUID
    let boat_id: UUID
    let name: String?
    let category: String?
    let manufacturer: String?
    let model: String?
}

private struct BoatDetail: Codable {
    let name: String?
    let boat_type: String?
    let manufacturer: String?
    let model: String?
    let year: Int?
    let length_meters: Double?
    let home_port: String?
    let engine: String?
    let registration_number: String?
    let hin: String?
}

// MARK: - Provider-Picker-Sheet (Suche über alle Service-Provider)

struct InquiryProviderPickerSheet: View {
    var onPick: (InquiryComposeView.PickedProvider) -> Void
    @EnvironmentObject var authService: AuthService
    @Environment(\.dismiss) private var dismiss

    @State private var searchText: String = ""
    @State private var providers: [PickerProvider] = []
    @State private var isLoading: Bool = true

    fileprivate struct PickerProvider: Codable, Identifiable {
        let id: UUID
        let name: String
        let city: String?
        let category: String?
        let email: String?
    }

    private var filtered: [PickerProvider] {
        let q = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return providers }
        return providers.filter {
            $0.name.lowercased().contains(q)
                || ($0.city?.lowercased().contains(q) ?? false)
                || ($0.category?.lowercased().contains(q) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("general.loading".loc)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filtered.isEmpty {
                    ContentUnavailableView("service_search.no_providers".loc,
                                           systemImage: "magnifyingglass",
                                           description: Text("equipment.try_larger_radius".loc))
                } else {
                    List(filtered) { p in
                        Button {
                            onPick(.init(id: p.id, name: p.name, email: p.email))
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "building.2.fill")
                                    .foregroundStyle(AppColors.info)
                                    .frame(width: 36, height: 36)
                                    .background(AppColors.info.opacity(0.10))
                                    .clipShape(Circle())
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name)
                                        .font(.subheadline).fontWeight(.semibold)
                                        .foregroundStyle(.primary)
                                    HStack(spacing: 6) {
                                        if let city = p.city, !city.isEmpty {
                                            Text(city).font(.caption).foregroundStyle(.secondary)
                                        }
                                        if let cat = p.category, !cat.isEmpty {
                                            Text(cat).font(.caption2).foregroundStyle(.tertiary)
                                        }
                                    }
                                    if let email = p.email, !email.isEmpty {
                                        Text(email).font(.caption2).foregroundStyle(AppColors.info)
                                    } else {
                                        Text("inquiry.no_email".loc)
                                            .font(.caption2).foregroundStyle(.orange)
                                    }
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption).foregroundStyle(.tertiary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .searchable(text: $searchText, prompt: "inquiry.pick_provider_title".loc)
            .navigationTitle("inquiry.pick_provider_title".loc)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("general.cancel".loc) { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            providers = try await authService.supabase
                .from("service_providers")
                .select("id, name, city, category, email")
                .order("name")
                .limit(500)
                .execute()
                .value
        } catch {
            AppLog.error("InquiryProviderPickerSheet.load: \(error)")
        }
    }
}

// MARK: - Segel-Maßblatt → PDF (Anhang an Anfrage)

extension InquiryComposeView {
    /// Findet alle ausgewählten Segel-Equipment-Items und erzeugt für jedes
    /// ein Maßblatt-PDF (sofern in der DB ein `sail_measurements`-Eintrag existiert
    /// und der User den Anhang nicht abgeschaltet hat).
    func buildSailMeasurementPDFs() async -> [(data: Data, name: String, mime: String)] {
        // 1. Ausgewählte Segel-Equipments identifizieren — nur die mit aktivem Toggle
        var sailItems: [(id: UUID, name: String, boatId: UUID)] = []
        for (_, items) in equipmentByBoat {
            for item in items where selectedEquipment.contains(item.id) {
                if Self.isSailCategory(category: item.category, name: item.name)
                    && (attachMeasurement[item.id] ?? true) {
                    sailItems.append((item.id, item.name ?? "Segel", item.boat_id))
                }
            }
        }
        guard !sailItems.isEmpty else { return [] }

        // 2. Maßblätter laden (gesammelt, ein Query)
        let ids = sailItems.map { $0.id.uuidString }
        let measurements: [SailMeasurement]
        do {
            measurements = try await SupabaseManager.shared.client
                .from("sail_measurements")
                .select()
                .in("equipment_id", values: ids)
                .execute()
                .value
        } catch {
            AppLog.error("buildSailMeasurementPDFs: \(error)")
            return []
        }
        guard !measurements.isEmpty else { return [] }

        // Boots-Namen für Header
        let boatNamesById: [UUID: String] = Dictionary(uniqueKeysWithValues:
            boats.map { ($0.id, $0.name) })

        // 3. Für jedes vorhandene Maßblatt ein PDF rendern
        var attachments: [(data: Data, name: String, mime: String)] = []
        for m in measurements {
            guard let sail = sailItems.first(where: { $0.id == m.equipmentId }) else { continue }
            let pdf = Self.renderSailMeasurementPDF(
                measurement: m,
                equipmentName: sail.name,
                boatName: boatNamesById[sail.boatId]
            )
            let safeName = sail.name.replacingOccurrences(of: " ", with: "_")
            attachments.append((data: pdf,
                                name: "Massblatt_\(safeName).pdf",
                                mime: "application/pdf"))
        }
        return attachments
    }

    /// Heuristik: ist dieses Equipment ein Segel?
    static func isSailCategory(category: String?, name: String?) -> Bool {
        let c = (category ?? "").lowercased()
        let n = (name ?? "").lowercased()
        if c.contains("segel") || c.contains("sail") { return true }
        return n.contains("segel") || n.contains("genua")
            || n.contains("gennaker") || n.contains("code 0") || n.contains("code0")
    }

    /// Rendert ein A4-PDF aus einem `SailMeasurement` — als sauberes Maßblatt.
    static func renderSailMeasurementPDF(measurement m: SailMeasurement,
                                         equipmentName: String,
                                         boatName: String?) -> Data {
        let pageW: CGFloat = 595.2     // A4 width in points
        let pageH: CGFloat = 841.8     // A4 height
        let marginL: CGFloat = 40
        let marginR: CGFloat = 40
        let marginT: CGFloat = 40
        let contentW = pageW - marginL - marginR
        let bounds = CGRect(x: 0, y: 0, width: pageW, height: pageH)
        let renderer = UIGraphicsPDFRenderer(bounds: bounds, format: UIGraphicsPDFRendererFormat())

        return renderer.pdfData { ctx in
            ctx.beginPage()

            var y: CGFloat = marginT

            // ── Titel
            let title = "Segel-Maßblatt"
            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 22),
                .foregroundColor: UIColor.black
            ]
            title.draw(at: CGPoint(x: marginL, y: y), withAttributes: titleAttrs)
            y += 30

            // ── Sub-Header
            let sub = "\(equipmentName) · \(sailTypeLabel(m.sailType))"
            let subAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14, weight: .medium),
                .foregroundColor: UIColor.darkGray
            ]
            sub.draw(at: CGPoint(x: marginL, y: y), withAttributes: subAttrs)
            y += 22

            // Datum / Boot
            var headerParts: [String] = []
            if let b = boatName, !b.isEmpty { headerParts.append("Boot: \(b)") }
            if let d = m.date, !d.isEmpty   { headerParts.append("Datum: \(d)") }
            if !m.sailNumber.isEmpty        { headerParts.append("Segelnr.: \(m.sailNumber)") }
            if !headerParts.isEmpty {
                let hdr = headerParts.joined(separator: " · ")
                let hdrAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 11),
                    .foregroundColor: UIColor.gray
                ]
                hdr.draw(at: CGPoint(x: marginL, y: y), withAttributes: hdrAttrs)
                y += 18
            }

            // Trennlinie
            let line = UIBezierPath()
            line.move(to: CGPoint(x: marginL, y: y + 4))
            line.addLine(to: CGPoint(x: pageW - marginR, y: y + 4))
            UIColor.lightGray.setStroke()
            line.lineWidth = 0.5
            line.stroke()
            y += 16

            // ── Maßtabelle je Segeltyp
            let rows = measurementRows(for: m)
            let labelFont = UIFont.systemFont(ofSize: 11)
            let valueFont = UIFont.systemFont(ofSize: 11, weight: .semibold)
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: labelFont, .foregroundColor: UIColor.darkGray
            ]
            let valueAttrs: [NSAttributedString.Key: Any] = [
                .font: valueFont, .foregroundColor: UIColor.black
            ]

            // Zwei-Spalten-Layout
            let colGap: CGFloat = 24
            let colW = (contentW - colGap) / 2
            var leftY = y
            var rightY = y
            let labelW: CGFloat = 150
            let rowH: CGFloat = 18

            for (idx, row) in rows.enumerated() {
                let inLeft = idx % 2 == 0
                let startX = inLeft ? marginL : (marginL + colW + colGap)
                let yPos = inLeft ? leftY : rightY

                row.label.draw(in: CGRect(x: startX, y: yPos, width: labelW, height: rowH),
                               withAttributes: labelAttrs)
                row.value.draw(in: CGRect(x: startX + labelW, y: yPos,
                                           width: colW - labelW, height: rowH),
                                withAttributes: valueAttrs)

                if inLeft { leftY += rowH } else { rightY += rowH }
            }
            y = max(leftY, rightY) + 10

            // ── Extras
            let extras = extraRows(for: m)
            if !extras.isEmpty {
                let head = "Optionen"
                head.draw(at: CGPoint(x: marginL, y: y),
                          withAttributes: [.font: UIFont.boldSystemFont(ofSize: 12),
                                           .foregroundColor: UIColor.black])
                y += 18
                for line in extras {
                    let bullet = "• \(line)"
                    bullet.draw(in: CGRect(x: marginL, y: y, width: contentW, height: rowH),
                                withAttributes: labelAttrs)
                    y += rowH
                }
                y += 10
            }

            // ── Notizen
            if !m.notes.isEmpty {
                let head = "Notizen"
                head.draw(at: CGPoint(x: marginL, y: y),
                          withAttributes: [.font: UIFont.boldSystemFont(ofSize: 12),
                                           .foregroundColor: UIColor.black])
                y += 18
                let notesRect = CGRect(x: marginL, y: y, width: contentW, height: pageH - y - 60)
                m.notes.draw(in: notesRect,
                             withAttributes: [.font: labelFont,
                                              .foregroundColor: UIColor.black])
            }

            // ── Fußzeile
            let footer = "Erstellt mit Skipily · Alle Maße in cm (Durchmesser in mm), wenn nicht anders angegeben"
            footer.draw(at: CGPoint(x: marginL, y: pageH - 30),
                        withAttributes: [.font: UIFont.systemFont(ofSize: 9),
                                         .foregroundColor: UIColor.gray])
        }
    }

    private static func sailTypeLabel(_ t: String) -> String {
        switch t.lowercased() {
        case "grosssegel":           return "Großsegel"
        case "vorsegel", "genua":    return "Vorsegel / Genua"
        case "gennaker":             return "Gennaker"
        case "code0", "code_0":      return "Code 0"
        default:                     return t.capitalized
        }
    }

    /// Liefert die Label-Wert-Zeilen passend zum Segeltyp.
    private static func measurementRows(for m: SailMeasurement) -> [(label: String, value: String)] {
        func v(_ s: String, suffix: String = " cm") -> String {
            s.isEmpty ? "—" : s + suffix
        }
        switch m.sailType.lowercased() {
        case "grosssegel":
            return [
                ("Vorliek (P)",                v(m.gs_P)),
                ("Unterliek (E)",              v(m.gs_E)),
                ("Mast → Achterstag (E1)",     v(m.gs_E1)),
                ("Baumoberk. → Keep (A)",      v(m.gs_A)),
                ("Galgen (G)",                 v(m.gs_G)),
                ("Großfallauslass (AL)",       v(m.gs_AL)),
                ("Reff 1 (R1)",                v(m.gs_R1)),
                ("Reff 2 (R2)",                v(m.gs_R2)),
                ("Reffhaken Masthinterk. (RB)",v(m.gs_RB)),
                ("Reffhaken Baumoberk. (RU)",  v(m.gs_RU)),
                ("Anschlag Masthinterk. (CB)", v(m.gs_CB)),
                ("Anschlag Baumoberk. (CU)",   v(m.gs_CU)),
                ("Unterliekstau",              v(m.gs_unterliekstau, suffix: " mm")),
                ("Vorliekstau",                v(m.gs_vorliekstau,   suffix: " mm")),
                ("Schothornrutscher",          v(m.gs_schothornrutscher, suffix: " mm")),
                ("Mastrutscher",               m.gs_mastrutscher.isEmpty ? "—" : m.gs_mastrutscher),
                ("Farbe",                      m.gs_farbe.isEmpty ? "—" : m.gs_farbe),
            ]
        case "vorsegel", "genua":
            return [
                ("Vorstaganschlag (I)",        v(m.vs_I)),
                ("Top-Fallauslass (I2)",       v(m.vs_I2)),
                ("Länge Vorstag (VST)",        v(m.vs_VST)),
                ("Anschlag → Mast (J)",        v(m.vs_J)),
                ("Bugspriet → Mast (J2)",      v(m.vs_J2)),
                ("Vorliekslänge (VL)",         v(m.vs_VL)),
                ("Fallschl. Anfang (AL1)",     v(m.vs_AL1)),
                ("Fallschl. Ende (AL2)",       v(m.vs_AL2)),
                ("Vorstag Anfang (T1)",        v(m.vs_T1)),
                ("Vorstag Ende (T2)",          v(m.vs_T2)),
                ("Vorstag → Want (W)",         v(m.vs_W)),
                ("Höhe Anschlag (Q)",          v(m.vs_Q)),
                ("Höhe Schothorn (K)",         v(m.vs_K)),
                ("Höhe Einfädler (H)",         v(m.vs_H)),
                ("Reffanlage",                 m.vs_reffanlage.isEmpty ? "—" : m.vs_reffanlage),
                ("Vorliekstau",                v(m.vs_vorliekstau, suffix: " mm")),
                ("Position",                   m.vs_position),
                ("Farbe",                      m.vs_farbe.isEmpty ? "—" : m.vs_farbe),
            ]
        case "gennaker", "code0", "code_0":
            return [
                ("Vorliekslänge",              v(m.gk_luffLength)),
                ("Achterliekslänge",           v(m.gk_leechLength)),
                ("Unterliekslänge",            v(m.gk_footLength)),
                ("Mittelbreite",               v(m.gk_midWidth)),
                ("Halshöhe über Deck",         v(m.gk_tackHeight)),
                ("Material",                   m.gk_material.isEmpty ? "—" : m.gk_material),
                ("Farbe",                      m.gk_farbe.isEmpty ? "—" : m.gk_farbe),
            ]
        default:
            return []
        }
    }

    /// Boolean-Optionen als kompakte Zusatz-Liste.
    private static func extraRows(for m: SailMeasurement) -> [String] {
        var out: [String] = []
        switch m.sailType.lowercased() {
        case "grosssegel":
            if m.gs_einleinenreff   { out.append("Einleinenreff") }
            if m.gs_weicherFussteil { out.append("Weicher Fußteil") }
            if m.gs_losesUnterliek  { out.append("Loses Unterliek") }
            if m.gs_segelzeichen    { out.append("Segelzeichen") }
            if m.gs_segelnummer     { out.append("Segelnummer") }
        case "vorsegel", "genua":
            if m.vs_rollreff { out.append("Rollreff") }
            if m.vs_fenster  { out.append("Fenster") }
            if m.vs_uvSchutz { out.append("UV-Schutz") }
        default: break
        }
        return out
    }
}

// MARK: - Camera Picker (UIImagePickerController-Wrapper)

private struct InquiryCameraPicker: UIViewControllerRepresentable {
    let onPick: (UIImage?) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: InquiryCameraPicker
        init(_ parent: InquiryCameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            parent.onPick(info[.originalImage] as? UIImage)
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onPick(nil)
            parent.dismiss()
        }
    }
}

// MARK: - MFMailComposeViewController-Wrapper für Anfragen

private struct InquiryMailComposer: UIViewControllerRepresentable {
    let recipient: String
    let subject: String
    let body: String
    let attachments: [(data: Data, name: String, mime: String)]
    let onComplete: (Bool) -> Void

    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let vc = MFMailComposeViewController()
        vc.setToRecipients([recipient])
        vc.setSubject(subject)
        vc.setMessageBody(body, isHTML: false)
        for a in attachments {
            vc.addAttachmentData(a.data, mimeType: a.mime, fileName: a.name)
        }
        vc.mailComposeDelegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ uiViewController: MFMailComposeViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onComplete: onComplete) }

    class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let onComplete: (Bool) -> Void
        init(onComplete: @escaping (Bool) -> Void) { self.onComplete = onComplete }
        func mailComposeController(_ controller: MFMailComposeViewController,
                                   didFinishWith result: MFMailComposeResult,
                                   error: Error?) {
            controller.dismiss(animated: true)
            onComplete(result == .sent)
        }
    }
}
