// Ausrüstungs-Import aus EINER Excel-Datei mit drei Blättern
// (SheetJS zum Lesen, ExcelJS zum Erzeugen der Vorlage — dynamisch geladen):
//   1) „Ausrüstung"      -> equipment
//   2) „Segelmessblatt"  -> sail_measurements   (verknüpft übers Feld „Ausrüstung")
//   3) „Tauwerk"         -> rope_configurations (verknüpft übers Feld „Ausrüstung")
// Zielgruppe: Werften geben dem Käufer eine ausgefüllte Vorlage; der Eigner
// lädt sie im Portal hoch. Spaltenüberschriften werden case-insensitiv gemappt.

import { ROPE_END_OPTIONS, ROPE_MATERIALS } from './ropeOptions'

const CATEGORIES = ['engine','electrical','navigation','safety','communication','rigging','hull','deck','anchor','other']

// Deutsche/englische Kategorie-Labels -> Enum-Key
const CAT_MAP = {
  'motor & antrieb': 'engine', 'motor': 'engine', 'engine': 'engine', 'antrieb': 'engine',
  'elektrik & batterie': 'electrical', 'elektrik': 'electrical', 'batterie': 'electrical', 'electrical': 'electrical',
  'navigation & elektronik': 'navigation', 'navigation': 'navigation', 'elektronik': 'navigation',
  'sicherheit': 'safety', 'safety': 'safety',
  'kommunikation': 'communication', 'communication': 'communication',
  'rigg & takelage': 'rigging', 'rigg': 'rigging', 'takelage': 'rigging', 'rigging': 'rigging',
  'rumpf & unterwasser': 'hull', 'rumpf': 'hull', 'hull': 'hull',
  'deck & beschläge': 'deck', 'deck': 'deck',
  'anker & kette': 'anchor', 'anker': 'anchor', 'anchor': 'anchor',
  'sonstiges': 'other', 'other': 'other',
}

// Feld -> akzeptierte Header (lowercase)
const FIELD_HEADERS = {
  name:                    ['bezeichnung', 'name', 'gerät', 'ausrüstung'],
  category:                ['kategorie', 'category'],
  manufacturer:            ['hersteller', 'manufacturer', 'marke', 'brand'],
  model:                   ['modell', 'model', 'typ'],
  serial_number:           ['seriennummer', 'serial', 'serial number', 'sn'],
  part_number:             ['teilenummer', 'artikelnummer', 'part number', 'part_number', 'part no', 'art.-nr.'],
  dimensions:              ['maße', 'masse', 'abmessungen', 'dimensions', 'größe'],
  location_on_boat:        ['einbauort', 'ort', 'position', 'location', 'einbauort am boot'],
  installation_date:       ['einbaudatum', 'eingebaut', 'installation', 'installationsdatum', 'installation date'],
  warranty_expiry:         ['garantie bis', 'garantie', 'garantieablauf', 'gewährleistung', 'warranty', 'warranty expiry'],
  maintenance_cycle_years: ['wartungsintervall', 'wartungsintervall (jahre)', 'intervall', 'maintenance cycle', 'cycle years'],
  last_maintenance_date:   ['letzte wartung', 'last maintenance', 'letzte-wartung'],
  item_description:        ['beschreibung', 'description', 'item description'],
  notes:                   ['notizen', 'notiz', 'notes', 'bemerkung'],
}

// Spaltenreihenfolge der Vorlage (alle importierbaren Felder)
export const TEMPLATE_HEADERS = [
  'Bezeichnung', 'Kategorie', 'Hersteller', 'Modell', 'Seriennummer', 'Teilenummer',
  'Maße', 'Einbauort', 'Einbaudatum', 'Garantie bis', 'Wartungsintervall (Jahre)',
  'Letzte Wartung', 'Beschreibung', 'Notizen',
]

// Kategorie-Labels EXAKT wie in der App — für das Dropdown in der Vorlage.
export const CATEGORY_LABELS = [
  'Motor & Antrieb', 'Elektrik & Batterie', 'Navigation & Elektronik',
  'Sicherheit', 'Kommunikation', 'Rigg & Takelage', 'Rumpf & Unterwasser',
  'Deck & Beschläge', 'Anker & Kette', 'Sonstiges',
]

