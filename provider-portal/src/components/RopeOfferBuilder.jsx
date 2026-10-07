import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { ROPE_END_OPTIONS, ROPE_MATERIALS } from '../lib/ropeOptions'
import { Plus, Trash2, Send } from 'lucide-react'

// Tauwerk-Angebots-Builder: bis zu 3 Varianten aus der Tauwerk-Konfiguration.
// Material + Preis aus dem Shop, Enden-Festpreise aus dem Anbieter-Katalog,
// Rabatt, Versand (fest/Engine), Zusatzpositionen. Senden via make-rope-offer.
const MAX_VARIANTS = 3
const num = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0
const money = (n, cur = 'EUR') => (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' ' + cur

function emptyVariant(cfg, i) {
  return {
    title: `Variante ${i + 1}`,
    length_m: cfg?.length_m ?? '',
    diameter_mm: cfg?.diameter_mm ?? '',
    material: cfg?.material ?? '',
    end1: cfg?.end1 ?? '',
    end2: cfg?.end2 ?? '',
    material_product_id: cfg?.matched_product_id ?? '',
    material_variant_id: '',
    material_unit_price: '',
    end1_price: '',
    end2_price: '',
    custom: [],
    discount_type: '',
    discount_value: '',
    discount_label: '',
    shipping_mode: 'fixed',
    shipping_cost: '',
  }
}

export default function RopeOfferBuilder({ inquiry, provider, onSent }) {
  const { t } = useT()
  const cfg = inquiry.rope_config || {}
  const defaultLetter =
    'Sehr geehrte/r #Anrede #Vorname #Nachname,\n\n' +
    'vielen Dank für Ihre Angebotsanfrage. Anliegend finden Sie die aus unserer Sicht ' +
    'sinnvollen Optionen für Ihre Anfrage.\n\nMit freundlichen Grüßen\n#Anbieter'
  const [coverLetter, setCoverLetter] = useState(defaultLetter)
  const [variants, setVariants] = useState([emptyVariant(cfg, 0)])
  const [products, setProducts] = useState([])
  const [variantsByProduct, setVariantsByProduct] = useState({}) // productId -> [{id, label, price}]
  const [endPrices, setEndPrices] = useState({}) // end_option -> price
  const [endLabels, setEndLabels] = useState({}) // end_option -> eigenes Label
  const [matLabels, setMatLabels] = useState({}) // material_key -> eigenes Label
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!provider) return
    ;(async () => {
      const { data: prods } = await supabase
        .from('metashop_products')
        .select('id, name, price, currency, variant_options')
        .eq('provider_id', provider.id)
        .order('name')
      setProducts(prods || [])
      const { data: ep } = await supabase
        .from('provider_rope_end_prices')
        .select('end_option, price, label')
        .eq('provider_id', provider.id)
      const m = {}, lbl = {}
      for (const r of ep || []) { m[r.end_option] = r.price; if (r.label) lbl[r.end_option] = r.label }
      setEndPrices(m); setEndLabels(lbl)
      const { data: ml } = await supabase
        .from('provider_rope_material_labels')
        .select('material_key, label')
        .eq('provider_id', provider.id)
      const mm = {}
      for (const r of ml || []) if (r.label) mm[r.material_key] = r.label
      setMatLabels(mm)
    })()
  }, [provider])

  // Eigene Begriffe bevorzugen, sonst Standard-Label.
  const endLabel = (o) => endLabels[o] || t('rope.end.' + o)
  const matLabel = (m) => matLabels[m] || t('rope.material.' + m)
  // Eigene (zusaetzliche) Materialien aus den Stammdaten.
  const customMaterials = useMemo(() => Object.keys(matLabels).filter(k => !ROPE_MATERIALS.includes(k)), [matLabels])

  // Produktvarianten (Preise) bei Bedarf nachladen.
  async function ensureProductVariants(productId) {
    if (!productId || variantsByProduct[productId]) return
    const { data } = await supabase
      .from('product_variants')
      .select('id, attributes, price')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('sort_order')
    const list = (data || []).map(v => ({
      id: v.id,
      label: Object.values(v.attributes || {}).join(' / ') || '—',
      price: v.price,
    }))
    setVariantsByProduct(prev => ({ ...prev, [productId]: list }))
  }

  useEffect(() => {
    // beim Start die vorbefüllten Produkte laden
    for (const v of variants) if (v.material_product_id) ensureProductVariants(v.material_product_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patch(vi, p) { setVariants(prev => prev.map((v, i) => i === vi ? { ...v, ...p } : v)) }

  function onSelectProduct(vi, productId) {
    patch(vi, { material_product_id: productId, material_variant_id: '', material_unit_price: '' })
    if (productId) {
      ensureProductVariants(productId)
      const p = products.find(x => x.id === productId)
      if (p && p.price != null) patch(vi, { material_unit_price: String(p.price).replace('.', ',') })
    }
  }
  function onSelectVariant(vi, variantId) {
    const v = variants[vi]
    const list = variantsByProduct[v.material_product_id] || []
    const pv = list.find(x => x.id === variantId)
    patch(vi, { material_variant_id: variantId, material_unit_price: pv?.price != null ? String(pv.price).replace('.', ',') : variants[vi].material_unit_price })
  }
  function onSelectEnd(vi, which, endKey) {
    const priceKey = which === 1 ? 'end1_price' : 'end2_price'
    const p = endPrices[endKey]
    patch(vi, { [which === 1 ? 'end1' : 'end2']: endKey, [priceKey]: p != null ? String(p).replace('.', ',') : '' })
  }

  function calc(v) {
    const matLine = num(v.length_m) * num(v.material_unit_price)
    const e1 = v.end1 ? num(v.end1_price) : 0
    const e2 = v.end2 ? num(v.end2_price) : 0
    const custom = (v.custom || []).reduce((s, c) => s + num(c.qty) * num(c.price), 0)
    const subtotal = matLine + e1 + e2 + custom
    const disc = v.discount_type === 'percent' ? subtotal * num(v.discount_value) / 100
      : v.discount_type === 'amount' ? num(v.discount_value) : 0
    const ship = v.shipping_mode === 'fixed' ? num(v.shipping_cost) : 0
    const total = Math.max(0, subtotal - disc) + ship
    return { matLine, e1, e2, custom, subtotal, disc, ship, total }
  }

  const prodName = (id) => products.find(p => p.id === id)?.name || ''

  async function send() {
    setErr(null)
    // Payload bauen
    const payloadVariants = variants.map((v, vi) => {
      const items = []
      if (v.material_product_id && num(v.length_m) > 0) {
        const pvLabel = (variantsByProduct[v.material_product_id] || []).find(x => x.id === v.material_variant_id)?.label
        items.push({
          kind: 'material',
          label: `${prodName(v.material_product_id)}${pvLabel ? ' (' + pvLabel + ')' : ''} · ${String(v.length_m).replace('.', ',')} m`,
          qty: num(v.length_m), unit_price: num(v.material_unit_price),
          product_id: v.material_product_id, product_variant_id: v.material_variant_id || null,
        })
      }
      if (v.end1) items.push({ kind: 'end1', label: `${t('ropeOffer.end1')}: ${endLabel(v.end1)}`, qty: 1, unit_price: num(v.end1_price) })
      if (v.end2) items.push({ kind: 'end2', label: `${t('ropeOffer.end2')}: ${endLabel(v.end2)}`, qty: 1, unit_price: num(v.end2_price) })
      for (const c of (v.custom || [])) if ((c.label || '').trim()) items.push({ kind: 'custom', label: c.label.trim(), qty: num(c.qty) || 1, unit_price: num(c.price) })
      return {
        title: v.title, length_m: num(v.length_m) || null, diameter_mm: num(v.diameter_mm) || null,
        material: v.material || null, end1: v.end1 || null, end2: v.end2 || null,
        material_product_id: v.material_product_id || null, material_variant_id: v.material_variant_id || null,
        items,
        discount_type: v.discount_type || null, discount_value: num(v.discount_value), discount_label: v.discount_label || null,
        shipping_mode: v.shipping_mode, shipping_cost: num(v.shipping_cost),
      }
    })
    if (payloadVariants.some(v => v.items.length === 0)) { setErr(t('ropeOffer.errEmpty')); return }
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('make-rope-offer', {
        body: { inquiry_id: inquiry.id, cover_letter: coverLetter, variants: payloadVariants },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      onSent?.()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setSending(false)
    }
  }

  const inStyle = { width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }

  return (
    <div className="rope-offer-builder" style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff', marginTop: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('ropeOffer.title')}</div>

      <label style={{ fontSize: 13, fontWeight: 600 }}>{t('ropeOffer.coverLetter')}</label>
      <textarea rows={5} value={coverLetter} onChange={e => setCoverLetter(e.target.value)} style={{ ...inStyle, marginTop: 4, resize: 'vertical' }} />
      <div style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 12px' }}>{t('ropeOffer.placeholders')}</div>

      {variants.map((v, vi) => {
        const c = calc(v)
        const pvs = variantsByProduct[v.material_product_id] || []
        return (
          <div key={vi} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <input value={v.title} onChange={e => patch(vi, { title: e.target.value })} style={{ ...inStyle, fontWeight: 600, maxWidth: 220 }} />
              {variants.length > 1 && (
                <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setVariants(prev => prev.filter((_, i) => i !== vi))}>
                  <Trash2 size={14} /> {t('ropeOffer.removeVariant')}
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.length')}</label>
                <input value={v.length_m} onChange={e => patch(vi, { length_m: e.target.value })} inputMode="decimal" style={inStyle} /></div>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.diameter')}</label>
                <input value={v.diameter_mm} onChange={e => patch(vi, { diameter_mm: e.target.value })} inputMode="decimal" style={inStyle} /></div>
            </div>

            <div style={{ marginTop: 8 }}><label style={{ fontSize: 12 }}>{t('ropeOffer.material')}</label>
              <select value={v.material} onChange={e => patch(vi, { material: e.target.value })} style={inStyle}>
                <option value="">{t('rope.materialNone')}</option>
                {ROPE_MATERIALS.map(m => <option key={m} value={m}>{matLabel(m)}</option>)}
                {customMaterials.map(m => <option key={m} value={m}>{matLabels[m]}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.materialProduct')}</label>
                <select value={v.material_product_id} onChange={e => onSelectProduct(vi, e.target.value)} style={inStyle}>
                  <option value="">{t('ropeOffer.selectProduct')}</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.materialVariant')}</label>
                <select value={v.material_variant_id} onChange={e => onSelectVariant(vi, e.target.value)} style={inStyle} disabled={!pvs.length}>
                  <option value="">—</option>
                  {pvs.map(pv => <option key={pv.id} value={pv.id}>{pv.label}</option>)}
                </select></div>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.unitPricePerM')}</label>
                <input value={v.material_unit_price} onChange={e => patch(vi, { material_unit_price: e.target.value })} inputMode="decimal" style={inStyle} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.end1')}</label>
                <select value={v.end1} onChange={e => onSelectEnd(vi, 1, e.target.value)} style={inStyle}>
                  <option value="">{t('rope.endNone')}</option>
                  {ROPE_END_OPTIONS.map(o => <option key={o} value={o}>{endLabel(o)}</option>)}
                </select></div>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.endPrice')}</label>
                <input value={v.end1_price} onChange={e => patch(vi, { end1_price: e.target.value })} inputMode="decimal" style={inStyle} disabled={!v.end1} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.end2')}</label>
                <select value={v.end2} onChange={e => onSelectEnd(vi, 2, e.target.value)} style={inStyle}>
                  <option value="">{t('rope.endNone')}</option>
                  {ROPE_END_OPTIONS.map(o => <option key={o} value={o}>{endLabel(o)}</option>)}
                </select></div>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.endPrice')}</label>
                <input value={v.end2_price} onChange={e => patch(vi, { end2_price: e.target.value })} inputMode="decimal" style={inStyle} disabled={!v.end2} /></div>
            </div>

            {/* Zusatzpositionen */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t('ropeOffer.customItems')}</div>
              {(v.custom || []).map((c, ci) => (
                <div key={ci} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                  <input placeholder={t('ropeOffer.itemLabel')} value={c.label} onChange={e => patch(vi, { custom: v.custom.map((x, j) => j === ci ? { ...x, label: e.target.value } : x) })} style={inStyle} />
                  <input placeholder={t('ropeOffer.qty')} value={c.qty} onChange={e => patch(vi, { custom: v.custom.map((x, j) => j === ci ? { ...x, qty: e.target.value } : x) })} inputMode="decimal" style={inStyle} />
                  <input placeholder={t('ropeOffer.price')} value={c.price} onChange={e => patch(vi, { custom: v.custom.map((x, j) => j === ci ? { ...x, price: e.target.value } : x) })} inputMode="decimal" style={inStyle} />
                  <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => patch(vi, { custom: v.custom.filter((_, j) => j !== ci) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => patch(vi, { custom: [...(v.custom || []), { label: '', qty: '1', price: '' }] })}>
                <Plus size={14} /> {t('ropeOffer.addCustom')}
              </button>
            </div>

            {/* Rabatt + Versand */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.discount')}</label>
                <select value={v.discount_type} onChange={e => patch(vi, { discount_type: e.target.value })} style={inStyle}>
                  <option value="">—</option>
                  <option value="percent">{t('ropeOffer.discountPercent')}</option>
                  <option value="amount">{t('ropeOffer.discountAmount')}</option>
                </select></div>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.price')}</label>
                <input value={v.discount_value} onChange={e => patch(vi, { discount_value: e.target.value })} inputMode="decimal" style={inStyle} disabled={!v.discount_type} /></div>
              <div><label style={{ fontSize: 12 }}>{t('ropeOffer.itemLabel')}</label>
                <input value={v.discount_label} onChange={e => patch(vi, { discount_label: e.target.value })} style={inStyle} disabled={!v.discount_type} /></div>
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12 }}>{t('ropeOffer.shipping')}</label>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 2 }}>
                <label style={{ fontSize: 13 }}><input type="radio" checked={v.shipping_mode === 'fixed'} onChange={() => patch(vi, { shipping_mode: 'fixed' })} /> {t('ropeOffer.shippingFixed')}</label>
                <label style={{ fontSize: 13 }}><input type="radio" checked={v.shipping_mode === 'engine'} onChange={() => patch(vi, { shipping_mode: 'engine' })} /> {t('ropeOffer.shippingEngine')}</label>
                {v.shipping_mode === 'fixed' && (
                  <input value={v.shipping_cost} onChange={e => patch(vi, { shipping_cost: e.target.value })} inputMode="decimal" placeholder="0,00" style={{ ...inStyle, maxWidth: 120 }} />
                )}
              </div>
            </div>

            <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 10, color: '#0f172a' }}>
              {t('ropeOffer.total')}: {money(c.total)}{v.shipping_mode === 'engine' ? ' + ' + t('ropeOffer.shippingByAddress') : ''}
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {variants.length < MAX_VARIANTS && (
          <button className="btn-secondary" onClick={() => setVariants(prev => [...prev, emptyVariant(cfg, prev.length)])}>
            <Plus size={16} /> {t('ropeOffer.addVariant')}
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {err && <span style={{ color: '#dc2626', fontSize: 13 }}>{err}</span>}
          <button className="btn-primary" onClick={send} disabled={sending}>
            <Send size={16} /> {sending ? '…' : t('ropeOffer.send')}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{t('ropeOffer.endPricesHint')}</div>
    </div>
  )
}
