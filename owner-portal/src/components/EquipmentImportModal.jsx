// Import-Dialog: Ausrüstung + Segelmessblatt + Tauwerk aus EINER Excel-Datei
// hochladen (Desktop). Werft füllt die Vorlage aus -> Eigner lädt sie hoch ->
// Vorschau (mit Duplikat-Erkennung) -> Import.
//
// Duplikat-Schutz: bereits vorhandene Ausrüstung (gleiche Seriennummer, sonst
// gleicher Name je Boot) wird NICHT neu angelegt — sonst würde die daran
// hängende Wartungshistorie verwaisen. Vorhandene Geräte werden übersprungen,
// ihre ID aber für die Verknüpfung von Segel-/Tauwerk-Daten weiterverwendet.

import { useEffect, useState } from 'react'
import { X, Upload, Download, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  parseWorkbook, toEquipmentInsert, toSailInsert, toRopeInsert,
  downloadEquipmentTemplate, normKey,
} from '../lib/equipmentImport'

const CAT_LABEL = {
  engine: 'Motor & Antrieb', electrical: 'Elektrik & Batterie', navigation: 'Navigation & Elektronik',
  safety: 'Sicherheit', communication: 'Kommunikation', rigging: 'Rigg & Takelage',
  hull: 'Rumpf & Unterwasser', deck: 'Deck & Beschläge', anchor: 'Anker & Kette', other: 'Sonstiges',
}

