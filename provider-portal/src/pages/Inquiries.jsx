import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Inbox, Send, CheckCircle, Package } from 'lucide-react'
import { useT } from '../i18n'

// Anfragen der Kunden an diesen Betrieb + strukturiertes Angebot (Preis) abgeben.
// Der Kunde kann das Angebot in der App annehmen und ueber Stripe bezahlen.
export default function Inquiries() {
  const { provider } = useAuth()
  const { t } = useT()
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState({})     // inquiryId -> { amount, shipping, description, reply }
  const [sendingId, setSendingId] = useState(null)
  const [message, setMessage] = useState(null)

  const load = useCallback(async () => {
    if (!provider) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('service_inquiries')
        .select('*, boats(id, name), profiles:owner_id(full_name)')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setInquiries(data || [])
    } catch (err) {
      console.error('Inquiries load error:', err)
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setLoading(false)
    }
  }, [provider, t])

  useEffect(() => { load() }, [load])

  function setField(id, field, value) {
    setForms(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))
  }

  async function sendOffer(inq) {
    const f = forms[inq.id] || {}
    const amount = parseFloat(String(f.amount || '').replace(',', '.'))
    if (!(amount > 0) || !f.description) {
      setMessage({ type: 'error', text: t('inquiries.offerNeedsFields') })
      return
    }
    setSendingId(inq.id)
    try {
      const { data, error } = await supabase.functions.invoke('make-offer', {
        body: {
          inquiry_id: inq.id,
          amount,
          shipping: parseFloat(String(f.shipping || '0').replace(',', '.')) || 0,
          currency: 'EUR',
          description: f.description,
          reply: f.reply || null,
        },
      })
      if (error) {
        let msg = error.message
        try { const b = await error.context?.json?.(); if (b?.error) msg = b.error } catch { /* ignore */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      setMessage({ type: 'success', text: t('inquiries.offerSent') })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setSendingId(null)
    }
  }

  const money = (v) => (Number(v) || 0).toFixed(2).replace('.', ',') + ' EUR'

  return (
    <div className="page">
      <div className="page-header">
        <h1><Inbox size={22} style={{ verticalAlign: '-4px', marginRight: 8 }} />{t('inquiries.title')}</h1>
        <p className="page-subtitle">{t('inquiries.subtitle')}</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} onClick={() => setMessage(null)}>{message.text}</div>
      )}

      {loading ? (
        <p>{t('common.loading')}</p>
      ) : inquiries.length === 0 ? (
        <div className="empty-state"><Inbox size={40} /><p>{t('inquiries.empty')}</p></div>
      ) : (
        <div className="card-list">
          {inquiries.map(inq => {
            const f = forms[inq.id] || {}
            const buyer = inq.profiles?.full_name || t('inquiries.customer')
            const ordered = inq.offer_status === 'ordered'
            const offered = inq.offer_status === 'offered'
            return (
              <div key={inq.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong>{inq.subject || t('inquiries.noSubject')}</strong>
                    <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                      {buyer}{inq.boats?.name ? ' · ' + inq.boats.name : ''}
                    </div>
                  </div>
                  {ordered && (
                    <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', whiteSpace: 'nowrap' }}>
                      <Package size={13} /> {t('inquiries.ordered')}
                    </span>
                  )}
                  {offered && (
                    <span className="badge" style={{ background: '#dcfce7', color: '#166534', whiteSpace: 'nowrap' }}>
                      <CheckCircle size={13} /> {t('inquiries.offered')} {money(inq.offer_amount)}
                    </span>
                  )}
                </div>

                {inq.message && (
                  <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 14 }}>{inq.message}</p>
                )}

                {!ordered && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('inquiries.makeOffer')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label>{t('inquiries.price')}
                        <input type="text" inputMode="decimal" value={f.amount || ''}
                          onChange={e => setField(inq.id, 'amount', e.target.value)} placeholder="0,00" />
                      </label>
                      <label>{t('inquiries.shipping')}
                        <input type="text" inputMode="decimal" value={f.shipping || ''}
                          onChange={e => setField(inq.id, 'shipping', e.target.value)} placeholder="0,00" />
                      </label>
                    </div>
                    <label>{t('inquiries.offerDescription')}
                      <textarea rows={2} value={f.description || ''}
                        onChange={e => setField(inq.id, 'description', e.target.value)}
                        placeholder={t('inquiries.offerDescriptionPlaceholder')} />
                    </label>
                    <label>{t('inquiries.replyOptional')}
                      <textarea rows={2} value={f.reply || ''}
                        onChange={e => setField(inq.id, 'reply', e.target.value)} />
                    </label>
                    <button className="btn btn-primary" disabled={sendingId === inq.id}
                      onClick={() => sendOffer(inq)} style={{ marginTop: 8 }}>
                      <Send size={15} /> {sendingId === inq.id ? t('common.sending') : t('inquiries.sendOffer')}
                    </button>
                    {offered && (
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>
                        {t('inquiries.offerResendHint')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
