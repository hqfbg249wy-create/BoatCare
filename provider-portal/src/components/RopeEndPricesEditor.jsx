import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { ROPE_END_OPTIONS } from '../lib/ropeOptions'
import { Save, Loader } from 'lucide-react'

// Wiederverwendbarer Enden-Preiskatalog je Anbieter (provider_rope_end_prices).
// Bef�llt den Tauwerk-Angebots-Builder vor; je Angebot weiter �nderbar.
export default function RopeEndPricesEditor({ provider }) {
  const { t } = useT()
  const [prices, setPrices] = useState({}) // end_option -> string
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!provider?.id) return
    supabase.from('provider_rope_end_prices').select('end_option, price').eq('provider_id', provider.id)
      .then(({ data }) => {
        const m = {}
        for (const r of data || []) m[r.end_option] = String(r.price).replace('.', ',')
        setPrices(m)
      })
  }, [provider?.id])

  async function save() {
    if (!provider?.id) return
    setSaving(true); setMsg(null)
    try {
      const rows = ROPE_END_OPTIONS
        .filter(o => (prices[o] ?? '').toString().trim() !== '')
        .map(o => ({ provider_id: provider.id, end_option: o, price: parseFloat(String(prices[o]).replace(',', '.')) || 0, currency: 'EUR', updated_at: new Date().toISOString() }))
      // Entfernte (leer gesetzte) Optionen loeschen.
      const keep = rows.map(r => r.end_option)
      const toDelete = ROPE_END_OPTIONS.filter(o => !keep.includes(o))
      if (toDelete.length) await supabase.from('provider_rope_end_prices').delete().eq('provider_id', provider.id).in('end_option', toDelete)
      if (rows.length) {
        const { error } = await supabase.from('provider_rope_end_prices').upsert(rows, { onConflict: 'provider_id,end_option' })
        if (error) throw error
      }
      setMsg({ type: 'success', text: t('ropePrices.saved') })
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>{t('ropePrices.title')}</h2>
      <p className="hint" style={{ marginTop: 0 }}>{t('ropePrices.hint')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8, alignItems: 'center' }}>
        {ROPE_END_OPTIONS.map(o => (
          <div key={o} style={{ display: 'contents' }}>
            <label style={{ fontSize: 13 }}>{t('rope.end.' + o)}</label>
            <input inputMode="decimal" placeholder="0,00 €" value={prices[o] || ''}
              onChange={e => setPrices(prev => ({ ...prev, [o]: e.target.value }))}
              style={{ width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <><Loader size={16} className="spin" /> {t('pf.k60')}</> : <><Save size={16} /> {t('pf.k55')}</>}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.type === 'error' ? '#dc2626' : '#16a34a' }}>{msg.text}</span>}
      </div>
    </div>
  )
}
