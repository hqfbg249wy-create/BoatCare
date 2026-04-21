import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Search, Upload, X, Save, Loader, Image as ImageIcon, Package } from 'lucide-react'

export default function Products() {
  const { provider } = useAuth()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null = list, 'new' = new, product obj = edit
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const fileInputRef = useRef(null)

  function emptyForm() {
    return {
      name: '', manufacturer: '', part_number: '', sku: '', ean: '',
      price: '', currency: 'EUR', stock_quantity: '', description: '',
      category: '', category_id: '', shipping_cost: '', delivery_days: '',
      weight_kg: '', min_order_quantity: '1', is_active: true, in_stock: true,
      image_url: '', images: [],
    }
  }

  useEffect(() => {
    if (provider) {
      loadProducts()
      loadCategories()
    }
  }, [provider])

  async function loadProducts() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('metashop_products')
        .select('*')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProducts(data || [])
    } catch (err) {
      console.error('Fehler beim Laden:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadCategories() {
    const { data } = await supabase
      .from('product_categories')
      .select('*')
      .order('sort_order')
    setCategories(data || [])
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()
    const path = `products/${provider.id}/${Date.now()}.${ext}`

    try {
      const { error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(path, file)

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(path)

      setForm(prev => ({ ...prev, image_url: publicUrl }))
      setMessage({ type: 'success', text: 'Bild hochgeladen.' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Bild-Upload fehlgeschlagen: ' + err.message })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const payload = {
      provider_id: provider.id,
      name: form.name,
      manufacturer: form.manufacturer,
      part_number: form.part_number,
      sku: form.sku,
      ean: form.ean,
      price: form.price ? parseFloat(form.price) : null,
      currency: form.currency,
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : 0,
      description: form.description,
      category: form.category,
      category_id: form.category_id || null,
      shipping_cost: form.shipping_cost ? parseFloat(form.shipping_cost) : null,
      delivery_days: form.delivery_days ? parseInt(form.delivery_days) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      min_order_quantity: form.min_order_quantity ? parseInt(form.min_order_quantity) : 1,
      is_active: form.is_active,
      in_stock: form.in_stock,
      image_url: form.image_url,
      source: 'manual',
    }

    try {
      if (editing === 'new') {
        const { error } = await supabase.from('metashop_products').insert(payload)
        if (error) throw error
        setMessage({ type: 'success', text: 'Produkt angelegt.' })
      } else {
        const { error } = await supabase.from('metashop_products').update(payload).eq('id', editing.id)
        if (error) throw error
        setMessage({ type: 'success', text: 'Produkt aktualisiert.' })
      }
      setEditing(null)
      setForm(emptyForm())
      loadProducts()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product) {
    if (!confirm(`"${product.name}" wirklich löschen?`)) return

    try {
      const { error } = await supabase.from('metashop_products').delete().eq('id', product.id)
      if (error) throw error
      loadProducts()
      setMessage({ type: 'success', text: 'Produkt gelöscht.' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    }
  }

  function startEdit(product) {
    setForm({
      name: product.name || '',
      manufacturer: product.manufacturer || '',
      part_number: product.part_number || '',
      sku: product.sku || '',
      ean: product.ean || '',
      price: product.price?.toString() || '',
      currency: product.currency || 'EUR',
      stock_quantity: product.stock_quantity?.toString() || '0',
      description: product.description || '',
      category: product.category || '',
      category_id: product.category_id || '',
      shipping_cost: product.shipping_cost?.toString() || '',
      delivery_days: product.delivery_days?.toString() || '',
      weight_kg: product.weight_kg?.toString() || '',
      min_order_quantity: product.min_order_quantity?.toString() || '1',
      is_active: product.is_active ?? true,
      in_stock: product.in_stock ?? true,
      image_url: product.image_url || '',
      images: product.images || [],
    })
    setEditing(product)
    setMessage(null)
  }

  const parentCategories = categories.filter(c => !c.parent_id)
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.manufacturer || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.part_number || '').toLowerCase().includes(search.toLowerCase())
  )

  // ---- Edit/Create Form ----
  if (editing !== null) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{editing === 'new' ? 'Neues Produkt' : 'Produkt bearbeiten'}</h1>
          <button className="btn-secondary" onClick={() => { setEditing(null); setForm(emptyForm()); setMessage(null) }}>
            <X size={16} /> Abbrechen
          </button>
        </div>

        {message && <div className={`message message-${message.type}`}>{message.text}</div>}

        <form onSubmit={handleSubmit}>
          <div className="card">
            <h2>Grunddaten</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Produktname *</label>
                <input name="name" value={form.name} onChange={handleChange} required placeholder="z.B. Impeller Jabsco 1210-0001" />
              </div>
              <div className="form-group">
                <label>Hersteller</label>
                <input name="manufacturer" value={form.manufacturer} onChange={handleChange} placeholder="z.B. Jabsco" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Artikelnr. (Hersteller)</label>
                <input name="part_number" value={form.part_number} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>SKU (intern)</label>
                <input name="sku" value={form.sku} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>EAN</label>
                <input name="ean" value={form.ean} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label>Beschreibung</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={4} />
            </div>
          </div>

          <div className="card">
            <h2>Kategorie & Preis</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Kategorie</label>
                <select name="category_id" value={form.category_id} onChange={handleChange}>
                  <option value="">-- Wählen --</option>
                  {parentCategories.map(parent => (
                    <optgroup key={parent.id} label={parent.name_de}>
                      {categories.filter(c => c.parent_id === parent.id).map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name_de}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Preis (EUR) *</label>
                <input name="price" type="number" step="0.01" min="0" value={form.price} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Versandkosten (EUR)</label>
                <input name="shipping_cost" type="number" step="0.01" min="0" value={form.shipping_cost} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Lieferzeit (Tage)</label>
                <input name="delivery_days" type="number" min="0" value={form.delivery_days} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Gewicht (kg)</label>
                <input name="weight_kg" type="number" step="0.01" min="0" value={form.weight_kg} onChange={handleChange} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Bestand</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Lagerbestand</label>
                <input name="stock_quantity" type="number" min="0" value={form.stock_quantity} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Mindestbestellmenge</label>
                <input name="min_order_quantity" type="number" min="1" value={form.min_order_quantity} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input type="checkbox" name="in_stock" checked={form.in_stock} onChange={handleChange} />
                Auf Lager
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
                Aktiv (im Shop sichtbar)
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Produktbild</h2>
            {form.image_url && (
              <div className="image-preview">
                <img src={form.image_url} alt="Vorschau" />
                <button type="button" className="btn-icon" onClick={() => setForm(prev => ({ ...prev, image_url: '' }))}>
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="form-group">
              <label>Bild-URL</label>
              <input name="image_url" value={form.image_url} onChange={handleChange} placeholder="https://..." />
            </div>
            <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
            <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} /> Bild hochladen
            </button>
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

  // ---- Product List ----
  return (
    <div className="page">
      <div className="page-header">
        <h1>Produkte ({products.length})</h1>
        <button className="btn-primary" onClick={() => { setEditing('new'); setForm(emptyForm()); setMessage(null) }}>
          <Plus size={16} /> Neues Produkt
        </button>
      </div>

      {message && <div className={`message message-${message.type}`}>{message.text}</div>}

      <div className="search-bar">
        <Search size={18} />
        <input
          placeholder="Suchen nach Name, Hersteller, Artikelnr..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Laden...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state">
          <Package size={48} />
          <p>{search ? 'Keine Produkte gefunden.' : 'Noch keine Produkte angelegt.'}</p>
          {!search && (
            <button className="btn-primary" onClick={() => { setEditing('new'); setForm(emptyForm()) }}>
              <Plus size={16} /> Erstes Produkt anlegen
            </button>
          )}
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map(product => (
            <div key={product.id} className={`product-card ${!product.is_active ? 'inactive' : ''}`}>
              <div className="product-image">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} />
                ) : (
                  <ImageIcon size={32} />
                )}
              </div>
              <div className="product-info">
                <h3>{product.name}</h3>
                {product.manufacturer && <span className="product-manufacturer">{product.manufacturer}</span>}
                <div className="product-meta">
                  <span className="product-price">{product.price ? `${Number(product.price).toFixed(2)} €` : '–'}</span>
                  <span className={`badge ${product.in_stock ? 'badge-confirmed' : 'badge-cancelled'}`}>
                    {product.in_stock ? `${product.stock_quantity || '?'} Stk.` : 'Nicht lieferbar'}
                  </span>
                </div>
                {!product.is_active && <span className="badge badge-pending">Inaktiv</span>}
              </div>
              <div className="product-actions">
                <button className="btn-icon" title="Bearbeiten" onClick={() => startEdit(product)}>
                  <Pencil size={16} />
                </button>
                <button className="btn-icon btn-danger" title="Löschen" onClick={() => handleDelete(product)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
