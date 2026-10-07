import SwiftUI

// Kundenansicht eines Angebots. Hat der Anbieter mehrere Varianten gesendet,
// werden ALLE als vergleichbare Karten (Kriterien + Positionen + Gesamt) mit
// eigener Annahme-Schaltflaeche angezeigt. Sonst Flat-Angebot (eine Annahme).
struct RopeOfferVariantsView: View {
    let inquiry: ServiceInquiry
    let isAccepting: Bool
    let disabled: Bool
    let onAccept: (UUID?) -> Void   // variantId oder nil (flaches Angebot)

    @State private var offer: InquiryOffer?
    @State private var loading = true

    private func money(_ v: Double?, _ cur: String?) -> String {
        String(format: "%.2f", v ?? 0).replacingOccurrences(of: ".", with: ",") + " " + (cur ?? "EUR").uppercased()
    }
    private func renderedLetter() -> String {
        var s = offer?.cover_letter ?? ""
        s = s.replacingOccurrences(of: "#Anbieter", with: inquiry.provider?.name ?? "")
        for p in ["#Anrede", "#Vorname", "#Nachname"] { s = s.replacingOccurrences(of: p, with: "") }
        while s.contains("  ") { s = s.replacingOccurrences(of: "  ", with: " ") }
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if loading {
                ProgressView().frame(maxWidth: .infinity)
            } else if let variants = offer?.variants, !variants.isEmpty {
                let letter = renderedLetter()
                if !letter.isEmpty {
                    Text(letter).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                }
                if variants.count > 1 {
                    Text(String(format: "inq.rope.chooseVariant".loc, variants.count))
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(Array(variants.enumerated()), id: \.element.id) { idx, v in
                    variantCard(v, index: idx)
                }
            } else {
                // Flat-Angebot (keine Varianten) - eine Annahme.
                if let d = inquiry.offerDescription, !d.isEmpty {
                    Text(d).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                }
                Text(String(format: "inq.offer_total".loc, money(inquiry.offerTotal, inquiry.offerCurrency)))
                    .font(.headline)
                acceptButton(nil)
            }
        }
        .task {
            offer = await InquiryService.shared.fetchInquiryOffer(inquiryId: inquiry.id)
            loading = false
        }
    }

    @ViewBuilder
    private func variantCard(_ v: OfferVariant, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(v.title ?? "\("inq.rope.variant".loc) \(index + 1)")
                    .font(.subheadline).fontWeight(.bold)
                Spacer()
                if !v.criteriaSummary.isEmpty {
                    Text(v.criteriaSummary).font(.caption).foregroundStyle(.secondary)
                }
            }
            ForEach(v.items ?? []) { it in
                HStack {
                    Text(it.label ?? "").font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 8)
                    Text(money(it.line_total, v.currency)).font(.caption)
                }
            }
            if (v.discount_value ?? 0) > 0 {
                HStack {
                    Text(v.discount_label ?? "Rabatt").font(.caption).foregroundStyle(AppColors.success)
                    Spacer()
                    Text(v.discount_type == "percent" ? "-\(Int(v.discount_value ?? 0)) %" : "-" + money(v.discount_value, v.currency))
                        .font(.caption).foregroundStyle(AppColors.success)
                }
            }
            HStack {
                Text("inq.rope.shipping".loc).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text(v.shipping_mode == "engine" ? "inq.rope.byAddress".loc : money(v.shipping_cost, v.currency)).font(.caption)
            }
            Divider()
            Text("\("inq.rope.total".loc): \(money(v.total, v.currency))"
                 + (v.shipping_mode == "engine" ? " + \("inq.rope.byAddress".loc)" : ""))
                .font(.subheadline).fontWeight(.semibold)
            acceptButton(v.id)
        }
        .padding(10)
        .background(AppColors.gray50)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func acceptButton(_ variantId: UUID?) -> some View {
        Button { onAccept(variantId) } label: {
            HStack(spacing: 6) {
                if isAccepting { ProgressView().tint(.white) } else { Image(systemName: "checkmark.seal.fill") }
                Text("inq.offer_accept_pay".loc).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent).tint(AppColors.success).controlSize(.regular)
        .disabled(disabled)
    }
}
