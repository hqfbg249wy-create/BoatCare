import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, ensureSession } from '../lib/supabase'
import { Camera, Package, Plus, Pencil, Trash2, X, Save, AlertTriangle, CheckCircle, Filter, ShoppingCart, MapPin, Bot, Mail, Sparkles, Link2, FileText, FileSpreadsheet } from 'lucide-react'
import EquipmentImportModal from '../components/EquipmentImportModal'
import RopeConfigFields, { emptyRope } from '../components/RopeConfigFields'
import { ROPE_EYE_ENDS } from '../lib/ropeOptions'
import { useT } from '../i18n'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildShopQuery, buildServiceQuery, buildAIQuestion } from '../lib/equipmentSearch'
import Lightbox from '../components/Lightbox'
import { buildSparePartsParams } from '../lib/sparePartsSearch'
import SailMeasurementForm, { emptySailForm, sailFormToPayload } from '../components/SailMeasurementForm'
import ServiceQuoteModal from '../components/ServiceQuoteModal'
import { useHasPlus } from '../hooks/useHasPlus'
import { useEquipmentCatalog } from '../lib/equipmentCategories'
import { fuzzyMatch } from '../lib/fuzzySearch'
import { Search } from 'lucide-react'
import { useFeatureGate } from '../hooks/useFeatureGate'
import { upgradeMessageFromInvoke } from '../lib/featureGate'

const emptyItem = { name: '', category: 'engine', manufacturer: '', model: '', serial_number: '', part_number: '', location_on_boat: '', dimensions: '', item_description: '', quantity: 1, installation_date: '', warranty_expiry: '', maintenance_cycle_years: '', last_maintenance_date: '', notes: '', boat_id: '' }

