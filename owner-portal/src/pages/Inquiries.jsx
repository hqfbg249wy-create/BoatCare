import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import {
  MessageSquarePlus, Send, Clock, CheckCheck, Mail,
  MailOpen, XCircle, ChevronRight, Pencil, Trash2,
  AlertCircle, RefreshCw, X, Ship, Check, Tag
} from 'lucide-react'
import { useT } from '../i18n'

const statusConfig = {
  draft:   { label: 'Entwurf',    color: '#94a3b8', bg: '#f1f5f9',   icon: Pencil },
  sent:    { label: 'Gesendet',   color: '#3b82f6', bg: '#eff6ff',   icon: Send },
  read:    { label: 'Gelesen',    color: '#8b5cf6', bg: '#f5f3ff',   icon: MailOpen },
  replied: { label: 'Beantwortet',color: '#10b981', bg: '#f0fdf4',   icon: CheckCheck },
  closed:  { label: 'Geschlossen',color: '#64748b', bg: '#f8fafc',   icon: XCircle },
}

function StatusBadge({ status }) {
  const { t } = useT()
  const cfg = statusConfig[status] || statusConfig.draft
  const Icon = cfg.icon
  return (
    <span className="inq-badge" style={{ color: cfg.color, background: cfg.bg }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`
  if (diff < 7 * 86400) return `vor ${Math.floor(diff / 86400)} Tagen`
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Inquiries() {
  const { t } = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [editing, setEditing] = useState(null)        // inquiry being edited (draft)
  const [boats, setBoats] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // id to confirm delete
  const [expanded, setExpanded] = useState(null)       // expanded reply
  const [justRead, setJustRead] = useState(() => new Set()) // in dieser Sitzung gelesen
  const [questionFor, setQuestionFor] = useState(null) // inquiry.id für offene Rückfrage
  const [questionText, setQuestionText] = useState('')
  const [offerBusy, setOfferBusy] = useState(null) // inquiry.id während einer Aktion

  useEffect(() => {
    if (user) { loadInquiries(); loadBoats() }
  }, [user])

  async function loadInquiries() {
    setLoading(true)
    const { data, error } = await supabase
      .from('service_inquiries')
      .select('*, provider:service_providers(id, name, logo_url, category), boat:boats(id, name)')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) console.error('Inquiries load error:', error)
    setInquiries(data || [])
    setLoading(false)
  }

  async function loadBoats() {
    const { data } = await supabase.from('boats').select('id, name').eq('owner_id', user.id)
    setBoats(data || [])
  }

  const filtered = filterStatus === 'all'
    ? inquiries
    // Gerade gelesene bleiben unter "Beantwortet" sichtbar, bis neu geladen wird.
    : inquiries.filter(i => i.status === filterStatus || (filterStatus === 'replied' && justRead.has(i.id)))

  const draftCount  = inquiries.filter(i => i.status === 'draft').length
  // Badge: neue Antworten UND offene Angebote (bis angenommen/abgelehnt).
  const unreadCount = inquiries.filter(i =>
    (i.offer_status === 'offered' && !i.order_id) || i.status === 'replied'
  ).length

  // ── Edit / Save draft ─────────────────────────────────────────────────────
  async function saveDraft() {
    if (!editing.subject?.trim() || !editing.message?.trim()) {
      alert(t('inq.k23'))
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('service_inquiries')
      .update({
        subject: editing.subject.trim(),
        message: editing.message.trim(),
        boat_id: editing.boat_id || null,
        owner_notes: editing.owner_notes?.trim() || null,
      })
      .eq('id', editing.id)
    setSaving(false)
    if (error) { alert('Fehler beim Speichern: ' + error.message); return }
    setEditing(null)
    loadInquiries()
  }

  async function sendInquiry(inq) {
    if (!inq.subject?.trim() || !inq.message?.trim()) {
      alert(t('inq.k23'))
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('service_inquiries')
      .update({ status: 'sent' })
      .eq('id', inq.id)
    setSaving(false)
    if (error) { alert('Fehler beim Senden: ' + error.message); return }
    setEditing(null)
    loadInquiries()
  }

  async function deleteInquiry(id) {
    // Ueber respond-offer loeschen: benachrichtigt den Anbieter, falls die
    // Anfrage gesendet und noch nicht abgelehnt war (Entwuerfe werden still
    // geloescht) - gleiche Logik wie in der iOS-App.
    const { data, error } = await supabase.functions.invoke('respond-offer', {
      body: { inquiry_id: id, action: 'delete' },
    })
    if (error || data?.ok !== true) {
      alert('Fehler beim Löschen: ' + (error?.message || data?.error || 'unbekannt'))
      return
    }
    setDeleteConfirm(null)
    loadInquiries()
  }

  // Auf-/Zuklappen; beim Öffnen einer beantworteten Anfrage wird sie als
  // gelesen markiert, damit der "neue Antwort"-Hinweis/Badge verschwindet.
  async function toggleExpand(inq) {
    const willExpand = expanded !== inq.id
    setExpanded(willExpand ? inq.id : null)
    if (willExpand && inq.status === 'replied') {
      setJustRead(prev => new Set(prev).add(inq.id))
      setInquiries(prev => prev.map(i => i.id === inq.id ? { ...i, status: 'read' } : i))
      const { error } = await supabase
        .from('service_inquiries')
        .update({ status: 'read' })
        .eq('id', inq.id)
      if (error) console.error('markRead error:', error)
    }
  }

  // ── Angebot: Aktionen des Käufers (wie iOS) ────────────────────────────────
  async function offerDecline(inq) {
    if (!confirm('Angebot ablehnen? Der Anbieter wird informiert.')) return
    setOfferBusy(inq.id)
    const { data, error } = await supabase.functions.invoke('respond-offer', {
      body: { inquiry_id: inq.id, action: 'decline' },
    })
    setOfferBusy(null)
    if (error || data?.ok !== true) { alert(error?.message || data?.error || 'Ablehnen fehlgeschlagen'); return }
    loadInquiries()
  }

  async function offerSendQuestion(inq) {
    const text = questionText.trim()
    if (!text) return
    setOfferBusy(inq.id)
    const { data, error } = await supabase.functions.invoke('respond-offer', {
      body: { inquiry_id: inq.id, action: 'question', text },
    })
    setOfferBusy(null)
    if (error || data?.ok !== true) { alert(error?.message || data?.error || 'Senden fehlgeschlagen'); return }
    setQuestionFor(null); setQuestionText('')
    loadInquiries()
  }

  async function offerAccept(inq) {
    setOfferBusy(inq.id)
    const { data, error } = await supabase.functions.invoke('accept-offer', {
      body: { inquiry_id: inq.id },
    })
    setOfferBusy(null)
    if (error || data?.ok !== true || !data?.order_id) {
      alert(error?.message || data?.error || 'Annahme fehlgeschlagen'); return
    }
    // Bestellung angelegt (Deferred). Zahlung/Details in Bestellungen.
    navigate('/orders')
  }

  const money = (a, c) => `${Number(a || 0).toFixed(2).replace('.', ',')} ${(c || 'EUR').toUpperCase()}`

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page-loading">
      <div className="spinner" />
      <p>{t('inq.k0')}</p>
    </div>
  )

  return (
    <div className="inq-page">
      {/* Header */}
      <div className="inq-page-header">
        <div>
          <h1>{t('inq.k1')}</h1>
          <p className="subtitle">
            {inquiries.length} Anfrage{inquiries.length !== 1 ? 'n' : ''}
            {draftCount > 0 && ` · ${draftCount} Entwurf${draftCount !== 1 ? 'e' : ''}`}
            {unreadCount > 0 && ` · ${unreadCount} neue Antwort${unreadCount !== 1 ? 'en' : ''}`}
          </p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => navigate('/services')}>
          <MessageSquarePlus size={16} /> {t('inq.k2')}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="inq-filter-tabs">
        {['all', 'draft', 'sent', 'read', 'replied', 'closed'].map(s => (
          <button
            key={s}
            className={`inq-filter-tab ${filterStatus === s ? 'active' : ''}`}
            onClick={() => setFilterStatus(s)}
          >
            {s === 'all' ? 'Alle' : statusConfig[s].label}
            {s === 'draft' && draftCount > 0 && <span className="inq-count-dot">{draftCount}</span>}
            {s === 'replied' && unreadCount > 0 && <span className="inq-count-dot inq-count-green">{unreadCount}</span>}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="inq-empty">
          <MessageSquarePlus size={40} color="#cbd5e1" />
          <p>
            {filterStatus === 'all'
              ? 'Noch keine Anfragen. Suche einen Service-Partner und stelle deine erste Anfrage!'
              : `Keine Anfragen mit Status „${statusConfig[filterStatus]?.label}".`}
          </p>
          {filterStatus === 'all' && (
            <button className="btn-primary" onClick={() => navigate('/services')}>
              {t('inq.k3')}
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className="inq-list">
        {filtered.map(inq => (
          <div key={inq.id} className={`inq-card ${inq.status === 'draft' ? 'inq-card-draft' : ''} ${inq.status === 'replied' ? 'inq-card-replied' : ''}`}>
            {/* Card header */}
            <div className="inq-card-head">
              {inq.provider?.logo_url ? (
                <img src={inq.provider.logo_url} alt="" className="inq-provider-logo" />
              ) : (
                <div className="inq-provider-logo inq-provider-logo-fallback">⚓</div>
              )}
              <div className="inq-card-meta">
                <div className="inq-provider-name"
                  onClick={() => navigate(`/provider/${inq.provider_id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  {inq.provider?.name || 'Unbekannter Anbieter'}
                </div>
                <div className="inq-subject">{inq.subject}</div>
                <div className="inq-card-footer-row">
                  <StatusBadge status={inq.status} />
                  <span className="inq-time">{timeAgo(inq.updated_at)}</span>
                  {inq.boat?.name && (
                    <span className="inq-boat-tag"><Ship size={11} /> {inq.boat.name}</span>
                  )}
                </div>
              </div>
              <button className="inq-chevron" onClick={() => toggleExpand(inq)}>
                <ChevronRight size={18} style={{ transform: expanded === inq.id ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
              </button>
            </div>

            {/* Expanded body */}
            {expanded === inq.id && (
              <div className="inq-card-body">
                <div className="inq-message-box">
                  <div className="inq-message-label">{t('inq.k4')}</div>
                  <p>{inq.message}</p>
                </div>

                {inq.owner_notes && (
                  <div className="inq-notes-box">
                    <div className="inq-message-label">{t('inq.k5')}</div>
                    <p>{inq.owner_notes}</p>
                  </div>
                )}

                {inq.provider_reply && (
                  <div className="inq-reply-box">
                    <div className="inq-message-label">Antwort von {inq.provider?.name}</div>
                    <p>{inq.provider_reply}</p>
                    {inq.replied_at && (
                      <span className="inq-time">{timeAgo(inq.replied_at)}</span>
                    )}
                  </div>
                )}

                {/* Bepreistes Angebot */}
                {inq.offer_status === 'offered' && Number(inq.offer_amount) > 0 && !inq.order_id && (
                  <div className="inq-offer-box">
                    <div className="inq-offer-head"><Tag size={15} /> Angebot</div>
                    <div className="inq-offer-total">{money((Number(inq.offer_amount) || 0) + (Number(inq.offer_shipping) || 0), inq.offer_currency)}</div>
                    {inq.offer_description && <p className="inq-offer-desc">{inq.offer_description}</p>}
                  </div>
                )}
                {inq.offer_status === 'declined' && (
                  <div className="inq-notes-box"><p>{inq.status === 'closed' ? 'Vom Anbieter abgelehnt — der Betrieb kann diese Anfrage nicht anbieten.' : 'Angebot abgelehnt.'}</p></div>
                )}
                {inq.order_id && (
                  <div className="inq-notes-box"><p>Angenommen — Details unter Bestellungen.</p></div>
                )}

                {/* Rückfrage-Eingabe */}
                {questionFor === inq.id && (
                  <div className="inq-notes-box">
                    <div className="inq-message-label">Rückfrage an {inq.provider?.name}</div>
                    <textarea rows={3} value={questionText} onChange={e => setQuestionText(e.target.value)}
                      placeholder="z. B. Frage zu Varianten, Lieferzeit …" />
                    <div className="inq-card-actions" style={{ marginTop: 8 }}>
                      <button className="btn-primary btn-sm" disabled={offerBusy === inq.id || !questionText.trim()}
                        onClick={() => offerSendQuestion(inq)}>
                        <Send size={14} /> Senden
                      </button>
                      <button className="btn-ghost btn-sm" onClick={() => { setQuestionFor(null); setQuestionText('') }}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="inq-card-actions">
                  {/* Käufer-Aktionen auf ein Angebot */}
                  {inq.offer_status === 'offered' && Number(inq.offer_amount) > 0 && !inq.order_id && (
                    <button className="btn-success btn-sm" disabled={offerBusy === inq.id}
                      onClick={() => offerAccept(inq)}>
                      <Check size={14} /> Annehmen &amp; bezahlen
                    </button>
                  )}
                  {['replied', 'read'].includes(inq.status) && inq.offer_status !== 'declined' && !inq.order_id && questionFor !== inq.id && (
                    <button className="btn-secondary btn-sm" onClick={() => { setQuestionFor(inq.id); setQuestionText('') }}>
                      <MessageSquarePlus size={14} /> Rückfrage
                    </button>
                  )}
                  {inq.offer_status === 'offered' && !inq.order_id && (
                    <button className="btn-danger btn-sm" disabled={offerBusy === inq.id}
                      onClick={() => offerDecline(inq)}>
                      <XCircle size={14} /> Ablehnen
                    </button>
                  )}
                  {inq.status === 'draft' && (
                    <>
                      <button className="btn-primary btn-sm" onClick={() => setEditing({ ...inq })}>
                        <Pencil size={14} /> {t('inq.k6')}
                      </button>
                      <button className="btn-success btn-sm" onClick={() => {
                        if (confirm(`Anfrage an „${inq.provider?.name}" jetzt senden?`)) sendInquiry(inq)
                      }} disabled={saving}>
                        <Send size={14} /> {t('inq.k7')}
                      </button>
                    </>
                  )}
                  {['sent', 'read'].includes(inq.status) && (
                    <button className="btn-ghost btn-sm" onClick={() => navigate(`/provider/${inq.provider_id}`)}>
                      {t('inq.k8')}
                    </button>
                  )}
                  {inq.status === 'replied' && (
                    <button className="btn-primary btn-sm" onClick={() => navigate(`/provider/${inq.provider_id}`)}>
                      <MessageSquarePlus size={14} /> {t('inq.k2')}
                    </button>
                  )}
                  {['draft', 'sent'].includes(inq.status) && (
                    <button className="btn-danger btn-sm" onClick={() => setDeleteConfirm(inq.id)}>
                      <Trash2 size={14} /> {t('inq.k9')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Refresh hint */}
      {inquiries.length > 0 && (
        <button className="inq-refresh-btn" onClick={loadInquiries}>
          <RefreshCw size={14} /> {t('inq.k10')}
        </button>
      )}

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {editing && (
        <div className="inq-modal-overlay" onClick={() => setEditing(null)}>
          <div className="inq-modal" onClick={e => e.stopPropagation()}>
            <div className="inq-modal-header">
              <span>{t('inq.k11')}</span>
              <button className="btn-icon" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="inq-modal-body">
              <div className="inq-modal-provider">
                <strong>An:</strong> {editing.provider?.name}
              </div>

              {boats.length > 0 && (
                <div className="form-group">
                  <label>{t('inq.k12')}</label>
                  <select value={editing.boat_id || ''} onChange={e => setEditing(prev => ({ ...prev, boat_id: e.target.value || null }))}>
                    <option value="">{t('inq.k22')}</option>
                    {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>{t('inq.k13')}</label>
                <input
                  type="text"
                  value={editing.subject}
                  onChange={e => setEditing(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder={t('inq.k19')}
                  maxLength={200}
                />
              </div>

              <div className="form-group">
                <label>{t('inq.k14')}</label>
                <textarea
                  rows={6}
                  value={editing.message}
                  onChange={e => setEditing(prev => ({ ...prev, message: e.target.value }))}
                  placeholder={t('inq.k20')}
                />
              </div>

              <div className="form-group">
                <label>{t('inq.k5')} <span className="form-label-hint">(nur für dich)</span></label>
                <textarea
                  rows={2}
                  value={editing.owner_notes || ''}
                  onChange={e => setEditing(prev => ({ ...prev, owner_notes: e.target.value }))}
                  placeholder={t('inq.k21')}
                />
              </div>
            </div>
            <div className="inq-modal-actions">
              <button className="btn-ghost" onClick={() => setEditing(null)}>{t('inq.k15')}</button>
              <button className="btn-secondary" onClick={saveDraft} disabled={saving}>
                <Clock size={14} /> {saving ? 'Speichern…' : 'Als Entwurf speichern'}
              </button>
              <button className="btn-primary" onClick={() => {
                saveDraft().then(() => {
                  if (confirm(`Anfrage jetzt an „${editing.provider?.name}" senden?`)) {
                    sendInquiry(editing)
                  }
                })
              }} disabled={saving}>
                <Send size={14} /> {t('inq.k16')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="inq-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="inq-modal inq-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="inq-modal-header">
              <AlertCircle size={18} color="#ef4444" />
              <span>{t('inq.k17')}</span>
              <button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={18} /></button>
            </div>
            <div className="inq-modal-body">
              <p>{t('inq.k18')}</p>
            </div>
            <div className="inq-modal-actions">
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>{t('inq.k15')}</button>
              <button className="btn-danger" onClick={() => deleteInquiry(deleteConfirm)}>
                <Trash2 size={14} /> {t('inq.k9')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