// ─────────────────────────── Segelmessblatt ───────────────────────────
// sail_type-Key <-> Label (Dropdown in der Vorlage)
const SAIL_TYPE_LABELS = { grosssegel: 'Großsegel', vorsegel: 'Vorsegel', gennaker: 'Gennaker', code0: 'Code 0' }
const SAIL_TYPE_MAP = {
  'großsegel': 'grosssegel', 'grosssegel': 'grosssegel', 'groß': 'grosssegel', 'gross': 'grosssegel',
  'main': 'grosssegel', 'mainsail': 'grosssegel', 'gs': 'grosssegel',
  'vorsegel': 'vorsegel', 'genua': 'vorsegel', 'fock': 'vorsegel', 'jib': 'vorsegel', 'headsail': 'vorsegel', 'vs': 'vorsegel',
  'gennaker': 'gennaker', 'spinnaker': 'gennaker', 'gennaker/code0': 'gennaker', 'gk': 'gennaker',
  'code0': 'code0', 'code 0': 'code0', 'code-0': 'code0',
}

// [Header, Feld, Typ]  Typ: text | num | bool | sailtype | date
const SAIL_COLUMNS = [
  ['Ausrüstung', '_equipment', 'text'],
  ['Segeltyp', 'sail_type', 'sailtype'],
  ['Segelnummer', 'sail_number', 'text'],
  ['Datum', 'date', 'date'],
  ['Notizen', 'notes', 'text'],
  // Großsegel
  ['GS P (Vorliek)', 'gs_p', 'num'], ['GS E (Unterliek)', 'gs_e', 'num'], ['GS A (Achterliek)', 'gs_a', 'num'],
  ['GS G', 'gs_g', 'num'], ['GS AL', 'gs_al', 'num'], ['GS Roach unten', 'gs_rb', 'num'], ['GS Roach oben', 'gs_ru', 'num'],
  ['GS Camber unten', 'gs_cb', 'num'], ['GS Camber oben', 'gs_cu', 'num'],
  ['GS Unterliekstau', 'gs_unterliekstau', 'text'], ['GS Vorliekstau', 'gs_vorliekstau', 'text'],
  ['GS Schothornrutscher', 'gs_schothornrutscher', 'text'], ['GS Mastrutscher', 'gs_mastrutscher', 'text'],
  ['GS Einleinenreff', 'gs_einleinenreff', 'bool'], ['GS Weicher Fußteil', 'gs_weicher_fussteil', 'bool'],
  ['GS Loses Unterliek', 'gs_loses_unterliek', 'bool'], ['GS Segelzeichen', 'gs_segelzeichen', 'bool'],
  ['GS Segelnummer aufgedruckt', 'gs_segelnummer', 'bool'], ['GS Farbe', 'gs_farbe', 'text'],
  // Vorsegel
  ['VS I (Vorstag)', 'vs_i', 'num'], ['VS Vorstagversatz', 'vs_vst', 'num'], ['VS J', 'vs_j', 'num'],
  ['VS Vorliek', 'vs_vl', 'num'], ['VS W', 'vs_w', 'num'], ['VS Q', 'vs_q', 'num'], ['VS K', 'vs_k', 'num'], ['VS H', 'vs_h', 'num'],
  ['VS Reffanlage', 'vs_reffanlage', 'text'], ['VS Vorliekstau', 'vs_vorliekstau', 'text'],
  ['VS Position (BB/STB)', 'vs_position', 'text'], ['VS Farbe', 'vs_farbe', 'text'],
  ['VS Rollreff', 'vs_rollreff', 'bool'], ['VS Fenster', 'vs_fenster', 'bool'], ['VS UV-Schutz', 'vs_uv_schutz', 'bool'],
  // Gennaker / Code 0
  ['GK Vorliek', 'gk_luff_length', 'num'], ['GK Achterliek', 'gk_leech_length', 'num'], ['GK Unterliek', 'gk_foot_length', 'num'],
  ['GK Mittelbreite', 'gk_mid_width', 'num'], ['GK Halshöhe', 'gk_tack_height', 'num'],
  ['GK Material', 'gk_material', 'text'], ['GK Farbe', 'gk_farbe', 'text'],
]

