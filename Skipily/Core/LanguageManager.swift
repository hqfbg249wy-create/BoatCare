//
//  LanguageManager.swift
//  Skipily
//

import SwiftUI
import Combine

// MARK: - App Language Enum

enum AppLanguage: String, CaseIterable, Codable {
    case system  = "system"
    case german  = "de"
    case english = "en"
    case french  = "fr"
    case spanish = "es"
    case italian = "it"
    case dutch   = "nl"

    var displayName: String {
        switch self {
        case .system:  return "System"
        case .german:  return "Deutsch"
        case .english: return "English"
        case .french:  return "Français"
        case .spanish: return "Español"
        case .italian: return "Italiano"
        case .dutch:   return "Nederlands"
        }
    }

    var flag: String {
        switch self {
        case .system:  return "🌐"
        case .german:  return "🇩🇪"
        case .english: return "🇬🇧"
        case .french:  return "🇫🇷"
        case .spanish: return "🇪🇸"
        case .italian: return "🇮🇹"
        case .dutch:   return "🇳🇱"
        }
    }

    /// Resolved language code (resolves "system" to actual locale)
    var code: String {
        if self == .system {
            let preferred = Locale.preferredLanguages.first ?? "en"
            let lang = String(preferred.prefix(2))
            let supported = ["de", "en", "fr", "es", "it", "nl"]
            return supported.contains(lang) ? lang : "en"
        }
        return rawValue
    }
}

// MARK: - Language Manager

final class LanguageManager: ObservableObject {
    static let shared = LanguageManager()

    @Published private(set) var currentLanguage: AppLanguage
    private var bundle: Bundle = .main

    private init() {
        let saved = UserDefaults.standard.string(forKey: "appLanguage") ?? "system"
        let lang = AppLanguage(rawValue: saved) ?? .system
        self.currentLanguage = lang
        self.bundle = LanguageManager.bundle(for: lang)
    }

    func setLanguage(_ language: AppLanguage) {
        UserDefaults.standard.set(language.rawValue, forKey: "appLanguage")
        currentLanguage = language
        bundle = LanguageManager.bundle(for: language)
    }

    func localized(_ key: String) -> String {
        bundle.localizedString(forKey: key, value: key, table: nil)
    }

    func localizedCategory(_ category: String) -> String {
        let lower = category.lowercased()
        let key: String
        switch lower {
        case "motor service", "werkstatt", "werft", "repair", "motorservice",
             "atelier", "chantier naval", "taller", "cantiere", "werkplaats", "officina":
            key = "category.motor_service"
        case "marine supplies", "zubehör", "ausrüstung", "accastillage", "shipchandler",
             "accesorios náuticos", "accessori nautici", "nautische benodigdheden":
            key = "category.supplies"
        case "sailmaker", "segelmacher", "voilerie", "velería", "veleria", "zeilmakerij":
            key = "category.sailmaker"
        case "instruments", "instrumente", "marine electronics", "électronique marine",
             "electrónica marina", "elettronica marina", "maritieme elektronica":
            key = "category.instruments"
        case "fuel", "tankstelle", "carburant", "combustible", "carburante", "brandstofstation":
            key = "category.fuel"
        case "marina", "hafen", "yachthafen", "port", "puerto", "porto", "jachthaven":
            key = "category.marina"
        case "surveyor", "gutachter", "expert maritime", "perito naval", "perito navale", "scheepsexpert":
            key = "category.surveyor"
        case "crane", "kran", "grue", "grúa", "gru", "kraan":
            key = "category.crane"
        case "painting", "lackierung", "antifouling", "peinture", "pintura", "verniciatura", "schilderwerk":
            key = "category.painting"
        case "rigging", "rigg", "gréement", "aparejo", "sartiame", "tuigage":
            key = "category.rigging"
        default:
            return category
        }
        return localized(key)
    }

    private static func bundle(for language: AppLanguage) -> Bundle {
        let code = language.code
        guard let path = Bundle.main.path(forResource: code, ofType: "lproj"),
              let bundle = Bundle(path: path) else {
            return .main
        }
        return bundle
    }
}

// MARK: - String Extension

extension String {
    var loc: String {
        LanguageManager.shared.localized(self)
    }
}

// MARK: - View Modifier for Language-Aware Re-rendering

struct LanguageAwareModifier: ViewModifier {
    @ObservedObject var manager = LanguageManager.shared

    func body(content: Content) -> some View {
        content
            .id(manager.currentLanguage)
    }
}

extension View {
    func languageAware() -> some View {
        modifier(LanguageAwareModifier())
    }
}
