//
//  InquiriesView.swift
//  Skipily
//
//  Liste aller Service-Anfragen des Eigners mit Status, Verlauf und Aktionen.
//

import SwiftUI
import StripePaymentSheet

/// Standalone-Variante (z. B. als Sheet) — eigener NavigationStack mit Titel.
struct InquiriesView: View {
    var body: some View {
        NavigationStack {
            InquiriesContent()
                .navigationTitle("Anfragen")
        }
    }
}

/// Eingebettete Variante — kein eigener NavigationStack, kein Titel.
/// Wird im Favoriten-Tab eingebunden, der bereits einen NavStack mitbringt.
struct InquiriesContent: View {
    @EnvironmentObject var authService: AuthService
    @State private var service = InquiryService.shared
    @State private var filter: InquiryStatus? = nil   // nil = alle
    @State private var editingInquiry: ServiceInquiry? = nil
    @State private var deletingId: UUID? = nil
    @State private var showDeleteConfirm = false
    @State private var expandedId: UUID? = nil
    @State private var errorAlert: String? = nil
    // Angebot annehmen & bezahlen (Deferred-Stripe-Flow)
    @State private var acceptingId: UUID? = nil
    @State private var paymentSheet: PaymentSheet? = nil
    @State private var pendingOrderId: UUID? = nil
    @State private var pendingSetupIntentId: String? = nil
    @State private var acceptInfo: String? = nil
    @State private var offerActioningId: UUID? = nil
    @State private var showQuestionFor: UUID? = nil
    @State private var questionDrafts: [UUID: String] = [:]

    private var filtered: [ServiceInquiry] {
        guard let f = filter else { return service.inquiries }
        return service.inquiries.filter { $0.status == f }
    }

