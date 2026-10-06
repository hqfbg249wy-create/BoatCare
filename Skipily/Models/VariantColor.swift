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
        "1000": "#cdba88",         "1001": "#d0b084",         "1002": "#d2aa6d",         "1003": "#f9a800",         "1004": "#e49e00",
        "1005": "#cb8e00",         "1006": "#e29000",         "1007": "#e88c00",         "1011": "#af804f",         "1012": "#ddaf27",
        "1013": "#e3d9c6",         "1014": "#ddc49a",         "1015": "#e6d2b5",         "1016": "#f1dd38",         "1017": "#f6a950",
        "1018": "#faca30",         "1019": "#a48f7a",         "1020": "#a08f65",         "1021": "#f3da0b",         "1023": "#f8f32b",
        "1024": "#ba8f4c",         "1026": "#ffff00",         "1027": "#a77f0e",         "1028": "#ff9b00",         "1032": "#e2a300",
        "1033": "#f99a1c",         "1034": "#eb9c52",         "1035": "#908370",         "1037": "#f09200",         "2000": "#da6e00",
        "2001": "#be4e20",         "2002": "#c63927",         "2003": "#fc7c00",         "2004": "#e75b12",         "2005": "#ff2300",
        "2007": "#ffa421",         "2008": "#f3752c",         "2009": "#e25303",         "2010": "#d35831",         "2011": "#e35c00",
        "2012": "#d36a50",         "2013": "#923e25",         "3000": "#af2b1e",         "3001": "#a52019",         "3002": "#a2231d",
        "3003": "#9b111e",         "3004": "#75151e",         "3005": "#5e2129",         "3007": "#412227",         "3009": "#642424",
        "3011": "#781f19",         "3012": "#c1876b",         "3013": "#a12312",         "3014": "#d36e70",         "3015": "#ea899a",
        "3016": "#b32821",         "3017": "#e63244",         "3018": "#d53032",         "3020": "#cc0605",         "3022": "#d95030",
        "3024": "#ff2d21",         "3026": "#ff2a1b",         "3027": "#c51d34",         "3028": "#cb3234",         "3031": "#b32428",
        "3032": "#721422",         "3033": "#b44c43",         "4001": "#6d3f5b",         "4002": "#922b3e",         "4003": "#de4c8a",
        "4004": "#641c34",         "4005": "#6c4675",         "4006": "#a03472",         "4007": "#4a192c",         "4008": "#924e7d",
        "4009": "#a18594",         "4010": "#cf3476",         "4011": "#6d6880",         "4012": "#6b6b7f",         "5000": "#354d73",
        "5001": "#1f3438",         "5002": "#20214f",         "5003": "#1f2b3a",         "5004": "#1d1e25",         "5005": "#154889",
        "5007": "#41678d",         "5008": "#313c48",         "5009": "#2e5978",         "5010": "#13447c",         "5011": "#232c3f",
        "5012": "#3481b8",         "5013": "#232d53",         "5014": "#6c7c98",         "5015": "#2874b2",         "5017": "#0e518d",
        "5018": "#21888f",         "5019": "#1d5b8f",         "5020": "#1a4c56",         "5021": "#07737a",         "5022": "#2f2a5a",
        "5023": "#4d668e",         "5024": "#6a93b0",         "5025": "#296478",         "5026": "#102c54",         "6000": "#327662",
        "6001": "#28713e",         "6002": "#276235",         "6003": "#4b573e",         "6004": "#0e4243",         "6005": "#0f4336",
        "6006": "#40433b",         "6007": "#283424",         "6008": "#35382e",         "6009": "#26392f",         "6010": "#3e753b",
        "6011": "#68825b",         "6012": "#31403b",         "6013": "#797c5a",         "6014": "#444337",         "6015": "#3d403a",
        "6016": "#026a52",         "6017": "#468641",         "6018": "#48a43f",         "6019": "#b7d9b1",         "6020": "#354733",
        "6021": "#86a47c",         "6022": "#25221a",         "6024": "#308446",         "6025": "#3d642d",         "6026": "#015d52",
        "6027": "#84c3be",         "6028": "#2c5545",         "6029": "#20603d",         "6032": "#317f43",         "6033": "#497e76",
        "6034": "#7fb0b2",         "6035": "#1c542d",         "6036": "#2a5a4b",         "6037": "#007f34",         "6038": "#00b534",
        "7000": "#7e8b92",         "7001": "#8f999f",         "7002": "#817f68",         "7003": "#7f7679",         "7004": "#9ea0a1",
        "7005": "#6c6e6b",         "7006": "#766a5e",         "7008": "#745e3d",         "7009": "#5d6058",         "7010": "#57554c",
        "7011": "#434b4d",         "7012": "#4c514a",         "7013": "#434138",         "7015": "#4e5754",         "7016": "#383e42",
        "7021": "#2f3234",         "7022": "#4b4d46",         "7023": "#818177",         "7024": "#474a51",         "7026": "#374447",
        "7030": "#939388",         "7031": "#5b6977",         "7032": "#b8b799",         "7033": "#7d8471",         "7034": "#8f8b66",
        "7035": "#d7d7d7",         "7036": "#7f7679",         "7037": "#7d7f7d",         "7038": "#b5b8b1",         "7039": "#6c6960",
        "7040": "#9da3a6",         "7042": "#8f9695",         "7043": "#4e5451",         "7044": "#cac4b0",         "7045": "#909090",
        "7046": "#82898f",         "7047": "#d0d0d0",         "7048": "#898176",         "8000": "#826c34",         "8001": "#955f20",
        "8002": "#6c3b2a",         "8003": "#734222",         "8004": "#8e402a",         "8007": "#59351d",         "8008": "#6f4f28",
        "8011": "#5b3a29",         "8012": "#592321",         "8014": "#382c1e",         "8015": "#633a34",         "8016": "#4c2f27",
        "8017": "#45322e",         "8019": "#403a3a",         "8022": "#212121",         "8023": "#a3502e",         "8024": "#79553d",
        "8025": "#755c48",         "8028": "#4e3b31",         "8029": "#763c28",         "9001": "#fdf4e3",         "9002": "#e7ebda",
        "9003": "#f4f4f4",         "9004": "#2b2b2c",         "9005": "#0a0a0a",         "9006": "#a5a5a5",         "9007": "#8f8f8f",
        "9010": "#f1f0ea",         "9011": "#27292b",         "9016": "#f6f6f6",         "9017": "#2a2d2f",         "9018": "#cfd3cd",
        "9022": "#9c9c9c",         "9023": "#828282",
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
        let scanned = VariantOption.scanColorWords(value)
        if scanned.count >= 2 { return scanned }
        if let single = VariantOption.parseToken(value) { return [single] }
        return scanned
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
