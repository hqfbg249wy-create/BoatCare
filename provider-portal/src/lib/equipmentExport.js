// Exportiert Produkte/Bestellpositionen als Excel im Format, das der
// Skipily-App-Ausrüstungsimport direkt einlesen kann (Blatt "Ausrüstung",
// deutsche Spaltenüberschriften, die der App-Parser erkennt).
//
// Der Kunde kann die Datei ohne Umbau in seinem App-Account hochladen; bei
// Nachbestellungen wird per Name/Hersteller/Artikelnummer gematcht und
// aktualisiert bzw. der Bestand ergänzt (siehe import-equipment-xlsx).
import * as XLSX from 'xlsx'

// rows: [{ name, manufacturer, part_number, quantity, category? }]
export function exportEquipmentXlsx(rows, filename = 'skipily-ausruestung.xlsx') {
  const data = (rows || [])
    .filter(r => (r?.name || '').trim())
    .map(r => ({
      'Bezeichnung': r.name || '',
      'Hersteller': r.manufacturer || '',
      'Artikelnummer': r.part_number || '',
      'Menge': r.quantity != null && r.quantity !== '' ? r.quantity : 1,
      'Kategorie': r.category || '',
    }))

  const ws = XLSX.utils.json_to_sheet(data, {
    header: ['Bezeichnung', 'Hersteller', 'Artikelnummer', 'Menge', 'Kategorie'],
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ausrüstung')
  XLSX.writeFile(wb, filename)
}

// Bequemer Namen-Baustein für Dateinamen (nur sichere Zeichen).
export function safeFilePart(s) {
  return String(s || '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export'
}
