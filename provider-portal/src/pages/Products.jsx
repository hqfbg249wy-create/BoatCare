import { useEffect, useState, useRef } from 'react'
import ProductRelations from '../components/ProductRelations'
import { useAuth } from '../hooks/useAuth'
import { useFeatureAccess } from '../hooks/useFeatureAccess'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, Upload, X, Save, Loader, Image as ImageIcon, Package, CheckSquare, Square, FileSpreadsheet, Download, Lock, Sparkles } from 'lucide-react'
import { useT } from '../i18n'
import * as XLSX from 'xlsx'
import { exportEquipmentXlsx } from '../lib/equipmentExport'

export default function Products() {
  const { provider } = useAuth()
  const access = useFeatureAccess()
  const { t, lang } = useT()
  const [generatingDesc, setGeneratingDesc] = useState(false)
  const [genDescError, setGenDescError] = useState(null)

  async function generateDescription() {
    if (!form.name?.trim()) {
      setGenDescError(t('products.namePrompt'))
      return
    }
    setGeneratingDesc(true)
    setGenDescError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(t('msg.notLoggedIn'))
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-product-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: form.name,
          manufacturer: form.manufacturer,
          part_number:  form.part_number,
          category:     form.category,
          lang: 'de',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.quota_exhausted) {
          setGenDescError(data.upgrade_hint || data.error)
        } else {
          setGenDescError(data.error || t('msg.genError'))
        }
        return
      }
      if (data.description) {
        setForm(prev => ({ ...prev, description: data.description }))
      }
    } catch (err) {
      setGenDescError(t('common.errorPrefix') + ' ' + err.message)
    } finally {
      setGeneratingDesc(false)
    }
  }
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null = list, 'new' = new, product obj = edit
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [valueDraft, setValueDraft] = useState({}) // { optIndex: "neuer Wert" }
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [csvResult, setCsvResult] = useState(null) // { ok: n, failed: [{row, error}] }
  // Rückfrage-Dialog bei Zeilen ohne Artikelnummer, die per Name matchen:
  const [importReview, setImportReview] = useState(null) // { payloads, rows:[{index,name,...}], decisions:{} }
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
      variant_options: [], variants: [],
    }
  }

  // ── Produktvarianten (Shop-Standard: Optionen + Kombinationen) ──
  // Kartesisches Produkt aller Optionswerte -> je Kombination eine Variante.
  function buildCombos(options) {
    const opts = (options || []).filter(o => o.name?.trim() && (o.values || []).length)
    if (!opts.length) return []
    let combos = [{}]
    for (const o of opts) {
      const next = []
      for (const c of combos) for (const v of o.values) next.push({ ...c, [o.name]: v })
      combos = next
    }
    return combos
  }

  // Optionen/Werte aendern und Varianten-Zeilen neu ableiten, bestehende
  // Preise/Bestaende je Kombination aber erhalten (per attribute-key gematcht).
  function regenVariants(options, prevVariants) {
    const combos = buildCombos(options)
    const keyOf = (attrs, opts) => (opts || []).map(o => `${o.name}=${attrs?.[o.name] ?? ''}`).join('|')
    const opts = (options || []).filter(o => o.name?.trim() && (o.values || []).length)
    const prevByKey = {}
    for (const v of (prevVariants || [])) prevByKey[keyOf(v.attributes, opts)] = v
    return combos.map((attrs, i) => {
      const ex = prevByKey[keyOf(attrs, opts)]
      return ex
        ? { ...ex, attributes: attrs, sort_order: i }
        : { attributes: attrs, price: '', stock_quantity: '', in_stock: true, sku: '', image_url: '', is_active: true, sort_order: i }
    })
  }

  function setVariantOptions(updater) {
    setForm(prev => {
      const options = typeof updater === 'function' ? updater(prev.variant_options || []) : updater
      return { ...prev, variant_options: options, variants: regenVariants(options, prev.variants) }
    })
  }

  function updateVariantRow(idx, patch) {
    setForm(prev => ({ ...prev, variants: prev.variants.map((v, i) => i === idx ? { ...v, ...patch } : v) }))
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

  // Aktive (nicht-Legacy) Kategorien für die Import-Referenz/Vorlage, geordnet:
  // je Oberkategorie direkt ihre Unterkategorien. Englische Namen = kanonisch.
  const importCategoryOptions = (() => {
    const active = categories.filter(c => !String(c.slug || '').startsWith('_legacy'))
    const parents = active.filter(c => !c.parent_id)
    const out = []
    for (const p of parents) {
      out.push({ ...p, isParent: true })
      for (const k of active.filter(c => c.parent_id === p.id)) out.push({ ...k, isParent: false })
    }
    return out
  })()

  // CSV-Kategorie (Name EN / Name DE / Slug, case-insensitive) → {category_id, name}.
  // Kanonisch gespeichert wird der englische Name; unbekannt → Freitext behalten,
  // damit der Import trotzdem durchläuft.
  function resolveCategory(text) {
    const key = String(text || '').trim().toLowerCase()
    if (!key) return { category_id: null, name: null }
    const hit = categories.find(c =>
      (c.name_en || '').toLowerCase() === key ||
      (c.name_de || '').toLowerCase() === key ||
      (c.slug || '').toLowerCase() === key
    )
    return hit ? { category_id: hit.id, name: hit.name_en || hit.slug } : { category_id: null, name: null }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  // Bis zu 5 Produktbilder. Das erste Bild ist zugleich image_url (Titelbild,
  // Legacy-Kompatibilitaet). Reihenfolge = Blaetter-Reihenfolge in Web/iOS.
  const MAX_IMAGES = 5

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const current = (form.images && form.images.length) ? form.images
      : (form.image_url ? [form.image_url] : [])
    const free = MAX_IMAGES - current.length
    if (free <= 0) {
      setMessage({ type: 'error', text: t('products.imageMax', { n: MAX_IMAGES }) })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploadingImage(true)
    try {
      const uploaded = []
      for (const file of files.slice(0, free)) {
        const ext = file.name.split('.').pop()
        const path = `products/${provider.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('product-images').upload(path, file)
        if (uploadErr) throw uploadErr
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
        uploaded.push(publicUrl)
      }
      setForm(prev => {
        const base = (prev.images && prev.images.length) ? prev.images : (prev.image_url ? [prev.image_url] : [])
        const images = [...base, ...uploaded].slice(0, MAX_IMAGES)
        return { ...prev, images, image_url: images[0] || '' }
      })
      const skipped = files.length - Math.min(files.length, free)
      setMessage({
        type: skipped > 0 ? 'error' : 'success',
        text: skipped > 0 ? t('products.imageMax', { n: MAX_IMAGES }) : t('products.imageUploaded'),
      })
    } catch (err) {
      setMessage({ type: 'error', text: t('products.imageUploadFailed') + ' ' + err.message })
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Bilder-Verwaltung im Editor: entfernen, als Titelbild setzen (nach vorne).
  function removeImage(idx) {
    setForm(prev => {
      const list = ((prev.images && prev.images.length) ? prev.images : (prev.image_url ? [prev.image_url] : [])).slice()
      list.splice(idx, 1)
      return { ...prev, images: list, image_url: list[0] || '' }
    })
  }
  function makeCoverImage(idx) {
    setForm(prev => {
      const list = ((prev.images && prev.images.length) ? prev.images : (prev.image_url ? [prev.image_url] : [])).slice()
      if (idx <= 0 || idx >= list.length) return prev
      const [img] = list.splice(idx, 1)
      list.unshift(img)
      return { ...prev, images: list, image_url: list[0] || '' }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // Tier-Limit prüfen: Standard-Provider können max. 10 Produkte anlegen
    if (editing === 'new' && Number.isFinite(access.limits.maxProducts)
        && products.length >= access.limits.maxProducts) {
      setMessage({
        type: 'error',
        text: t('products.limitMsg', { n: access.limits.maxProducts }),
      })
      return
    }

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
      images: (form.images && form.images.length) ? form.images : (form.image_url ? [form.image_url] : []),
      image_url: (form.images && form.images.length) ? form.images[0] : (form.image_url || null),
      source: 'manual',
    }

    // Nur echte Optionen (Name + mind. 1 Wert) speichern, sonst null.
    const cleanOptions = (form.variant_options || [])
      .map(o => ({ name: (o.name || '').trim(), values: (o.values || []).map(v => String(v).trim()).filter(Boolean) }))
      .filter(o => o.name && o.values.length)
    payload.variant_options = cleanOptions.length ? cleanOptions : null

    try {
      let productId = editing?.id
      if (editing === 'new') {
        const { data, error } = await supabase.from('metashop_products').insert(payload).select('id').single()
        if (error) throw error
        productId = data.id
        setMessage({ type: 'success', text: t('products.created') })
      } else {
        const { error } = await supabase.from('metashop_products').update(payload).eq('id', editing.id)
        if (error) throw error
        setMessage({ type: 'success', text: t('products.updated') })
      }
      await persistVariants(productId, cleanOptions)
      setEditing(null)
      setForm(emptyForm())
      loadProducts()
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  // Varianten mit der DB abgleichen: vorhandene aktualisieren, neue anlegen,
  // entfernte loeschen. Bei Produkten ohne Optionen alle Varianten entfernen.
  async function persistVariants(productId, cleanOptions) {
    if (!productId) return
    const { data: existing } = await supabase
      .from('product_variants').select('id, attributes').eq('product_id', productId)
    const keyOf = (attrs) => cleanOptions.map(o => `${o.name}=${attrs?.[o.name] ?? ''}`).join('|')

    if (!cleanOptions.length) {
      if (existing?.length) await supabase.from('product_variants').delete().eq('product_id', productId)
      return
    }

    const existingByKey = {}
    for (const e of (existing || [])) existingByKey[keyOf(e.attributes)] = e
    const keepIds = new Set()

    const rows = (form.variants || []).map(v => {
      const ex = existingByKey[keyOf(v.attributes)]
      if (ex) keepIds.add(ex.id)
      return {
        ...(ex ? { id: ex.id } : {}),
        product_id: productId,
        attributes: v.attributes,
        sku: v.sku?.trim() || null,
        price: v.price !== '' && v.price != null ? parseFloat(v.price) : null,
        stock_quantity: v.stock_quantity !== '' && v.stock_quantity != null ? parseInt(v.stock_quantity) : null,
        in_stock: v.in_stock ?? true,
        image_url: v.image_url?.trim() || null,
        is_active: v.is_active ?? true,
        sort_order: v.sort_order ?? 0,
      }
    })

    // Entfernte Kombinationen loeschen
    const toDelete = (existing || []).filter(e => !keepIds.has(e.id)).map(e => e.id)
    if (toDelete.length) await supabase.from('product_variants').delete().in('id', toDelete)

    if (rows.length) {
      const { error } = await supabase.from('product_variants').upsert(rows, { onConflict: 'id' })
      if (error) throw error
    }
  }

  async function handleDelete(product) {
    if (!confirm(t('products.deleteConfirm', { name: product.name }))) return

    try {
      const { error } = await supabase.from('metashop_products').delete().eq('id', product.id)
      if (error) throw error
      loadProducts()
      setMessage({ type: 'success', text: t('products.deleted') })
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    }
  }

  // ---------- CSV Import ----------
  const CSV_HEADERS = [
    'name', 'manufacturer', 'part_number', 'sku', 'ean',
    'price', 'currency', 'stock_quantity', 'description',
    'category', 'shipping_cost', 'delivery_days', 'weight_kg',
    'min_order_quantity', 'is_active', 'in_stock', 'image_url',
    // Weitere Produktbilder (bis zu 5 gesamt; image_url = Titelbild = Bild 1).
    // Werden im Shop per Wischen/Pfeil durchgeblaettert.
    'bild2', 'bild3', 'bild4', 'bild5',
    // Produktvarianten (optional): mehrere Zeilen mit GLEICHEM name = ein
    // Produkt mit Varianten. Preis/Bestand/SKU je Variante moeglich.
    'variante1_name', 'variante1_wert', 'variante2_name', 'variante2_wert',
    'variante_preis', 'variante_bestand', 'variante_sku', 'variante_bild',
  ]

  function downloadCsvTemplate() {
    // Beispielzeilen als Objekte -> in Header-Reihenfolge serialisiert (keine
    // verzaehlten Kommas). Zeigt u.a. ein Tauwerk mit zwei Durchmesser-Varianten
    // (gleicher name, unterschiedlicher Preis).
    const samples = [
      { name: 'Impeller Jabsco 1210-0001', manufacturer: 'Jabsco', part_number: '1210-0001', sku: 'JAB-IMP-01', ean: '4012345678901', price: '29.90', currency: 'EUR', stock_quantity: '50', description: 'Impeller spare part', category: 'Engine & Drive', shipping_cost: '5.90', delivery_days: '3', weight_kg: '0.05', min_order_quantity: '1', is_active: 'true', in_stock: 'true', image_url: 'https://…/impeller-front.jpg', bild2: 'https://…/impeller-side.jpg', bild3: 'https://…/impeller-box.jpg' },
      { name: 'Liros Race SK78', manufacturer: 'Liros', description: 'Hochfestes Tauwerk', category: 'Ropes', currency: 'EUR', is_active: 'true', in_stock: 'true', price: '100.00', variante1_name: 'Durchmesser', variante1_wert: '6mm', variante_preis: '100.00', variante_bestand: '20', variante_sku: 'LIROS-SK78-6' },
      { name: 'Liros Race SK78', variante1_name: 'Durchmesser', variante1_wert: '8mm', variante_preis: '120.00', variante_bestand: '15', variante_sku: 'LIROS-SK78-8' },
      { name: 'Liros Race SK78', variante1_name: 'Durchmesser', variante1_wert: '10mm', variante_preis: '150.00', variante_bestand: '10', variante_sku: 'LIROS-SK78-10' },
    ]
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = [CSV_HEADERS.join(',')]
    for (const row of samples) lines.push(CSV_HEADERS.map(h => esc(row[h])).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'skipily-produkte-vorlage.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Bestehenden Produktbestand im NEUEN Vorlagen-Format exportieren (inkl.
  // Varianten-Spalten). Produkte mit Varianten werden Shopify-artig auf mehrere
  // Zeilen (gleicher Name) verteilt. Die Datei ist 1:1 wieder importierbar.
  async function exportProducts() {
    setExporting(true)
    setMessage(null)
    try {
      const { data: prods, error } = await supabase
        .from('metashop_products')
        .select('name, manufacturer, part_number, sku, ean, price, currency, stock_quantity, description, category, shipping_cost, delivery_days, weight_kg, min_order_quantity, is_active, in_stock, image_url, images, variant_options, id')
        .eq('provider_id', provider.id)
        .order('name')
      if (error) throw error
      const list = prods || []
      const ids = list.map(p => p.id)
      let variantsByProduct = {}
      if (ids.length) {
        const { data: vs } = await supabase
          .from('product_variants').select('*').in('product_id', ids).order('sort_order')
        for (const v of (vs || [])) (variantsByProduct[v.product_id] ||= []).push(v)
      }
      const boolStr = (b) => b === false ? 'false' : 'true'
      const baseOf = (p) => ({
        name: p.name || '', manufacturer: p.manufacturer || '', part_number: p.part_number || '',
        sku: p.sku || '', ean: p.ean || '', price: p.price ?? '', currency: p.currency || 'EUR',
        stock_quantity: p.stock_quantity ?? '', description: p.description || '', category: p.category || '',
        shipping_cost: p.shipping_cost ?? '', delivery_days: p.delivery_days ?? '', weight_kg: p.weight_kg ?? '',
        min_order_quantity: p.min_order_quantity ?? '', is_active: boolStr(p.is_active), in_stock: boolStr(p.in_stock),
        // Bild 1 = image_url (Titelbild), Bild 2-5 aus dem images[]-Array.
        image_url: (Array.isArray(p.images) && p.images.length ? p.images[0] : p.image_url) || '',
        bild2: (Array.isArray(p.images) && p.images[1]) || '',
        bild3: (Array.isArray(p.images) && p.images[2]) || '',
        bild4: (Array.isArray(p.images) && p.images[3]) || '',
        bild5: (Array.isArray(p.images) && p.images[4]) || '',
      })
      const aoa = [CSV_HEADERS]
      for (const p of list) {
        const opts = Array.isArray(p.variant_options) ? p.variant_options.filter(o => o?.name) : []
        const vs = variantsByProduct[p.id] || []
        if (opts.length && vs.length) {
          const opt1 = opts[0]?.name || '', opt2 = opts[1]?.name || ''
          vs.forEach((v, i) => {
            const a = v.attributes || {}
            const row = i === 0 ? baseOf(p) : { name: p.name }
            row.variante1_name = opt1
            row.variante1_wert = opt1 ? (a[opt1] ?? '') : ''
            row.variante2_name = opt2
            row.variante2_wert = opt2 ? (a[opt2] ?? '') : ''
            row.variante_preis = v.price ?? ''
            row.variante_bestand = v.stock_quantity ?? ''
            row.variante_sku = v.sku || ''
            row.variante_bild = v.image_url || ''
            aoa.push(CSV_HEADERS.map(h => row[h] ?? ''))
          })
        } else {
          const row = baseOf(p)
          aoa.push(CSV_HEADERS.map(h => row[h] ?? ''))
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Products')
      XLSX.writeFile(wb, 'skipily-produkte-export.xlsx')
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setExporting(false)
    }
  }

  // Header-Aliase: deutsche/englische Schreibweisen → kanonischer Feldname.
  // So laufen CSVs aus Excel, Lieferantenlisten und Warenwirtschaft direkt durch.
  const HEADER_ALIASES = {
    name: ['name', 'bezeichnung', 'produktname', 'artikel', 'artikelbezeichnung', 'titel', 'title', 'product', 'produkt'],
    manufacturer: ['manufacturer', 'hersteller', 'marke', 'brand', 'fabrikat'],
    part_number: ['part_number', 'partnumber', 'artikelnummer', 'artikel-nr', 'artikelnr', 'art-nr', 'artnr', 'teilenummer', 'herstellernummer', 'mpn'],
    sku: ['sku', 'sku-nr', 'lagernummer', 'lager-nr'],
    ean: ['ean', 'gtin', 'barcode', 'ean13'],
    price: ['price', 'preis', 'vk', 'verkaufspreis', 'preis_brutto', 'bruttopreis', 'einzelpreis', 'vk-preis'],
    currency: ['currency', 'währung', 'waehrung'],
    stock_quantity: ['stock_quantity', 'bestand', 'lagerbestand', 'menge', 'anzahl', 'quantity', 'qty', 'stück', 'stueck'],
    description: ['description', 'beschreibung', 'beschr', 'text', 'produktbeschreibung'],
    category: ['category', 'kategorie', 'warengruppe', 'gruppe'],
    shipping_cost: ['shipping_cost', 'versandkosten', 'versand', 'porto'],
    delivery_days: ['delivery_days', 'lieferzeit', 'lieferzeit_tage', 'lieferung', 'lieferzeit-tage'],
    weight_kg: ['weight_kg', 'gewicht', 'gewicht_kg', 'kg'],
    min_order_quantity: ['min_order_quantity', 'mindestbestellmenge', 'mbm', 'mindestmenge'],
    is_active: ['is_active', 'aktiv', 'active'],
    in_stock: ['in_stock', 'verfügbar', 'verfuegbar', 'vorrätig', 'vorraetig', 'lieferbar'],
    image_url: ['image_url', 'bild', 'bild1', 'bild_url', 'bildurl', 'foto', 'image', 'picture', 'bild-url', 'bild_1'],
    img2: ['bild2', 'bild_2', 'image2', 'image_url2', 'foto2'],
    img3: ['bild3', 'bild_3', 'image3', 'image_url3', 'foto3'],
    img4: ['bild4', 'bild_4', 'image4', 'image_url4', 'foto4'],
    img5: ['bild5', 'bild_5', 'image5', 'image_url5', 'foto5'],
    // Produktvarianten (Shopify-artig): mehrere Zeilen mit gleichem Namen bilden
    // EIN Produkt; jede Zeile mit Optionswerten wird eine Variante.
    v_opt1_name: ['variante1_name', 'variante_option1', 'option1_name', 'option1', 'optionsname1', 'variantenname1'],
    v_val1: ['variante1_wert', 'variante_wert1', 'option1_wert', 'option1_value', 'option1_wert1', 'wert1', 'variantenwert1'],
    v_opt2_name: ['variante2_name', 'variante_option2', 'option2_name', 'option2', 'optionsname2', 'variantenname2'],
    v_val2: ['variante2_wert', 'variante_wert2', 'option2_wert', 'option2_value', 'wert2', 'variantenwert2'],
    v_price: ['variante_preis', 'variantenpreis', 'variant_price', 'variantpreis'],
    v_stock: ['variante_bestand', 'variantenbestand', 'variant_stock', 'variante_menge'],
    v_sku: ['variante_sku', 'variantensku', 'variant_sku'],
    v_image: ['variante_bild', 'variant_image', 'variante_bild_url', 'variantbild'],
  }
  const ALIAS_LOOKUP = (() => {
    const m = {}
    for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) {
      for (const a of aliases) m[a] = canon
    }
    return m
  })()
  const normalizeHeader = (h) =>
    ALIAS_LOOKUP[h.toLowerCase().replace(/^"|"$/g, '').trim()] || h.toLowerCase().replace(/^"|"$/g, '').trim()

  function parseCsv(text) {
    // UTF-8-BOM entfernen (Excel/Numbers hängen es an → sonst heißt die erste
    // Spalte "﻿name" und die Pflichtspalten-Prüfung schlägt fehl).
    const clean = text.replace(/^﻿/, '')
    const lines = clean.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim())
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

    // Header lowercasen UND über Aliase auf kanonische Feldnamen mappen
    const headers = splitLine(lines[0]).map(normalizeHeader)
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
    // Robust gegen deutsches Zahlenformat + Währungszeichen:
    //   "1.299,00 €" → 1299.00 · "29,90" → 29.90 · "1,234.56" → 1234.56
    const asNum = (v) => {
      if (v == null) return null
      let s = String(v).trim()
      if (!s) return null
      // Währungssymbole/-codes + Leerzeichen raus
      s = s.replace(/[€$£\s]/g, '').replace(/eur/ig, '').replace(/chf/ig, '')
      if (!s) return null
      const hasComma = s.includes(',')
      const hasDot = s.includes('.')
      if (hasComma && hasDot) {
        // Letztes Trennzeichen = Dezimaltrenner, das andere = Tausender
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          s = s.replace(/\./g, '').replace(',', '.')   // deutsch: 1.299,00
        } else {
          s = s.replace(/,/g, '')                      // englisch: 1,299.00
        }
      } else if (hasComma) {
        s = s.replace(',', '.')                          // 29,90
      }
      const n = parseFloat(s)
      return isNaN(n) ? null : n
    }
    const asInt = (v) => {
      const n = asNum(v)
      return n == null ? null : Math.round(n)
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
      category:          resolveCategory(row.category).name || row.category || null,
      category_id:       resolveCategory(row.category).category_id,
      shipping_cost:     asNum(row.shipping_cost),
      delivery_days:     asInt(row.delivery_days),
      weight_kg:         asNum(row.weight_kg),
      min_order_quantity: asInt(row.min_order_quantity) ?? 1,
      is_active: row.is_active === '' || row.is_active == null ? true : asBool(row.is_active),
      in_stock:  row.in_stock  === '' || row.in_stock  == null ? true : asBool(row.in_stock),
      image_url: row.image_url || null,
      images:    [row.image_url, row.img2, row.img3, row.img4, row.img5]
                   .map(u => (u || '').trim()).filter(Boolean).slice(0, 5),
      source:    'csv',
    }
  }

  // Gruppiert Importzeilen zu Produkten: mehrere Zeilen mit GLEICHEM name
  // bilden EIN Produkt; Zeilen mit Optionswerten werden zu Varianten
  // (Shopify-artig, mit Preis/Bestand/SKU je Variante). Zeilen ohne Varianten-
  // spalten ergeben ein normales Produkt.
  function buildImportPayloads(rows, failed) {
    const numOf = (v) => {
      if (v == null || v === '') return null
      let s = String(v).trim()
      const hasC = s.includes(','), hasD = s.includes('.')
      if (hasC && hasD) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
      else if (hasC) s = s.replace(',', '.')
      const n = parseFloat(s); return isNaN(n) ? null : n
    }
    const intOf = (v) => { const n = numOf(v); return n == null ? null : Math.round(n) }
    const groups = new Map()
    const order = []
    rows.forEach((row, idx) => {
      const name = (row.name || '').trim()
      if (!name) { failed.push({ row: idx + 2, error: 'Name fehlt' }); return }
      const key = name.toLowerCase()
      if (!groups.has(key)) { groups.set(key, []); order.push(key) }
      groups.get(key).push({ row, idx })
    })

    const payloads = []
    for (const key of order) {
      const grp = groups.get(key)
      const base = rowToPayload(grp[0].row)
      const opt1 = (grp.map(g => (g.row.v_opt1_name || '').trim()).find(Boolean)) || ''
      const opt2 = (grp.map(g => (g.row.v_opt2_name || '').trim()).find(Boolean)) || ''
      const variantRows = grp.filter(g => (g.row.v_val1 || '').trim() || (g.row.v_val2 || '').trim())

      if ((opt1 || opt2) && variantRows.length) {
        const distinct = (arr) => [...new Set(arr.filter(Boolean))]
        const options = []
        if (opt1) options.push({ name: opt1, values: distinct(variantRows.map(g => (g.row.v_val1 || '').trim())) })
        if (opt2) options.push({ name: opt2, values: distinct(variantRows.map(g => (g.row.v_val2 || '').trim())) })
        base.variant_options = options.length ? options : null
        base.variants = variantRows.map(g => {
          const attrs = {}
          if (opt1 && (g.row.v_val1 || '').trim()) attrs[opt1] = g.row.v_val1.trim()
          if (opt2 && (g.row.v_val2 || '').trim()) attrs[opt2] = g.row.v_val2.trim()
          return {
            attributes: attrs,
            price: numOf(g.row.v_price) ?? base.price,
            stock_quantity: intOf(g.row.v_stock) ?? base.stock_quantity ?? 0,
            sku: (g.row.v_sku || '').trim() || null,
            image_url: (g.row.v_image || '').trim() || null,
            in_stock: true, is_active: true,
          }
        })
      }

      if (base.price == null && (!base.variants || !base.variants.length)) {
        failed.push({ row: grp[0].idx + 2, error: 'Preis fehlt' })
        continue
      }
      // Produktpreis notfalls aus der ersten Variante ableiten.
      if (base.price == null && base.variants?.length) base.price = base.variants[0].price ?? 0
      payloads.push(base)
    }
    return payloads
  }

  // Ruft die import-products Edge Function (preview oder commit).
  async function callImport({ products, mode, decisions }) {
    const { data: { session } } = await supabase.auth.getSession()
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
    const res = await fetch(`${supabaseUrl}/functions/v1/import-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ provider_id: provider.id, products, mode, decisions }),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) return { error: result.error || `Import fehlgeschlagen (HTTP ${res.status})` }
    return result
  }

  // Führt den eigentlichen Import aus und zeigt das Ergebnis.
  async function commitImport(payloads, decisions, parseFailed = []) {
    setCsvImporting(true)
    const result = await callImport({ products: payloads, mode: 'commit', decisions })
    if (result.error) { setMessage({ type: 'error', text: result.error }); setCsvImporting(false); return }
    const failed = [...parseFailed, ...(Array.isArray(result.failed) ? result.failed : [])]
    setCsvResult({ ok: result.ok || 0, updated: result.updated || 0, stock: result.stock || 0, skipped: result.skipped || 0, failed })
    await loadProducts()
    setCsvImporting(false)
  }

  async function handleCsvUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvImporting(true)
    setCsvResult(null)
    setMessage(null)

    try {
      // Excel (.xlsx/.xls) direkt annehmen: erstes Blatt (bzw. „Products") in
      // CSV wandeln und durch dieselbe Pipeline schicken. Sonst CSV als Text.
      let text
      const isExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name)
      if (isExcel) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'products') || wb.SheetNames[0]
        text = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], { FS: ',' })
      } else {
        text = await file.text()
      }
      const { rows, headers } = parseCsv(text)

      if (rows.length === 0) {
        setMessage({ type: 'error', text: t('products.csvNoData') })
        return
      }

      const missing = ['name', 'price'].filter(h => !headers.includes(h))
      if (missing.length) {
        setMessage({
          type: 'error',
          text: `Pflichtspalten fehlen: ${missing.join(', ')}. Erkannte Spalten: ${headers.join(', ') || '—'}. `
              + `Tipp: erste Zeile muss die Spaltenüberschriften enthalten (name und price bzw. „Name" und „Preis"). Lade die Vorlage herunter.`,
        })
        return
      }

      const failed = []
      const payloads = buildImportPayloads(rows, failed)

      // Zuerst Vorschau: gibt es Zeilen ohne Artikelnummer, die per Name auf
      // ein vorhandenes Produkt matchen? Die brauchen eine Rückfrage, damit
      // nicht versehentlich Bestände überschrieben werden.
      const preview = await callImport({ products: payloads, mode: 'preview' })
      if (preview.error) { setMessage({ type: 'error', text: preview.error }); return }

      if (preview.review && preview.review.length > 0) {
        // Dialog öffnen; Default-Aktion je Zeile = aktualisieren
        const decisions = {}
        preview.review.forEach(r => { decisions[r.index] = { action: 'update', part_number: '' } })
        setImportReview({ payloads, rows: preview.review, decisions, parseFailed: failed })
        return   // Commit erst nach Bestätigung
      }

      // Keine Rückfragen → direkt committen
      await commitImport(payloads, {}, failed)
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setCsvImporting(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(t('products.bulkDeleteConfirm', { n: ids.length }))) return

    setBulkDeleting(true)
    try {
      const { error } = await supabase.from('metashop_products').delete().in('id', ids)
      if (error) throw error
      clearSelection()
      await loadProducts()
      setMessage({ type: 'success', text: `${ids.length} Produkt(e) gelöscht.` })
    } catch (err) {
      setMessage({ type: 'error', text: t('products.deleteFailed') + ' ' + err.message })
    } finally {
      setBulkDeleting(false)
    }
  }

  async function startEdit(product) {
    const options = Array.isArray(product.variant_options) ? product.variant_options : []
    let loadedVariants = []
    if (options.length) {
      const { data } = await supabase
        .from('product_variants').select('*').eq('product_id', product.id).order('sort_order')
      loadedVariants = (data || []).map(v => ({
        id: v.id, attributes: v.attributes || {},
        price: v.price != null ? String(v.price) : '',
        stock_quantity: v.stock_quantity != null ? String(v.stock_quantity) : '',
        in_stock: v.in_stock ?? true, sku: v.sku || '', image_url: v.image_url || '',
        is_active: v.is_active ?? true, sort_order: v.sort_order ?? 0,
      }))
    }
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
      variant_options: options,
      variants: loadedVariants,
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

  // Bestandspflege: Produkte mit niedrigem Bestand (≤ 1) hervorheben und nach
  // oben rücken, damit man sie sofort nachpflegen kann.
  const LOW_STOCK_THRESHOLD = 1
  const isLowStock = (p) => (Number(p.stock_quantity) || 0) <= LOW_STOCK_THRESHOLD
  const lowStockCount = filteredProducts.filter(isLowStock).length
  const sortedProducts = [...filteredProducts].sort(
    (a, b) => (isLowStock(a) ? 0 : 1) - (isLowStock(b) ? 0 : 1)
  )

  // ---- Edit/Create Form ----
  if (editing !== null) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{editing === 'new' ? t('products.newProduct') : t('products.editProduct')}</h1>
          <button className="btn-secondary" onClick={() => { setEditing(null); setForm(emptyForm()); setMessage(null) }}>
            <X size={16} /> {t('common.cancel')}
          </button>
        </div>

        {message && <div className={`message message-${message.type}`}>{message.text}</div>}

        <form onSubmit={handleSubmit}>
          <div className="card">
            <h2>{t('products.basics')}</h2>
            <div className="form-row">
              <div className="form-group">
                <label>{t('products.name')} *</label>
                <input name="name" value={form.name} onChange={handleChange} required placeholder={t('products.namePh')} />
              </div>
              <div className="form-group">
                <label>{t('products.manufacturer')}</label>
                <input name="manufacturer" value={form.manufacturer} onChange={handleChange} placeholder={t('products.manufacturerPh')} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('products.partNumber')}</label>
                <input name="part_number" value={form.part_number} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>{t('products.sku')}</label>
                <input name="sku" value={form.sku} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>EAN</label>
                <input name="ean" value={form.ean} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                <label style={{ margin: 0 }}>{t('products.description')}</label>
                {access.isPro && (
                  <button
                    type="button"
                    onClick={generateDescription}
                    disabled={generatingDesc}
                    title={t('products.aiGenTitle')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px',
                      background: '#f3e8ff', color: '#7e22ce',
                      border: '1px solid #e9d5ff', borderRadius: 6,
                      fontSize: 12, fontWeight: 600,
                      cursor: generatingDesc ? 'wait' : 'pointer',
                    }}>
                    {generatingDesc
                      ? <><Loader size={12} className="spin" /> {t('products.generating')}</>
                      : <><Sparkles size={12} /> {t('products.aiGenerate')}</>}
                  </button>
                )}
              </div>
              <textarea name="description" value={form.description} onChange={handleChange} rows={4} />
              {genDescError && (
                <div style={{
                  marginTop: 6, padding: '6px 10px',
                  background: '#fef2f2', color: '#991b1b',
                  border: '1px solid #fecaca', borderRadius: 6,
                  fontSize: 12,
                }}>{genDescError}</div>
              )}
            </div>
          </div>

          <div className="card">
            <h2>{t('products.categoryPrice')}</h2>
            <div className="form-row">
              <div className="form-group">
                <label>{t('products.category')}</label>
                <select name="category_id" value={form.category_id} onChange={handleChange}>
                  <option value="">{t('products.chooseCat')}</option>
                  {parentCategories.map(parent => (
                    <optgroup key={parent.id} label={parent['name_' + lang] || parent.name_de}>
                      {categories.filter(c => c.parent_id === parent.id).map(sub => (
                        <option key={sub.id} value={sub.id}>{sub['name_' + lang] || sub.name_de}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('products.price')} *</label>
                <input name="price" type="number" step="0.01" min="0" value={form.price} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('products.shippingCost')}</label>
                <input name="shipping_cost" type="number" step="0.01" min="0" value={form.shipping_cost} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>{t('products.deliveryDays')}</label>
                <input name="delivery_days" type="number" min="0" value={form.delivery_days} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>{t('products.weight')}</label>
                <input name="weight_kg" type="number" step="0.01" min="0" value={form.weight_kg} onChange={handleChange} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2>{t('products.stockSection')}</h2>
            <div className="form-row">
              <div className="form-group">
                <label>{t('products.stockQty')}</label>
                <input name="stock_quantity" type="number" min="0" value={form.stock_quantity} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>{t('products.minOrderQty')}</label>
                <input name="min_order_quantity" type="number" min="1" value={form.min_order_quantity} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input type="checkbox" name="in_stock" checked={form.in_stock} onChange={handleChange} />
                {t('products.inStockLabel')}
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
                {t('products.activeVisible')}
              </label>
            </div>
          </div>

          <div className="card">
            <h2>{t('products.variantsTitle')}</h2>
            <p className="form-hint">{t('products.variantsHint')}</p>

            {(form.variant_options || []).map((opt, oi) => (
              <div key={oi} className="variant-option">
                <div className="variant-option-head">
                  <input
                    className="variant-opt-name"
                    value={opt.name}
                    placeholder={t('products.variantOptNamePh')}
                    onChange={e => setVariantOptions(prev => prev.map((o, i) => i === oi ? { ...o, name: e.target.value } : o))}
                  />
                  <button type="button" className="btn-icon" title={t('common.delete')}
                    onClick={() => { setVariantOptions(prev => prev.filter((_, i) => i !== oi)); }}>
                    <X size={16} />
                  </button>
                </div>
                <div className="variant-values">
                  {(opt.values || []).map((val, vi) => (
                    <span key={vi} className="variant-value-chip">
                      {val}
                      <button type="button" onClick={() => setVariantOptions(prev => prev.map((o, i) => i === oi ? { ...o, values: o.values.filter((_, j) => j !== vi) } : o))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="variant-value-input"
                    value={valueDraft[oi] || ''}
                    placeholder={t('products.variantValuePh')}
                    onChange={e => setValueDraft(d => ({ ...d, [oi]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = (valueDraft[oi] || '').trim()
                        if (!v) return
                        setVariantOptions(prev => prev.map((o, i) => i === oi && !(o.values || []).includes(v) ? { ...o, values: [...(o.values || []), v] } : o))
                        setValueDraft(d => ({ ...d, [oi]: '' }))
                      }
                    }}
                  />
                </div>
              </div>
            ))}

            <button type="button" className="btn-secondary"
              onClick={() => setVariantOptions(prev => [...prev, { name: '', values: [] }])}>
              <Plus size={16} /> {t('products.variantAddOption')}
            </button>

            {(form.variants || []).length > 0 && (
              <div className="variant-table-wrap">
                <table className="variant-table">
                  <thead>
                    <tr>
                      {(form.variant_options || []).filter(o => o.name?.trim()).map((o, i) => <th key={i}>{o.name}</th>)}
                      <th>{t('products.variantPrice')}</th>
                      <th>{t('products.variantStock')}</th>
                      <th>SKU</th>
                      <th>{t('products.variantInStock')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.variants.map((v, vi) => (
                      <tr key={vi}>
                        {(form.variant_options || []).filter(o => o.name?.trim()).map((o, i) => (
                          <td key={i} className="variant-attr-cell">{v.attributes?.[o.name]}</td>
                        ))}
                        <td><input type="number" step="0.01" value={v.price} placeholder={form.price || '0.00'}
                          onChange={e => updateVariantRow(vi, { price: e.target.value })} /></td>
                        <td><input type="number" value={v.stock_quantity} placeholder="0"
                          onChange={e => updateVariantRow(vi, { stock_quantity: e.target.value })} /></td>
                        <td><input value={v.sku} onChange={e => updateVariantRow(vi, { sku: e.target.value })} /></td>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={v.in_stock}
                          onChange={e => updateVariantRow(vi, { in_stock: e.target.checked })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>{t('products.images')} <span className="muted">({(form.images?.length || (form.image_url ? 1 : 0))}/{MAX_IMAGES})</span></h2>
            <p className="muted" style={{ marginTop: 0 }}>{t('products.imagesHint', { n: MAX_IMAGES })}</p>
            {(form.images && form.images.length > 0) && (
              <div className="product-images-grid">
                {form.images.map((img, i) => (
                  <div key={i} className={`product-image-tile ${i === 0 ? 'is-cover' : ''}`}>
                    <img src={img} alt="" />
                    {i === 0 && <span className="cover-badge">{t('products.coverImage')}</span>}
                    <div className="product-image-actions">
                      {i !== 0 && (
                        <button type="button" className="btn-icon" title={t('products.makeCover')} onClick={() => makeCoverImage(i)}>
                          <ImageIcon size={14} />
                        </button>
                      )}
                      <button type="button" className="btn-icon" title={t('common.delete')} onClick={() => removeImage(i)}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="form-group">
              <label>{t('products.imageUrl')}</label>
              <input
                value=""
                onChange={(e) => {
                  const url = e.target.value.trim()
                  if (!url) return
                  setForm(prev => {
                    const base = (prev.images && prev.images.length) ? prev.images : (prev.image_url ? [prev.image_url] : [])
                    if (base.length >= MAX_IMAGES) { setMessage({ type: 'error', text: t('products.imageMax', { n: MAX_IMAGES }) }); return prev }
                    const images = [...base, url].slice(0, MAX_IMAGES)
                    return { ...prev, images, image_url: images[0] }
                  })
                  e.target.value = ''
                }}
                placeholder="https://..."
              />
            </div>
            <input type="file" ref={fileInputRef} accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
            <button
              type="button"
              className="btn-secondary"
              disabled={uploadingImage || (form.images?.length || 0) >= MAX_IMAGES}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingImage ? <><Loader size={16} className="spin" /> {t('common.saving')}</> : <><Upload size={16} /> {t('products.uploadImage')}</>}
            </button>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><Loader size={16} className="spin" /> {t('common.saving')}</> : <><Save size={16} /> {t('common.save')}</>}
            </button>
          </div>
        </form>

        {/* Verknüpfte Produkte – nur bei bestehenden Produkten (braucht eine ID). */}
        {editing !== 'new' && editing?.id && (
          <ProductRelations productId={editing.id} providerId={provider.id} lang={lang} />
        )}
      </div>
    )
  }

  // ---- Product List ----
  const productLimit  = access.limits.maxProducts
  const limitReached  = products.length >= productLimit
  const remaining     = Number.isFinite(productLimit) ? productLimit - products.length : null

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('products.titleCount')} ({products.length}{selected.size > 0 ? ', ' + t('products.selectedSuffix', { n: selected.size }) : ''})</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selected.size > 0 && (
            <>
              <button className="btn-secondary" onClick={clearSelection}>
                <X size={16} /> {t('products.deselectAll')}
              </button>
              <button className="btn-secondary" onClick={() => exportEquipmentXlsx(
                products.filter(p => selected.has(p.id)).map(p => ({
                  name: p.name, manufacturer: p.manufacturer, part_number: p.part_number, quantity: p.stock_quantity,
                })),
                'skipily-produkte-auswahl.xlsx'
              )} title={t('products.exportXlsxTitle')}>
                <FileSpreadsheet size={16} /> {t('products.exportXlsx')}
              </button>
              <button className="btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <><Loader size={16} className="spin" /> {t('products.deleting')}</> : <><Trash2 size={16} /> {t('products.deleteN', { n: selected.size })}</>}
              </button>
            </>
          )}
          <a className="btn-secondary" href="/skipily-produkte-vorlage.xlsx" download
             style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
             title={t('products.xlsxTemplateTitle')}>
            <FileSpreadsheet size={16} /> {t('products.xlsxTemplate')}
          </a>
          <button className="btn-secondary" onClick={downloadCsvTemplate} title={t('products.csvTemplateTitle')}>
            <Download size={16} /> {t('products.csvTemplate')}
          </button>
          <button
            className="btn-secondary"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting || limitReached}
            title={limitReached ? t('products.limitReachedImportTitle') : t('products.csvImportTitle')}
          >
            {csvImporting
              ? <><Loader size={16} className="spin" /> {t('products.importing')}</>
              : <><FileSpreadsheet size={16} /> {t('products.importCsvExcel')}</>}
          </button>
          {products.length > 0 && (
            <button className="btn-secondary" onClick={exportProducts} disabled={exporting}
              title={t('products.exportTitle')}>
              {exporting
                ? <><Loader size={16} className="spin" /> {t('products.exporting')}</>
                : <><Download size={16} /> {t('products.exportProducts')}</>}
            </button>
          )}
          <input
            type="file"
            ref={csvInputRef}
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleCsvUpload}
            style={{ display: 'none' }}
          />
          {limitReached ? (
            <Link
              to="/profile"
              className="btn-primary"
              style={{ background: '#15803d', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
              title={t('products.standardMaxTitle', { n: productLimit })}
            >
              <Lock size={16} /> {t('products.limitReachedBtn')}
            </Link>
          ) : (
            <button className="btn-primary" onClick={() => { setEditing('new'); setForm(emptyForm()); setMessage(null) }}>
              <Plus size={16} /> {t('products.newProduct')}
            </button>
          )}
        </div>
      </div>

      {/* Kategorie-Referenz für den CSV-Import: gültige Werte für die Spalte „category" */}
      {importCategoryOptions.length > 0 && (
        <details style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#334155',
        }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            {t('products.csvCategoriesTitle')}
          </summary>
          <p style={{ margin: '8px 0 10px', color: '#64748b' }}>
            {t('products.csvCategoriesHint')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {importCategoryOptions.map(c => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: c.isParent ? '#eef2ff' : '#fff',
                border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '4px 8px', whiteSpace: 'nowrap',
                fontWeight: c.isParent ? 700 : 400,
              }}>
                {!c.isParent && <span style={{ color: '#cbd5e1' }}>↳</span>}
                <span>{c.name_en}</span>
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Limit-Hinweis für Standard-Provider */}
      {access.isStandard && (
        <div style={{
          padding: '10px 14px',
          background: limitReached ? '#fef3c7' : '#f0fdf4',
          border: `1px solid ${limitReached ? '#fde68a' : '#bbf7d0'}`,
          borderRadius: 8,
          fontSize: 13,
          color: limitReached ? '#854d0e' : '#15803d',
          marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span>
            {limitReached
              ? t('products.limitBannerReached', { a: products.length, b: productLimit })
              : t('products.limitBannerFree', { r: remaining, b: productLimit })
            }
          </span>
          <Link to="/profile" style={{ color: limitReached ? '#92400e' : '#166534', fontWeight: 600, textDecoration: 'underline' }}>
            {t('products.upgradeNow')}
          </Link>
        </div>
      )}

      {message && <div className={`message message-${message.type}`}>{message.text}</div>}

      {csvResult && (
        <div className={`message message-${csvResult.failed.length === 0 ? 'success' : 'warning'}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>
              {t('products.csvResultOk', { n: csvResult.ok })}
              {csvResult.updated > 0 && ` · ${t('products.csvResultUpdated', { n: csvResult.updated })}`}
              {csvResult.stock > 0 && ` · ${t('products.csvResultStock', { n: csvResult.stock })}`}
              {csvResult.failed.length > 0 && t('products.csvResultFailed', { n: csvResult.failed.length })}
            </strong>
            <button className="btn-icon" onClick={() => setCsvResult(null)} title={t('common.close')}>
              <X size={16} />
            </button>
          </div>
          {csvResult.failed.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer' }}>{t('products.errorDetails')}</summary>
              <ul style={{ margin: '8px 0 0 16px', fontSize: 13, maxHeight: 200, overflowY: 'auto' }}>
                {csvResult.failed.slice(0, 50).map((f, i) => (
                  <li key={i}>{t('products.row')} {f.row}: {f.error}</li>
                ))}
                {csvResult.failed.length > 50 && <li>{t('products.moreErrors', { n: csvResult.failed.length - 50 })}</li>}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="search-bar">
        <Search size={18} />
        <input
          placeholder={t('products.searchPh')}
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
              ? <><CheckSquare size={16} /> {t('products.unselectAll')}</>
              : <><Square size={16} /> {t('products.selectAll')} ({filteredProducts.length})</>}
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state">
          <Package size={48} />
          <p>{search ? t('products.noneFound') : t('products.emptyList')}</p>
          {!search && (
            <button className="btn-primary" onClick={() => { setEditing('new'); setForm(emptyForm()) }}>
              <Plus size={16} /> {t('products.firstProduct')}
            </button>
          )}
        </div>
      ) : (
        <>
        {lowStockCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 14, marginBottom: 12, fontWeight: 600 }}>
            ⚠ {t('products.lowStockBanner', { n: lowStockCount })}
          </div>
        )}
        <div className="product-grid">
          {sortedProducts.map(product => {
            const isSel = selected.has(product.id)
            const low = isLowStock(product)
            return (
            <div key={product.id} className={`product-card ${!product.is_active ? 'inactive' : ''} ${isSel ? 'selected' : ''} ${low ? 'low-stock' : ''}`}
              style={{
                ...(isSel ? { outline: '2px solid #f97316', outlineOffset: 2 } : {}),
                ...(low ? { boxShadow: 'inset 5px 0 0 #ef4444', background: '#fff5f5' } : {}),
              }}>
              <button
                type="button"
                className="btn-icon"
                onClick={() => toggleSelect(product.id)}
                title={isSel ? t('products.deselect') : t('products.select')}
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
                {low && (
                  <span className="badge" style={{ background: '#ef4444', color: '#fff', marginBottom: 6, display: 'inline-block', fontWeight: 700 }}>
                    ⚠ {t('products.lowStock')} ({Number(product.stock_quantity) || 0})
                  </span>
                )}
                <h3>{product.name}</h3>
                {product.manufacturer && <span className="product-manufacturer">{product.manufacturer}</span>}
                <div className="product-meta">
                  <span className="product-price">{product.price ? `${Number(product.price).toFixed(2)} €` : '–'}</span>
                  <span className={`badge ${product.in_stock ? 'badge-confirmed' : 'badge-cancelled'}`}>
                    {product.in_stock ? `${product.stock_quantity || '?'} ` + t('products.pcs') : t('products.notDeliverable')}
                  </span>
                </div>
                {!product.is_active && <span className="badge badge-pending">{t('products.inactive')}</span>}
              </div>
              <div className="product-actions">
                <button className="btn-icon" title={t('products.editTitle')} onClick={() => startEdit(product)}>
                  <Pencil size={16} />
                </button>
                <button className="btn-icon btn-danger" title={t('products.deleteTitle')} onClick={() => handleDelete(product)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )})}
        </div>
        </>
      )}

      {importReview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div style={{ background:'#fff', borderRadius:12, maxWidth:720, width:'100%', maxHeight:'85vh', overflow:'auto', padding:20 }}>
            <h3 style={{ marginTop:0 }}>{t('products.reviewTitle')}</h3>
            <p style={{ color:'#475569', fontSize:14 }}>{t('products.reviewIntro')}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:12, margin:'12px 0' }}>
              {importReview.rows.map(r => {
                const d = importReview.decisions[r.index] || { action:'update', part_number:'' }
                const setD = (patch) => setImportReview(prev => ({ ...prev, decisions: { ...prev.decisions, [r.index]: { ...d, ...patch } } }))
                return (
                  <div key={r.index} style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:12 }}>
                    <div style={{ fontWeight:600 }}>{r.name}{r.manufacturer ? ` · ${r.manufacturer}` : ''}</div>
                    <div style={{ fontSize:13, color:'#64748b', marginBottom:8 }}>
                      {t('products.reviewMatch', { name: r.existingName })}
                      {(r.existingStock != null || r.newStock != null) && ` · ${t('products.reviewStock', { old: r.existingStock ?? '—', new: r.newStock ?? '—' })}`}
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                      <input type="text" value={d.part_number} onChange={e => setD({ part_number: e.target.value })}
                        placeholder={t('products.reviewArticlePlaceholder')}
                        style={{ flex:'1 1 200px', padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:6 }} />
                      <select value={d.action} onChange={e => setD({ action: e.target.value })}
                        style={{ padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:6 }}>
                        <option value="update">{t('products.reviewActionUpdate')}</option>
                        <option value="add_stock">{t('products.reviewActionStock')}</option>
                        <option value="new">{t('products.reviewActionNew')}</option>
                        <option value="skip">{t('products.reviewActionSkip')}</option>
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button className="btn-secondary" onClick={() => { setImportReview(null); setCsvImporting(false) }}>{t('common.cancel')}</button>
              <button className="btn-primary" onClick={async () => {
                const { payloads, decisions, parseFailed } = importReview
                setImportReview(null)
                await commitImport(payloads, decisions, parseFailed)
              }}>{t('products.reviewConfirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
