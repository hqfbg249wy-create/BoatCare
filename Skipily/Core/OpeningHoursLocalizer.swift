//
//  OpeningHoursLocalizer.swift
//  Skipily
//
//  Übersetzt Öffnungszeiten-Strings client-side. Format aus Google Places:
//    "Montag: 09:00–12:00 Uhr\nDienstag: ..."
//  Wir ersetzen die Wochentage, "Uhr" und "Geschlossen" sprachabhängig —
//  Zeiten und Trennzeichen bleiben unverändert.
//

import Foundation

enum OpeningHoursLocalizer {

    private static let weekdays: [String: [String: String]] = [
        "en": ["Montag": "Monday", "Dienstag": "Tuesday", "Mittwoch": "Wednesday",
               "Donnerstag": "Thursday", "Freitag": "Friday", "Samstag": "Saturday",
               "Sonntag": "Sunday"],
        "fr": ["Montag": "Lundi", "Dienstag": "Mardi", "Mittwoch": "Mercredi",
               "Donnerstag": "Jeudi", "Freitag": "Vendredi", "Samstag": "Samedi",
               "Sonntag": "Dimanche"],
        "es": ["Montag": "Lunes", "Dienstag": "Martes", "Mittwoch": "Miércoles",
               "Donnerstag": "Jueves", "Freitag": "Viernes", "Samstag": "Sábado",
               "Sonntag": "Domingo"],
        "it": ["Montag": "Lunedì", "Dienstag": "Martedì", "Mittwoch": "Mercoledì",
               "Donnerstag": "Giovedì", "Freitag": "Venerdì", "Samstag": "Sabato",
               "Sonntag": "Domenica"],
        "nl": ["Montag": "Maandag", "Dienstag": "Dinsdag", "Mittwoch": "Woensdag",
               "Donnerstag": "Donderdag", "Freitag": "Vrijdag", "Samstag": "Zaterdag",
               "Sonntag": "Zondag"],
    ]

    private static let closed: [String: String] = [
        "en": "Closed", "fr": "Fermé", "es": "Cerrado",
        "it": "Chiuso", "nl": "Gesloten",
    ]

    private static let clockSuffix: [String: String] = [
        // "Uhr" → in EN/FR/ES/IT/NL einfach weglassen, da Zeitformat 24h schon klar ist
        "en": "", "fr": "", "es": "", "it": "", "nl": "",
    ]

    /// Lokalisiert einen Öffnungszeiten-Block. Bei `de` oder unbekannter
    /// Sprache wird das Original 1:1 zurückgegeben.
    static func localized(_ hours: String, lang: String) -> String {
        guard lang != "de", let dayMap = weekdays[lang] else { return hours }

        var out = hours

        // Wochentage 1:1 ersetzen
        for (de, target) in dayMap {
            out = out.replacingOccurrences(of: de, with: target)
        }
        // "Geschlossen" ersetzen
        if let closedTarget = closed[lang] {
            out = out.replacingOccurrences(of: "Geschlossen", with: closedTarget)
        }
        // "Uhr" weglassen / ersetzen (mit führendem Leerzeichen, damit "Uhr,"-Komma sauber entfernt wird)
        if let suffix = clockSuffix[lang] {
            out = out.replacingOccurrences(of: " Uhr", with: suffix)
        }

        return out
    }
}
