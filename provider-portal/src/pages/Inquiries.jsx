import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Inbox, Send, CheckCircle, Package, XCircle, Trash2, MessageSquare } from 'lucide-react'
import { useT } from '../i18n'
import RopeOfferBuilder from '../components/RopeOfferBuilder'

// Anfragen der Kunden an diesen Betrieb + strukturiertes Angebot (Preis) abgeben.
// Der Kunde kann das Angebot in der App annehmen und ueber Stripe bezahlen.
export default function Inquiries() {
  const { provider } = useAuth()
  const { t } = useT()
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState({})     // inquiryId -> { amount, shipping, description, reply }
  const [sendingId, setSendingId] = useState(null)
  const [actioningId, setActioningId] = useState(null)
  const [message, setMessage] = useState(null)
  // Rückfragen-Thread (zentral aus der DB): je Anfrage Verlauf + Antwort.
  const [threads, setThreads] = useState({})     // inquiryId -> messages[]
  const [threadOpen, setThreadOpen] = useState({}) // inquiryId -> bool
  const [replyText, setReplyText] = useState({})  // inquiryId -> string
  const [posting, setPosting] = useState(null)
  const [ropeForce, setRopeForce] = useState(() => new Set()) // manuell als Tauwerk-Angebot

  // Tauwerk-Angebot (Varianten-Builder) zeigen: wenn rope_config vorhanden,
  // am Stichwort erkannt oder vom Anbieter manuell gewaehlt.
  const isRopeKeyword = (inq) => /tauwerk|rope|splei|cordage|touw/i.test(`${inq.subject || ''} ${inq.message || ''}`)
  const showRope = (inq) => !!inq.rope_config || ropeForce.has(inq.id) || isRopeKeyword(inq)

  async function loadThread(inqId) {
    const { data } = await supabase.rpc('get_inquiry_thread', { p_inquiry_id: inqId })
    setThreads(prev => ({ ...prev, [inqId]: data || [] }))
    supabase.rpc('mark_inquiry_read', { p_inquiry_id: inqId })
  }
  function toggleThread(inqId) {
    setThreadOpen(prev => {
      const open = !prev[inqId]
      if (open) loadThread(inqId)
      return { ...prev, [inqId]: open }
    })
  }
  async function postReply(inqId) {
    const text = (replyText[inqId] || '').trim()
    if (!text) return
    setPosting(inqId)
    const { error } = await supabase.rpc('post_inquiry_message', { p_inquiry_id: inqId, p_content: text })
    setPosting(null)
    if (error) { setMessage({ type: 'error', text: error.message }); return }
    setReplyText(prev => ({ ...prev, [inqId]: '' }))
    loadThread(inqId)
  }

  const load = useCallback(async () => {
    if (!provider) return
    setLoading(true)
    try {
      // Kein profiles-Join: owner_id hat keinen FK auf profiles und der Kunde
      // ist per RLS ohnehin nicht lesbar. Boot-Name reicht als Kontext.
      const { data, error } = await supabase
        .from('service_inquiries')
        .select('*, boats(id, name)')
        .eq('provider_id', provider.id)
        .eq('provider_archived', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      const list = data || []
      setInquiries(list)
      // Bestehende Angebote ins Formular vorbelegen (fuer "Angebot aendern").
      setForms(prev => {
        const next = { ...prev }
        for (const inq of list) {
          if (inq.offer_amount != null && !next[inq.id]) {
            next[inq.id] = {
              amount: String(inq.offer_amount).replace('.', ','),
              shipping: inq.offer_shipping ? String(inq.offer_shipping).replace('.', ',') : '',
              description: inq.offer_description || '',
              reply: inq.provider_reply || '',
            }
          }
        }
        return next
      })
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

  async function doAction(inq, action, confirmText) {
    if (confirmText && !confirm(confirmText)) return
    setActioningId(inq.id)
    try {
      const { data, error } = await supabase.functions.invoke('provider-inquiry-action', {
        body: { inquiry_id: inq.id, action },
      })
      if (error) {
        let msg = error.message
        try { const b = await error.context?.json?.(); if (b?.error) msg = b.error } catch { /* ignore */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      setMessage({ type: 'success', text: action === 'decline' ? t('inquiries.declined') : t('inquiries.removed') })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setActioningId(null)
    }
  }

  const money = (v) => (Number(v) || 0).toFixed(2).replace('.', ',') + ' EUR'

  return (
    <div className="page">
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <h1><Inbox size={22} style={{ verticalAlign: '-4px', marginRight: 8 }} />{t('inquiries.title')}</h1>
        <p className="subtitle" style={{ marginBottom: 0 }}>{t('inquiries.subtitle')}</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} onClick={() => setMessage(null)}>{message.text}</div>
      )}

      {loading ? (
        <p className="loading">{t('common.loading')}</p>
      ) : inquiries.length === 0 ? (
        <div className="empty-state"><Inbox size={40} /><p>{t('inquiries.empty')}</p></div>
      ) : (
        <div className="inquiry-list">
          {inquiries.map(inq => {
            const f = forms[inq.id] || {}
            const buyer = t('inquiries.customer')
            const ordered = inq.offer_status === 'ordered'
            const offered = inq.offer_status === 'offered'
            const declined = inq.offer_status === 'declined'
            const isInquiry = inq.request_type === 'inquiry'
            const busy = actioningId === inq.id
            return (
              <div key={inq.id} className="card inquiry-card">
                <div className="inquiry-head">
                  <div>
                    <div className="inquiry-subject">{inq.subject || t('inquiries.noSubject')}</div>
                    <div className="inquiry-meta">
                      {buyer}{inq.boats?.name ? ' · ' + inq.boats.name : ''}
                      {' · '}
                      <span className="inquiry-type">
                        {isInquiry ? t('inquiries.typeInquiry') : t('inquiries.typeQuote')}
                      </span>
                    </div>
                  </div>
                  {ordered && (
                    <span className="badge badge-blue"><Package size={13} /> {t('inquiries.ordered')}</span>
                  )}
                  {offered && (
                    <span className="badge badge-green"><CheckCircle size={13} /> {t('inquiries.offered')} {money(inq.offer_amount)}</span>
                  )}
                  {declined && (
                    <span className="badge badge-red"><XCircle size={13} /> {t('inquiries.declinedBadge')}</span>
                  )}
                </div>

                {inq.message && (
                  <div className="inquiry-message">
                    <div className="inquiry-message-label">{t('inquiries.customerRequest')}</div>
                    {inq.message}
                  </div>
                )}

                {!ordered && showRope(inq) && (
                  <div className="offer-form">
                    <RopeOfferBuilder inquiry={inq} provider={provider}
                      onSent={() => { setMessage({ type: 'success', text: t('inquiries.offerSent') }); load() }} />
                    <div className="offer-actions" style={{ marginTop: 10 }}>
                      {!declined && (
                        <button className="btn-secondary" disabled={busy}
                          onClick={() => doAction(inq, 'decline', t('inquiries.declineConfirm'))}>
                          <XCircle size={15} /> {t('inquiries.decline')}
                        </button>
                      )}
                      <button className="btn-secondary btn-danger" disabled={busy}
                        onClick={() => doAction(inq, 'archive', t('inquiries.removeConfirm'))}>
                        <Trash2 size={15} /> {t('inquiries.remove')}
                      </button>
                    </div>
                  </div>
                )}
                {!ordered && !showRope(inq) && (
                  <div className="offer-form">
                    <div className="offer-form-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{(offered || declined) ? t('inquiries.changeOffer') : t('inquiries.makeOffer')}</span>
                      <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }}
                        onClick={() => setRopeForce(prev => new Set(prev).add(inq.id))}>
                        {t('inquiries.useRopeBuilder')}
                      </button>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>{t('inquiries.price')}</label>
                        <input type="text" inputMode="decimal" value={f.amount || ''}
                          onChange={e => setField(inq.id, 'amount', e.target.value)} placeholder="0,00" />
                      </div>
                      <div className="form-group">
                        <label>{t('inquiries.shipping')}</label>
                        <input type="text" inputMode="decimal" value={f.shipping || ''}
                          onChange={e => setField(inq.id, 'shipping', e.target.value)} placeholder="0,00" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>{t('inquiries.offerDescription')}</label>
                      <textarea rows={4} value={f.description || ''}
                        onChange={e => setField(inq.id, 'description', e.target.value)}
                        placeholder={t('inquiries.offerDescriptionPlaceholder')} />
                    </div>
                    <div className="form-group">
                      <label>{t('inquiries.replyOptional')}</label>
                      <textarea rows={3} value={f.reply || ''}
                        onChange={e => setField(inq.id, 'reply', e.target.value)}
                        placeholder={t('inquiries.replyPlaceholder')} />
                    </div>
                    {(() => {
                      const rate = Number(provider?.commission_rate ?? 10)
                      const amt = parseFloat(String(f.amount || '0').replace(',', '.')) || 0
                      const ship = parseFloat(String(f.shipping || '0').replace(',', '.')) || 0
                      const gross = amt + ship
                      const fee = gross * rate / 100
                      const money = n => n.toFixed(2).replace('.', ',') + ' €'
                      return (
                        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px 14px', fontSize:13, color:'#475569', margin:'4px 0 12px' }}>
                          <div style={{ fontWeight:600, color:'#334155', marginBottom:4 }}>Deine Transaktionsgebühr (vereinbarter Satz): {rate.toString().replace('.', ',')} %{gross > 0 ? ` = ${money(fee)}` : ''}</div>
                          Nimmt der Kunde dein Angebot an, wickelt Skipily die Zahlung über Stripe ab. Wir behalten diese Transaktionsgebühr; darin enthalten sind die komplette Zahlungsabwicklung (Stripe), die Rechnungsstellung und die gesetzeskonforme E‑Rechnung. {gross > 0 ? `Dir werden ${money(gross - fee)} ausgezahlt.` : ''}
                        </div>
                      )
                    })()}
                    <div className="offer-actions">
                      <button className="btn-primary" disabled={sendingId === inq.id}
                        onClick={() => sendOffer(inq)}>
                        <Send size={15} /> {sendingId === inq.id ? t('common.sending')
                          : ((offered || declined) ? t('inquiries.updateOffer') : t('inquiries.sendOffer'))}
                      </button>
                      {!ordered && !declined && (
                        <button className="btn-secondary" disabled={busy}
                          onClick={() => doAction(inq, 'decline', t('inquiries.declineConfirm'))}>
                          <XCircle size={15} /> {t('inquiries.decline')}
                        </button>
                      )}
                      <button className="btn-secondary btn-danger" disabled={busy}
                        onClick={() => doAction(inq, 'archive', t('inquiries.removeConfirm'))}>
                        <Trash2 size={15} /> {t('inquiries.remove')}
                      </button>
                    </div>
                    {offered && <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>{t('inquiries.offerResendHint')}</div>}
                  </div>
                )}

                {ordered && (
                  <div className="offer-actions" style={{ marginTop: 12 }}>
                    <button className="btn-secondary btn-danger" disabled={busy}
                      onClick={() => doAction(inq, 'archive', t('inquiries.removeConfirm'))}>
                      <Trash2 size={15} /> {t('inquiries.remove')}
                    </button>
                  </div>
                )}

                {/* Rückfragen-Thread (Verlauf + Antwort, an einem Ort) */}
                <div className="inq-thread-wrap">
                  <button className="btn-ghost btn-sm" onClick={() => toggleThread(inq.id)}>
                    <MessageSquare size={14} /> {threadOpen[inq.id] ? t('inquiries.hideThread') : t('inquiries.showThread')}
                  </button>
                  {threadOpen[inq.id] && (
                    <div className="inq-thread">
                      {(threads[inq.id]?.length > 0) ? threads[inq.id].map(m => (
                        <div key={m.id} className={`inq-thread-msg ${m.is_mine ? 'mine' : 'theirs'}`}>
                          <div className="inq-thread-bubble">{m.content}</div>
                        </div>
                      )) : <div className="hint" style={{ margin: 0 }}>{t('inquiries.threadEmpty')}</div>}
                      <div className="inq-thread-reply">
                        <textarea rows={2} value={replyText[inq.id] || ''}
                          onChange={e => setReplyText(prev => ({ ...prev, [inq.id]: e.target.value }))}
                          placeholder={t('inquiries.replyPlaceholder')} />
                        <button className="btn-primary btn-sm" disabled={posting === inq.id || !(replyText[inq.id] || '').trim()}
                          onClick={() => postReply(inq.id)}>
                          <Send size={14} /> {t('inquiries.send')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