    var body: some View {
        Group {
            if service.isLoading && service.inquiries.isEmpty {
                ProgressView("Anfragen laden…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filtered.isEmpty {
                emptyView
            } else {
                inquiryList
            }
        }
        .safeAreaInset(edge: .top) {
            filterBar
        }
        .task {
            await reload()
        }
        .refreshable {
            await reload()
        }
        .sheet(item: $editingInquiry) { inq in
            InquiryComposeView(
                editing: inq,
                onSave: { await reload() }
            )
            .environmentObject(authService)
        }
        .confirmationDialog(
            "inq.deleteTitle".loc,
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("inq.delete".loc, role: .destructive) {
                if let id = deletingId {
                    Task { await deleteInquiry(id: id) }
                }
            }
            Button("inq.cancel".loc, role: .cancel) {}
        } message: {
            Text("inq.deleteDesc".loc)
        }
        .alert("inq.error".loc, isPresented: Binding(
            get: { errorAlert != nil },
            set: { if !$0 { errorAlert = nil } }
        )) {
            Button("OK") { errorAlert = nil }
        } message: {
            Text(errorAlert ?? "")
        }
    }

    // MARK: - Filter bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip(label: "inq.filterAll".loc, status: nil)
                ForEach([InquiryStatus.draft, .sent, .read, .replied, .closed], id: \.self) { s in
                    filterChip(label: s.label, status: s)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(.ultraThinMaterial)
    }

    private func filterChip(label: String, status: InquiryStatus?) -> some View {
        let isActive = filter == status
        return Button {
            withAnimation(.easeInOut(duration: 0.15)) { filter = status }
        } label: {
            Text(label)
                .font(.subheadline)
                .fontWeight(isActive ? .semibold : .regular)
                .foregroundStyle(isActive ? .white : .secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(isActive ? AppColors.info : Color(UIColor.secondarySystemBackground))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    private var inquiryList: some View {
        List {
            ForEach(filtered) { inq in
                inquiryRow(inq)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .padding(.top, 4)
    }

    private func inquiryRow(_ inq: ServiceInquiry) -> some View {
        let isExpanded = expandedId == inq.id

        return VStack(alignment: .leading, spacing: 0) {
            // Header row
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    expandedId = isExpanded ? nil : inq.id
                }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    // Provider icon
                    ZStack {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(AppColors.info.opacity(0.12))
                            .frame(width: 44, height: 44)
                        Image(systemName: "building.2.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(AppColors.info)
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(inq.provider?.name ?? "inq.providerFallback".loc)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        Text(inq.subject)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)

                        HStack(spacing: 6) {
                            // Status badge
                            Label(inq.status.label, systemImage: inq.status.systemImage)
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .foregroundStyle(inq.status.color)
                                .lineLimit(1)
                                .fixedSize()
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(inq.status.color.opacity(0.12))
                                .clipShape(Capsule())

                            Text(inq.displayDate)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                                .fixedSize()

                            if let boatName = inq.boat?.name {
                                Label(boatName, systemImage: "sailboat")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                            Spacer(minLength: 0)
                        }
                    }

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 4)
                }
            }
            .buttonStyle(.plain)
            .padding(14)

            // Expanded content
            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    Divider()
                        .padding(.horizontal, 14)

                    // Message
                    infoBox(label: "inq.yourMessage".loc, text: inq.message, color: .blue)

                    // Private notes
                    if let notes = inq.ownerNotes, !notes.isEmpty {
                        infoBox(label: "Private Notizen", text: notes, color: .orange)
                    }

                    // Provider reply
                    if let reply = inq.providerReply, !reply.isEmpty {
                        infoBox(label: String(format: "inq.replyFrom".loc, inq.provider?.name ?? "inq.providerFallback".loc), text: reply, color: .green)
                    }

                    // Angebot des Anbieters -> annehmen & bezahlen (via Stripe)
                    if inq.hasOpenOffer {
                        offerBox(inq)
                    } else if inq.orderId != nil {
                        infoBox(label: "inq.offer_ordered_label".loc, text: "inq.offer_ordered_text".loc, color: .blue)
                    } else if inq.offerStatus == "declined" {
                        infoBox(label: "inq.offer_declined".loc, text: "inq.offer_declined".loc, color: .red)
                    }

                    // Actions — kompakt und einzeilig
                    HStack(spacing: 6) {
                        if inq.status == .draft {
                            Button {
                                editingInquiry = inq
                            } label: {
                                Label("Bearbeiten", systemImage: "pencil")
                                    .font(.caption).fontWeight(.semibold)
                                    .lineLimit(1).fixedSize()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            .tint(AppColors.info)

                            Button {
                                Task { await sendDraft(inq) }
                            } label: {
                                Label("Senden", systemImage: "paperplane.fill")
                                    .font(.caption).fontWeight(.semibold)
                                    .lineLimit(1).fixedSize()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            .tint(AppColors.success)
                        }

                        if [.draft, .sent].contains(inq.status) {
                            Spacer(minLength: 0)
                            Button(role: .destructive) {
                                deletingId = inq.id
                                showDeleteConfirm = true
                            } label: {
                                Image(systemName: "trash")
                                    .font(.caption)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .tint(.red)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 14)
                }
            }
        }
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(inq.status == .replied ? AppColors.success.opacity(0.4) :
                              inq.status == .draft   ? Color(UIColor.systemGray4)    : .clear,
                              lineWidth: 1.5)
        )
    }

    private func offerBox(_ inq: ServiceInquiry) -> some View {
        let cur = (inq.offerCurrency ?? "EUR").uppercased()
        func money(_ v: Double) -> String {
            String(format: "%.2f", v).replacingOccurrences(of: ".", with: ",") + " " + cur
        }
        return VStack(alignment: .leading, spacing: 8) {
            Text("inq.offer_label".loc.uppercased())
                .font(.caption2).fontWeight(.semibold).foregroundStyle(AppColors.primary)
            if let d = inq.offerDescription, !d.isEmpty {
                Text(d).font(.subheadline).fixedSize(horizontal: false, vertical: true)
            }
            Text(String(format: "inq.offer_total".loc, money(inq.offerTotal)))
                .font(.headline)
            if (inq.offerShipping ?? 0) > 0 {
                Text(String(format: "inq.offer_incl_shipping".loc, money(inq.offerShipping ?? 0)))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Button {
                Task { await acceptAndPay(inq) }
            } label: {
                HStack(spacing: 8) {
                    if acceptingId == inq.id { ProgressView().tint(.white) }
                    else { Image(systemName: "checkmark.seal.fill") }
                    Text("inq.offer_accept_pay".loc).fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.regular)
            .tint(AppColors.success)
            .disabled(acceptingId != nil || offerActioningId != nil)

            // Ablehnen + Nachfrage
            HStack(spacing: 10) {
                Button(role: .destructive) {
                    Task { await declineOffer(inq) }
                } label: {
                    Label("inq.offer_decline".loc, systemImage: "xmark.circle")
                        .font(.subheadline)
                }
                .disabled(offerActioningId != nil || acceptingId != nil)
                Spacer(minLength: 0)
                Button {
                    withAnimation {
                        showQuestionFor = (showQuestionFor == inq.id) ? nil : inq.id
                    }
                } label: {
                    Label("inq.offer_question".loc, systemImage: "questionmark.bubble")
                        .font(.subheadline)
                }
                .disabled(offerActioningId != nil)
            }

            if showQuestionFor == inq.id {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("inq.offer_question_placeholder".loc,
                              text: Binding(
                                get: { questionDrafts[inq.id] ?? "" },
                                set: { questionDrafts[inq.id] = $0 }),
                              axis: .vertical)
                        .lineLimit(2...5)
                        .textFieldStyle(.roundedBorder)
                    Button {
                        Task { await sendQuestion(inq) }
                    } label: {
                        HStack(spacing: 6) {
                            if offerActioningId == inq.id { ProgressView() }
                            else { Image(systemName: "paperplane.fill") }
                            Text("inq.offer_question_send".loc).fontWeight(.medium)
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled((questionDrafts[inq.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty || offerActioningId != nil)
                }
                .padding(.top, 4)
            }

            if let acceptInfo, acceptingId == nil {
                Text(acceptInfo).font(.caption).foregroundStyle(AppColors.error)
            }
            Text("inq.offer_pay_hint".loc).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppColors.primary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 14)
    }

    @MainActor
    private func declineOffer(_ inq: ServiceInquiry) async {
        offerActioningId = inq.id
        acceptInfo = nil
        defer { offerActioningId = nil }
        do {
            try await InquiryService.shared.declineOffer(inquiryId: inq.id)
            await reload()
        } catch {
            acceptInfo = error.localizedDescription
        }
    }

    @MainActor
    private func sendQuestion(_ inq: ServiceInquiry) async {
        let text = (questionDrafts[inq.id] ?? "").trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        offerActioningId = inq.id
        acceptInfo = nil
        defer { offerActioningId = nil }
        do {
            try await InquiryService.shared.askOfferQuestion(inquiryId: inq.id, text: text)
            questionDrafts[inq.id] = ""
            withAnimation { showQuestionFor = nil }
            await reload()
        } catch {
            acceptInfo = error.localizedDescription
        }
    }

    @MainActor
    private func acceptAndPay(_ inq: ServiceInquiry) async {
        acceptingId = inq.id
        acceptInfo = nil
        defer { acceptingId = nil }
        do {
            let orderId = try await InquiryService.shared.acceptOffer(inquiryId: inq.id)
            pendingOrderId = orderId
            // Deferred-Flow: Karte hinterlegen (SetupIntent), keine Sofort-Abbuchung.
            let (sheet, setupIntentId) = try await PaymentService.shared.createDeferredSetupSheet()
            pendingSetupIntentId = setupIntentId
            paymentSheet = sheet
            presentPaymentSheet()
        } catch {
            acceptInfo = error.localizedDescription
        }
    }

    private func presentPaymentSheet() {
        guard let sheet = paymentSheet,
              let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }
        var top = root
        while let p = top.presentedViewController { top = p }
        sheet.present(from: top) { result in
            Task { @MainActor in await handlePaymentResult(result) }
        }
    }

    @MainActor
    private func handlePaymentResult(_ result: PaymentSheetResult) async {
        switch result {
        case .completed:
            if let oid = pendingOrderId, let sid = pendingSetupIntentId {
                do {
                    try await PaymentService.shared.attachPaymentToOrders(orderIds: [oid], setupIntentId: sid)
                    acceptInfo = nil
                    await reload()
                } catch {
                    acceptInfo = "\("general.error".loc): \(error.localizedDescription)"
                }
            }
        case .canceled:
            acceptInfo = "inq.offer_pay_canceled".loc
        case .failed(let err):
            acceptInfo = "\("general.error".loc): \(err.localizedDescription)"
        }
        pendingOrderId = nil; pendingSetupIntentId = nil; paymentSheet = nil
    }

    private func infoBox(label: String, text: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.tertiary)
                .tracking(0.5)
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(color.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.horizontal, 14)
    }

    // MARK: - Empty

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundStyle(AppColors.gray300)
            Text(filter == nil ? "inq.noneAll".loc : String(format: "inq.noneFiltered".loc, filter!.label))
                .font(.title3)
                .fontWeight(.semibold)
            if filter == nil {
                Text("inq.emptyHint".loc)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    // MARK: - Actions

    private func reload() async {
        guard let uid = authService.currentUser?.id else { return }
        await service.loadInquiries(ownerId: uid)
    }

    private func sendDraft(_ inq: ServiceInquiry) async {
        do {
            try await InquiryService.shared.sendInquiry(id: inq.id)
            await reload()
        } catch {
            errorAlert = error.localizedDescription
        }
    }

    private func deleteInquiry(id: UUID) async {
        do {
            try await InquiryService.shared.deleteInquiry(id: id)
            if expandedId == id { expandedId = nil }
            await reload()
        } catch {
            errorAlert = error.localizedDescription
        }
    }
}
