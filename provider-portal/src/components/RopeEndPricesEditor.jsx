import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { ROPE_END_OPTIONS, ROPE_MATERIALS } from '../lib/ropeOptions'
import { Save, Loader } from 'lucide-react'

// Voreinstellungen für Angebote (Tauwerk): wiederverwendbare Enden-Festpreise
// UND anpassbare Begriffe für Enden + Materialien (Bezeichnungen sind nicht
// überall gleich). Key bleibt stabil, nur das angezeigte Label ändert sich.
// Daten: provider_rope_end_prices (label, price) + provider_rope_material_labels.
export default function RopeEndPricesEditor({ provider }) {
  const { t } = useT()
  const [ends, setEnds] = useState({})   // key -> { label, price } (Strings)
  const [mats, setMats] = useState({})   // key -> label (String)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!provider?.id) return
    ;(async () => {
      const { data: ep } = await supabase.from('provider_rope_end_prices')
        .select('end_option, price, label').eq('provider_id', provider.id)
      const e = {}
      for (const r of ep || []) e[r.end_option] = { label: r.label || '', price: r.price != null ? String(r.price).replace('.', ',') : '' }
      setEnds(e)
      const { data: ml } = await supabase.from('provider_rope_material_labels')
        .select('material_key, label').eq('provider_id', provider.id)
      const m = {}
      for (const r of ml || []) m[r.material_key] = r.label || ''
      setMats(m)
    })()
  }, [provider?.id])

  const setEnd = (k, field, val) => setEnds(prev => ({ ...prev, [k]: { ...(prev[k] || { label: '', price: '' }), [field]: val } }))

  async function save() {
    if (!provider?.id) return
    setSaving(true); setMsg(null)
    try {
      // Enden: Zeile behalten, wenn Preis ODER Label gesetzt.
      const endRows = ROPE_END_OPTIONS
        .filter(o => (ends[o]?.price ?? '').toString().trim() !== '' || (ends[o]?.label ?? '').trim() !== '')
        .map(o => ({
          provider_id: provider.id, end_option: o,
          price: parseFloat(String(ends[o]?.price || '0').replace(',', '.')) || 0,
          label: (ends[o]?.label || '').trim() || null,
          currency: 'EUR', updated_at: new Date().toISOString(),
        }))
      const endKeep = endRows.map(r => r.end_option)
      const endDel = ROPE_END_OPTIONS.filter(o => !endKeep.includes(o))
      if (endDel.length) await supabase.from('provider_rope_end_prices').delete().eq('provider_id', provider.id).in('end_option', endDel)
      if (endRows.length) {
        const { error } = await supabase.from('provider_rope_end_prices').upsert(endRows, { onConflict: 'provider_id,end_option' })
        if (error) throw error
      }
      // Materialien: nur Label.
      const matRows = ROPE_MATERIALS
        .filter(m => (mats[m] ?? '').trim() !== '')
        .map(m => ({ provider_id: provider.id, material_key: m, label: mats[m].trim(), updated_at: new Date().toISOString() }))
      const matKeep = matRows.map(r => r.material_key)
      const matDel = ROPE_MATERIALS.filter(m => !matKeep.includes(m))
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.standardTerm')}</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.ownTerm')}</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.priceCol')}</div>
        {ROPE_END_OPTIONS.map(o => (
          <div key={o} style={{ display: 'contents' }}>
            <label style={{ fontSize: 13 }}>{t('rope.end.' + o)}</label>
            <input value={ends[o]?.label || ''} placeholder={t('rope.end.' + o)}
              onChange={e => setEnd(o, 'label', e.target.value)} style={inp} />
            <input inputMode="decimal" placeholder="0,00 €" value={ends[o]?.price || ''}
              onChange={e => setEnd(o, 'price', e.target.value)} style={inp} />
          </div>
        ))}
      </div>

      <h3 style={{ margin: '16px 0 6px', fontSize: '1rem' }}>{t('ropePrices.materialsTitle')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.standardTerm')}</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('ropePrices.ownTerm')}</div>
        {ROPE_MATERIALS.map(m => (
          <div key={m} style={{ display: 'contents' }}>
            <label style={{ fontSize: 13 }}>{t('rope.material.' + m)}</label>
            <input value={mats[m] || ''} placeholder={t('rope.material.' + m)}
              onChange={e => setMats(prev => ({ ...prev, [m]: e.target.value }))} style={inp} />
          </div>
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
