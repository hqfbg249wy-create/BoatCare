import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Search, Upload, X, Save, Loader, Image as ImageIcon, Package, CheckSquare, Square, FileSpreadsheet, Download } from 'lucide-react'

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
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState(null) // { ok: n, failed: [{row, error}] }
  const fileInputRef = useRef(null)
  const csvInputRef = useRef(null)

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function clearSelection() { setSelected(new Set()) }
  function selectAllFiltered(ids) { setSelected(new Set(ids)) }

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

  // ---------- CSV Import ----------
  const CSV_HEADERS = [
    'name', 'manufacturer', 'part_number', 'sku', 'ean',
    'price', 'currency', 'stock_quantity', 'description',
    'category', 'shipping_cost', 'delivery_days', 'weight_kg',
    'min_order_quantity', 'is_active', 'in_stock', 'image_url',
  ]

  function downloadCsvTemplate() {
    const sample = [
      CSV_HEADERS.join(','),
      'Impeller Jabsco 1210-0001,Jabsco,1210-0001,JAB-IMP-01,4012345678901,29.90,EUR,50,Impeller Ersatzteil für Jabsco Kühlpumpen,engine,5.90,3,0.05,1,true,true,',
      'Raymarine Element 9 HV,Raymarine,E70643,RAY-EL9,4012345678902,1299.00,EUR,5,Kartenplotter mit HyperVision Sonar,navigation,0,7,1.8,1,true,true,',
    ].join('\n')
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'skipily-produkte-vorlage.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCsv(text) {
    // Simpler Parser: Semikolon oder Komma, Anführungszeichen für eingebettete Kommas
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim())
    if (lines.length === 0) return { rows: [], headers: [] }

    const detectDelim = (line) => (line.split(';').length > line.split(',').length ? ';' : ',')
    const delim = detectDelim(lines[0])

    const splitLine = (line) => {
      const result = []
      let cur = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') { inQuotes = !inQuotes; continue }
        if (c === delim && !inQuotes) { result.push(cur); cur = ''; continue }
        cur += c
      }
      result.push(cur)
      return result.map(s => s.trim())
    }

    const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
      const cells = splitLine(line)
      const obj = {}
      headers.forEach((h, i) => { obj[h] = cells[i] ?? '' })
      return obj
    })
    return { rows, headers }
  }

  function rowToPayload(row) {
    const asBool = (v) => ['true', '1', 'ja', 'yes', 'y'].includes(String(v).toLowerCase().trim())
    const asNum = (v) => {
      if (v === '' || v == null) return null
      const n = parseFloat(String(v).replace(',', '.'))
      return isNaN(n) ? null : n
    }
    const asInt = (v) => {
      if (v === '' || v == null) return null
      const n = parseInt(String(v), 10)
      return isNaN(n) ? null : n
    }

    return {
      provider_id: provider.id,
      name:         row.name?.trim(),
      manufacturer: row.manufacturer || null,
      part_number:  row.part_number  || null,
      sku:          row.sku  || null,
      ean:          row.ean  || null,
      price:             asNum(row.price),
      currency:          row.currency || 'EUR',
      stock_quantity:    asInt(row.stock_quantity) ?? 0,
      description:       row.description || null,
      category:          row.category    || null,
      shipping_cost:     asNum(row.shipping_cost),
      delivery_days:     asInt(row.delivery_days),
      weight_kg:         asNum(row.weight_kg),
      min_order_quantity: asInt(row.min_order_quantity) ?? 1,
      is_active: row.is_active === '' || row.is_active == null ? true : asBool(row.is_active),
      in_stock:  row.in_stock  === '' || row.in_stock  == null ? true : asBool(row.in_stock),
      image_url: row.image_url || null,
      source:    'csv',
    }
  }

  async function handleCsvUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvImporting(true)
    setCsvResult(null)
    setMessage(null)

    try {
      const text = await file.text()
      const { rows, headers } = parseCsv(text)

      if (rows.length === 0) {
        setMessage({ type: 'error', text: 'Die CSV-Datei enthält keine Daten.' })
        return
      }

      const missing = ['name', 'price'].filter(h => !headers.includes(h))
      if (missing.length) {
        setMessage({ type: 'error', text: `Pflichtspalten fehlen: ${missing.join(', ')}. Lade die Vorlage herunter.` })
        return
      }

      const payloads = []
      const failed = []
      rows.forEach((row, idx) => {
        const p = rowToPayload(row)
        if (!p.name || p.price == null) {
          failed.push({ row: idx + 2, error: 'Name oder Preis fehlt' })
          return
        }
        payloads.push(p)
      })

      // Batch-Insert in 50er-Paketen
      let imported = 0
      for (let i = 0; i < payloads.length; i += 50) {
        const batch = payloads.slice(i, i + 50)
        const { error } = await supabase.from('metashop_products').insert(batch)
        if (error) {
          batch.forEach((_, j) => failed.push({ row: i + j + 2, error: error.message }))
        } else {
          imported += batch.length
        }
      }

      setCsvResult({ ok: imported, failed })
      await loadProducts()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setCsvImporting(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`${ids.length} Produkt(e) wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return

    setBulkDeleting(true)
    try {
      const { error } = await supabase.from('metashop_products').delete().in('id', ids)
      if (error) throw error
      clearSelection()
      await loadProducts()
      setMessage({ type: 'success', text: `${ids.length} Produkt(e) gelöscht.` })
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler beim Löschen: ' + err.message })
    } finally {
      setBulkDeleting(false)
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
        <h1>Produkte ({products.length}{selected.size > 0 ? `, ${selected.size} ausgewählt` : ''})</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selected.size > 0 && (
            <>
              <button className="btn-secondary" onClick={clearSelection}>
                <X size={16} /> Auswahl aufheben
              </button>
              <button className="btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <><Loader size={16} className="spin" /> Lösche…</> : <><Trash2 size={16} /> {selected.size} löschen</>}
              </button>
            </>
          )}
          <button className="btn-secondary" onClick={downloadCsvTemplate} title="CSV-Vorlage herunterladen">
            <Download size={16} /> CSV-Vorlage
          </button>
          <button
            className="btn-secondary"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            title="Produkte aus CSV-Datei importieren"
          >
            {csvImporting
              ? <><Loader size={16} className="spin" /> Importiere…</>
              : <><FileSpreadsheet size={16} /> CSV-Import</>}
          </button>
          <input
            type="file"
            ref={csvInputRef}
            accept=".csv,text/csv"
            onChange={handleCsvUpload}
            style={{ display: 'none' }}
          />
          <button className="btn-primary" onClick={() => { setEditing('new'); setForm(emptyForm()); setMessage(null) }}>
            <Plus size={16} /> Neues Produkt
          </button>
        </div>
      </div>

      {message && <div className={`message message-${message.type}`}>{message.text}</div>}

      {csvResult && (
        <div className={`message message-${csvResult.failed.length === 0 ? 'success' : 'warning'}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>
              CSV-Import: {csvResult.ok} erfolgreich
              {csvResult.failed.length > 0 && `, ${csvResult.failed.length} fehlgeschlagen`}
            </strong>
            <button className="btn-icon" onClick={() => setCsvResult(null)} title="Schließen">
              <X size={16} />
            </button>
          </div>
          {csvResult.failed.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer' }}>Fehlerdetails anzeigen</summary>
              <ul style={{ margin: '8px 0 0 16px', fontSize: 13, maxHeight: 200, overflowY: 'auto' }}>
                {csvResult.failed.slice(0, 50).map((f, i) => (
                  <li key={i}>Zeile {f.row}: {f.error}</li>
                ))}
                {csvResult.failed.length > 50 && <li>… und {csvResult.failed.length - 50} weitere</li>}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="search-bar">
        <Search size={18} />
        <input
          placeholder="Suchen nach Name, Hersteller, Artikelnr..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filteredProducts.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0 16px', fontSize: 14, color: 'var(--text-muted, #64748b)' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '6px 10px' }}
            onClick={() => {
              const allIds = filteredProducts.map(p => p.id)
              const allSelected = allIds.every(id => selected.has(id))
              if (allSelected) clearSelection()
              else selectAllFiltered(allIds)
            }}
          >
            {filteredProducts.every(p => selected.has(p.id)) && filteredProducts.length > 0
              ? <><CheckSquare size={16} /> Alle abwählen</>
              : <><Square size={16} /> Alle auswählen ({filteredProducts.length})</>}
          </button>
        </div>
      )}

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
          {filteredProducts.map(product => {
            const isSel = selected.has(product.id)
            return (
            <div key={product.id} className={`product-card ${!product.is_active ? 'inactive' : ''} ${isSel ? 'selected' : ''}`} style={isSel ? { outline: '2px solid #f97316', outlineOffset: 2 } : undefined}>
              <button
                type="button"
                className="btn-icon"
                onClick={() => toggleSelect(product.id)}
                title={isSel ? 'Abwählen' : 'Auswählen'}
                style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: 'white', border: '1px solid #e2e8f0' }}
              >
                {isSel ? <CheckSquare size={18} color="#f97316" /> : <Square size={18} />}
              </button>
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
          )})}
        </div>
      )}
    </div>
  )
}
