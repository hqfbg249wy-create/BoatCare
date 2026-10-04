import SwiftUI

// Farb-Logik fuer Produktvarianten - Pendant zu variantColors.js in den
// Web-Portalen (Zwei-Frontends-Paritaet). Erkennt aus einem Variantenwert eine
// oder ZWEI Farben: Hex, RGB, RAL, Farbname sowie Mehrfarben ("Rot-Weiss",
// "Blaugruen"). Zwei Farben werden als geteilter Farbkreis dargestellt.
extension VariantOption {

    private static let colorWord = try? NSRegularExpression(
        pattern: "\\b(farbe|farben|colour|colors?|couleurs?|colori?|colore|kleur|kleuren|farve)\\b",
        options: [.caseInsensitive])

    private static let nameHex: [([String], String)] = [
        (["weiss", "weiß", "white", "blanc", "bianco", "blanco", "wit"], "#ffffff"),
        (["schwarz", "black", "noir", "nero", "negro", "zwart"], "#111111"),
        (["silber", "silver", "argent", "argento", "plata", "zilver"], "#c4c8cc"),
        (["anthrazit", "anthracite", "antracite"], "#383e42"),
        (["grau", "gray", "grey", "gris", "grigio", "grijs"], "#9ca3af"),
        (["rot", "red", "rouge", "rosso", "rojo", "rood"], "#e11d2a"),
        (["orange", "arancione", "naranja", "oranje"], "#f97316"),
        (["gelb", "yellow", "jaune", "giallo", "amarillo", "geel"], "#facc15"),
        (["tuerkis", "türkis", "turquoise", "cyan", "turchese"], "#06b6d4"),
        (["hellblau", "lichtblau", "light blue", "azzurro"], "#38bdf8"),
        (["dunkelblau", "navy", "marineblau", "marine"], "#1e2a52"),
        (["blau", "blue", "bleu", "blu", "azul", "blauw"], "#1d4ed8"),
        (["lila", "violett", "purple", "violet", "viola", "morado", "paars"], "#7c3aed"),
        (["rosa", "pink", "rose", "roze"], "#ec4899"),
        (["hellgruen", "hellgrün", "light green"], "#4ade80"),
        (["dunkelgruen", "dunkelgrün", "dark green"], "#166534"),
        (["gruen", "grün", "green", "vert", "verde", "groen"], "#16a34a"),
        (["braun", "brown", "marron", "marrone", "bruin"], "#92400e"),
        (["beige", "creme", "crème", "cream", "sand"], "#e4d8bd"),
        (["gold", "oro", "goud"], "#d4af37"),
    ]

    private static let ralHex: [String: String] = [
        "1021": "#f3da0b", "1023": "#f8f32b", "2004": "#e75b12", "2008": "#f3752c",
        "3000": "#af2b1e", "3002": "#9b2423", "3020": "#bb1f11",
        "5002": "#20214f", "5003": "#1d1e33", "5010": "#0e294b", "5012": "#0089b6",
        "5015": "#007cb0", "5017": "#063971",
        "6005": "#2f4538", "6018": "#57a639", "6029": "#007243",
        "7016": "#383e42", "7035": "#d7d7d7", "7038": "#b5b8b1", "7042": "#8f9695", "7047": "#cbcbcb",
        "8017": "#45322e", "8022": "#1a1718",
        "9001": "#fdf4e3", "9002": "#e7ebda", "9003": "#f4f4f4", "9005": "#0a0a0a",
        "9006": "#a5a5a5", "9007": "#8f8f8f", "9010": "#f1f0ea", "9016": "#f6f6f6",
    ]

    var isColorOption: Bool {
        if let flag = isColor { return flag }
        let n = name as NSString
        if let re = VariantOption.colorWord,
           re.firstMatch(in: name, range: NSRange(location: 0, length: n.length)) != nil { return true }
        return false
    }

