// Gemeinsame Farb-Logik fuer Produktvarianten (Provider- + Owner-Portal
// halten je eine identische Kopie, siehe Zwei-Frontends-Paritaet).
//
// Eine Option gilt als Farboption, wenn sie explizit so markiert ist
// (opt.is_color === true) oder – ohne Markierung – der Name ein Farb-Stichwort
// enthaelt (Farbe/Color/...). Das angezeigte Farbfeld kommt aus:
//   1. einem hinterlegten Farbcode  opt.swatches[value]  (z. B. RAL -> Hex)
//   2. sonst dem erkannten Farbnamen im Wert (Rot, Blau, Weiss, ...)
//   3. sonst null (dann kein Farbfeld, nur Text).

const COLOR_WORD = /\b(farbe|farben|colour|colors?|couleurs?|colori?|colore|kleur|kleuren|farve)\b/i

// Gaengige Farbnamen (de/en/fr/it/es/nl) -> Hex. Substring-Treffer erlaubt,
// damit auch "Gelcoat Weiss" oder "Signalrot" ein Farbfeld bekommen.
const NAME_HEX = [
  [['weiss', 'weiß', 'white', 'blanc', 'bianco', 'blanco', 'wit'], '#ffffff'],
  [['schwarz', 'black', 'noir', 'nero', 'negro', 'zwart'], '#111111'],
  [['silber', 'silver', 'argent', 'argento', 'plata', 'zilver'], '#c4c8cc'],
  [['grau', 'gray', 'grey', 'gris', 'grigio', 'grijs'], '#9ca3af'],
  [['rot', 'red', 'rouge', 'rosso', 'rojo', 'rood'], '#e11d2a'],
  [['orange', 'arancione', 'naranja', 'oranje'], '#f97316'],
  [['gelb', 'yellow', 'jaune', 'giallo', 'amarillo', 'geel'], '#facc15'],
  [['gruen', 'grün', 'green', 'vert', 'verde', 'groen'], '#16a34a'],
  [['tuerkis', 'türkis', 'turquoise', 'cyan', 'turchese'], '#06b6d4'],
  [['blau', 'blue', 'bleu', 'blu', 'azul', 'blauw'], '#1d4ed8'],
  [['lila', 'violett', 'purple', 'violet', 'viola', 'morado', 'paars'], '#7c3aed'],
  [['rosa', 'pink', 'rose', 'roze'], '#ec4899'],
  [['braun', 'brown', 'marron', 'marrone', 'marron', 'bruin'], '#92400e'],
  [['beige', 'creme', 'crème', 'cream'], '#e4d8bd'],
  [['gold', 'oro', 'goud'], '#d4af37'],
]

export function isColorOption(opt) {
  if (!opt) return false
  if (opt.is_color === true) return true
  if (opt.is_color === false) return false
  return COLOR_WORD.test(opt.name || '')
}

function nameToHex(value) {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return null
  // Direkter Hexcode im Wert (z. B. "#0055aa")
  const hex = s.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)
  if (hex) return hex[0]
  for (const [words, code] of NAME_HEX) {
    if (words.some(w => s.includes(w))) return code
  }
  return null
}

// Farbfeld-Hex fuer einen Wert (oder null, wenn nichts bekannt).
export function swatchFor(opt, value) {
  const explicit = opt?.swatches?.[value]
  if (explicit && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(explicit)) return explicit
  return nameToHex(value)
}

// Setzt/entfernt einen Farbcode in der swatches-Map (unveraenderlich).
export function withSwatch(opt, value, hex) {
  const swatches = { ...(opt?.swatches || {}) }
  if (hex) swatches[value] = hex
  else delete swatches[value]
  return { ...opt, swatches }
}