export default function EquipmentImportModal({ boats, defaultBoatId, onClose, onImported }) {
  const [boatId, setBoatId] = useState(defaultBoatId || (boats[0]?.id || ''))
  const [rows, setRows] = useState([])       // equipment
  const [sails, setSails] = useState([])
  const [ropes, setRopes] = useState([])
  const [existing, setExisting] = useState([]) // vorhandene Ausrüstung des Boots
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Vorhandene Ausrüstung des gewählten Boots laden (für Duplikat-Erkennung).
  useEffect(() => {
    if (!boatId) { setExisting([]); return }
    let cancel = false
    supabase.from('equipment').select('id, name, serial_number').eq('boat_id', boatId)
      .then(({ data }) => { if (!cancel) setExisting(data || []) })
    return () => { cancel = true }
  }, [boatId])

  const existBySerial = new Map(existing.filter(e => e.serial_number).map(e => [normKey(e.serial_number), e]))
  const existByName = new Map(existing.map(e => [normKey(e.name), e]))
  const isDup = (r) => (r.serial_number && existBySerial.has(normKey(r.serial_number))) || existByName.has(normKey(r.name))

  const dupCount = rows.filter(isDup).length
  const newCount = rows.length - dupCount

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setFileName(file.name)
    try {
      const { equipment, sails: s, ropes: rp } = await parseWorkbook(file)
      if (equipment.length === 0 && s.length === 0 && rp.length === 0) {
        setError('Keine gültigen Zeilen gefunden. Bitte die Vorlage verwenden (Blatt „Ausrüstung" mit Spalte „Bezeichnung").')
      }
      setRows(equipment); setSails(s); setRopes(rp)
    } catch (err) {
      console.error('Import-Parse:', err)
      setError('Datei konnte nicht gelesen werden. Bitte .xlsx oder .csv verwenden.')
      setRows([]); setSails([]); setRopes([])
    }
  }

  async function doImport() {
    if (!boatId || (rows.length === 0 && sails.length === 0 && ropes.length === 0)) return
    setBusy(true); setError('')
    try {
      // 1) Nur NEUE Ausrüstung anlegen (Duplikate überspringen -> Historie schützen).
      const toInsert = rows.filter(r => !isDup(r))
      if (toInsert.length > 0) {
        const payload = toInsert.map(r => toEquipmentInsert(r, boatId))
        const { error: err } = await supabase.from('equipment').insert(payload)
        if (err) throw err
      }

      // 2) Name -> equipment_id für ALLE Geräte des Boots (vorhandene + neue).
      let nameToId = new Map()
      if (sails.length > 0 || ropes.length > 0) {
        const { data: all, error: eErr } = await supabase
          .from('equipment').select('id, name').eq('boat_id', boatId)
        if (eErr) throw eErr
        nameToId = new Map((all || []).map(e => [normKey(e.name), e.id]))
      }

      // 3) Segelmessblätter verknüpfen & einfügen.
      let sailSkipped = 0
      const sailPayload = []
      for (const s of sails) {
        const id = nameToId.get(normKey(s._equipment))
        if (!id) { sailSkipped++; continue }
        sailPayload.push(toSailInsert(s, id))
      }
      if (sailPayload.length > 0) {
        const { error: sErr } = await supabase.from('sail_measurements').insert(sailPayload)
        if (sErr) throw sErr
      }

      // 4) Tauwerk verknüpfen & einfügen.
      let ropeSkipped = 0
      const ropePayload = []
      for (const r of ropes) {
        const id = nameToId.get(normKey(r._equipment))
        if (!id) { ropeSkipped++; continue }
        ropePayload.push(toRopeInsert(r, id))
      }
      if (ropePayload.length > 0) {
        const { error: rErr } = await supabase.from('rope_configurations').insert(ropePayload)
        if (rErr) throw rErr
      }

      onImported?.({
        equipment: toInsert.length, skippedEquipment: rows.length - toInsert.length,
        sails: sailPayload.length, ropes: ropePayload.length,
        unlinked: sailSkipped + ropeSkipped,
      })
      onClose()
    } catch (err) {
      console.error('Import:', err)
      setError('Import fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'))
    } finally {
      setBusy(false)
    }
  }

  const total = rows.length + sails.length + ropes.length

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={20} /> Ausrüstung importieren
          </h2>
          <button style={S.x} onClick={onClose}><X size={20} /></button>
        </div>

        <p style={S.hint}>
          Eine Excel-Datei mit den Blättern <b>Ausrüstung</b>, <b>Segelmessblatt</b> und <b>Tauwerk</b> hochladen —
          ideal für die Übernahme beim Bootskauf. Nutze am besten die Vorlage.
          Bereits vorhandene Ausrüstung wird erkannt und <b>nicht doppelt angelegt</b>.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <button style={S.secondary} onClick={() => downloadEquipmentTemplate()}>
            <Download size={16} /> Vorlage (.xlsx)
          </button>
          <label style={S.secondary}>
            <Upload size={16} /> Datei wählen (.xlsx / .csv)
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
          {fileName && <span style={{ alignSelf: 'center', color: '#64748b', fontSize: 13 }}>{fileName}</span>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Boot</label>
          <select value={boatId} onChange={e => setBoatId(e.target.value)} style={S.select}>
            {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {total > 0 && (
          <div style={S.previewWrap}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={S.pill}>{newCount} Ausrüstung neu</span>
              {dupCount > 0 && <span style={{ ...S.pill, background: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}>
                <AlertTriangle size={12} /> {dupCount} bereits vorhanden (übersprungen)
              </span>}
              {sails.length > 0 && <span style={S.pill}>{sails.length} Segelmessblatt</span>}
              {ropes.length > 0 && <span style={S.pill}>{ropes.length} Tauwerk</span>}
            </div>

            {rows.length > 0 && (
              <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['', 'Bezeichnung', 'Kategorie', 'Hersteller', 'Modell', 'Seriennr.', 'Garantie bis', 'Interv.'].map((h, i) =>
                        <th key={i} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const dup = isDup(r)
                      return (
                        <tr key={i} style={dup ? { background: '#fffbeb', color: '#92400e' } : undefined}>
                          <td style={S.td}>{dup ? <AlertTriangle size={13} color="#f59e0b" /> : <Check size={13} color="#10b981" />}</td>
                          <td style={S.td}>{r.name}</td>
                          <td style={S.td}>{CAT_LABEL[r.category] || r.category}</td>
                          <td style={S.td}>{r.manufacturer || '—'}</td>
                          <td style={S.td}>{r.model || '—'}</td>
                          <td style={S.td}>{r.serial_number || '—'}</td>
                          <td style={S.td}>{r.warranty_expiry || '—'}</td>
                          <td style={S.td}>{r.maintenance_cycle_years ? `${r.maintenance_cycle_years} J` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
              Segel- und Tauwerk-Daten werden über die Spalte „Ausrüstung" mit dem Gerät verknüpft
              (Name muss zu einem Ausrüstungs-Eintrag passen).
            </p>
          </div>
        )}

        {error && <p style={{ color: '#dc2626', fontSize: 14 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button style={S.ghost} onClick={onClose}>Abbrechen</button>
          <button style={{ ...S.primary, opacity: (!boatId || total === 0 || busy) ? 0.5 : 1 }}
                  onClick={doImport} disabled={!boatId || total === 0 || busy}>
            <Check size={16} /> {busy ? 'Importiere…' : 'Importieren'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 22, width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  x: { background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' },
  hint: { color: '#64748b', fontSize: 14, marginTop: 0 },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#0B1D3A' },
  ghost: { padding: '9px 16px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 14 },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: '#f97316', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 4 },
  select: { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 14 },
  previewWrap: { marginBottom: 8 },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontSize: 12, fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '7px 10px', background: '#f1f5f9', position: 'sticky', top: 0, fontSize: 12 },
  td: { padding: '6px 10px', borderTop: '1px solid #eef2f7' },
}