    // Ein Token -> Hex (oder nil): Hex, RGB, RAL, Farbname.
    private static func parseToken(_ token: String) -> String? {
        let s = token.trimmingCharacters(in: .whitespaces).lowercased()
        if s.isEmpty { return nil }
        if let r = s.range(of: "#?[0-9a-f]{6}", options: .regularExpression) {
            let hx = s[r].replacingOccurrences(of: "#", with: "")
            if s.contains("#") || hx.count == 6 { return "#" + hx }
        }
        // RGB: r,g,b oder rgb(r,g,b)
        if let r = s.range(of: "(\\d{1,3})[, ]+(\\d{1,3})[, ]+(\\d{1,3})", options: .regularExpression) {
            let nums = s[r].split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
            if nums.count == 3 {
                let c = nums.map { max(0, min(255, $0)) }
                return String(format: "#%02x%02x%02x", c[0], c[1], c[2])
            }
        }
        if let r = s.range(of: "ral\\s*([0-9]{4})", options: .regularExpression) {
            let code = s[r].filter { $0.isNumber }
            if let hex = ralHex[code] { return hex }
        }
        for (words, code) in nameHex where words.contains(s) { return code }
        for (words, code) in nameHex where words.contains(where: { s.contains($0) }) { return code }
        return nil
    }

    private static func scanColorWords(_ value: String) -> [String] {
        let s = value.lowercased()
        var hits: [(idx: Int, code: String)] = []
        for (words, code) in nameHex {
            for w in words {
                if let r = s.range(of: w) { hits.append((s.distance(from: s.startIndex, to: r.lowerBound), code)); break }
            }
        }
        hits.sort { $0.idx < $1.idx }
        var out: [String] = []
        for h in hits where !out.contains(h.code) { out.append(h.code); if out.count == 2 { break } }
        return out
    }

    /// Eine oder zwei Farben fuer einen Wert.
    func swatchHexes(for value: String) -> [String] {
        if let ex = swatches?[value] {
            let parts = ex.split(whereSeparator: { "/,;|".contains($0) })
                .compactMap { VariantOption.parseToken(String($0)) }
            if !parts.isEmpty { return Array(parts.prefix(2)) }
        }
        let seps = value.split(whereSeparator: { "/,;|-".contains($0) })
            .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        if seps.count >= 2 {
            let cols = seps.compactMap { VariantOption.parseToken($0) }
            if !cols.isEmpty { return Array(cols.prefix(2)) }
        }
        if let single = VariantOption.parseToken(value) { return [single] }
        return VariantOption.scanColorWords(value)
    }

    /// SwiftUI-Farben (1-2) fuer den Farbkreis.
    func swatchColors(for value: String) -> [Color] {
        swatchHexes(for: value).compactMap { Color(hexString: $0) }
    }
}

extension Color {
    init?(hexString: String) {
        var h = hexString.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        guard h.count == 6, let v = UInt64(h, radix: 16) else { return nil }
        self.init(.sRGB,
                  red: Double((v >> 16) & 0xff) / 255.0,
                  green: Double((v >> 8) & 0xff) / 255.0,
                  blue: Double(v & 0xff) / 255.0, opacity: 1.0)
    }
}

// Farbkreis: Vollton oder diagonaler Zweiton (fuer Mehrfarben-Werte).
struct VariantSwatch: View {
    let colors: [Color]
    var size: CGFloat = 16
    var body: some View {
        Group {
            if colors.count >= 2 {
                Circle().fill(LinearGradient(
                    stops: [.init(color: colors[0], location: 0),
                            .init(color: colors[0], location: 0.5),
                            .init(color: colors[1], location: 0.5),
                            .init(color: colors[1], location: 1)],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
            } else if let c = colors.first {
                Circle().fill(c)
            } else {
                Circle().fill(Color.gray.opacity(0.3))
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(Color.black.opacity(0.18), lineWidth: 1))
    }
}
