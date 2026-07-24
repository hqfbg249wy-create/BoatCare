import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Package, Plus, Pencil, Trash2, X, Save, AlertTriangle, CheckCircle, Filter, ShoppingCart, MapPin, Bot, Mail, Sparkles, Link2, FileText } from 'lucide-react'
import RopeConfigFields, { emptyRope } from '../components/RopeConfigFields'
import { ROPE_EYE_ENDS } from '../lib/ropeOptions'
import { useT } from '../i18n'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildShopQuery, buildServiceQuery, buildAIQuestion, buildInquirySubject, buildInquiryMessage } from '../lib/equipmentSearch'
import { buildSparePartsParams } from '../lib/sparePartsSearch'
import SailMeasurementForm, { emptySailForm, sailFormToPayload } from '../components/SailMeasurementForm'

const categories = ['engine', 'electrical', 'navigation', 'safety', 'communication', 'rigging', 'sails', 'rope', 'hull', 'deck', 'anchor', 'other']
const categoryLabels = {
  engine: 'eqcat.engine', electrical: 'eqcat.electrical', navigation: 'eqcat.navigation',
  safety: 'eqcat.safety', communication: 'eqcat.communication', rigging: 'eqcat.rigging',
  sails: 'eqcat.sails', rope: 'eqcat.rope',
  hull: 'eqcat.hull', deck: 'eqcat.deck', anchor: 'eqcat.anchor', other: 'eqcat.other'
}

const emptyItem = { name: '', category: 'engine', manufacturer: '', model: '', serial_number: '', installation_date: '', warranty_expiry: '', maintenance_cycle_years: '', last_maintenance_date: '', notes: '', boat_id: '' }

