// Gemeinsame Farb-Logik fuer Produktvarianten (Provider- + Owner-Portal
// halten je eine identische Kopie, siehe Zwei-Frontends-Paritaet; iOS-Pendant
// = VariantColor.swift).
//
// Kann aus einem Variantenwert eine oder ZWEI Farben ableiten:
//   • Farbcode direkt: Hex (#0055aa), RGB (rgb(0,85,170) / 0,85,170), RAL (RAL 5010)
//   • Farbname: Rot, Blau, Weiss ... (de/en/fr/it/es/nl)
//   • Mehrfarbig: "Rot-Weiss", "Blau/Weiss", "Blaugruen" -> zwei Farben
// Die zwei Farben werden im UI als geteilter Farbkreis dargestellt.

const COLOR_WORD = /\b(farbe|farben|colour|colors?|couleurs?|colori?|colore|kleur|kleuren|farve)\b/i

// Farbnamen (de/en/fr/it/es/nl) -> Hex. Reihenfolge: laengere/spezifische zuerst.
const NAME_HEX = [
  [['weiss', 'weiß', 'white', 'blanc', 'bianco', 'blanco', 'wit'], '#ffffff'],
  [['schwarz', 'black', 'noir', 'nero', 'negro', 'zwart'], '#111111'],
  [['silber', 'silver', 'argent', 'argento', 'plata', 'zilver'], '#c4c8cc'],
  [['anthrazit', 'anthracite', 'antracite'], '#383e42'],
  [['grau', 'gray', 'grey', 'gris', 'grigio', 'grijs'], '#9ca3af'],
  [['rot', 'red', 'rouge', 'rosso', 'rojo', 'rood'], '#e11d2a'],
  [['orange', 'arancione', 'naranja', 'oranje'], '#f97316'],
  [['gelb', 'yellow', 'jaune', 'giallo', 'amarillo', 'geel'], '#facc15'],
  [['tuerkis', 'türkis', 'turquoise', 'cyan', 'turchese'], '#06b6d4'],
  [['hellblau', 'lichtblau', 'light blue', 'azzurro'], '#38bdf8'],
  [['dunkelblau', 'navy', 'marineblau', 'marine'], '#1e2a52'],
  [['blau', 'blue', 'bleu', 'blu', 'azul', 'blauw'], '#1d4ed8'],
  [['lila', 'violett', 'purple', 'violet', 'viola', 'morado', 'paars'], '#7c3aed'],
  [['rosa', 'pink', 'rose', 'roze'], '#ec4899'],
  [['hellgruen', 'hellgrün', 'light green'], '#4ade80'],
  [['dunkelgruen', 'dunkelgrün', 'dark green'], '#166534'],
  [['gruen', 'grün', 'green', 'vert', 'verde', 'groen'], '#16a34a'],
  [['braun', 'brown', 'marron', 'marrone', 'bruin'], '#92400e'],
  [['beige', 'creme', 'crème', 'cream', 'sand'], '#e4d8bd'],
  [['gold', 'oro', 'goud'], '#d4af37'],
]

