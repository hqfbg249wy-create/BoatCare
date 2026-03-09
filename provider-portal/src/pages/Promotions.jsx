import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Tag, X, Save, Loader } from 'lucide-react'

export default function Promotions() {
  const { provider } = useAuth()
  const [promotions, setPromotions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  function emptyForm() {
    return {
      name: '', description: '', discount_type: 'percent', discount_value: '',
      filter_categories: '', filter_boat_types: '', filter_manufacturers: '',
      filter_min_order: '', valid_from: '', valid_until: '', is_active: true, max_uses: '',
    }
  }

  useEffect(() => {
    if (provider) {
      loadPromotions()
      loadCategories()
    }
  }, [provider])

  async function loadPromotions() {
    setLoading(true)
    const { data } = await supabase
      .from('provider_promotions')
      .select('*')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false })
    setPromotions(data || [])
    setLoading(false)
  }

  async function loadCategories() {
    const { data } = await supabase.from('product_categories').select('*').order('sort_order')
    setCategories(data || [])
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const payload = {
      provider_id: provider.id,
      name: form.name,
      description: form.description,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      filter_categories: form.filter_categories ? form.filter_categories.split(',').map(s => s.trim()) : null,
      filter_boat_types: form.filter_boat_types ? form.filter_boat_types.split(',').map(s => s.trim()) : null,
      filter_manufacturers: form.filter_manufacturers ? form.filter_manufacturers.split(',').map(s => s.trim()) : null,
      filter_min_order: form.filter_min_order ? parseFloat(form.filter_min_order) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      is_active: form.is_active,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
    }

    try {
      if (editing === 'new') {
        const { error } = await supabase.from('provider_promotions').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('provider_promotions').update(payload).eq('id', editing.id)
        if (error) throw error
      }
      setMessage({ type: 'success', text: 'Angebot gespeichert.' })
      setEditing(null)
      setForm(emptyForm())
      loadPromotions()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(promo) {
    if (!confirm(`"${promo.name}" wirklich löschen?`)) return
    await supabase.from('provider_promotions').delete().eq('id', promo.id)
    loadPromotions()
  }

  function startEdit(promo) {
    setForm({
      name: promo.name || '',
      description: promo.description || '',
      discount_type: promo.discount_type || 'percent',
      discount_value: promo.discount_value?.toString() || '',
      filter_categories: (promo.filter_categories || []).join(', '),
      filter_boat_types: (promo.filter_boat_types || []).join(', '),
      filter_manufacturers: (promo.filter_manufacturers || []).join(', '),
      filter_min_order: promo.filter_min_order?.toString() || '',
      valid_from: promo.valid_from || '',
      valid_until: promo.valid_until || '',
      is_active: promo.is_active ?? true,
      max_uses: promo.max_uses?.toString() || '',
    })
    setEditing(promo)
    setMessage(null)
  }

  if (editing !== null) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{editing === 'new' ? 'Neues Angebot' : 'Angebot bearbeiten'}</h1>
          <button className="btn-secondary" onClick={() => { setEditing(null); setForm(emptyForm()) }}>
            <X size={16} /> Abbrechen
          </button>
        </div>

        {message && <div className={`message message-${message.type}`}>{message.text}</div>}

        <form onSubmit={handleSubmit}>
          <div className="card">
            <h2>Angebot</h2>
            <div className="form-group">
              <label>Name *</label>
              <input name="name" value={form.name} onChange={handleChange} required placeholder="z.B. Frühlings-Rabatt Antifouling" />
            </div>
            <div className="form-group">
              <label>Beschreibung</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={2} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Rabatt-Typ</label>
                <select name="discount_type" value={form.discount_type} onChange={handleChange}>
                  <option value="percent">Prozent (%)</option>
                  <option value="fixed">Festbetrag (EUR)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Rabatt-Wert *</label>
                <input name="discount_value" type="number" step="0.01" min="0" value={form.discount_value} onChange={handleChange} required
                  placeholder={form.discount_type === 'percent' ? 'z.B. 5' : 'z.B. 10.00'} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Filter (optional)</h2>
            <p className="hint">Nur Kunden, die diese Kriterien erfüllen, sehen das Angebot. Leer = für alle.</p>
            <div className="form-group">
              <label>Produktkategorien (kommagetrennt)</label>
              <input name="filter_categories" value={form.filter_categories} onChange={handleChange} placeholder="z.B. Antifouling, Motoröl" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Bootstypen</label>
                <input name="filter_boat_types" value={form.filter_boat_types} onChange={handleChange} placeholder="z.B. Segelboot, Motorboot" />
              </div>
              <div className="form-group">
                <label>Bootshersteller</label>
                <input name="filter_manufacturers" value={form.filter_manufacturers} onChange={handleChange} placeholder="z.B. Bavaria, Jeanneau" />
              </div>
            </div>
            <div className="form-group">
              <label>Mindestbestellwert (EUR)</label>
              <input name="filter_min_order" type="number" step="0.01" min="0" value={form.filter_min_order} onChange={handleChange} />
            </div>
          </div>

          <div className="card">
            <h2>Gültigkeit</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Gültig ab</label>
                <input name="valid_from" type="date" value={form.valid_from} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Gültig bis</label>
                <input name="valid_until" type="date" value={form.valid_until} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Max. Einlösungen</label>
                <input name="max_uses" type="number" min="0" value={form.max_uses} onChange={handleChange} placeholder="leer = unbegrenzt" />
              </div>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
              Angebot aktiv
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><Loader size={16} className="spin" /> Speichern...</> : <><Save size={16} /> Speichern</>}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Angebote & Rabatte</h1>
        <button className="btn-primary" onClick={() => { setEditing('new'); setForm(emptyForm()) }}>
          <Plus size={16} /> Neues Angebot
        </button>
      </div>

      {loading ? (
        <div className="loading">Laden...</div>
      ) : promotions.length === 0 ? (
        <div className="empty-state">
          <Tag size={48} />
          <p>Noch keine Angebote erstellt.</p>
        </div>
      ) : (
        <div className="promo-list">
          {promotions.map(promo => (
            <div key={promo.id} className={`card promo-card ${!promo.is_active ? 'inactive' : ''}`}>
              <div className="promo-header">
                <h3>{promo.name}</h3>
                <span className="promo-discount">
                  {promo.discount_type === 'percent' ? `${promo.discount_value}%` : `${Number(promo.discount_value).toFixed(2)} €`}
                </span>
              </div>
              {promo.description && <p>{promo.description}</p>}
              <div className="promo-meta">
                {promo.valid_from && <span>Ab: {promo.valid_from}</span>}
                {promo.valid_until && <span>Bis: {promo.valid_until}</span>}
                {promo.max_uses && <span>Einlösungen: {promo.current_uses}/{promo.max_uses}</span>}
                {!promo.is_active && <span className="badge badge-pending">Inaktiv</span>}
              </div>
              {(promo.filter_categories?.length > 0 || promo.filter_boat_types?.length > 0) && (
                <div className="promo-filters">
                  {promo.filter_categories?.map(c => <span key={c} className="filter-tag">{c}</span>)}
                  {promo.filter_boat_types?.map(t => <span key={t} className="filter-tag">{t}</span>)}
                </div>
              )}
              <div className="promo-actions">
                <button className="btn-icon" onClick={() => startEdit(promo)}><Pencil size={16} /></button>
                <button className="btn-icon btn-danger" onClick={() => handleDelete(promo)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
