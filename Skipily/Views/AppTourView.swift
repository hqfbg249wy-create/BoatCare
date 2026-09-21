//
//  AppTourView.swift
//  Skipily
//
//  Kleine geführte Tour (Karten): erklärt kurz, was hinter den Tabs/Buttons
//  steckt, wo überall die KI hilft und welche Vorteile Skipily + das Abo bieten.
//  Wird beim ersten Start gezeigt (siehe MainTabView) und ist über den
//  Hilfe-Button jederzeit erneut aufrufbar.
//

import SwiftUI

struct TourCard: Identifiable {
    let id = UUID()
    let icon: String
    let color: Color
    let title: String
    let text: String
}

struct AppTourView: View {
    var onFinish: () -> Void

    @State private var index = 0

    private let cards: [TourCard] = [
        TourCard(icon: "hand.wave.fill", color: .blue,
                 title: "Willkommen bei Skipily 👋",
                 text: "Kurze Tour? In 30 Sekunden zeige ich dir, was hinter den Buttons steckt und wo überall die KI hilft."),
        TourCard(icon: "sailboat.fill", color: .teal,
                 title: "Warum Skipily?",
                 text: "Alles rund um dein Boot an einem Ort: Boote, Ausrüstung und Wartung verwalten, rechtzeitig an fällige Wartungen erinnert werden, europaweit passende Betriebe finden und anfragen, Ersatzteile kaufen und Angebote vergleichen."),
        TourCard(icon: "map.fill", color: .blue,
                 title: "Karte",
                 text: "Finde Marinas, Werften und Service-Betriebe in deiner Nähe."),
        TourCard(icon: "sailboat.fill", color: .indigo,
                 title: "Boote",
                 text: "Lege deine Boote an. Ausrüstung, Wartung und Anfragen hängen daran."),
        TourCard(icon: "wrench.and.screwdriver.fill", color: .orange,
                 title: "Wartung",
                 text: "Behalte fällige Wartungen im Blick und werde rechtzeitig erinnert."),
        TourCard(icon: "shippingbox.fill", color: .purple,
                 title: "Ausrüstung & Ersatzteile 🤖",
                 text: "Erfasse deine Ausrüstung. Die KI schlägt dir passende Ausrüstung und Ersatzteile vor und findet den richtigen Betrieb."),
        TourCard(icon: "storefront.fill", color: .green,
                 title: "Shop",
                 text: "Ersatzteile und Zubehör kaufen. Sichere Zahlung, Rechnung inklusive."),
        TourCard(icon: "paperplane.fill", color: .green,
                 title: "Anfragen & Angebote",
                 text: "Sende eine unverbindliche Anfrage oder eine Bitte um ein Angebot an Betriebe. Angebote nimmst du an und bezahlst sicher — alles unter Kontakte/Anfragen."),
        TourCard(icon: "bubble.left.and.bubble.right.fill", color: .blue,
                 title: "KI-Chat 🤖",
                 text: "Frag die KI alles rund um dein Boot: Wartung, Technik, Kaufberatung. Deine ersten Fragen sind gratis."),
        TourCard(icon: "sparkles", color: .pink,
                 title: "Dein Vorteil mit der Skipily-KI ⚡",
                 text: "Die KI kennt Boote und deine Daten — sie spart dir das Suchen: erklärt Technik verständlich, empfiehlt Wartung, findet Ersatzteil und Betrieb. In Sekunden statt Stunden."),
        TourCard(icon: "wand.and.stars", color: .purple,
                 title: "Wo überall KI?",
                 text: "An drei Stellen: KI-Chat, Ausrüstungs-Vorschläge und Ersatzteil-Suche. Einfach ausprobieren."),
        TourCard(icon: "crown.fill", color: .yellow,
                 title: "Mehr Power mit Skipily Plus 💎",
                 text: "Kostenlos startest du mit ein paar KI-Fragen. Mit Skipily Plus bekommst du deutlich mehr Fragen pro Tag und das stärkere KI-Modell — präzisere Antworten für kniffligere Bootsfragen. Findest du unter Profil.")
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Überspringen") { onFinish() }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.trailing, 4)
            }
            .padding()

            TabView(selection: $index) {
                ForEach(Array(cards.enumerated()), id: \.offset) { i, card in
                    VStack(spacing: 20) {
                        ZStack {
                            Circle().fill(card.color.opacity(0.15)).frame(width: 120, height: 120)
                            Image(systemName: card.icon)
                                .font(.system(size: 52))
                                .foregroundStyle(card.color)
                        }
                        Text(card.title)
                            .font(.title2).fontWeight(.bold)
                            .multilineTextAlignment(.center)
                        Text(card.text)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 28)
                        Spacer()
                    }
                    .padding(.top, 24)
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            // Steuerung
            HStack(spacing: 12) {
                if index > 0 {
                    Button {
                        withAnimation { index -= 1 }
                    } label: {
                        Text("Zurück").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
                Button {
                    if index < cards.count - 1 { withAnimation { index += 1 } }
                    else { onFinish() }
                } label: {
                    Text(index == cards.count - 1 ? "Los geht’s" : "Weiter")
                        .fontWeight(.semibold).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Color(.systemBackground))
    }
}