export default function Equipment() {
  const { t, lang } = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [boats, setBoats] = useState([])

  // KI-Vorschläge (Ersatzteile pro Gerät ODER Ausrüstungsliste pro Boot)
  const [sug, setSug] = useState(null) // { mode:'spare'|'boat', boatId, boatName, focusName? }
  const [sugLoading, setSugLoading] = useState(false)
  const [sugList, setSugList] = useState([])
  const [sugError, setSugError] = useState(null)
  const [sugAdding, setSugAdding] = useState(() => new Set())
  const [sugAdded, setSugAdded] = useState(() => new Set())

  // Tauwerk-Konfiguration (im Equipment-Formular integriert, Kategorie Tauwerk)
  const [ropeForm, setRopeForm] = useState(emptyRope)
  // Vorselektion via URL: /equipment?boat=<uuid>
  const [selectedBoat, setSelectedBoat] = useState(searchParams.get('boat') || '')
  const [filterCat, setFilterCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyItem)
  const [saving, setSaving] = useState(false)
  const [sailForm, setSailForm] = useState(emptySailForm)
  const [photoFiles, setPhotoFiles] = useState([])       // neue Fotos (Upload beim Speichern)
  const [existingPhotos, setExistingPhotos] = useState([]) // bereits gespeicherte URLs (beim Bearbeiten)

  async function deleteExistingPhoto(url) {
    setExistingPhotos(prev => prev.filter(u => u !== url))
    if (editing && editing !== 'new') {
      await supabase.from('equipment_photos').delete().eq('equipment_id', editing).eq('photo_url', url)
    }
  }

  useEffect(() => { if (user) loadData() }, [user])

  // Chat-Button "Ausrüstungsliste anzeigen" → /equipment?suggest=1
  useEffect(() => {
    if (searchParams.get('suggest') && boats.length > 0 && !sug) {
      const boat = boats.find(b => b.id === selectedBoat) || boats[0]
      openBoatSuggestions(boat.id, boat.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boats])

  // --- KI-Vorschläge ---

  // Lädt volle Bootsdaten (für Kontext) — boats-State hat nur id+name.
  async function loadBoatRow(boatId) {
    const { data } = await supabase
      .from('boats')
      .select('boat_type, manufacturer, model, year, length_meters, engine')
      .eq('id', boatId).single()
    return data || {}
  }

  function openSpareParts(item) {
    const boatName = boats.find(b => b.id === item.boat_id)?.name || ''
    setSug({ mode: 'spare', boatId: item.boat_id, boatName, focusName: item.name, focus: item })
    fetchSuggestions({ boatId: item.boat_id, focus: item })
  }

  function openBoatSuggestions(boatId, boatName) {
    setSug({ mode: 'boat', boatId, boatName })
    fetchSuggestions({ boatId })
  }

  async function fetchSuggestions({ boatId, focus }) {
    setSugLoading(true); setSugError(null); setSugList([]); setSugAdded(new Set()); setSugAdding(new Set())
    try {
      const boatRow = await loadBoatRow(boatId)
      const existing = items.filter(i => i.boat_id === boatId).map(i => ({ name: i.name, category: i.category }))
      const body = {
        boat: {
          type: boatRow.boat_type || null,
          manufacturer: boatRow.manufacturer || null,
          model: boatRow.model || null,
          year: boatRow.year || null,
          length: boatRow.length_meters || null,
          engine: boatRow.engine || null,
        },
        existing_equipment: existing,
        lang,
        ...(focus ? { focus: { name: focus.name, category: focus.category, manufacturer: focus.manufacturer || null, model: focus.model || null } } : {}),
      }
      const { data, error } = await supabase.functions.invoke('suggest-equipment', { body })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSugList(Array.isArray(data?.suggestions) ? data.suggestions : [])
    } catch (err) {
      console.error('suggest-equipment:', err)
      setSugError(t('eq.sugError'))
    } finally {
      setSugLoading(false)
    }
  }

  function sugKey(s) { return `${s.name}|${s.category}` }

  async function acceptSuggestion(s) {
    if (!sug?.boatId) return
    const key = sugKey(s)
    setSugAdding(prev => new Set(prev).add(key))
    try {
      const cycle = Number.isInteger(s.maintenance_cycle_years) ? s.maintenance_cycle_years : null
      const today = new Date().toISOString().slice(0, 10)
      let next = null
      if (cycle) { const d = new Date(); d.setFullYear(d.getFullYear() + cycle); next = d.toISOString().slice(0, 10) }
      const payload = {
        boat_id: sug.boatId,
        name: s.name,
        category: categories.includes(s.category) ? s.category : 'other',
        manufacturer: s.manufacturer_hint || null,
        maintenance_cycle_years: cycle,
        notes: s.why || null,
        last_maintenance_date: cycle ? today : null,
        next_maintenance_date: next,
      }
      const { error } = await supabase.from('equipment').insert(payload)
      if (error) throw error
      setSugAdded(prev => new Set(prev).add(key))
      loadData()
    } catch (err) {
      console.error('accept suggestion:', err)
      alert(t('eq.sugAddError') + (err.message || ''))
    } finally {
      setSugAdding(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  function rejectSuggestion(s) {
    const key = sugKey(s)
    setSugList(prev => prev.filter(x => sugKey(x) !== key))
  }

  function closeSuggestions() {
    setSug(null); setSugList([]); setSugError(null)
  }

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
    setRopeForm(emptyRope)
    setPhotoFiles([]); setExistingPhotos([])
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
    setPhotoFiles([]); setExistingPhotos(item.photos || [])
    // Bei Segel-Equipment: existierendes Maßblatt mitladen
    if (item.category === 'sails') {
      const { data: sail } = await supabase.from('sail_measurements').select('*').eq('equipment_id', item.id).maybeSingle()
      setSailForm(sail ? { ...emptySailForm, ...sail } : emptySailForm)
    } else {
      setSailForm(emptySailForm)
    }
    // Bei Tauwerk: existierende Konfiguration mitladen
    if (item.category === 'rope') {
      const { data: rope } = await supabase.from('rope_configurations')
        .select('*').eq('equipment_id', item.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setRopeForm(rope ? {
        article_number: rope.article_number || '', length_m: rope.length_m ?? '',
        material: rope.material || '', diameter_mm: rope.diameter_mm ?? '',
        end1: rope.end1 || '', end1_eye_length_cm: rope.end1_eye_length_cm ?? '',
        end2: rope.end2 || '', end2_eye_length_cm: rope.end2_eye_length_cm ?? '',
        accessory_article_number: rope.accessory_article_number || '', notes: rope.notes || '',
      } : emptyRope)
    } else {
      setRopeForm(emptyRope)
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

      // Neue Fotos hochladen (Bucket user-photos) + in equipment_photos verknüpfen
      if (savedEquipmentId && photoFiles.length > 0) {
        const startOrder = existingPhotos.length
        for (let i = 0; i < photoFiles.length; i++) {
          const file = photoFiles[i]
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
          const path = `${user.id}/${savedEquipmentId}/${Date.now()}_${i}.${ext}`
          const { error: upErr } = await supabase.storage.from('user-photos')
            .upload(path, file, { upsert: true, contentType: file.type })
          if (upErr) throw upErr
          const { data: pub } = supabase.storage.from('user-photos').getPublicUrl(path)
          await supabase.from('equipment_photos').insert({
            equipment_id: savedEquipmentId, photo_url: pub.publicUrl, sort_order: startOrder + i,
          })
        }
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

      // Bei Tauwerk zusätzlich die Konfiguration speichern + Art am Equipment verankern
      if (form.category === 'rope' && savedEquipmentId) {
        const n = v => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null }
        const art = ropeForm.article_number.trim()
        let matchedId = null
        if (art) {
          const { data: prod } = await supabase.from('metashop_products')
            .select('id').or(`part_number.eq.${art},sku.eq.${art}`).limit(1).maybeSingle()
          matchedId = prod?.id || null
        }
        const ropePayload = {
          equipment_id: savedEquipmentId,
          article_number: art,
          matched_product_id: matchedId,
          length_m: n(ropeForm.length_m),
          material: ropeForm.material || '',
          diameter_mm: n(ropeForm.diameter_mm),
          end1: ropeForm.end1 || null,
          end1_eye_length_cm: ROPE_EYE_ENDS.has(ropeForm.end1) ? n(ropeForm.end1_eye_length_cm) : null,
          end2: ropeForm.end2 || null,
          end2_eye_length_cm: ROPE_EYE_ENDS.has(ropeForm.end2) ? n(ropeForm.end2_eye_length_cm) : null,
          accessory_article_number: ropeForm.accessory_article_number.trim(),
          notes: nullify(form.notes) || '',
          status: matchedId ? 'in_cart' : 'offer_requested',
        }
        const { data: existingRope } = await supabase.from('rope_configurations')
          .select('id').eq('equipment_id', savedEquipmentId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (existingRope) {
          await supabase.from('rope_configurations').update(ropePayload).eq('id', existingRope.id)
        } else {
          await supabase.from('rope_configurations').insert(ropePayload)
        }
        // Tauwerk-Art als Kategorie am Equipment verankern
        if (ropeForm.material) {
          await supabase.from('equipment').update({ rope_type: ropeForm.material }).eq('id', savedEquipmentId)
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
              {categories.map(c => <option key={c} value={c}>{t(categoryLabels[c])}</option>)}
            </select>
          </div>

          {editing && (
            <div className="modal-overlay" onClick={() => setEditing(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>{form.category === 'rope' ? t('rope.title') : (editing === 'new' ? 'Neues Geraet' : 'Geraet bearbeiten')}</h2>
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
                        {categories.map(c => <option key={c} value={c}>{t(categoryLabels[c])}</option>)}
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

                  {/* ─── Fotos (max. 5, Bucket user-photos) ──────── */}
                  <div className="form-group">
                    <label>{t('eq.photos')} <span className="form-label-hint">(max. 5)</span></label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {existingPhotos.map((url, i) => (
                        <div key={'ex' + i} style={{ position: 'relative', width: 64, height: 64 }}>
                          <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                          <button type="button" onClick={() => deleteExistingPhoto(url)} aria-label="remove"
                            style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                      {photoFiles.map((f, i) => (
                        <div key={'new' + i} style={{ position: 'relative', width: 64, height: 64 }}>
                          <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #93c5fd' }} />
                          <button type="button" onClick={() => setPhotoFiles(prev => prev.filter((_, j) => j !== i))} aria-label="remove"
                            style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                      {existingPhotos.length + photoFiles.length < 5 && (
                        <label style={{ width: 64, height: 64, borderRadius: 8, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                            onChange={e => {
                              const files = Array.from(e.target.files || [])
                              const room = 5 - existingPhotos.length - photoFiles.length
                              setPhotoFiles(prev => [...prev, ...files.slice(0, room)])
                              e.target.value = ''
                            }} />
                          <Plus size={20} />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* ─── Segel-Maßblatt (nur wenn category=sails) ──────── */}
                  {form.category === 'sails' && (
                    <SailMeasurementForm sailForm={sailForm} setSailForm={setSailForm} />
                  )}

                  {/* ─── Tauwerk-Konfiguration (nur wenn category=rope) ─── */}
                  {form.category === 'rope' && (
                    <RopeConfigFields rope={ropeForm} setRope={setRopeForm} />
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
                      <span className="eq-category">{categoryLabels[item.category] ? t(categoryLabels[item.category]) : item.category}</span>
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
                      <button className="eq-action-btn eq-action-spare" title={t('eq.spareTitle')}
                        onClick={() => openSpareParts(item)}>
                        <Sparkles size={13} /> {t('eq.spareBtn')}
                      </button>
                      {item.category === 'sails' && (
                        <button className="eq-action-btn eq-action-sail" title={t('eq.sailForm')}
                          onClick={() => startEdit(item)}>
                          <FileText size={13} /> {t('eq.sailFormBtn')}
                        </button>
                      )}
                      {item.category === 'rope' && (
                        <button className="eq-action-btn eq-action-rope" title={t('rope.title')}
                          onClick={() => startEdit(item)}>
                          <Link2 size={13} /> {t('rope.btn')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* KI-Vorschläge: Ersatzteile (spare) oder Ausrüstungsliste (boat) */}
      {sug && (
        <div className="modal-overlay" onClick={closeSuggestions}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2><Sparkles size={18} /> {sug.mode === 'spare' ? t('eq.spareTitle') : t('eq.sugBoatTitle')}</h2>
              <button className="btn-icon" onClick={closeSuggestions}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                {sug.mode === 'spare'
                  ? `${t('eq.spareIntro')} „${sug.focusName || ''}“`
                  : t('eq.sugBoatIntro')}
              </p>
              {sugLoading && <p style={{ color: '#64748b' }}>{t('eq.sugLoading')}</p>}
              {sugError && <p style={{ color: '#dc2626' }}>{sugError}</p>}
              {!sugLoading && !sugError && sugList.length === 0 && (
                <p style={{ color: '#64748b' }}>{t('eq.sugEmpty')}</p>
              )}
              {sugList.map(s => {
                const key = sugKey(s)
                const adding = sugAdding.has(key)
                const added = sugAdded.has(key)
                const catLabel = categoryLabels[s.category] ? t(categoryLabels[s.category]) : s.category
                return (
                  <div key={key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {catLabel}{s.maintenance_cycle_years ? ` · ${s.maintenance_cycle_years} ${t('eq.yearsShort')}` : ''}
                      </div>
                      {s.why && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.why}</div>}
                      {s.manufacturer_hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.manufacturer_hint}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {!added && (
                        <button className="btn-icon" onClick={() => rejectSuggestion(s)} disabled={adding}
                          title={t('eq.sugReject')} style={{ color: '#94a3b8' }}>
                          <X size={18} />
                        </button>
                      )}
                      <button className="btn-icon" onClick={() => acceptSuggestion(s)} disabled={adding || added}
                        title={t('eq.sugAccept')} style={{ color: added ? '#10b981' : '#ea580c' }}>
                        {added ? <CheckCircle size={18} /> : adding ? '…' : <Plus size={18} />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeSuggestions}>{t('eq.sugDone')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
