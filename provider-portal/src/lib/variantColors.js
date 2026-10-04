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

// Haeufige RAL-Classic-Farben (Marine-relevant) -> Hex (Naeherung).
const RAL_HEX = {
  1021: '#f3da0b', 1023: '#f8f32b', 2004: '#e75b12', 2008: '#f3752c',
  3000: '#af2b1e', 3002: '#9b2423', 3020: '#bb1f11',
  5002: '#20214f', 5003: '#1d1e33', 5010: '#0e294b', 5012: '#0089b6',
  5015: '#007cb0', 5017: '#063971',
  6005: '#2f4538', 6018: '#57a639', 6029: '#007243',
  7016: '#383e42', 7035: '#d7d7d7', 7038: '#b5b8b1', 7042: '#8f9695', 7047: '#cbcbcb',
  8017: '#45322e', 8022: '#1a1718',
  9001: '#fdf4e3', 9002: '#e7ebda', 9003: '#f4f4f4', 9005: '#0a0a0a',
  9006: '#a5a5a5', 9007: '#8f8f8f', 9010: '#f1f0ea', 9016: '#f6f6f6',
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
  // 3) Einzelnes Token
  const single = parseColorToken(value)
  if (single) return [single]
  // 4) Zusammengesetzter Name ("Blaugruen") -> bis zu zwei Farbnamen
  const scanned = scanColorWords(value)
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