// ─────────────────────────── Tauwerk ───────────────────────────
// Enum-Key <-> lesbares Label (Dropdown in der Vorlage). Import mappt zurück.
const ROPE_MATERIAL_LABELS = {
  geschlagen: 'Geschlagen (3-Schlag)', kern_mantel: 'Kern-Mantel', squareline: 'Squareline',
  pes_dyneema: 'PES/Dyneema-Mix', dyneema_hohlgeflecht: 'Dyneema Hohlgeflecht',
}
const ROPE_END_LABELS = {
  glatt_abgeschnitten: 'Glatt abgeschnitten', takling: 'Takling',
  augspleiss_indiv_mit_schamfil: 'Augspleiß individuell (mit Schamfilschutz)',
  augspleiss_indiv_ohne_schamfil: 'Augspleiß individuell (ohne Schamfilschutz)',
  augspleiss_3_5: 'Augspleiß 3–5 mm', augspleiss_6_8: 'Augspleiß 6–8 mm', augspleiss_9_12: 'Augspleiß 9–12 mm',
  augspleiss_low_friction: 'Augspleiß Low-Friction-Ring',
  augspleiss_kausch_edelstahl: 'Augspleiß mit Kausch (Edelstahl)',
  augspleiss_kausch_verzinkt: 'Augspleiß mit Kausch (verzinkt)',
  augspleiss_zubehoer: 'Augspleiß mit Zubehör',
}
// Reverse-Maps (label/lower + roher Key -> Key) für robustes Zurückmappen.
function buildReverse(keyToLabel, keys) {
  const m = {}
  for (const k of keys) { m[k] = k; m[k.toLowerCase()] = k }
  for (const [k, label] of Object.entries(keyToLabel)) m[String(label).trim().toLowerCase()] = k
  return m
}
const ROPE_MATERIAL_REV = buildReverse(ROPE_MATERIAL_LABELS, ROPE_MATERIALS)
const ROPE_END_REV = buildReverse(ROPE_END_LABELS, ROPE_END_OPTIONS)

const ROPE_COLUMNS = [
  ['Ausrüstung', '_equipment', 'text'],
  ['Artikelnummer', 'article_number', 'text'],
  ['Länge (m)', 'length_m', 'num'],
  ['Material', 'material', 'ropematerial'],
  ['Durchmesser (mm)', 'diameter_mm', 'num'],
  ['Ende 1', 'end1', 'ropeend'],
  ['Ende 1 Auglänge (cm)', 'end1_eye_length_cm', 'num'],
  ['Ende 2', 'end2', 'ropeend'],
  ['Ende 2 Auglänge (cm)', 'end2_eye_length_cm', 'num'],
  ['Zubehör-Artikelnr.', 'accessory_article_number', 'text'],
  ['Notizen', 'notes', 'text'],
]