// RAL-Classic-Tabelle (Naeherungswerte) -> Hex. Deckt die gaengigen Codes ab.
const RAL_HEX = {
  1000: '#cdba88', 1001: '#d0b084', 1002: '#d2aa6d', 1003: '#f9a800', 1004: '#e49e00',
  1005: '#cb8e00', 1006: '#e29000', 1007: '#e88c00', 1011: '#af804f', 1012: '#ddaf27',
  1013: '#e3d9c6', 1014: '#ddc49a', 1015: '#e6d2b5', 1016: '#f1dd38', 1017: '#f6a950',
  1018: '#faca30', 1019: '#a48f7a', 1020: '#a08f65', 1021: '#f3da0b', 1023: '#f8f32b',
  1024: '#ba8f4c', 1026: '#ffff00', 1027: '#a77f0e', 1028: '#ff9b00', 1032: '#e2a300',
  1033: '#f99a1c', 1034: '#eb9c52', 1035: '#908370', 1037: '#f09200',
  2000: '#da6e00', 2001: '#be4e20', 2002: '#c63927', 2003: '#fc7c00', 2004: '#e75b12',
  2005: '#ff2300', 2007: '#ffa421', 2008: '#f3752c', 2009: '#e25303', 2010: '#d35831',
  2011: '#e35c00', 2012: '#d36a50', 2013: '#923e25',
  3000: '#af2b1e', 3001: '#a52019', 3002: '#a2231d', 3003: '#9b111e', 3004: '#75151e',
  3005: '#5e2129', 3007: '#412227', 3009: '#642424', 3011: '#781f19', 3012: '#c1876b',
  3013: '#a12312', 3014: '#d36e70', 3015: '#ea899a', 3016: '#b32821', 3017: '#e63244',
  3018: '#d53032', 3020: '#cc0605', 3022: '#d95030', 3024: '#ff2d21', 3026: '#ff2a1b',
  3027: '#c51d34', 3028: '#cb3234', 3031: '#b32428', 3032: '#721422', 3033: '#b44c43',
  4001: '#6d3f5b', 4002: '#922b3e', 4003: '#de4c8a', 4004: '#641c34', 4005: '#6c4675',
  4006: '#a03472', 4007: '#4a192c', 4008: '#924e7d', 4009: '#a18594', 4010: '#cf3476',
  4011: '#6d6880', 4012: '#6b6b7f',
  5000: '#354d73', 5001: '#1f3438', 5002: '#20214f', 5003: '#1f2b3a', 5004: '#1d1e25',
  5005: '#154889', 5007: '#41678d', 5008: '#313c48', 5009: '#2e5978', 5010: '#13447c',
  5011: '#232c3f', 5012: '#3481b8', 5013: '#232d53', 5014: '#6c7c98', 5015: '#2874b2',
  5017: '#0e518d', 5018: '#21888f', 5019: '#1d5b8f', 5020: '#1a4c56', 5021: '#07737a',
  5022: '#2f2a5a', 5023: '#4d668e', 5024: '#6a93b0', 5025: '#296478', 5026: '#102c54',
  6000: '#327662', 6001: '#28713e', 6002: '#276235', 6003: '#4b573e', 6004: '#0e4243',
  6005: '#0f4336', 6006: '#40433b', 6007: '#283424', 6008: '#35382e', 6009: '#26392f',
  6010: '#3e753b', 6011: '#68825b', 6012: '#31403b', 6013: '#797c5a', 6014: '#444337',
  6015: '#3d403a', 6016: '#026a52', 6017: '#468641', 6018: '#48a43f', 6019: '#b7d9b1',
  6020: '#354733', 6021: '#86a47c', 6022: '#25221a', 6024: '#308446', 6025: '#3d642d',
  6026: '#015d52', 6027: '#84c3be', 6028: '#2c5545', 6029: '#20603d', 6032: '#317f43',
  6033: '#497e76', 6034: '#7fb0b2', 6035: '#1c542d', 6036: '#2a5a4b', 6037: '#007f34',
  6038: '#00b534',
  7000: '#7e8b92', 7001: '#8f999f', 7002: '#817f68', 7003: '#7f7679', 7004: '#9ea0a1',
  7005: '#6c6e6b', 7006: '#766a5e', 7008: '#745e3d', 7009: '#5d6058', 7010: '#57554c',
  7011: '#434b4d', 7012: '#4c514a', 7013: '#434138', 7015: '#4e5754', 7016: '#383e42',
  7021: '#2f3234', 7022: '#4b4d46', 7023: '#818177', 7024: '#474a51', 7026: '#374447',
  7030: '#939388', 7031: '#5b6977', 7032: '#b8b799', 7033: '#7d8471', 7034: '#8f8b66',
  7035: '#d7d7d7', 7036: '#7f7679', 7037: '#7d7f7d', 7038: '#b5b8b1', 7039: '#6c6960',
  7040: '#9da3a6', 7042: '#8f9695', 7043: '#4e5451', 7044: '#cac4b0', 7045: '#909090',
  7046: '#82898f', 7047: '#d0d0d0', 7048: '#898176',
  8000: '#826c34', 8001: '#955f20', 8002: '#6c3b2a', 8003: '#734222', 8004: '#8e402a',
  8007: '#59351d', 8008: '#6f4f28', 8011: '#5b3a29', 8012: '#592321', 8014: '#382c1e',
  8015: '#633a34', 8016: '#4c2f27', 8017: '#45322e', 8019: '#403a3a', 8022: '#212121',
  8023: '#a3502e', 8024: '#79553d', 8025: '#755c48', 8028: '#4e3b31', 8029: '#763c28',
  9001: '#fdf4e3', 9002: '#e7ebda', 9003: '#f4f4f4', 9004: '#2b2b2c', 9005: '#0a0a0a',
  9006: '#a5a5a5', 9007: '#8f8f8f', 9010: '#f1f0ea', 9011: '#27292b', 9016: '#f6f6f6',
  9017: '#2a2d2f', 9018: '#cfd3cd', 9022: '#9c9c9c', 9023: '#828282',
}

