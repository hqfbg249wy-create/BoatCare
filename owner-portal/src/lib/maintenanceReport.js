// Erzeugt einen Wartungsreport als PDF (Download): alle Ausrüstungsgegenstände
// je Boot mit letzter/nächster Wartung, Intervall, Status und dem kompletten
// Wartungsverlauf (Migration 121: maintenance_history).

import { supabase } from './supabase'
// jsPDF + autotable werden erst beim Klick geladen (dynamic import), damit sie
// nicht das Haupt-Bundle aufblähen.

const CAT = {
  engine: 'Motor & Antrieb', electrical: 'Elektrik & Batterie', navigation: 'Navigation & Elektronik',
  safety: 'Sicherheit', communication: 'Kommunikation', rigging: 'Rigg & Takelage',
  hull: 'Rumpf & Unterwasser', deck: 'Deck & Beschläge', anchor: 'Anker & Kette', other: 'Sonstiges',
}
// Reihenfolge der Kategorien (für die Sortierung im Report).
export const CAT_ORDER = ['engine','electrical','navigation','safety','communication','rigging','hull','deck','anchor','other']
const catRank = (c) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? 999 : i }

const fmt = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—')

function statusText(nextDue) {
  if (!nextDue) return '—'
  const days = Math.ceil((new Date(nextDue) - new Date()) / 86400000)
  if (days < 0) return `Überfällig (${Math.abs(days)} T)`
  if (days <= 30) return `Bald fällig (${days} T)`
  return 'OK'
}

export async function generateMaintenanceReport(userId) {
  // Robuste Interop-Auflösung (ESM/CJS unterscheidet sich je nach Bundler):
  const [jspdfMod, atMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const jsPDF = [jspdfMod.jsPDF, jspdfMod.default?.jsPDF, jspdfMod.default].find(x => typeof x === 'function')
  const autoTable = [atMod.default, atMod.default?.default, atMod.autoTable].find(x => typeof x === 'function')

  const { data: boats } = await supabase
    .from('boats').select('id, name, manufacturer, model')
    .eq('owner_id', userId).order('name')

  const boatIds = (boats || []).map(b => b.id)
  const { data: equip } = boatIds.length
    ? await supabase.from('equipment').select('*').in('boat_id', boatIds).order('name')
    : { data: [] }

  const equipIds = (equip || []).map(e => e.id)
  const { data: history } = equipIds.length
    ? await supabase.from('maintenance_history')
        .select('equipment_id, performed_on').in('equipment_id', equipIds)
        .order('performed_on', { ascending: false })
    : { data: [] }

  // Verlauf je Gerät
  const histByEq = {}
  for (const h of (history || [])) {
    (histByEq[h.equipment_id] ||= []).push(fmt(h.performed_on))
  }

  const doc = new jsPDF()
  const now = new Date().toLocaleDateString('de-DE')

  doc.setFontSize(18); doc.setTextColor(11, 29, 58)
  doc.text('Wartungsreport', 14, 20)
  doc.setFontSize(10); doc.setTextColor(100)
  doc.text(`Erstellt am ${now} · Skipily`, 14, 27)

  let y = 36
  for (const boat of (boats || [])) {
    const items = (equip || [])
      .filter(e => e.boat_id === boat.id)
      .sort((a, b) => catRank(a.category) - catRank(b.category)
                   || (a.name || '').localeCompare(b.name || '', 'de'))
    const sub = [boat.manufacturer, boat.model].filter(Boolean).join(' ')

    doc.setFontSize(13); doc.setTextColor(11, 29, 58)
    doc.text(`${boat.name}${sub ? ` — ${sub}` : ''}`, 14, y)
    y += 3

    if (items.length === 0) {
      doc.setFontSize(9); doc.setTextColor(120)
      doc.text('Keine Ausrüstung erfasst.', 14, y + 6)
      y += 14
      continue
    }

    autoTable(doc, {
      startY: y + 3,
      head: [['Bezeichnung', 'Hersteller / Modell', 'Kategorie', 'Letzte', 'Nächste', 'Interv.', 'Status', 'Verlauf']],
      body: items.map(e => [
        e.name || '—',
        [e.manufacturer, e.model].filter(Boolean).join(' ') || '—',
        CAT[e.category] || e.category || '—',
        fmt(e.last_maintenance_date),
        fmt(e.next_maintenance_date),
        e.maintenance_cycle_years ? `${e.maintenance_cycle_years} J` : '—',
        statusText(e.next_maintenance_date),
        (histByEq[e.id] || []).join('\n') || '—',
      ]),
      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [11, 29, 58], textColor: 255, fontSize: 7.5 },
      columnStyles: { 7: { cellWidth: 34 } },
      margin: { left: 14, right: 14 },
      didDrawPage: (d) => { y = d.cursor.y },
    })
    y = (doc.lastAutoTable?.finalY || y) + 12
    if (y > 260) { doc.addPage(); y = 20 }
  }

  if (!boats || boats.length === 0) {
    doc.setFontSize(11); doc.setTextColor(120)
    doc.text('Keine Boote erfasst.', 14, y)
  }

  doc.save(`Skipily_Wartungsreport_${new Date().toISOString().slice(0, 10)}.pdf`)
}