// ─────────────────────────── Helfer ───────────────────────────
function toISODate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (de) return `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d) ? null : d.toISOString().slice(0, 10)
}

function toNum(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function toBool(v) {
  const s = String(v ?? '').trim().toLowerCase()
  return ['ja', 'x', 'true', '1', 'yes', 'wahr', 'y'].includes(s)
}

function convert(v, type) {
  switch (type) {
    case 'num': return toNum(v)
    case 'bool': return toBool(v)
    case 'date': return toISODate(v)
    case 'sailtype': return SAIL_TYPE_MAP[String(v ?? '').trim().toLowerCase()] || null
    case 'ropematerial': return ROPE_MATERIAL_REV[String(v ?? '').trim().toLowerCase()] || null
    case 'ropeend': return ROPE_END_REV[String(v ?? '').trim().toLowerCase()] || null
    default: { const s = String(v ?? '').trim(); return s || null }
  }
}

function headerToField(header) {
  const h = String(header || '').trim().toLowerCase()
  for (const [field, variants] of Object.entries(FIELD_HEADERS)) {
    if (variants.includes(h)) return field
  }
  return null
}

// Normalisiert einen Namen für den Duplikat-/Verknüpfungs-Vergleich.
export function normKey(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ') }

// Mappt eine Rohzeile (Header->Wert) über eine Spaltendefinition auf Felder.
function mapByColumns(raw, columns) {
  const norm = h => String(h || '').trim().toLowerCase()
  const byLabel = {}
  for (const [label, field, type] of columns) byLabel[norm(label)] = { field, type }
  const item = {}
  for (const [k, v] of Object.entries(raw)) {
    const c = byLabel[norm(k)]
    if (c) item[c.field] = convert(v, c.type)
  }
  return item
}

// Wandelt equipment-Rohzeilen in normalisierte Objekte (nur mit Name).
function mapEquipmentRows(rows) {
  const out = []
  for (const raw of rows) {
    const item = {}
    for (const [key, val] of Object.entries(raw)) {
      const field = headerToField(key)
      if (field) item[field] = val
    }
    const name = String(item.name || '').trim()
    if (!name) continue
    out.push({
      name,
      category: CAT_MAP[String(item.category || '').trim().toLowerCase()]
                || (CATEGORIES.includes(String(item.category).toLowerCase()) ? String(item.category).toLowerCase() : 'other'),
      manufacturer: String(item.manufacturer || '').trim() || null,
      model: String(item.model || '').trim() || null,
      serial_number: String(item.serial_number || '').trim() || null,
      part_number: String(item.part_number || '').trim() || null,
      dimensions: String(item.dimensions || '').trim() || null,
      location_on_boat: String(item.location_on_boat || '').trim() || null,
      installation_date: toISODate(item.installation_date),
      warranty_expiry: toISODate(item.warranty_expiry),
      maintenance_cycle_years: (() => { const n = parseInt(item.maintenance_cycle_years, 10); return Number.isFinite(n) && n > 0 ? n : null })(),
      last_maintenance_date: toISODate(item.last_maintenance_date),
      item_description: String(item.item_description || '').trim() || null,
      notes: String(item.notes || '').trim() || null,
    })
  }
  return out
}

// Findet ein Blatt case-insensitiv (exakt, dann Teilstring).
function findSheet(wb, names) {
  const lower = wb.SheetNames.map(n => n.toLowerCase())
  for (const n of names) { const i = lower.indexOf(n); if (i >= 0) return wb.SheetNames[i] }
  for (const n of names) { const i = lower.findIndex(x => x.includes(n)); if (i >= 0) return wb.SheetNames[i] }
  return null
}

/**
 * Liest EINE Excel-/CSV-Datei und liefert { equipment, sails, ropes }.
 * CSV hat nur ein Blatt -> nur equipment. Segel/Tauwerk nur bei .xlsx.
 */
export async function parseWorkbook(file) {
  const xm = await import('xlsx')
  const XLSX = xm.read ? xm : xm.default
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })

  const json = (names) => {
    const sheet = findSheet(wb, names)
    if (!sheet) return []
    return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' })
  }

  const equipment = mapEquipmentRows(json(['ausrüstung', 'ausruestung', 'equipment']).length
    ? json(['ausrüstung', 'ausruestung', 'equipment'])
    : XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })) // Fallback: erstes Blatt (CSV)

  const sails = json(['segelmessblatt', 'segel', 'sail'])
    .map(r => mapByColumns(r, SAIL_COLUMNS))
    .filter(s => s._equipment && s.sail_type)

  const ropes = json(['tauwerk', 'rope', 'leine'])
    .map(r => mapByColumns(r, ROPE_COLUMNS))
    .filter(r => r._equipment && (r.length_m != null || r.material || r.diameter_mm != null || r.article_number))

  return { equipment, sails, ropes }
}

/** Baut das DB-Insert-Objekt (mit boat_id) aus einer geparsten equipment-Zeile. */
export function toEquipmentInsert(row, boatId) {
  const p = { ...row, boat_id: boatId }
  if (p.maintenance_cycle_years && p.last_maintenance_date) {
    const d = new Date(p.last_maintenance_date)
    d.setFullYear(d.getFullYear() + p.maintenance_cycle_years)
    p.next_maintenance_date = d.toISOString().slice(0, 10)
  }
  return p
}

/** Baut die sail_measurements-Zeile (equipment_id gesetzt, _equipment entfernt). */
export function toSailInsert(row, equipmentId) {
  const { _equipment, ...rest } = row
  return { ...rest, equipment_id: equipmentId }
}

/** Baut die rope_configurations-Zeile (equipment_id gesetzt, _equipment entfernt). */
export function toRopeInsert(row, equipmentId) {
  const { _equipment, ...rest } = row
  return { ...rest, equipment_id: equipmentId, status: 'draft' }
}

// Speichert ein ExcelJS-Workbook als xlsx-Download.
async function saveWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Erzeugt ein Import-Protokoll (.xlsx) mit je einem Blatt pro Bereich und
 * einem Status/Hinweis je Zeile — damit nachvollziehbar ist, was neu angelegt,
 * was als Duplikat übersprungen und was (nicht) verknüpft wurde.
 * `detail` = { equipment[], sails[], ropes[] } mit Feldern {status, hint, …}.
 */
export async function downloadImportProtocol(detail) {
  const em = await import('exceljs')
  const ExcelJS = em.Workbook ? em : em.default
  const wb = new ExcelJS.Workbook()

  const head = (ws) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1D3A' } }
  }
  const paint = (cell, ok) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ok ? 'FFDCFCE7' : 'FFFEF3C7' } }
  }

  const ws1 = wb.addWorksheet('Ausrüstung')
  ws1.columns = [
    { header: 'Bezeichnung', width: 30 }, { header: 'Seriennummer', width: 18 },
    { header: 'Kategorie', width: 20 }, { header: 'Status', width: 24 }, { header: 'Hinweis', width: 46 },
  ]
  head(ws1)
  for (const e of (detail.equipment || [])) {
    const row = ws1.addRow([e.name, e.serial_number || '', e.category || '', e.status, e.hint || ''])
    paint(row.getCell(4), e.ok)
  }

  if ((detail.sails || []).length) {
    const ws2 = wb.addWorksheet('Segelmessblatt')
    ws2.columns = [{ header: 'Ausrüstung', width: 30 }, { header: 'Segeltyp', width: 16 }, { header: 'Status', width: 24 }, { header: 'Hinweis', width: 46 }]
    head(ws2)
    for (const s of detail.sails) { const row = ws2.addRow([s.equipment, s.sail_type || '', s.status, s.hint || '']); paint(row.getCell(3), s.ok) }
  }

  if ((detail.ropes || []).length) {
    const ws3 = wb.addWorksheet('Tauwerk')
    ws3.columns = [{ header: 'Ausrüstung', width: 30 }, { header: 'Artikelnummer', width: 18 }, { header: 'Status', width: 24 }, { header: 'Hinweis', width: 46 }]
    head(ws3)
    for (const r of detail.ropes) { const row = ws3.addRow([r.equipment, r.article_number || '', r.status, r.hint || '']); paint(row.getCell(3), r.ok) }
  }

  await saveWorkbook(wb, `Skipily_Import-Protokoll_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/**
 * Lädt die Vorlage (xlsx) mit DREI Blättern herunter. Alle Dropdowns
 * (Kategorie, Segeltyp, Material, Enden) liegen auf einem versteckten Blatt
 * „Listen" und werden per Range referenziert (kein 255-Zeichen-Limit,
 * kein Freitext-Chaos). Beispielzeilen inklusive.
 */