export function isColorOption(opt) {
  if (!opt) return false
  if (opt.is_color === true) return true
  if (opt.is_color === false) return false
  return COLOR_WORD.test(opt.name || '')
}

function normHex(h) {
  let s = String(h || '').trim()
  if (!s) return null
  if (s[0] === '#') s = s.slice(1)
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map(c => c + c).join('')
  return /^[0-9a-f]{6}$/i.test(s) ? ('#' + s.toLowerCase()) : null
}

// Ein einzelnes Token -> Hex (oder null). Erkennt Hex, RGB, RAL, Farbname.
export function parseColorToken(token) {
  const s = String(token || '').trim().toLowerCase()
  if (!s) return null
  // Hex
  const hex = s.match(/#?([0-9a-f]{6}|[0-9a-f]{3})\b/i)
  if (hex && (s.startsWith('#') || /^[0-9a-f]{6}$/i.test(hex[1]))) {
    const h = normHex(hex[1]); if (h) return h
  }
  // RGB: rgb(r,g,b) oder r,g,b oder r g b
  const rgb = s.match(/(?:rgb\s*\(\s*)?(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/)
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(n => Math.max(0, Math.min(255, parseInt(n, 10))))
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
  }
  // RAL
  const ral = s.match(/ral\s*([0-9]{4})/)
  if (ral && RAL_HEX[ral[1]]) return RAL_HEX[ral[1]]
  // Farbname (exakt oder als Teilstring)
  for (const [words, code] of NAME_HEX) {
    if (words.some(w => s === w)) return code
  }
  for (const [words, code] of NAME_HEX) {
    if (words.some(w => s.includes(w))) return code
  }
  return null
}

// Durchsucht einen Wert nach bis zu zwei enthaltenen Farbnamen (z. B. "Blaugruen").
function scanColorWords(value) {
  const s = String(value || '').toLowerCase()
  const hits = []
  for (const [words, code] of NAME_HEX) {
    for (const w of words) {
      const idx = s.indexOf(w)
      if (idx >= 0) { hits.push({ idx, code }); break }
    }
  }
  hits.sort((a, b) => a.idx - b.idx)
  const out = []
  for (const h of hits) { if (!out.includes(h.code)) out.push(h.code); if (out.length === 2) break }
  return out
}

// Eine oder zwei Farben fuer einen Wert (fuer den geteilten Farbkreis).
export function swatchColors(opt, value) {
  // 1) Expliziter Code (kann selbst mehrfarbig sein: "#fff / #d00")
  const explicit = opt?.swatches?.[value]
  if (explicit) {
    const parts = String(explicit).split(/[\/,;|]| und | and /i).map(p => parseColorToken(p)).filter(Boolean)
    if (parts.length) return parts.slice(0, 2)
  }
  // 2) Wert nach Trennzeichen splitten (Rot-Weiss, Blau/Weiss, Rot e Bianco)
  const sep = String(value || '').split(/[\/,;|]|\s[-–—]\s|-| und | and | e | en /i)
    .map(p => p.trim()).filter(Boolean)
  if (sep.length >= 2) {
    const cols = sep.map(parseColorToken).filter(Boolean)
    if (cols.length >= 1) return cols.slice(0, 2)
  }
  // 3) Zusammengesetzter Name ("Blaugruen") -> zwei Farbnamen (vor Einzeltoken,
  //    da parseColorToken sonst nur die erste Farbe liefern wuerde).
  const scanned = scanColorWords(value)
  if (scanned.length >= 2) return scanned
  // 4) Einzelnes Token (Hex/RGB/RAL/Farbname)
  const single = parseColorToken(value)
  if (single) return [single]
  return scanned
}

// Rueckwaertskompatibel: erste (Haupt-)Farbe oder null.
export function swatchFor(opt, value) {
  const c = swatchColors(opt, value)
  return c.length ? c[0] : null
}

// CSS-Hintergrund fuer den Farbkreis: ein Vollton oder diagonaler Zweiton.
export function swatchBackground(opt, value) {
  const c = swatchColors(opt, value)
  if (!c.length) return null
  if (c.length === 1) return c[0]
  return `linear-gradient(135deg, ${c[0]} 0 50%, ${c[1]} 50% 100%)`
}

// Setzt/entfernt einen Farbcode in der swatches-Map (unveraenderlich).
export function withSwatch(opt, value, hex) {
  const swatches = { ...(opt?.swatches || {}) }
  if (hex) swatches[value] = hex
  else delete swatches[value]
  return { ...opt, swatches }
}
