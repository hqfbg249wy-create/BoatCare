//
//  InquiriesView.swift
//  Skipily
//
//  Liste aller Service-Anfragen des Eigners mit Status, Verlauf und Aktionen.
//

import SwiftUI

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
            "Anfrage löschen?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Löschen", role: .destructive) {
                if let id = deletingId {
                    Task { await deleteInquiry(id: id) }
                }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Diese Anfrage wird unwiderruflich gelöscht.")
        }
        .alert("Fehler", isPresented: Binding(
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
                filterChip(label: "Alle", status: nil)
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
                        Text(inq.provider?.name ?? "Anbieter")
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
                    infoBox(label: "Deine Nachricht", text: inq.message, color: .blue)

                    // Private notes
                    if let notes = inq.ownerNotes, !notes.isEmpty {
                        infoBox(label: "Private Notizen", text: notes, color: .orange)
                    }

                    // Provider reply
                    if let reply = inq.providerReply, !reply.isEmpty {
                        infoBox(label: "Antwort von \(inq.provider?.name ?? "Anbieter")", text: reply, color: .green)
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
            Text(filter == nil ? "Noch keine Anfragen" : "Keine \(filter!.label)-Anfragen")
                .font(.title3)
                .fontWeight(.semibold)
            if filter == nil {
                Text("Tippe auf \"Anfrage\" beim Anbieter-Profil,\num eine Anfrage zu stellen.")
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
