import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Package, Plus, Pencil, Trash2, X, Save, AlertTriangle, CheckCircle, Filter, ShoppingCart, MapPin, Bot, Mail } from 'lucide-react'
import { useT } from '../i18n'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildShopQuery, buildServiceQuery, buildAIQuestion, buildInquirySubject, buildInquiryMessage } from '../lib/equipmentSearch'
import { buildSparePartsParams } from '../lib/sparePartsSearch'
import SailMeasurementForm, { emptySailForm, sailFormToPayload } from '../components/SailMeasurementForm'

const categories = ['engine', 'electrical', 'navigation', 'safety', 'communication', 'rigging', 'sails', 'hull', 'deck', 'anchor', 'other']
const categoryLabels = {
  engine: 'Motor & Antrieb', electrical: 'Elektrik & Batterie', navigation: 'Navigation & Elektronik',
  safety: 'Sicherheit', communication: 'Kommunikation', rigging: 'Rigg & Takelage',
  sails: 'Segel & Tuch',
  hull: 'Rumpf & Unterwasser', deck: 'Deck & Beschlaege', anchor: 'Anker & Kette', other: 'Sonstiges'
}

const emptyItem = { name: '', category: 'engine', manufacturer: '', model: '', serial_number: '', installation_date: '', warranty_expiry: '', maintenance_cycle_years: '', last_maintenance_date: '', notes: '', boat_id: '' }

