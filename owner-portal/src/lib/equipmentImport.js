// Ausrüstungs-Import aus Excel/CSV (SheetJS, dynamisch geladen).
// Zielgruppe: Werften geben dem Käufer eine ausgefüllte Vorlage; der Eigner
// lädt sie im Portal hoch. Spaltenüberschriften werden case-insensitiv auf die
// equipment-Felder gemappt (deutsche UND englische Varianten).

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
// (lower-case matchen sie in CAT_MAP zurück auf die Enum-Keys.)
export const CATEGORY_LABELS = [
  'Motor & Antrieb', 'Elektrik & Batterie', 'Navigation & Elektronik',
  'Sicherheit', 'Kommunikation', 'Rigg & Takelage', 'Rumpf & Unterwasser',
  'Deck & Beschläge', 'Anker & Kette', 'Sonstiges',
]

function toISODate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  // dd.mm.yyyy
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (de) return `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d) ? null : d.toISOString().slice(0, 10)
}

function headerToField(header) {
  const h = String(header || '').trim().toLowerCase()
  for (const [field, variants] of Object.entries(FIELD_HEADERS)) {
    if (variants.includes(h)) return field
  }
  return null
}

/** Liest xlsx/csv und liefert normalisierte Zeilen (nur mit Name). */
export async function parseEquipmentFile(file) {
  const xm = await import('xlsx')
  const XLSX = xm.read ? xm : xm.default   // robuste Interop-Auflösung
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const out = []
  for (const raw of rows) {
    const item = {}
    for (const [key, val] of Object.entries(raw)) {
      const field = headerToField(key)
      if (field) item[field] = val
    }
    const name = String(item.name || '').trim()
    if (!name) continue // Leerzeilen / Kopf ohne Namen überspringen

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

/** Baut das DB-Insert-Objekt (mit boat_id) aus einer geparsten Zeile. */
export function toEquipmentInsert(row, boatId) {
  const p = { ...row, boat_id: boatId }
  // next_maintenance_date ableiten, falls Intervall + letzte Wartung da sind.
  if (p.maintenance_cycle_years && p.last_maintenance_date) {
    const d = new Date(p.last_maintenance_date)
    d.setFullYear(d.getFullYear() + p.maintenance_cycle_years)
    p.next_maintenance_date = d.toISOString().slice(0, 10)
  }
  return p
}

/** Lädt eine Vorlage (xlsx) herunter — mit Kategorie-DROPDOWN (Datenvalidierung),
 *  damit keine freien/falschen Kategorien entstehen. Beispielzeile inklusive. */
export async function downloadEquipmentTemplate() {
  const em = await import('exceljs')
  const ExcelJS = em.Workbook ? em : em.default   // robuste Interop-Auflösung

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Ausrüstung')
  ws.columns = TEMPLATE_HEADERS.map(h => ({ header: h, key: h, width: Math.max(16, h.length + 2) }))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1D3A' } }

  ws.addRow({
    'Bezeichnung': 'Impeller Seewasserpumpe',
    'Kategorie': 'Motor & Antrieb',
    'Hersteller': 'Yanmar',
    'Modell': '3JH5E',
    'Seriennummer': 'YM-12345',
    'Teilenummer': '129470-42500',
    'Maße': '—',
    'Einbauort': 'Motorraum',
    'Einbaudatum': '15.04.2022',
    'Garantie bis': '15.04.2024',
    'Wartungsintervall (Jahre)': 1,
    'Letzte Wartung': '15.04.2025',
    'Beschreibung': 'Seewasser-Impeller, jährlicher Service',
    'Notizen': 'Ersatz im Bordwerkzeug',
  })

  // Kategorie-Dropdown für Zeilen 2..500 (App-Kategorien).
  const catCol = TEMPLATE_HEADERS.indexOf('Kategorie') + 1
  const letter = ws.getColumn(catCol).letter
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: [`"${CATEGORY_LABELS.join(',')}"`],
      showErrorMessage: true, errorStyle: 'error',
      errorTitle: 'Ungültige Kategorie',
      error: 'Bitte eine Kategorie aus der Dropdown-Liste wählen.',
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'Skipily_Ausruestung_Vorlage.xlsx'
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
