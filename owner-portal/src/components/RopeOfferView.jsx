import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { Check, Tag } from 'lucide-react'

// Kundenansicht eines Tauwerk-Angebots: Anschreiben + bis zu 3 Varianten
// (Positionen, Rabatt, Versand, Gesamtpreis). Annahme je Variante -> accept-offer.
const money = (n, c = 'EUR') => `${Number(n || 0).toFixed(2).replace('.', ',')} ${(c || 'EUR').toUpperCase()}`

function renderLetter(tpl, provider, fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  const last = parts.length > 1 ? parts.pop() : ''
  const first = parts.join(' ')
  return (tpl || '')
    .replaceAll('#Anbieter', provider || '')
    .replaceAll('#Vorname', first)
    .replaceAll('#Nachname', last)
    .replaceAll('#Anrede', '')
    .replace(/[ \t]{2,}/g, ' ')
}

export default function RopeOfferView({ inquiry, onAccept, busy }) {
  const { user } = useAuth()
  const { t } = useT()
  const [offer, setOffer] = useState(null)
  const [buyerName, setBuyerName] = useState('')

  useEffect(() => {
    supabase.rpc('get_inquiry_offer', { p_inquiry_id: inquiry.id }).then(({ data }) => setOffer(data || null))
    if (user?.id) supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle().then(({ data }) => setBuyerName(data?.full_name || ''))
  }, [inquiry.id, user?.id])

  if (!offer || !(offer.variants?.length)) return null
  const letter = renderLetter(offer.cover_letter, inquiry.provider?.name, buyerName)

  return (
    <div className="inq-offer-box">
      <div className="inq-offer-head"><Tag size={15} /> {t('inqRope.title')}</div>
      {letter && <p className="inq-offer-desc" style={{ whiteSpace: 'pre-wrap' }}>{letter}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {offer.variants.map(v => {
          const cur = v.currency || 'EUR'
          const engine = v.shipping_mode === 'engine'
          return (
            <div key={v.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{v.title}</div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  {(v.items || []).map(it => (
                    <tr key={it.id}>
                      <td style={{ padding: '2px 0', color: '#475569' }}>{it.label}</td>
                      <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{money(it.line_total, cur)}</td>
                    </tr>
                  ))}
                  {Number(v.discount_value) > 0 && (
                    <tr>
                      <td style={{ padding: '2px 0', color: '#16a34a' }}>{v.discount_label || t('inqRope.discount')}</td>
                      <td style={{ padding: '2px 0', textAlign: 'right', color: '#16a34a' }}>
                        {v.discount_type === 'percent' ? `-${Number(v.discount_value)} %` : `-${money(v.discount_value, cur)}`}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '4px 0', color: '#475569' }}>{t('inqRope.shipping')}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right' }}>{engine ? t('inqRope.shippingByAddress') : money(v.shipping_cost, cur)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                <strong>{t('inqRope.total')}: {money(v.total, cur)}{engine ? ' + ' + t('inqRope.shippingByAddress') : ''}</strong>
                {!inquiry.order_id && (
                  <button className="btn-success btn-sm" disabled={busy} onClick={() => onAccept(v.id)}>
                    <Check size={14} /> {t('inqRope.acceptPay')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
