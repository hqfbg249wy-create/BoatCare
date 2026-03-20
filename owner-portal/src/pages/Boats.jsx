import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Ship, Plus, Pencil, Trash2, X, Save, Ruler, Gauge, MapPin, Hash } from 'lucide-react'

const emptyBoat = { name: '', boat_type: '', manufacturer: '', model: '', year: '', length_meters: '', width: '', draft: '', engine: '', home_port: '', registration_number: '', hin: '' }

const boatTypes = ['Segelboot', 'Motorboot', 'Katamaran', 'Schlauchboot', 'Yacht', 'Jolle', 'Trimaran', 'Hausboot']

export default function Boats() {
  const { user } = useAuth()
  const [boats, setBoats] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyBoat)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) loadBoats() }, [user])

  async function loadBoats() {
    setLoading(true)
    const { data } = await supabase.from('boats').select('*').eq('owner_id', user.id).order('created_at')
    setBoats(data || [])
    setLoading(false)
  }

  function startEdit(boat) {
    setForm({
      name: boat.name || '', boat_type: boat.boat_type || '', manufacturer: boat.manufacturer || '',
      model: boat.model || '', year: boat.year || '', length_meters: boat.length_meters || '',
      width: boat.width || '', draft: boat.draft || '', engine: boat.engine || '',
      home_port: boat.home_port || '', registration_number: boat.registration_number || '', hin: boat.hin || ''
    })
    setEditing(boat.id)
  }

  function startNew() {
    setForm(emptyBoat)
    setEditing('new')
  }

  async function saveBoat(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, owner_id: user.id }
    if (payload.year) payload.year = parseInt(payload.year) || null
    if (payload.length_meters) payload.length_meters = parseFloat(payload.length_meters) || null
    if (payload.width) payload.width = parseFloat(payload.width) || null
    if (payload.draft) payload.draft = parseFloat(payload.draft) || null

    try {
      if (editing === 'new') {
        await supabase.from('boats').insert(payload)
      } else {
        await supabase.from('boats').update(payload).eq('id', editing)
      }
      setEditing(null)
      await loadBoats()
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
    setSaving(false)
  }

  async function deleteBoat(id) {
    if (!confirm('Boot wirklich loeschen? Alle zugehoerigen Geraete werden ebenfalls geloescht.')) return
    await supabase.from('boats').delete().eq('id', id)
    await loadBoats()
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Meine Boote</h1><p className="subtitle">{boats.length} Boot{boats.length !== 1 ? 'e' : ''} registriert</p></div>
        <button className="btn-primary" onClick={startNew}><Plus size={16} /> Boot hinzufuegen</button>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing === 'new' ? 'Neues Boot' : 'Boot bearbeiten'}</h2>
              <button className="btn-icon" onClick={() => setEditing(null)}><X size={20} /></button>
            </div>
            <form onSubmit={saveBoat} className="modal-body">
              <div className="form-row">
                <div className="form-group"><label>Bootsname *</label>
                  <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="z.B. SY Horizont" /></div>
                <div className="form-group"><label>Bootstyp</label>
                  <select value={form.boat_type} onChange={e => setForm({...form, boat_type: e.target.value})}>
                    <option value="">Bitte waehlen</option>
                    {boatTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Hersteller</label>
                  <input value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} placeholder="z.B. Bavaria" /></div>
                <div className="form-group"><label>Modell</label>
                  <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="z.B. Cruiser 40" /></div>
                <div className="form-group"><label>Baujahr</label>
                  <input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})} placeholder="2020" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Laenge (m)</label>
                  <input type="number" step="0.01" value={form.length_meters} onChange={e => setForm({...form, length_meters: e.target.value})} /></div>
                <div className="form-group"><label>Breite (m)</label>
                  <input type="number" step="0.01" value={form.width} onChange={e => setForm({...form, width: e.target.value})} /></div>
                <div className="form-group"><label>Tiefgang (m)</label>
                  <input type="number" step="0.01" value={form.draft} onChange={e => setForm({...form, draft: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Motor</label>
                <input value={form.engine} onChange={e => setForm({...form, engine: e.target.value})} placeholder="z.B. Yanmar 3YM30, 29 PS Diesel" /></div>
              <h3 className="form-section">Registrierung</h3>
              <div className="form-row">
                <div className="form-group"><label>Heimathafen</label>
                  <input value={form.home_port} onChange={e => setForm({...form, home_port: e.target.value})} placeholder="z.B. Kiel" /></div>
                <div className="form-group"><label>Kennzeichen</label>
                  <input value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value})} /></div>
                <div className="form-group"><label>HIN</label>
                  <input value={form.hin} onChange={e => setForm({...form, hin: e.target.value})} placeholder="Hull Identification Number" /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Abbrechen</button>
                <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Speichern...' : 'Speichern'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {boats.length === 0 ? (
        <div className="empty-state">
          <Ship size={64} color="#cbd5e1" />
          <h2>Noch kein Boot registriert</h2>
          <p>Fuegen Sie Ihr erstes Boot hinzu, um Ausruestung und Wartung zu verwalten.</p>
          <button className="btn-primary" onClick={startNew}><Plus size={16} /> Boot hinzufuegen</button>
        </div>
      ) : (
        <div className="boat-grid">
          {boats.map(boat => (
            <div key={boat.id} className="boat-card">
              <div className="boat-card-header">
                <div className="boat-icon-circle"><Ship size={24} /></div>
                <div>
                  <h3>{boat.name}</h3>
                  <span className="boat-type">{boat.boat_type || 'Boot'}</span>
                </div>
                <div className="boat-actions">
                  <button className="btn-icon" onClick={() => startEdit(boat)}><Pencil size={16} /></button>
                  <button className="btn-icon btn-danger" onClick={() => deleteBoat(boat.id)}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="boat-details">
                {boat.manufacturer && <div className="boat-detail"><span className="detail-label">Hersteller</span><span>{boat.manufacturer} {boat.model}</span></div>}
                {boat.year && <div className="boat-detail"><span className="detail-label">Baujahr</span><span>{boat.year}</span></div>}
                {boat.length_meters && <div className="boat-detail"><Ruler size={14} /><span>{boat.length_meters}m x {boat.width || '?'}m</span></div>}
                {boat.engine && <div className="boat-detail"><Gauge size={14} /><span>{boat.engine}</span></div>}
                {boat.home_port && <div className="boat-detail"><MapPin size={14} /><span>{boat.home_port}</span></div>}
                {boat.registration_number && <div className="boat-detail"><Hash size={14} /><span>{boat.registration_number}</span></div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