export default function Equipment() {
  const { t } = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [boats, setBoats] = useState([])
  // Vorselektion via URL: /equipment?boat=<uuid>
  const [selectedBoat, setSelectedBoat] = useState(searchParams.get('boat') || '')
  const [filterCat, setFilterCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyItem)
  const [saving, setSaving] = useState(false)
  const [sailForm, setSailForm] = useState(emptySailForm)

  useEffect(() => { if (user) loadData() }, [user])

  async function loadData() {
    setLoading(true)
    // Load boats first (owner_id)
    const { data: b } = await supabase.from('boats').select('id, name').eq('owner_id', user.id).order('name')
    setBoats(b || [])

    // Load equipment for all user's boats — inkl. der Fotos aus
    // equipment_photos (max 5 pro Item, iOS-Schema).
    const boatIds = (b || []).map(boat => boat.id)
    let eq = []
    if (boatIds.length > 0) {
      const [{ data: equipData }, { data: photoData }] = await Promise.all([
        supabase.from('equipment').select('*').in('boat_id', boatIds).order('category, name'),
        supabase.from('equipment_photos').select('equipment_id, photo_url, sort_order')
          .order('sort_order', { ascending: true }),
      ])
      const photosByEq = {}
      for (const ph of (photoData || [])) {
        if (!photosByEq[ph.equipment_id]) photosByEq[ph.equipment_id] = []
        photosByEq[ph.equipment_id].push(ph.photo_url)
      }
      // Legacy: comma-separated photo_url-Spalte → als Fallback verwenden
      eq = (equipData || []).map(item => {
        const fromTable = photosByEq[item.id] || []
        const legacy = (item.photo_url || '')
          .split(',').map(s => s.trim()).filter(Boolean)
        return { ...item, photos: fromTable.length > 0 ? fromTable : legacy }
      })
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

  function startNew() {
    // Kategorie aus dem aktiven Filter übernehmen, damit man nicht
    // doppelt klicken muss (Filter setzt → "+ Neu" → wieder dropdown).
    setForm({
      ...emptyItem,
      boat_id: selectedBoat || (boats[0]?.id || ''),
      category: filterCat || emptyItem.category,
    })
    setSailForm(emptySailForm)
    setEditing('new')
  }
  async function startEdit(item) {
    setForm({
      name: item.name || '', category: item.category || 'other', manufacturer: item.manufacturer || '',
      model: item.model || '', serial_number: item.serial_number || '',
      installation_date: item.installation_date || '', warranty_expiry: item.warranty_expiry || '',
      maintenance_cycle_years: item.maintenance_cycle_years || '',
      last_maintenance_date: item.last_maintenance_date || '', notes: item.notes || '',
      boat_id: item.boat_id || ''
    })
    // Bei Segel-Equipment: existierendes Maßblatt mitladen
    if (item.category === 'sails') {
      const { data: sail } = await supabase.from('sail_measurements').select('*').eq('equipment_id', item.id).maybeSingle()
      setSailForm(sail ? { ...emptySailForm, ...sail } : emptySailForm)
    } else {
      setSailForm(emptySailForm)
    }
    setEditing(item.id)
  }

  async function saveItem(e) {
    e.preventDefault()
    setSaving(true)

    // Leere Strings → null für optionale Felder (DB akzeptiert kein '' bei date/int)
    const nullify = v => (v === '' || v === undefined) ? null : v
    const payload = {
      name:                     form.name.trim(),
      category:                 form.category,
      boat_id:                  form.boat_id,
      manufacturer:             nullify(form.manufacturer),
      model:                    nullify(form.model),
      serial_number:            nullify(form.serial_number),
      installation_date:        nullify(form.installation_date),
      warranty_expiry:          nullify(form.warranty_expiry),
      maintenance_cycle_years:  form.maintenance_cycle_years ? parseInt(form.maintenance_cycle_years) || null : null,
      last_maintenance_date:    nullify(form.last_maintenance_date),
      notes:                    nullify(form.notes),
    }

    if (!payload.boat_id) { alert(t('eq.k31')); setSaving(false); return }

    // Nächsten Wartungstermin berechnen
    if (payload.last_maintenance_date && payload.maintenance_cycle_years) {
      const d = new Date(payload.last_maintenance_date)
      d.setFullYear(d.getFullYear() + payload.maintenance_cycle_years)
      payload.next_maintenance_date = d.toISOString().slice(0, 10)
    } else {
      payload.next_maintenance_date = null
    }

    try {
      let savedEquipmentId = editing === 'new' ? null : editing
      if (editing === 'new') {
        const { data: saved, error } = await supabase.from('equipment').insert(payload).select('id').single()
        if (error) throw error
        savedEquipmentId = saved.id
      } else {
        const { error } = await supabase.from('equipment').update(payload).eq('id', editing)
        if (error) throw error
      }

      // Bei Segeln zusätzlich das Maßblatt speichern
      if (form.category === 'sails' && savedEquipmentId) {
        const sailPayload = sailFormToPayload(sailForm, savedEquipmentId)
        // Existiert bereits? → UPDATE, sonst INSERT
        const { data: existing } = await supabase
          .from('sail_measurements')
          .select('id')
          .eq('equipment_id', savedEquipmentId)
          .maybeSingle()
        if (existing) {
          const { error: sErr } = await supabase.from('sail_measurements').update(sailPayload).eq('id', existing.id)
          if (sErr) throw sErr
        } else {
          const { error: sErr } = await supabase.from('sail_measurements').insert(sailPayload)
          if (sErr) throw sErr
        }
      }

      setEditing(null)
      await loadData()
    } catch (err) {
      console.error('Equipment speichern Fehler:', err)
      alert('Fehler beim Speichern: ' + (err.message || JSON.stringify(err)))
    }
    setSaving(false)
  }

  async function deleteItem(id) {
    if (!confirm(t('eq.k32'))) return
    const { error } = await supabase.from('equipment').delete().eq('id', id)
    if (error) { alert('Fehler beim Löschen: ' + error.message); return }
    await loadData()
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>{t('eq.k0')}</h1><p className="subtitle">{items.length} Geraete erfasst</p></div>
        {boats.length > 0 && <button className="btn-primary" onClick={startNew}><Plus size={16} /> {t('eq.k1')}</button>}
      </div>

      {boats.length === 0 ? (
        <div className="empty-state">
          <Package size={64} color="#cbd5e1" />
          <h2>{t('eq.k2')}</h2>
          <p>{t('eq.k3')}</p>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <Filter size={16} />
            <select value={selectedBoat} onChange={e => setSelectedBoat(e.target.value)}>
              <option value="">{t('eq.k4')}</option>
              {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">{t('eq.k5')}</option>
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
                  {editing === 'new' && (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px', marginBottom: 14,
                      background: 'rgba(251, 146, 60, 0.08)',
                      border: '1px solid rgba(251, 146, 60, 0.25)',
                      borderRadius: 10,
                    }}>
                      <span style={{ fontSize: 16, lineHeight: 1.2 }}>💡</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', lineHeight: 1.4 }}>
                        {t('eq.k6')}
                      </span>
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group"><label>{t('eq.k7')}</label>
                      <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={t('eq.k26')} /></div>
                    <div className="form-group"><label>{t('eq.k8')}</label>
                      <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                        {categories.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                      </select></div>
                    <div className="form-group"><label>{t('eq.k9')}</label>
                      <select required value={form.boat_id} onChange={e => setForm({...form, boat_id: e.target.value})}>
                        <option value="">{t('eq.k10')}</option>
                        {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>{t('eq.k11')}</label>
                      <input value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} /></div>
                    <div className="form-group"><label>{t('eq.k12')}</label>
                      <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} /></div>
                    <div className="form-group"><label>{t('eq.k13')}</label>
                      <input value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>{t('eq.k14')}</label>
                      <input type="date" value={form.installation_date} onChange={e => setForm({...form, installation_date: e.target.value})} /></div>
                    <div className="form-group"><label>{t('eq.k15')}</label>
                      <input type="date" value={form.warranty_expiry} onChange={e => setForm({...form, warranty_expiry: e.target.value})} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>{t('eq.k16')}</label>
                      <input type="number" value={form.maintenance_cycle_years} onChange={e => setForm({...form, maintenance_cycle_years: e.target.value})} placeholder="z.B. 1" /></div>
                    <div className="form-group"><label>{t('eq.k17')}</label>
                      <input type="date" value={form.last_maintenance_date} onChange={e => setForm({...form, last_maintenance_date: e.target.value})} /></div>
                  </div>
                  <div className="form-group"><label>{t('eq.k18')}</label>
                    <textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>

                  {/* ─── Segel-Maßblatt (nur wenn category=sails) ──────── */}
                  {form.category === 'sails' && (
                    <SailMeasurementForm sailForm={sailForm} setSailForm={setSailForm} />
                  )}

                  <div className="modal-footer">
                    <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('eq.k19')}</button>
                    <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Speichern...' : 'Speichern'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="empty-state">
              <Package size={64} color="#cbd5e1" />
              <h2>{t('eq.k20')}</h2>
              <p>{t('eq.k21')}</p>
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
                    {/* Foto-Thumbnails — bis zu 5 aus equipment_photos */}
                    {item.photos && item.photos.length > 0 && (
                      <div className="eq-photo-strip">
                        {item.photos.slice(0, 5).map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt=""
                            className="eq-photo-thumb"
                            onError={e => { e.currentTarget.style.display = 'none' }}
                          />
                        ))}
                      </div>
                    )}
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
                      <button className="eq-action-btn eq-action-shop" title={t('eq.k27')}
                        onClick={() => navigate(`/shop?${buildSparePartsParams(item)}`)}>
                        <ShoppingCart size={13} /> {t('eq.k22')}
                      </button>
                      <button className="eq-action-btn eq-action-service" title={t('eq.k28')}
                        onClick={() => navigate(`/services?search=${encodeURIComponent(buildServiceQuery(item))}`)}>
                        <MapPin size={13} /> {t('eq.k23')}
                      </button>
                      <button className="eq-action-btn eq-action-inquiry" title={t('eq.k29')}
                        onClick={() => {
                          // Inquiry-Kontext in sessionStorage, damit ProviderDetail die Anfrage vorausfüllt.
                          sessionStorage.setItem('pending_inquiry', JSON.stringify({
                            subject: buildInquirySubject(item),
                            message: buildInquiryMessage(item, boatName(item.boat_id)),
                            boat_id: item.boat_id,
                            equipment_id: item.id,
                          }))
                          navigate(`/services?inquiry=1&search=${encodeURIComponent(buildServiceQuery(item))}`)
                        }}>
                        <Mail size={13} /> {t('eq.k24')}
                      </button>
                      <button className="eq-action-btn eq-action-ai" title={t('eq.k30')}
                        onClick={() => navigate(`/chat?question=${encodeURIComponent(buildAIQuestion(item, boatName(item.boat_id)))}`)}>
                        <Bot size={13} /> {t('eq.k25')}
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
