//
//  ReferralShareSheet.swift
//  Skipily
//
//  Wrapper um UIActivityViewController fuer den Empfehlungs-Share.
//  Trennt Plaintext-Message und Code, damit Mail/iMessage/WhatsApp alle
//  vernuenftig formatiert ankommt.
//

import SwiftUI
import UIKit

struct ReferralShareSheet: UIViewControllerRepresentable {
    let code: String

    func makeUIViewController(context: Context) -> UIActivityViewController {
        // Nachricht in der App-Sprache (LanguageManager), Code via %@ eingesetzt.
        let message = String(format: "referral.share.message".loc, code)
        return UIActivityViewController(
            activityItems: [message],
            applicationActivities: nil
        )
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
