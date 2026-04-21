import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Package, Plus, Pencil, Trash2, X, Save, AlertTriangle, CheckCircle, Filter, ShoppingCart, MapPin, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { buildShopQuery, buildServiceQuery, buildAIQuestion } from '../lib/equipmentSearch'

const categories = ['engine', 'electrical', 'navigation', 'safety', 'communication', 'rigging', 'hull', 'deck', 'anchor', 'other']
const categoryLabels = {
  engine: 'Motor & Antrieb', electrical: 'Elektrik & Batterie', navigation: 'Navigation & Elektronik',
  safety: 'Sicherheit', communication: 'Kommunikation', rigging: 'Rigg & Takelage',
  hull: 'Rumpf & Unterwasser', deck: 'Deck & Beschlaege', anchor: 'Anker & Kette', other: 'Sonstiges'
}


const emptyItem = { name: '', category: 'engine', manufacturer: '', model: '', serial_number: '', installation_date: '', warranty_expiry: '', maintenance_cycle_years: '', last_maintenance_date: '', notes: '', boat_id: '' }

export default function Equipment() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [boats, setBoats] = useState([])
  const [selectedBoat, setSelectedBoat] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyItem)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) loadData() }, [user])

  async function loadData() {
    setLoading(true)
    // Load boats first (owner_id)
    const { data: b } = await supabase.from('boats').select('id, name').eq('owner_id', user.id).order('name')
    setBoats(b || [])

    // Load equipment for all user's boats
    const boatIds = (b || []).map(boat => boat.id)
    let eq = []
    if (boatIds.length > 0) {
      const { data } = await supabase.from('equipment').select('*').in('boat_id', boatIds).order('category, name')
      eq = data || []
    }
    setItems(eq)
    setLoading(false)
  }

  const filtered = items.filter(i => {
    if (selectedBoat && i.boat_id !== selectedBoat) return false
    if (filterCat && i.category !== filterCat) return false
    return true
  })

  function maintenanceStatus(item) {
    if (!item.next_maintenance_date) return null
    const d = new Date(item.next_maintenance_date)
    const days = Math.ceil((d - new Date()) / 86400000)
    if (days < 0) return { label: `${Math.abs(days)} Tage ueberfaellig`, cls: 'overdue' }
    if (days <= 30) return { label: `In ${days} Tagen`, cls: 'due_soon' }
    return { label: `In ${days} Tagen`, cls: 'ok' }
  }

  const boatName = (id) => boats.find(b => b.id === id)?.name || ''

  function startNew() { setForm({ ...emptyItem, boat_id: selectedBoat || (boats[0]?.id || '') }); setEditing('new') }
  function startEdit(item) {
    setForm({
      name: item.name || '', category: item.category || 'other', manufacturer: item.manufacturer || '',
      model: item.model || '', serial_number: item.serial_number || '',
      installation_date: item.installation_date || '', warranty_expiry: item.warranty_expiry || '',
      maintenance_cycle_years: item.maintenance_cycle_years || '',
      last_maintenance_date: item.last_maintenance_date || '', notes: item.notes || '',
      boat_id: item.boat_id || ''
    })
    setEditing(item.id)
  }

  async function saveItem(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form }
    if (payload.maintenance_cycle_years) payload.maintenance_cycle_years = parseInt(payload.maintenance_cycle_years) || null
    if (!payload.boat_id) { alert('Bitte ein Boot waehlen'); setSaving(false); return }

    // Compute next_maintenance_date
    if (payload.last_maintenance_date && payload.maintenance_cycle_years) {
      const d = new Date(payload.last_maintenance_date)
      d.setFullYear(d.getFullYear() + (payload.maintenance_cycle_years || 1))
      payload.next_maintenance_date = d.toISOString().slice(0, 10)
    }

    try {
      if (editing === 'new') {
        await supabase.from('equipment').insert(payload)
      } else {
        await supabase.from('equipment').update(payload).eq('id', editing)
      }
      setEditing(null)
      await loadData()
    } catch (err) { alert('Fehler: ' + err.message) }
    setSaving(false)
  }

  async function deleteItem(id) {
    if (!confirm('Geraet wirklich loeschen?')) return
    await supabase.from('equipment').delete().eq('id', id)
    await loadData()
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Ausruestung</h1><p className="subtitle">{items.length} Geraete erfasst</p></div>
        {boats.length > 0 && <button className="btn-primary" onClick={startNew}><Plus size={16} /> Geraet hinzufuegen</button>}
      </div>

      {boats.length === 0 ? (
        <div className="empty-state">
          <Package size={64} color="#cbd5e1" />
          <h2>Bitte zuerst ein Boot anlegen</h2>
          <p>Geraete werden einem Boot zugeordnet.</p>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <Filter size={16} />
            <select value={selectedBoat} onChange={e => setSelectedBoat(e.target.value)}>
              <option value="">Alle Boote</option>
              {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {categories.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}
            </select>
          </div>

          {editing && (
            <div className="modal-overlay" onClick={() => setEditing(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>{editing === 'new' ? 'Neues Geraet' : 'Geraet bearbeiten'}</h2>
                  <button className="btn-icon" onClick={() => setEditing(null)}><X size={20} /></button>
                </div>
                <form onSubmit={saveItem} className="modal-body">
                  <div className="form-row">
                    <div className="form-group"><label>Bezeichnung *</label>
                      <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="z.B. Yanmar 3YM30" /></div>
                    <div className="form-group"><label>Kategorie</label>
                      <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                        {categories.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                      </select></div>
                    <div className="form-group"><label>Boot *</label>
                      <select required value={form.boat_id} onChange={e => setForm({...form, boat_id: e.target.value})}>
                        <option value="">Bitte waehlen</option>
                        {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Hersteller</label>
                      <input value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} /></div>
                    <div className="form-group"><label>Modell</label>
                      <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} /></div>
                    <div className="form-group"><label>Seriennummer</label>
                      <input value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Eingebaut am</label>
                      <input type="date" value={form.installation_date} onChange={e => setForm({...form, installation_date: e.target.value})} /></div>
                    <div className="form-group"><label>Garantie bis</label>
                      <input type="date" value={form.warranty_expiry} onChange={e => setForm({...form, warranty_expiry: e.target.value})} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Wartungsintervall (Jahre)</label>
                      <input type="number" value={form.maintenance_cycle_years} onChange={e => setForm({...form, maintenance_cycle_years: e.target.value})} placeholder="z.B. 1" /></div>
                    <div className="form-group"><label>Letzte Wartung</label>
                      <input type="date" value={form.last_maintenance_date} onChange={e => setForm({...form, last_maintenance_date: e.target.value})} /></div>
                  </div>
                  <div className="form-group"><label>Notizen</label>
                    <textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
                  <div className="modal-footer">
                    <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Abbrechen</button>
                    <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Speichern...' : 'Speichern'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="empty-state">
              <Package size={64} color="#cbd5e1" />
              <h2>Keine Geraete gefunden</h2>
              <p>Erfassen Sie Ihre Bordausruestung fuer eine einfache Wartungsuebersicht.</p>
            </div>
          ) : (
            <div className="equipment-grid">
              {filtered.map(item => {
                const ms = maintenanceStatus(item)
                return (
                  <div key={item.id} className={`equipment-card ${ms?.cls || ''}`}>
                    <div className="eq-header">
                      <span className="eq-category">{categoryLabels[item.category] || item.category}</span>
                      <div className="eq-actions">
                        <button className="btn-icon" onClick={() => startEdit(item)}><Pencil size={14} /></button>
                        <button className="btn-icon btn-danger" onClick={() => deleteItem(item.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <h3 className="eq-name">{item.name}</h3>
                    <p className="eq-detail">{item.manufacturer} {item.model}</p>
                    {item.serial_number && <p className="eq-serial">SN: {item.serial_number}</p>}
                    <p className="eq-boat-label">{boatName(item.boat_id)}</p>
                    {ms && (
                      <div className={`eq-maint-badge ${ms.cls}`}>
                        {ms.cls === 'overdue' || ms.cls === 'due_soon' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                        <span>{ms.label}</span>
                      </div>
                    )}
                    <div className="eq-quick-actions">
                      <button className="eq-action-btn eq-action-shop" title="Passende Artikel im Shop suchen"
                        onClick={() => navigate(`/shop?q=${encodeURIComponent(buildShopQuery(item))}`)}>
                        <ShoppingCart size={13} /> Shop
                      </button>
                      <button className="eq-action-btn eq-action-service" title="Passenden Service in der Nähe finden"
                        onClick={() => navigate(`/services?search=${encodeURIComponent(buildServiceQuery(item))}`)}>
                        <MapPin size={13} /> Service
                      </button>
                      <button className="eq-action-btn eq-action-ai" title="KI zu diesem Gerät fragen"
                        onClick={() => navigate(`/chat?question=${encodeURIComponent(buildAIQuestion(item, boatName(item.boat_id)))}`)}>
                        <Bot size={13} /> KI fragen
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
