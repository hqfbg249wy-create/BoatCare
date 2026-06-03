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
        let message = """
        Ich nutze Skipily fuer mein Boot — Wartung, Equipment-Inventar, \
        Shop und KI-Assistent in einer App. Wenn du dich anmeldest und \
        meinen Empfehlungs-Code eingibst, bekommen wir beide einen Monat \
        Skipily Plus geschenkt.

        Mein Code: \(code)

        App laden: https://apps.apple.com/app/skipily
        """
        return UIActivityViewController(
            activityItems: [message],
            applicationActivities: nil
        )
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
