import SwiftUI

// Kundenansicht eines Tauwerk-Angebots: Anschreiben + bis zu 3 Varianten
// (Positionen, Rabatt, Versand, Gesamt). Annahme je Variante -> onAccept.
struct RopeOfferVariantsView: View {
    let inquiry: ServiceInquiry
    let isAccepting: Bool
    let disabled: Bool
    let onAccept: (UUID) -> Void

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
                ForEach(variants) { v in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(v.title ?? "Variante").font(.subheadline).fontWeight(.bold)
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
                                Text(v.discount_type == "percent"
                                     ? "-\(Int(v.discount_value ?? 0)) %"
                                     : "-" + money(v.discount_value, v.currency))
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
                        Button {
                            onAccept(v.id)
                        } label: {
                            HStack(spacing: 6) {
                                if isAccepting { ProgressView().tint(.white) } else { Image(systemName: "checkmark.seal.fill") }
                                Text("inq.offer_accept_pay".loc).fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent).tint(AppColors.success).controlSize(.regular)
                        .disabled(disabled)
                    }
                    .padding(10)
                    .background(AppColors.gray50)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .task {
            offer = await InquiryService.shared.fetchInquiryOffer(inquiryId: inquiry.id)
            loading = false
        }
    }
}