export async function downloadEquipmentTemplate() {
  const em = await import('exceljs')
  const ExcelJS = em.Workbook ? em : em.default

  const wb = new ExcelJS.Workbook()

  // ── verstecktes Listen-Blatt (Quellen für die Dropdowns) ──
  const lists = wb.addWorksheet('Listen')
  const catLabels = CATEGORY_LABELS
  const sailLabels = Object.values(SAIL_TYPE_LABELS)
  const matLabels = ROPE_MATERIALS.map(k => ROPE_MATERIAL_LABELS[k])
  const endLabels = ROPE_END_OPTIONS.map(k => ROPE_END_LABELS[k])
  const maxLen = Math.max(catLabels.length, sailLabels.length, matLabels.length, endLabels.length)
  for (let i = 0; i < maxLen; i++) {
    lists.getCell(`A${i + 1}`).value = catLabels[i] ?? null
    lists.getCell(`B${i + 1}`).value = sailLabels[i] ?? null
    lists.getCell(`C${i + 1}`).value = matLabels[i] ?? null
    lists.getCell(`D${i + 1}`).value = endLabels[i] ?? null
  }
  const range = (col, n) => `Listen!$${col}$1:$${col}$${n}`
  lists.state = 'veryHidden'

  const headStyle = (ws) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1D3A' } }
  }
  const addListValidation = (ws, colIndex, listFormula, title) => {
    const letter = ws.getColumn(colIndex).letter
    for (let r = 2; r <= 500; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [listFormula],
        showErrorMessage: true, errorStyle: 'error',
        errorTitle: title, error: 'Bitte einen Wert aus der Dropdown-Liste wählen.',
      }
    }
  }

  // ── Blatt 1: Ausrüstung ──
  const ws1 = wb.addWorksheet('Ausrüstung')
  ws1.columns = TEMPLATE_HEADERS.map(h => ({ header: h, key: h, width: Math.max(16, h.length + 2) }))
  headStyle(ws1)
  ws1.addRow({
    'Bezeichnung': 'Impeller Seewasserpumpe', 'Kategorie': 'Motor & Antrieb', 'Hersteller': 'Yanmar',
    'Modell': '3JH5E', 'Seriennummer': 'YM-12345', 'Teilenummer': '129470-42500', 'Maße': '—',
    'Einbauort': 'Motorraum', 'Einbaudatum': '15.04.2022', 'Garantie bis': '15.04.2024',
    'Wartungsintervall (Jahre)': 1, 'Letzte Wartung': '15.04.2025',
    'Beschreibung': 'Seewasser-Impeller, jährlicher Service', 'Notizen': 'Ersatz im Bordwerkzeug',
  })
  addListValidation(ws1, TEMPLATE_HEADERS.indexOf('Kategorie') + 1, range('A', catLabels.length), 'Ungültige Kategorie')

  // ── Blatt 2: Segelmessblatt ──
  const ws2 = wb.addWorksheet('Segelmessblatt')
  ws2.columns = SAIL_COLUMNS.map(([h]) => ({ header: h, key: h, width: Math.max(12, h.length + 2) }))
  headStyle(ws2)
  ws2.addRow({ 'Ausrüstung': 'Großsegel', 'Segeltyp': 'Großsegel', 'Segelnummer': 'GER 1234', 'Datum': '01.05.2025',
    'GS P (Vorliek)': 12.5, 'GS E (Unterliek)': 4.2, 'GS A (Achterliek)': 12.9, 'GS Farbe': 'weiß' })
  addListValidation(ws2, 2, range('B', sailLabels.length), 'Ungültiger Segeltyp') // Spalte „Segeltyp"

  // ── Blatt 3: Tauwerk ──
  const ws3 = wb.addWorksheet('Tauwerk')
  ws3.columns = ROPE_COLUMNS.map(([h]) => ({ header: h, key: h, width: Math.max(14, h.length + 2) }))
  headStyle(ws3)
  ws3.addRow({ 'Ausrüstung': 'Großschot', 'Artikelnummer': 'GS-14', 'Länge (m)': 30, 'Material': 'Kern-Mantel',
    'Durchmesser (mm)': 12, 'Ende 1': 'Augspleiß individuell (mit Schamfilschutz)', 'Ende 1 Auglänge (cm)': 15,
    'Ende 2': 'Takling', 'Notizen': 'Farbe blau/weiß' })
  const matCol = ROPE_COLUMNS.findIndex(([, f]) => f === 'material') + 1
  const end1Col = ROPE_COLUMNS.findIndex(([, f]) => f === 'end1') + 1
  const end2Col = ROPE_COLUMNS.findIndex(([, f]) => f === 'end2') + 1
  addListValidation(ws3, matCol, range('C', matLabels.length), 'Ungültiges Material')
  addListValidation(ws3, end1Col, range('D', endLabels.length), 'Ungültiges Ende')
  addListValidation(ws3, end2Col, range('D', endLabels.length), 'Ungültiges Ende')

  await saveWorkbook(wb, 'Skipily_Ausruestung_Vorlage.xlsx')
}
