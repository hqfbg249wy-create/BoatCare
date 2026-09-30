import SwiftUI

// Farb-Logik fuer Produktvarianten - Pendant zu variantColors.js in den
// Web-Portalen (Zwei-Frontends-Paritaet). Eine Option ist eine Farboption,
// wenn is_color == true oder - ohne Markierung - der Name ein Farb-Stichwort
// enthaelt. Das Farbfeld kommt aus dem hinterlegten Code (swatches) oder dem
// erkannten Farbnamen im Wert.
extension VariantOption {

    private static let colorWord = try? NSRegularExpression(
        pattern: "\\b(farbe|farben|colour|colors?|couleurs?|colori?|colore|kleur|kleuren|farve)\\b",
        options: [.caseInsensitive])

    // Gaengige Farbnamen (de/en/fr/it/es/nl) -> Hex (Substring-Treffer erlaubt).
    private static let nameHex: [([String], String)] = [
        (["weiss", "weiß", "white", "blanc", "bianco", "blanco", "wit"], "#ffffff"),
        (["schwarz", "black", "noir", "nero", "negro", "zwart"], "#111111"),
        (["silber", "silver", "argent", "argento", "plata", "zilver"], "#c4c8cc"),
        (["grau", "gray", "grey", "gris", "grigio", "grijs"], "#9ca3af"),
        (["rot", "red", "rouge", "rosso", "rojo", "rood"], "#e11d2a"),
        (["orange", "arancione", "naranja", "oranje"], "#f97316"),
        (["gelb", "yellow", "jaune", "giallo", "amarillo", "geel"], "#facc15"),
        (["gruen", "grün", "green", "vert", "verde", "groen"], "#16a34a"),
        (["tuerkis", "türkis", "turquoise", "cyan", "turchese"], "#06b6d4"),
        (["blau", "blue", "bleu", "blu", "azul", "blauw"], "#1d4ed8"),
        (["lila", "violett", "purple", "violet", "viola", "morado", "paars"], "#7c3aed"),
        (["rosa", "pink", "rose", "roze"], "#ec4899"),
        (["braun", "brown", "marron", "marrone", "bruin"], "#92400e"),
        (["beige", "creme", "crème", "cream"], "#e4d8bd"),
        (["gold", "oro", "goud"], "#d4af37"),
    ]

    var isColorOption: Bool {
        if let flag = isColor { return flag }
        let n = name as NSString
        if let re = VariantOption.colorWord,
           re.firstMatch(in: name, range: NSRange(location: 0, length: n.length)) != nil {
            return true
        }
        return false
    }

    private static func nameToHex(_ value: String) -> String? {
        let s = value.trimmingCharacters(in: .whitespaces).lowercased()
        if s.isEmpty { return nil }
        if let r = s.range(of: "#([0-9a-f]{3}|[0-9a-f]{6})\\b", options: .regularExpression) {
            return String(s[r])
        }
        for (words, code) in nameHex where words.contains(where: { s.contains($0) }) {
            return code
        }
        return nil
    }

    /// Farbe fuer einen Wert (oder nil, wenn kein Farbcode/-name bekannt ist).
    func swatchColor(for value: String) -> Color? {
        if let hex = swatches?[value], let c = Color(hexString: hex) { return c }
        if let hex = VariantOption.nameToHex(value), let c = Color(hexString: hex) { return c }
        return nil
    }
}

extension Color {
    /// Erzeugt eine Color aus "#rgb" oder "#rrggbb" (oder ohne '#').
    init?(hexString: String) {
        var h = hexString.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        guard h.count == 6, let v = UInt64(h, radix: 16) else { return nil }
        self.init(
            .sRGB,
            red: Double((v >> 16) & 0xff) / 255.0,
            green: Double((v >> 8) & 0xff) / 255.0,
            blue: Double(v & 0xff) / 255.0,
            opacity: 1.0)
    }
}
