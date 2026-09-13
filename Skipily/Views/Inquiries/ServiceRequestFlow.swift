//
//  ServiceRequestFlow.swift
//  Skipily
//
//  Geführter Wizard für Service-Anfragen aus der Ausrüstung heraus:
//
//  1) Anbieter auswählen
//  2) Schiffsdaten + Ausrüstungsdaten werden automatisch übernommen
//  3) Fotos (Mediathek / Kamera) optional ergänzen
//  4) Problem-Beschreibung in der eigenen Sprache
//  5) Versandweg wählen (E-Mail / WhatsApp / SMS)
//  6) Vorschau (mit optionaler Übersetzung) → Senden
//

import SwiftUI
import PhotosUI
import MessageUI
import Supabase

// MARK: - Schritt-Enum

enum ServiceRequestStep: Int, CaseIterable {
    case pickProvider = 0
    case compose      = 1
    case channel      = 2
    case review       = 3
}

enum SendChannel: String, CaseIterable, Identifiable {
    case email     = "email"
    case whatsapp  = "whatsapp"
    case sms       = "sms"
    var id: String { rawValue }

    var label: String {
        switch self {
        case .email:    return "E-Mail"
        case .whatsapp: return "WhatsApp"
        case .sms:      return "SMS"
        }
    }
    var systemImage: String {
        switch self {
        case .email:    return "envelope.fill"
        case .whatsapp: return "message.circle.fill"
        case .sms:      return "message.fill"
        }
    }
    var color: Color {
        switch self {
        case .email:    return AppColors.info
        case .whatsapp: return Color(red: 0.149, green: 0.659, blue: 0.357)
        case .sms:      return AppColors.success
        }
    }
}

// MARK: - Haupt-Wizard

struct ServiceRequestFlow: View {
    let equipmentId: UUID
    let boatId: UUID

    @EnvironmentObject private var authService: AuthService
    @Environment(\.dismiss) private var dismiss

    // Schritt-Status
    @State private var step: ServiceRequestStep = .pickProvider

    // Daten
    @State private var providers: [ServiceProvider] = []
    @State private var loadingProviders = true
    @State private var providerSearch = ""
    @State private var selectedProvider: ServiceProvider?

    @State private var briefingMarkdown: String = ""           // auto-erzeugt
    @State private var briefingLoading: Bool = false
    @State private var equipmentName: String = ""

    @State private var problemDescription: String = ""
    @State private var photos: [UIImage] = []

    @State private var photoPickerItems: [PhotosPickerItem] = []
    @State private var showCamera: Bool = false

    @State private var channel: SendChannel = .email

    // Übersetzung
    @State private var targetLang: String = LanguageManager.shared.currentLanguage.code
    @State private var translatedDescription: String? = nil
    @State private var isTranslating: Bool = false

    @State private var errorMessage: String? = nil

    // MessageUI
    @State private var showMailComposer = false
    @State private var showSmsComposer = false

    // MARK: - Body

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progressBar
                Divider()

                Group {
                    switch step {
                    case .pickProvider: providerStep
                    case .compose:      composeStep
                    case .channel:      channelStep
                    case .review:       reviewStep
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if step == .pickProvider {
                        Button("srf.cancel".loc) { dismiss() }
                    } else {
                        Button {
                            goBack()
                        } label: {
                            Label("srf.back".loc, systemImage: "chevron.left")
                        }
                    }
                }
            }
            .task { await loadProviders() }
            .alert("srf.error".loc, isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
            .sheet(isPresented: $showMailComposer) {
                if let p = selectedProvider, let email = p.email {
                    MailComposer(
                        recipient: email,
                        subject: mailSubject,
                        body: finalMessage,
                        attachments: photoAttachments,
                        onComplete: handleSendComplete
                    )
                }
            }
            .sheet(isPresented: $showSmsComposer) {
                if let p = selectedProvider, let phone = p.phone {
                    SmsComposer(
                        recipient: phone,
                        body: finalMessage,
                        attachments: photoAttachments,
                        onComplete: handleSendComplete
                    )
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker(image: Binding(
                    get: { nil },
                    set: { if let img = $0 { photos.append(img) } }
                ))
            }
        }
    }