export default function Equipment() {
  const { t, lang } = useT()
  // Kategorien serverseitig (DB) mit Offline-Fallback/Cache; Resolver fuer Label/Farbe.
  const { keys: categories, colorOf, labelOf } = useEquipmentCatalog(lang)
  const { user } = useAuth()
  const navigate = useNavigate()
  const { hasPlus } = useHasPlus()
  const { gate, showUpgrade, gateModal } = useFeatureGate()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [boats, setBoats] = useState([])
  const [lightboxUrl, setLightboxUrl] = useState(null)   // Foto im Vollbild (Pinch-Zoom)

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
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [quoteItem, setQuoteItem] = useState(null) // Ausrüstung für die Angebotsanfrage
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyItem)
  const [saving, setSaving] = useState(false)
  const [sailForm, setSailForm] = useState(emptySailForm)
  const [photoFiles, setPhotoFiles] = useState([])       // neue Fotos (Upload beim Speichern)
  const [existingPhotos, setExistingPhotos] = useState([]) // bereits gespeicherte URLs (beim Bearbeiten)

  // Foto-KI-Analyse (Vorschlag, dann bestaetigen)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [aiSelected, setAiSelected] = useState({})
  const [aiError, setAiError] = useState(null)

  async function deleteExistingPhoto(url) {
    setExistingPhotos(prev => prev.filter(u => u !== url))
    if (editing && editing !== 'new') {
      await supabase.from('equipment_photos').delete().eq('equipment_id', editing).eq('photo_url', url)
    }
  }

  // --- Foto-KI-Analyse ---
  function fileToBase64(file) {
    return new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] || '')
      r.onerror = () => resolve('')
      r.readAsDataURL(file)
    })
  }
  async function urlToBase64(url) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return await new Promise((resolve) => {
        const r = new FileReader()
        r.onload = () => resolve({ b64: String(r.result).split(',')[1] || '', type: blob.type || 'image/jpeg' })
        r.onerror = () => resolve(null)
        r.readAsDataURL(blob)
      })
    } catch { return null }
  }
  async function analyzePhotos() {
    setAiError(null); setAiSuggestion(null); setAiSelected({})
    // Paywall: Ausrüstung per Foto erfassen ab Skipily Basic (Meldung aus der DB)
    if (!(await gate('equipment_photo'))) return
    setAiBusy(true)
    try {
      if (!(await ensureSession())) { setAiError(t('eq.sessionExpired')); return }
      const images = []
      for (const f of photoFiles) {
        if (images.length >= 5) break
        const b64 = await fileToBase64(f)
        if (b64) images.push({ image_base64: b64, media_type: f.type || 'image/jpeg' })
      }
      for (const url of existingPhotos) {
        if (images.length >= 5) break
        const r = await urlToBase64(url)
        if (r?.b64) images.push({ image_base64: r.b64, media_type: r.type })
      }
      if (images.length === 0) { setAiError(t('eq.aiError')); return }
      const { data, error } = await supabase.functions.invoke('analyze-equipment-photo', {
        body: { images, lang, userLocale: navigator.language || lang },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const f = data?.fields
      const hasAny = f && (f.name || f.manufacturer || f.model || f.serial_number || f.part_number || f.item_description)
      if (!hasAny) { setAiError(t('eq.aiNone')); return }
      setAiSuggestion(f)
      // Vorbelegen: Felder anhaken, deren Formularwert leer ist.
      setAiSelected({
        name: !!f.name && !form.name,
        manufacturer: !!f.manufacturer && !form.manufacturer,
        model: !!f.model && !form.model,
        serial_number: !!f.serial_number && !form.serial_number,
        item_description: !!f.item_description && !form.notes,
        category: !!f.category && categories.includes(f.category),
      })
    } catch (err) {
      console.error('analyze-equipment-photo:', err)
      const upgrade = await upgradeMessageFromInvoke(err)
      if (upgrade) showUpgrade(upgrade, 'basic')
      else setAiError(t('eq.aiError'))
    } finally {
      setAiBusy(false)
    }
  }
  function applyAiSuggestion() {
    const f = aiSuggestion
    if (!f) return
    setForm(prev => ({
      ...prev,
      ...(aiSelected.name ? { name: f.name } : {}),
      ...(aiSelected.manufacturer ? { manufacturer: f.manufacturer } : {}),
      ...(aiSelected.model ? { model: f.model } : {}),
      ...(aiSelected.serial_number ? { serial_number: f.serial_number } : {}),
      ...(aiSelected.item_description ? { notes: f.item_description } : {}),
      ...(aiSelected.category && categories.includes(f.category) ? { category: f.category } : {}),
    }))
    setAiSuggestion(null); setAiSelected({}); setAiError(null)
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
    if (searchQ.trim()) {
      const hay = [
        i.name, i.manufacturer, i.model, i.serial_number, i.part_number,
        i.notes, labelOf(i.category, t),
      ].filter(Boolean).join(' ')
      if (!fuzzyMatch(hay, searchQ)) return false
    }
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
    setAiSuggestion(null); setAiSelected({}); setAiError(null)
    setEditing('new')
  }
  async function startEdit(item) {
    setForm({
      name: item.name || '', category: item.category || 'other', manufacturer: item.manufacturer || '',
      model: item.model || '', serial_number: item.serial_number || '',
      part_number: item.part_number || '', location_on_boat: item.location_on_boat || '',
      dimensions: item.dimensions || '', item_description: item.item_description || '',
      quantity: item.quantity || 1,
      installation_date: item.installation_date || '', warranty_expiry: item.warranty_expiry || '',
      maintenance_cycle_years: item.maintenance_cycle_years || '',
      last_maintenance_date: item.last_maintenance_date || '', notes: item.notes || '',
      boat_id: item.boat_id || ''
    })
    setPhotoFiles([]); setExistingPhotos(item.photos || [])
    setAiSuggestion(null); setAiSelected({}); setAiError(null)
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
        material: rope.material || '', diameter_mm: rope.diameter_mm ?? '', color: rope.color || '',
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

    // Session sicherstellen (ggf. auffrischen); sonst klare Meldung statt RLS-Fehler.
    if (!(await ensureSession())) { alert(t('eq.sessionExpired')); setSaving(false); return }

    // Leere Strings → null für optionale Felder (DB akzeptiert kein '' bei date/int)
    const nullify = v => (v === '' || v === undefined) ? null : v
    const payload = {
      name:                     form.name.trim(),
      category:                 form.category,
      boat_id:                  form.boat_id,
      manufacturer:             nullify(form.manufacturer),
      model:                    nullify(form.model),
      serial_number:            nullify(form.serial_number),
      part_number:              nullify(form.part_number),
      location_on_boat:         nullify(form.location_on_boat),
      dimensions:               nullify(form.dimensions),
      item_description:         nullify(form.item_description),
      quantity:                 Math.max(1, parseInt(form.quantity) || 1),
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
          // WICHTIG: erster Ordner MUSS "equipment" sein (Storage-RLS-Policy des
          // Buckets user-photos; identisch zur iOS-App). Sonst "new row violates RLS".
          const path = `equipment/${payload.boat_id}/${savedEquipmentId}_${Date.now()}_${i}.${ext}`
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
          color: ropeForm.color || '',
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
        // Tauwerk-Art als Kategorie + Maße (für die Ersatzteilsuche-Kopfzeile)
        // ans Equipment übernehmen. Länge in m, Stärke in mm (Ø).
        const dimParts = []
        const L = n(ropeForm.length_m); if (L != null) dimParts.push(`${L} m`)
        const D = n(ropeForm.diameter_mm); if (D != null) dimParts.push(`Ø ${D} mm`)
        const ropeDims = dimParts.join(' · ')
        const eqUpdate = {}
        if (ropeForm.material) eqUpdate.rope_type = ropeForm.material
        if (ropeDims) eqUpdate.dimensions = ropeDims
        if (Object.keys(eqUpdate).length) {
          await supabase.from('equipment').update(eqUpdate).eq('id', savedEquipmentId)
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

  // Nach Kategorie gruppiert; innerhalb nach naechster Wartung (soonest zuerst,
  // ohne Datum ans Ende); Gruppenreihenfolge nach frueheste­r Wartung je Gruppe
  // (dringendste Kategorie oben). Siehe iOS fuer dieselbe Logik.
  const grouped = (() => {
    const nd = (i) => i.next_maintenance_date ? new Date(i.next_maintenance_date).getTime() : null
    const map = new Map()
    for (const it of filtered) {
      const key = (it.category || 'other').toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(it)
    }
    const groups = [...map.entries()].map(([key, arr]) => {
      arr.sort((a, b) => {
        const da = nd(a), db = nd(b)
        if (da == null && db == null) return (a.name || '').localeCompare(b.name || '')
        if (da == null) return 1
        if (db == null) return -1
        return da - db
      })
      const earliest = arr.reduce((m, x) => {
        const d = nd(x); return d == null ? m : (m == null ? d : Math.min(m, d))
      }, null)
      return { key, items: arr, earliest }
    })
    groups.sort((g1, g2) => {
      if (g1.earliest == null && g2.earliest == null) return g1.key.localeCompare(g2.key)
      if (g1.earliest == null) return 1
      if (g2.earliest == null) return -1
      return g1.earliest - g2.earliest
    })
    return groups
  })()

  function renderCard(item) {
    const ms = maintenanceStatus(item)
    return (
      <div key={item.id} className={`equipment-card ${ms?.cls || ''}`}>
        <div className="eq-header">
          <span className="eq-category">{labelOf(item.category, t)}</span>
          <div className="eq-actions">
            <button className="btn-icon" onClick={() => startEdit(item)}><Pencil size={14} /></button>
            <button className="btn-icon btn-danger" onClick={() => deleteItem(item.id)}><Trash2 size={14} /></button>
          </div>
        </div>
        {/* Erstes Foto als Thumbnail (weitere im Bearbeiten-Dialog) */}
        {item.photos && item.photos.length > 0 && (
          <div className="eq-photo-strip">
            <img
              src={item.photos[0]}
              alt=""
              className="eq-photo-thumb"
              style={{ cursor: 'zoom-in' }}
              onClick={() => setLightboxUrl(item.photos[0])}
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
            {item.photos.length > 1 && <span className="eq-photo-more">+{item.photos.length - 1}</span>}
          </div>
        )}
        <h3 className="eq-name">{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</h3>
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
            onClick={() => setQuoteItem({ ...item, _boatName: boatName(item.boat_id) })}>
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
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      {gateModal}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      <div className="page-header">
        <div><h1>{t('eq.k0')}</h1><p className="subtitle">{items.length} Geraete erfasst</p></div>
        {boats.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={async () => { if (hasPlus || await gate('excel_import')) setShowImport(true) }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={16} /> Import (Excel/CSV)
              {!hasPlus && <span style={{ fontSize: 11, fontWeight: 700, background: '#f97316', color: '#fff', padding: '2px 7px', borderRadius: 999 }}>Plus</span>}
            </button>
            <button className="btn-primary" onClick={startNew}><Plus size={16} /> {t('eq.k1')}</button>
          </div>
        )}
      </div>

      {showImport && (
        <EquipmentImportModal
          boats={boats}
          defaultBoatId={selectedBoat}
          onClose={() => setShowImport(false)}
          onImported={() => loadData()}
        />
      )}

      {quoteItem && (
        <ServiceQuoteModal
          item={quoteItem}
          boatName={quoteItem._boatName}
          onClose={() => setQuoteItem(null)}
        />
      )}

      {boats.length === 0 ? (
        <div className="empty-state">
          <Package size={64} color="#cbd5e1" />
          <h2>{t('eq.k2')}</h2>
          <p>{t('eq.k3')}</p>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="search-input" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 220px', minWidth: 180 }}>
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder={t('eq.searchPlaceholder')}
                style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 14 }}
              />
              {searchQ && (
                <button type="button" className="btn-icon" onClick={() => setSearchQ('')} aria-label="clear"
                  style={{ padding: 0, color: '#94a3b8' }}><X size={16} /></button>
              )}
            </div>
            <Filter size={16} />
            <select value={selectedBoat} onChange={e => setSelectedBoat(e.target.value)}>
              <option value="">{t('eq.k4')}</option>
              {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">{t('eq.k5')}</option>
              {categories.map(c => <option key={c} value={c}>{labelOf(c, t)}</option>)}
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
                  {/* ─── Fotos (max. 5, Bucket user-photos): oben im Formular ─── */}
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

                    {/* Aufnahme + KI-Analyse direkt unter den Bildern */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {existingPhotos.length + photoFiles.length < 5 && (
                        <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                            onChange={e => {
                              const files = Array.from(e.target.files || [])
                              const room = 5 - existingPhotos.length - photoFiles.length
                              setPhotoFiles(prev => [...prev, ...files.slice(0, room)])
                              e.target.value = ''
                            }} />
                          <Camera size={15} /> {t('eq.takePhoto')}
                        </label>
                      )}
                      {(existingPhotos.length + photoFiles.length) > 0 && (
                        <button type="button" className="btn-secondary" disabled={aiBusy}
                          onClick={analyzePhotos}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Sparkles size={15} /> {aiBusy ? t('eq.aiAnalyzing') : t('eq.aiAnalyze')}
                        </button>
                      )}
                    </div>

                    {/* KI-Ergebnis → Vorschlag zum Bestaetigen */}
                    {(existingPhotos.length + photoFiles.length) > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {aiError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>{aiError}</div>}
                        <div className="form-label-hint" style={{ marginTop: 6 }}>{t('eq.aiHint')}</div>

                        {aiSuggestion && (
                          <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: 'rgba(16,185,129,0.04)' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Sparkles size={15} color="#10b981" /> {t('eq.aiTitle')}
                            </div>
                            {[
                              { k: 'name', label: t('eq.k7'), val: aiSuggestion.name },
                              { k: 'manufacturer', label: t('eq.k11'), val: aiSuggestion.manufacturer },
                              { k: 'model', label: t('eq.k12'), val: aiSuggestion.model },
                              { k: 'serial_number', label: t('eq.k13'), val: aiSuggestion.serial_number },
                              { k: 'item_description', label: t('eq.k18'), val: aiSuggestion.item_description },
                              { k: 'category', label: t('eq.k8'), val: aiSuggestion.category ? labelOf(aiSuggestion.category, t) : '' },
                            ].filter(r => r.val && String(r.val).trim()).map(r => (
                              <label key={r.k} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                                <input type="checkbox" checked={!!aiSelected[r.k]}
                                  onChange={e => setAiSelected(prev => ({ ...prev, [r.k]: e.target.checked }))}
                                  style={{ marginTop: 3 }} />
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>{r.label}</span>
                                  <span style={{ fontSize: 14 }}>{r.val}</span>
                                </span>
                              </label>
                            ))}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button type="button" className="btn-secondary" onClick={() => { setAiSuggestion(null); setAiSelected({}) }}>
                                {t('eq.aiCancel')}
                              </button>
                              <button type="button" className="btn-primary" onClick={applyAiSuggestion}
                                disabled={!Object.values(aiSelected).some(Boolean)}>
                                {t('eq.aiApply')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group"><label>{t('eq.k7')}</label>
                      <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={t('eq.k26')} /></div>
                    <div className="form-group"><label>{t('eq.k8')}</label>
                      <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                        {categories.map(c => <option key={c} value={c}>{labelOf(c, t)}</option>)}
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
                    <div className="form-group"><label>{t('eq.partNumber')}</label>
                      <input value={form.part_number} onChange={e => setForm({...form, part_number: e.target.value})} /></div>
                    <div className="form-group"><label>{t('eq.quantity')}</label>
                      <input type="number" min="1" step="1" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></div>
                    <div className="form-group"><label>{t('eq.dimensions')}</label>
                      <input value={form.dimensions} onChange={e => setForm({...form, dimensions: e.target.value})} placeholder={t('eq.dimensionsPh')} /></div>
                  </div>
                  <div className="form-group"><label>{t('eq.location')}</label>
                    <input value={form.location_on_boat} onChange={e => setForm({...form, location_on_boat: e.target.value})} placeholder={t('eq.locationPh')} /></div>
                  <div className="form-group"><label>{t('eq.itemDescription')}</label>
                    <textarea rows={2} value={form.item_description} onChange={e => setForm({...form, item_description: e.target.value})} /></div>
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
            <div className="equipment-groups">
              {grouped.map(group => {
                const color = colorOf(group.key)
                return (
                  <section key={group.key} className="eq-group"
                    style={{ borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '10px 12px 4px', marginBottom: 18, background: 'var(--card-bg, #fff)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                    <div className="eq-group-header"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color, marginBottom: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
                      {labelOf(group.key, t)}
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{group.items.length}</span>
                    </div>
                    <div className="equipment-grid">
                      {group.items.map(item => renderCard(item))}
                    </div>
                  </section>
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
                const catLabel = labelOf(s.category, t)
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
