import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { ROPE_END_OPTIONS, ROPE_MATERIALS } from '../lib/ropeOptions'
import { Save, Loader } from 'lucide-react'

// Voreinstellungen für Angebote (Tauwerk): Enden-Festpreise + anpassbare
// Begriffe für Enden + Materialien. Die Bezeichnung ist bereits mit dem
// Standardbegriff vorbefüllt und direkt im selben Feld editierbar (eine Spalte).
// Key bleibt stabil; weicht das Label vom Standard ab, wird es gespeichert.
export default function RopeEndPricesEditor({ provider }) {
  const { t } = useT()
  const endDefault = (o) => t('rope.end.' + o)
  const matDefault = (m) => t('rope.material.' + m)
  const [ends, setEnds] = useState({})   // key -> { label, price } (Strings)
  const [mats, setMats] = useState({})   // key -> label (String)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!provider?.id) return
    ;(async () => {
      const { data: ep } = await supabase.from('provider_rope_end_prices')
        .select('end_option, price, label').eq('provider_id', provider.id)
      const dbEnd = {}
      for (const r of ep || []) dbEnd[r.end_option] = r
      const e = {}
      for (const o of ROPE_END_OPTIONS) {
        e[o] = {
          label: dbEnd[o]?.label || endDefault(o),
          price: dbEnd[o]?.price != null ? String(dbEnd[o].price).replace('.', ',') : '',
        }
      }
      setEnds(e)

      const { data: ml } = await supabase.from('provider_rope_material_labels')
        .select('material_key, label').eq('provider_id', provider.id)
      const dbMat = {}
      for (const r of ml || []) dbMat[r.material_key] = r.label
      const m = {}
      for (const k of ROPE_MATERIALS) m[k] = dbMat[k] || matDefault(k)
      setMats(m)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id])

  const setEnd = (k, field, val) => setEnds(prev => ({ ...prev, [k]: { ...(prev[k] || { label: '', price: '' }), [field]: val } }))

  async function save() {
    if (!provider?.id) return
    setSaving(true); setMsg(null)
    try {
      // Enden: Zeile behalten, wenn ein Preis gesetzt ist ODER das Label vom
      // Standard abweicht. Label nur speichern, wenn abweichend (sonst null).
      const endRows = []
      const endDel = []
      for (const o of ROPE_END_OPTIONS) {
        const lbl = (ends[o]?.label || '').trim()
        const priceStr = (ends[o]?.price ?? '').toString().trim()
        const custom = lbl && lbl !== endDefault(o) ? lbl : null
        if (priceStr !== '' || custom) {
          endRows.push({
            provider_id: provider.id, end_option: o,
            price: parseFloat(priceStr.replace(',', '.')) || 0,
            label: custom, currency: 'EUR', updated_at: new Date().toISOString(),
          })
        } else {
          endDel.push(o)
        }
      }
      if (endDel.length) await supabase.from('provider_rope_end_prices').delete().eq('provider_id', provider.id).in('end_option', endDel)
      if (endRows.length) {
        const { error } = await supabase.from('provider_rope_end_prices').upsert(endRows, { onConflict: 'provider_id,end_option' })
        if (error) throw error
      }

      // Materialien: Label nur speichern, wenn abweichend.
      const matRows = []
      const matDel = []
      for (const k of ROPE_MATERIALS) {
        const lbl = (mats[k] || '').trim()
        if (lbl && lbl !== matDefault(k)) matRows.push({ provider_id: provider.id, material_key: k, label: lbl, updated_at: new Date().toISOString() })
        else matDel.push(k)
      }
      if (matDel.length) await supabase.from('provider_rope_material_labels').delete().eq('provider_id', provider.id).in('material_key', matDel)
      if (matRows.length) {
        const { error } = await supabase.from('provider_rope_material_labels').upsert(matRows, { onConflict: 'provider_id,material_key' })
        if (error) throw error
      }
      setMsg({ type: 'success', text: t('ropePrices.saved') })
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) })
    } finally {
      setSaving(false)
    }
  }

  const inp = { width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8 }

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>{t('ropePrices.hint')}</p>

      <h3 style={{ margin: '12px 0 6px', fontSize: '1rem' }}>{t('ropePrices.endsTitle')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.ownTerm')}</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.priceCol')}</div>
        {ROPE_END_OPTIONS.map(o => (
          <div key={o} style={{ display: 'contents' }}>
            <input value={ends[o]?.label ?? ''} onChange={e => setEnd(o, 'label', e.target.value)} style={inp} />
            <input inputMode="decimal" placeholder="0,00 €" value={ends[o]?.price || ''}
              onChange={e => setEnd(o, 'price', e.target.value)} style={inp} />
          </div>
        ))}
      </div>

      <h3 style={{ margin: '16px 0 6px', fontSize: '1rem' }}>{t('ropePrices.materialsTitle')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.ownTerm')}</div>
        {ROPE_MATERIALS.map(m => (
          <input key={m} value={mats[m] ?? ''} onChange={e => setMats(prev => ({ ...prev, [m]: e.target.value }))} style={inp} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <><Loader size={16} className="spin" /> {t('pf.k60')}</> : <><Save size={16} /> {t('pf.k55')}</>}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.type === 'error' ? '#dc2626' : '#16a34a' }}>{msg.text}</span>}
      </div>
    </div>
  )
}
