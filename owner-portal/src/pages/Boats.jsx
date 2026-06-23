import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Ship, Plus, Pencil, Trash2, X, Save, Ruler, Gauge, MapPin, Hash, Package, Wrench, Bot } from 'lucide-react'
import { useT } from '../i18n'

const emptyBoat = { name: '', boat_type: '', manufacturer: '', model: '', year: '', length_meters: '', width: '', draft: '', engine: '', home_port: '', registration_number: '', hin: '' }

// value = gespeicherter Wert (bleibt Deutsch, damit Bestandsdaten passen),
// key   = Übersetzungs-Key für die Anzeige
const boatTypes = [
  { value: 'Segelboot',    key: 'boats.type.sail' },
  { value: 'Motorboot',    key: 'boats.type.motor' },
  { value: 'Katamaran',    key: 'boats.type.catamaran' },
  { value: 'Schlauchboot', key: 'boats.type.inflatable' },
  { value: 'Yacht',        key: 'boats.type.yacht' },
  { value: 'Jolle',        key: 'boats.type.dinghy' },
  { value: 'Trimaran',     key: 'boats.type.trimaran' },
  { value: 'Hausboot',     key: 'boats.type.houseboat' },
]

export default function Boats() {
  const { user } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [boats, setBoats] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyBoat)
  const [saving, setSaving] = useState(false)

  // Gespeicherten (deutschen) Bootstyp für die Anzeige übersetzen.
  const boatTypeLabel = (value) => {
    const m = boatTypes.find(b => b.value === value)
    return m ? t(m.key) : (value || t('boats.fallbackType'))
  }

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
      alert(t('common.errorPrefix') + ' ' + err.message)
    }
    setSaving(false)
  }

  async function deleteBoat(id) {
    if (!confirm(t('boats.deleteConfirm'))) return
    await supabase.from('boats').delete().eq('id', id)
    await loadBoats()
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('nav.boats')}</h1>
          <p className="subtitle">{t(boats.length === 1 ? 'boats.countSingular' : 'boats.countPlural', { n: boats.length })}</p>
        </div>
        <button className="btn-primary" onClick={startNew}><Plus size={16} /> {t('boats.add')}</button>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing === 'new' ? t('boats.new') : t('boats.edit')}</h2>
              <button className="btn-icon" onClick={() => setEditing(null)}><X size={20} /></button>
            </div>
            <form onSubmit={saveBoat} className="modal-body">
              <div className="form-row">
                <div className="form-group"><label>{t('boats.name')} *</label>
                  <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={t('boats.namePlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.type')}</label>
                  <select value={form.boat_type} onChange={e => setForm({...form, boat_type: e.target.value})}>
                    <option value="">{t('boats.pleaseSelect')}</option>
                    {boatTypes.map(bt => <option key={bt.value} value={bt.value}>{t(bt.key)}</option>)}
                  </select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>{t('boats.manufacturer')}</label>
                  <input value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} placeholder={t('boats.manufacturerPlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.model')}</label>
                  <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder={t('boats.modelPlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.year')}</label>
                  <input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})} placeholder="2020" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>{t('boats.length')}</label>
                  <input type="number" step="0.01" value={form.length_meters} onChange={e => setForm({...form, length_meters: e.target.value})} /></div>
                <div className="form-group"><label>{t('boats.width')}</label>
                  <input type="number" step="0.01" value={form.width} onChange={e => setForm({...form, width: e.target.value})} /></div>
                <div className="form-group"><label>{t('boats.draft')}</label>
                  <input type="number" step="0.01" value={form.draft} onChange={e => setForm({...form, draft: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>{t('boats.engine')}</label>
                <input value={form.engine} onChange={e => setForm({...form, engine: e.target.value})} placeholder={t('boats.enginePlaceholder')} /></div>
              <h3 className="form-section">{t('boats.registration')}</h3>
              <div className="form-row">
                <div className="form-group"><label>{t('boats.homePort')}</label>
                  <input value={form.home_port} onChange={e => setForm({...form, home_port: e.target.value})} placeholder={t('boats.homePortPlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.regNumber')}</label>
                  <input value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value})} /></div>
                <div className="form-group"><label>HIN</label>
                  <input value={form.hin} onChange={e => setForm({...form, hin: e.target.value})} placeholder={t('boats.hinPlaceholder')} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {boats.length === 0 ? (
        <div className="empty-state">
          <Ship size={64} color="#cbd5e1" />
          <h2>{t('boats.emptyTitle')}</h2>
          <p>{t('boats.emptyHint')}</p>
          <button className="btn-primary" onClick={startNew}><Plus size={16} /> {t('boats.add')}</button>
        </div>
      ) : (
        <div className="boat-grid">
          {boats.map(boat => (
            <div key={boat.id} className="boat-card">
              {/* Boot-Foto, falls vorhanden */}
              {boat.image_url && (
                <img
                  src={boat.image_url}
                  alt={boat.name}
                  className="boat-card-photo"
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div className="boat-card-header">
                <div className="boat-icon-circle"><Ship size={24} /></div>
                <div>
                  <h3>{boat.name}</h3>
                  <span className="boat-type">{boatTypeLabel(boat.boat_type)}</span>
                </div>
                <div className="boat-actions">
                  <button className="btn-icon" onClick={() => startEdit(boat)}><Pencil size={16} /></button>
                  <button className="btn-icon btn-danger" onClick={() => deleteBoat(boat.id)}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="boat-details">
                {boat.manufacturer && <div className="boat-detail"><span className="detail-label">{t('boats.manufacturer')}</span><span>{boat.manufacturer} {boat.model}</span></div>}
                {boat.year && <div className="boat-detail"><span className="detail-label">{t('boats.year')}</span><span>{boat.year}</span></div>}
                {boat.length_meters && <div className="boat-detail"><Ruler size={14} /><span>{boat.length_meters}m x {boat.width || '?'}m</span></div>}
                {boat.engine && <div className="boat-detail"><Gauge size={14} /><span>{boat.engine}</span></div>}
                {boat.home_port && <div className="boat-detail"><MapPin size={14} /><span>{boat.home_port}</span></div>}
                {boat.registration_number && <div className="boat-detail"><Hash size={14} /><span>{boat.registration_number}</span></div>}
              </div>
              {/* iOS-Style Quick Actions */}
              <div className="boat-quick-actions">
                <button className="boat-action-btn" onClick={() => navigate(`/equipment?boat=${boat.id}`)}>
                  <Package size={16} /><span>{t('nav.equipment')}</span>
                </button>
                <button className="boat-action-btn" onClick={() => navigate(`/maintenance?boat=${boat.id}`)}>
                  <Wrench size={16} /><span>{t('nav.maintenance')}</span>
                </button>
                <button className="boat-action-btn" onClick={() => navigate(`/chat?boat=${boat.id}`)}>
                  <Bot size={16} /><span>{t('maint.askAi')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