    private var navigationTitle: String {
        switch step {
        case .pickProvider: return "srf.nav.pick".loc
        case .compose:      return "srf.nav.compose".loc
        case .channel:      return "srf.nav.channel".loc
        case .review:       return "srf.nav.review".loc
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        HStack(spacing: 6) {
            ForEach(ServiceRequestStep.allCases, id: \.rawValue) { s in
                Capsule()
                    .fill(s.rawValue <= step.rawValue ? AppColors.info : Color(.systemGray4))
                    .frame(height: 4)
                    .animation(.easeInOut(duration: 0.2), value: step)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Step 1: Provider-Picker

    private var providerStep: some View {
        Group {
            if loadingProviders {
                ProgressView("srf.loadingProviders".loc)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredProviders.isEmpty {
                ContentUnavailableView(
                    "srf.noProviders".loc,
                    systemImage: "magnifyingglass",
                    description: Text("srf.noProvidersDesc".loc)
                )
            } else {
                List {
                    Section {
                        TextField("srf.search".loc, text: $providerSearch)
                    }
                    Section("srf.chooseProvider".loc) {
                        ForEach(filteredProviders) { p in
                            Button {
                                Task { await selectProvider(p) }
                            } label: {
                                providerRow(p)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private var filteredProviders: [ServiceProvider] {
        guard !providerSearch.isEmpty else { return providers }
        let q = providerSearch.lowercased()
        return providers.filter {
            $0.name.lowercased().contains(q)
            || ($0.city?.lowercased().contains(q) ?? false)
            || $0.category.lowercased().contains(q)
        }
    }

    private func providerRow(_ p: ServiceProvider) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "building.2.fill")
                .foregroundStyle(AppColors.info)
                .frame(width: 36, height: 36)
                .background(AppColors.info.opacity(0.12))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(p.name).font(.subheadline.weight(.semibold))
                if let city = p.city, !city.isEmpty {
                    Text(city).font(.caption).foregroundStyle(.secondary)
                }
                HStack(spacing: 6) {
                    if p.email != nil {
                        Label("E-Mail", systemImage: "envelope.fill")
                            .font(.caption2).foregroundStyle(AppColors.info)
                    }
                    if p.phone != nil {
                        Label("Tel.", systemImage: "phone.fill")
                            .font(.caption2).foregroundStyle(AppColors.success)
                    }
                }
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary).font(.caption)
        }
        .padding(.vertical, 2)
    }

    // MARK: - Step 2: Compose

    private var composeStep: some View {
        Form {
            // Auto-übernommene Daten
            Section {
                if briefingLoading {
                    HStack {
                        ProgressView().scaleEffect(0.8)
                        Text("srf.briefingLoading".loc).foregroundStyle(.secondary).font(.subheadline)
                    }
                } else if !briefingMarkdown.isEmpty {
                    DisclosureGroup("srf.previewData".loc) {
                        Text(briefingMarkdown)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
            } header: {
                Label("srf.autoIncluded".loc, systemImage: "checkmark.seal.fill")
                    .foregroundStyle(AppColors.success)
            } footer: {
                Text("srf.autoFooter".loc)
            }

            // Problem-Beschreibung
            Section {
                ZStack(alignment: .topLeading) {
                    if problemDescription.isEmpty {
                        Text("srf.problemPlaceholder".loc)
                            .foregroundStyle(.tertiary).font(.callout)
                            .padding(.top, 8).padding(.leading, 4)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $problemDescription)
                        .frame(minHeight: 140)
                }
            } header: {
                Text("srf.problemHeader".loc)
            } footer: {
                Text("srf.problemFooter".loc)
            }

            // Fotos
            Section {
                if !photos.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(photos.enumerated()), id: \.offset) { idx, img in
                                ZStack(alignment: .topTrailing) {
                                    Image(uiImage: img)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 86, height: 86)
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
                        Label("srf.fromLibrary".loc, systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(AppColors.info.opacity(0.12))
                            .foregroundStyle(AppColors.info)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    Button {
                        showCamera = true
                    } label: {
                        Label("srf.camera".loc, systemImage: "camera.fill")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(AppColors.success.opacity(0.12))
                            .foregroundStyle(AppColors.success)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                }
                .buttonStyle(.plain)
            } header: {
                Label("srf.photosHeader".loc, systemImage: "camera")
            } footer: {
                Text("srf.photosFooter".loc)
            }
            .onChange(of: photoPickerItems) { _, newItems in
                Task { await loadPhotosFromPicker(newItems) }
            }

            Section {
                Button {
                    step = .channel
                } label: {
                    Label("srf.next".loc, systemImage: "chevron.right")
                        .frame(maxWidth: .infinity)
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(AppColors.info)
                .disabled(problemDescription.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    // MARK: - Step 3: Channel

    private var channelStep: some View {
        let p = selectedProvider
        let availability: [SendChannel: Bool] = [
            .email:    p?.email != nil,
            .whatsapp: p?.phone != nil,
            .sms:      p?.phone != nil && MFMessageComposeViewController.canSendText()
        ]

        return Form {
            Section {
                ForEach(SendChannel.allCases) { ch in
                    let avail = availability[ch] ?? false
                    Button {
                        if avail { channel = ch }
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: ch.systemImage)
                                .font(.title3)
                                .foregroundStyle(.white)
                                .frame(width: 38, height: 38)
                                .background(avail ? ch.color : Color.gray)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ch.label)
                                    .font(.subheadline).fontWeight(.semibold)
                                    .foregroundStyle(avail ? .primary : .secondary)
                                Text(channelHint(for: ch, available: avail, provider: p))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if channel == ch && avail {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(AppColors.info)
                                    .font(.title3)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                    .disabled(!avail)
                }
            } header: {
                Text("srf.channelHeader".loc)
            } footer: {
                Text("srf.channelFooter".loc)
            }

            Section {
                Button {
                    step = .review
                    Task { await maybeAutoTranslate() }
                } label: {
                    Label("srf.nextToReview".loc, systemImage: "chevron.right")
                        .frame(maxWidth: .infinity)
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(AppColors.info)
                .disabled(!(availability[channel] ?? false))
            }
        }
    }

    private func channelHint(for ch: SendChannel, available: Bool, provider: ServiceProvider?) -> String {
        if !available {
            switch ch {
            case .email:    return "srf.noEmail".loc
            case .whatsapp: return "srf.noPhone".loc
            case .sms:      return "srf.smsUnavailable".loc
            }
        }
        switch ch {
        case .email:    return provider?.email ?? ""
        case .whatsapp: return provider?.phone ?? ""
        case .sms:      return provider?.phone ?? ""
        }
    }

    // MARK: - Step 4: Review

    private var reviewStep: some View {
        Form {
            // Empfänger
            Section {
                HStack(spacing: 12) {
                    Image(systemName: channel.systemImage)
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(channel.color)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(format: "srf.sendVia".loc, channel.label))
                            .font(.subheadline).fontWeight(.semibold)
                        Text(recipientDisplay).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            // Übersetzung
            Section {
                if isTranslating {
                    HStack {
                        ProgressView().scaleEffect(0.8)
                        Text("srf.translating".loc).foregroundStyle(.secondary)
                    }
                } else {
                    Picker("srf.language".loc, selection: $targetLang) {
                        Text("srf.lang.de".loc).tag("de")
                        Text("srf.lang.en".loc).tag("en")
                        Text("srf.lang.fr".loc).tag("fr")
                        Text("srf.lang.es".loc).tag("es")
                        Text("srf.lang.it".loc).tag("it")
                        Text("srf.lang.nl".loc).tag("nl")
                    }
                    .onChange(of: targetLang) { _, _ in
                        Task { await translateIfNeeded() }
                    }
                }
            } header: {
                Label("srf.language".loc, systemImage: "globe")
            } footer: {
                if let auto = autoDetectedLang(), auto != "de" {
                    Text("srf.autoTranslateHint".loc)
                } else {
                    Text("srf.changeLangHint".loc)
                }
            }

            // Vorschau-Text
            Section {
                Text(finalMessage)
                    .font(.callout)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } header: {
                Text("srf.fullMessage".loc)
            }

            // Fotos
            if !photos.isEmpty {
                Section(String(format: "srf.attachments".loc, photos.count)) {
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
            }

            // Senden
            Section {
                Button {
                    sendNow()
                } label: {
                    Label(String(format: "srf.sendButton".loc, channel.label), systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(channel.color)
            }
        }
    }

    private var recipientDisplay: String {
        guard let p = selectedProvider else { return "" }
        switch channel {
        case .email:    return p.email ?? ""
        case .whatsapp, .sms: return p.phone ?? ""
        }
    }

    // MARK: - Final Message Builder

    private var mailSubject: String {
        let eq = equipmentName.isEmpty ? "srf.subjectFallback".loc : equipmentName
        return String(format: "srf.subject".loc, eq, selectedProvider?.name ?? "")
    }

    private var finalMessage: String {
        // Beschreibung (übersetzt oder original)
        let desc = (translatedDescription ?? problemDescription)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var out: [String] = []
        if !desc.isEmpty { out.append(desc); out.append("") }
        if !briefingMarkdown.isEmpty {
            out.append("---")
            out.append("")
            out.append(briefingMarkdown)
        }
        return out.joined(separator: "\n")
    }

    private var photoAttachments: [(data: Data, name: String, mime: String)] {
        photos.enumerated().compactMap { idx, img in
            guard let data = img.jpegData(compressionQuality: 0.8) else { return nil }
            return (data: data, name: "foto_\(idx + 1).jpg", mime: "image/jpeg")
        }
    }

    // MARK: - Provider laden

    private func loadProviders() async {
        loadingProviders = true
        defer { loadingProviders = false }
        do {
            let rows: [ServiceProvider] = try await SupabaseManager.shared.client
                .from("service_providers")
                .select()
                .order("name")
                .execute()
                .value
            providers = rows
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func selectProvider(_ p: ServiceProvider) async {
        selectedProvider = p
        // Übersetzungssprache aus Provider-Land vorbelegen
        if let auto = autoDetectedLang(for: p) {
            targetLang = auto
        }
        // Schiffs-/Ausrüstungs-Briefing erzeugen
        briefingLoading = true
        do {
            briefingMarkdown = try await EquipmentBriefingBuilder.build(
                equipmentId: equipmentId,
                boatId: boatId,
                providerName: p.name,
                lang: LanguageManager.shared.currentLanguage.code
            ) { name in equipmentName = name }
        } catch {
            errorMessage = String(format: "srf.errBriefing".loc, error.localizedDescription)
        }
        briefingLoading = false
        // Verfügbaren Default-Channel setzen
        if p.email != nil      { channel = .email }
        else if p.phone != nil { channel = .whatsapp }
        step = .compose
    }

    // MARK: - Photos vom PhotosPicker

    private func loadPhotosFromPicker(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                if photos.count < 5 { photos.append(img) }
            }
        }
        // Reset, damit der gleiche Picker nochmal genutzt werden kann
        photoPickerItems = []
    }

    // MARK: - Übersetzung

    private func autoDetectedLang(for provider: ServiceProvider? = nil) -> String? {
        let p = provider ?? selectedProvider
        guard let country = p?.country?.lowercased() else { return nil }
        let mapping: [String: String] = [
            "deutschland": "de", "österreich": "de", "schweiz": "de", "germany": "de", "austria": "de", "switzerland": "de",
            "frankreich": "fr", "france": "fr",
            "spanien": "es", "spain": "es",
            "italien": "it", "italy": "it",
            "niederlande": "nl", "netherlands": "nl", "holland": "nl",
            "england": "en", "uk": "en", "united kingdom": "en", "ireland": "en", "vereinigtes königreich": "en",
            "kroatien": "en", "croatia": "en", // Kroatisch nicht supported → Englisch
            "griechenland": "en", "greece": "en"
        ]
        return mapping[country]
    }

    private func autoLangLabel(_ code: String) -> String {
        switch code {
        case "en": return "englisch"
        case "fr": return "französisch"
        case "es": return "spanisch"
        case "it": return "italienisch"
        case "nl": return "niederländisch"
        default:   return "deutsch"
        }
    }

    private func maybeAutoTranslate() async {
        // Auto-Übersetzung wenn Provider in anderem Sprachland und User-Sprache != Ziel
        if targetLang != "de" && translatedDescription == nil {
            await translateIfNeeded()
        }
    }

    private func translateIfNeeded() async {
        guard targetLang != "de" else {
            translatedDescription = nil
            return
        }
        let txt = problemDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !txt.isEmpty else { return }
        isTranslating = true
        defer { isTranslating = false }
        struct Req: Encodable {
            let texts: [Item]
            let target_lang: String
            struct Item: Encodable { let id: String; let text: String }
        }
        struct Resp: Decodable {
            let translations: [String: String]
        }
        do {
            let body = Req(texts: [.init(id: "desc", text: txt)], target_lang: targetLang)
            let response: Resp = try await SupabaseManager.shared.client.functions
                .invoke("translate-text", options: .init(body: body))
            translatedDescription = response.translations["desc"]
        } catch {
            errorMessage = "Übersetzung fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    // MARK: - Senden

    private func sendNow() {
        guard let p = selectedProvider else { return }
        switch channel {
        case .email:
            if MFMailComposeViewController.canSendMail() {
                showMailComposer = true
            } else if let email = p.email,
                      let subject = mailSubject.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                      let body = finalMessage.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                      let url = URL(string: "mailto:\(email)?subject=\(subject)&body=\(body)") {
                UIApplication.shared.open(url)
                logInquiry()
            } else {
                errorMessage = "srf.errMail".loc
            }
        case .whatsapp:
            sendViaWhatsApp(phone: p.phone ?? "")
        case .sms:
            if MFMessageComposeViewController.canSendText() {
                showSmsComposer = true
            } else {
                errorMessage = "srf.errSms".loc
            }
        }
    }

    private func sendViaWhatsApp(phone: String) {
        let cleaned = phone.filter { $0.isNumber || $0 == "+" }
        guard let body = finalMessage.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://wa.me/\(cleaned.replacingOccurrences(of: "+", with: ""))?text=\(body)")
        else {
            errorMessage = "WhatsApp-URL konnte nicht erstellt werden."
            return
        }
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
            logInquiry()
            dismiss()
        } else {
            errorMessage = "srf.errWhatsApp".loc
        }
    }

    private func handleSendComplete(success: Bool) {
        if success {
            logInquiry()
            dismiss()
        }
    }

    /// Speichert den Vorgang als Eintrag in `service_inquiries` für die Historie.
    private func logInquiry() {
        guard let uid = authService.currentUser?.id,
              let pid = selectedProvider?.id else { return }
        Task {
            try? await InquiryService.shared.createInquiry(
                ownerId: uid,
                providerId: pid,
                boatId: boatId,
                subject: mailSubject,
                message: finalMessage,
                notes: nil,
                send: true
            )
        }
    }

    // MARK: - Navigation

    private func goBack() {
        switch step {
        case .pickProvider: dismiss()
        case .compose:      step = .pickProvider
        case .channel:      step = .compose
        case .review:       step = .channel
        }
    }
}

// MARK: - MFMailComposeViewController-Wrapper

struct MailComposer: UIViewControllerRepresentable {
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

// MARK: - MFMessageComposeViewController-Wrapper

struct SmsComposer: UIViewControllerRepresentable {
    let recipient: String
    let body: String
    let attachments: [(data: Data, name: String, mime: String)]
    let onComplete: (Bool) -> Void

    func makeUIViewController(context: Context) -> MFMessageComposeViewController {
        let vc = MFMessageComposeViewController()
        vc.recipients = [recipient]
        vc.body = body
        for a in attachments {
            vc.addAttachmentData(a.data, typeIdentifier: "public.jpeg", filename: a.name)
        }
        vc.messageComposeDelegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ uiViewController: MFMessageComposeViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onComplete: onComplete) }

    class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        let onComplete: (Bool) -> Void
        init(onComplete: @escaping (Bool) -> Void) { self.onComplete = onComplete }
        func messageComposeViewController(_ controller: MFMessageComposeViewController,
                                          didFinishWith result: MessageComposeResult) {
            controller.dismiss(animated: true)
            onComplete(result == .sent)
        }
    }
}

// MARK: - Camera Picker (UIImagePickerController-Wrapper)

private struct CameraPicker: UIViewControllerRepresentable {
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
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.image = img }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
