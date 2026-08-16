// Import-Dialog: Ausrüstung aus Excel/CSV hochladen (Desktop).
// Werft füllt die Vorlage aus -> Eigner lädt sie hoch -> Vorschau -> Import.

import { useState } from 'react'
import { X, Upload, Download, FileSpreadsheet, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { parseEquipmentFile, toEquipmentInsert, downloadEquipmentTemplate } from '../lib/equipmentImport'

const CAT_LABEL = {
  engine: 'Motor & Antrieb', electrical: 'Elektrik & Batterie', navigation: 'Navigation & Elektronik',
  safety: 'Sicherheit', communication: 'Kommunikation', rigging: 'Rigg & Takelage',
  hull: 'Rumpf & Unterwasser', deck: 'Deck & Beschläge', anchor: 'Anker & Kette', other: 'Sonstiges',
}

export default function EquipmentImportModal({ boats, defaultBoatId, onClose, onImported }) {
  const [boatId, setBoatId] = useState(defaultBoatId || (boats[0]?.id || ''))
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setFileName(file.name)
    try {
      const parsed = await parseEquipmentFile(file)
      if (parsed.length === 0) setError('Keine gültigen Zeilen gefunden (Spalte „Bezeichnung" nötig).')
      setRows(parsed)
    } catch (err) {
      console.error('Import-Parse:', err)
      setError('Datei konnte nicht gelesen werden. Bitte .xlsx oder .csv verwenden.')
      setRows([])
    }
  }

  async function doImport() {
    if (!boatId || rows.length === 0) return
    setBusy(true); setError('')
    try {
      const payload = rows.map(r => toEquipmentInsert(r, boatId))
      const { error: err } = await supabase.from('equipment').insert(payload)
      if (err) throw err
      onImported?.(rows.length)
      onClose()
    } catch (err) {
      console.error('Import:', err)
      setError('Import fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'))
    } finally {
      setBusy(false)
    }
  }

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
          Excel/CSV mit der Ausrüstungsliste hochladen — ideal für die Übernahme beim Bootskauf.
          Nutze am besten die Vorlage.
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

        {rows.length > 0 && (
          <div style={S.previewWrap}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{rows.length} Einträge erkannt:</div>
            <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['Bezeichnung', 'Kategorie', 'Hersteller', 'Modell', 'Letzte Wartung', 'Interv.'].map(h =>
                      <th key={h} style={S.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={S.td}>{r.name}</td>
                      <td style={S.td}>{CAT_LABEL[r.category] || r.category}</td>
                      <td style={S.td}>{r.manufacturer || '—'}</td>
                      <td style={S.td}>{r.model || '—'}</td>
                      <td style={S.td}>{r.last_maintenance_date || '—'}</td>
                      <td style={S.td}>{r.maintenance_cycle_years ? `${r.maintenance_cycle_years} J` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p style={{ color: '#dc2626', fontSize: 14 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button style={S.ghost} onClick={onClose}>Abbrechen</button>
          <button style={{ ...S.primary, opacity: (!boatId || rows.length === 0 || busy) ? 0.5 : 1 }}
                  onClick={doImport} disabled={!boatId || rows.length === 0 || busy}>
            <Check size={16} /> {busy ? 'Importiere…' : `${rows.length || ''} importieren`}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 22, width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  x: { background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' },
  hint: { color: '#64748b', fontSize: 14, marginTop: 0 },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#0B1D3A' },
  ghost: { padding: '9px 16px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 14 },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: '#f97316', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 4 },
  select: { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 14 },
  previewWrap: { marginBottom: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '7px 10px', background: '#f1f5f9', position: 'sticky', top: 0, fontSize: 12 },
  td: { padding: '6px 10px', borderTop: '1px solid #eef2f7' },
}
