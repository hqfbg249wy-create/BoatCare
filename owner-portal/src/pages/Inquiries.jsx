import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import {
  MessageSquarePlus, Send, Clock, CheckCheck, Mail,
  MailOpen, XCircle, ChevronRight, Pencil, Trash2,
  AlertCircle, RefreshCw, X, Ship
} from 'lucide-react'

const statusConfig = {
  draft:   { label: 'Entwurf',    color: '#94a3b8', bg: '#f1f5f9',   icon: Pencil },
  sent:    { label: 'Gesendet',   color: '#3b82f6', bg: '#eff6ff',   icon: Send },
  read:    { label: 'Gelesen',    color: '#8b5cf6', bg: '#f5f3ff',   icon: MailOpen },
  replied: { label: 'Beantwortet',color: '#10b981', bg: '#f0fdf4',   icon: CheckCheck },
  closed:  { label: 'Geschlossen',color: '#64748b', bg: '#f8fafc',   icon: XCircle },
}

function StatusBadge({ status }) {
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
    : inquiries.filter(i => i.status === filterStatus)

  const draftCount  = inquiries.filter(i => i.status === 'draft').length
  const unreadCount = inquiries.filter(i => i.status === 'replied').length

  // ── Edit / Save draft ─────────────────────────────────────────────────────
  async function saveDraft() {
    if (!editing.subject?.trim() || !editing.message?.trim()) {
      alert('Bitte Betreff und Nachricht ausfüllen.')
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
      alert('Bitte Betreff und Nachricht ausfüllen.')
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
    const { error } = await supabase.from('service_inquiries').delete().eq('id', id)
    if (error) { alert('Fehler beim Löschen: ' + error.message); return }
    setDeleteConfirm(null)
    loadInquiries()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page-loading">
      <div className="spinner" />
      <p>Laden…</p>
    </div>
  )

  return (
    <div className="inq-page">
      {/* Header */}
      <div className="inq-page-header">
        <div>
          <h1>Anfragen</h1>
          <p className="subtitle">
            {inquiries.length} Anfrage{inquiries.length !== 1 ? 'n' : ''}
            {draftCount > 0 && ` · ${draftCount} Entwurf${draftCount !== 1 ? 'e' : ''}`}
            {unreadCount > 0 && ` · ${unreadCount} neue Antwort${unreadCount !== 1 ? 'en' : ''}`}
          </p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => navigate('/services')}>
          <MessageSquarePlus size={16} /> Neue Anfrage
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
              Service-Partner suchen
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
              <button className="inq-chevron" onClick={() => setExpanded(expanded === inq.id ? null : inq.id)}>
                <ChevronRight size={18} style={{ transform: expanded === inq.id ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
              </button>
            </div>

            {/* Expanded body */}
            {expanded === inq.id && (
              <div className="inq-card-body">
                <div className="inq-message-box">
                  <div className="inq-message-label">Deine Nachricht</div>
                  <p>{inq.message}</p>
                </div>

                {inq.owner_notes && (
                  <div className="inq-notes-box">
                    <div className="inq-message-label">Private Notizen</div>
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

                {/* Actions */}
                <div className="inq-card-actions">
                  {inq.status === 'draft' && (
                    <>
                      <button className="btn-primary btn-sm" onClick={() => setEditing({ ...inq })}>
                        <Pencil size={14} /> Bearbeiten
                      </button>
                      <button className="btn-success btn-sm" onClick={() => {
                        if (confirm(`Anfrage an „${inq.provider?.name}" jetzt senden?`)) sendInquiry(inq)
                      }} disabled={saving}>
                        <Send size={14} /> Senden
                      </button>
                    </>
                  )}
                  {['sent', 'read'].includes(inq.status) && (
                    <button className="btn-ghost btn-sm" onClick={() => navigate(`/provider/${inq.provider_id}`)}>
                      Zum Anbieter
                    </button>
                  )}
                  {inq.status === 'replied' && (
                    <button className="btn-primary btn-sm" onClick={() => navigate(`/provider/${inq.provider_id}`)}>
                      <MessageSquarePlus size={14} /> Neue Anfrage
                    </button>
                  )}
                  {['draft', 'sent'].includes(inq.status) && (
                    <button className="btn-danger btn-sm" onClick={() => setDeleteConfirm(inq.id)}>
                      <Trash2 size={14} /> Löschen
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
          <RefreshCw size={14} /> Aktualisieren
        </button>
      )}

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {editing && (
        <div className="inq-modal-overlay" onClick={() => setEditing(null)}>
          <div className="inq-modal" onClick={e => e.stopPropagation()}>
            <div className="inq-modal-header">
              <span>Anfrage bearbeiten</span>
              <button className="btn-icon" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="inq-modal-body">
              <div className="inq-modal-provider">
                <strong>An:</strong> {editing.provider?.name}
              </div>

              {boats.length > 0 && (
                <div className="form-group">
                  <label>Boot (optional)</label>
                  <select value={editing.boat_id || ''} onChange={e => setEditing(prev => ({ ...prev, boat_id: e.target.value || null }))}>
                    <option value="">— kein Boot angeben —</option>
                    {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Betreff *</label>
                <input
                  type="text"
                  value={editing.subject}
                  onChange={e => setEditing(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Worum geht es?"
                  maxLength={200}
                />
              </div>

              <div className="form-group">
                <label>Nachricht *</label>
                <textarea
                  rows={6}
                  value={editing.message}
                  onChange={e => setEditing(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Beschreibe dein Anliegen…"
                />
              </div>

              <div className="form-group">
                <label>Private Notizen <span className="form-label-hint">(nur für dich)</span></label>
                <textarea
                  rows={2}
                  value={editing.owner_notes || ''}
                  onChange={e => setEditing(prev => ({ ...prev, owner_notes: e.target.value }))}
                  placeholder="Deine internen Notizen zu dieser Anfrage…"
                />
              </div>
            </div>
            <div className="inq-modal-actions">
              <button className="btn-ghost" onClick={() => setEditing(null)}>Abbrechen</button>
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
                <Send size={14} /> Jetzt senden
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
              <span>Anfrage löschen?</span>
              <button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={18} /></button>
            </div>
            <div className="inq-modal-body">
              <p>Diese Anfrage wird unwiderruflich gelöscht.</p>
            </div>
            <div className="inq-modal-actions">
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn-danger" onClick={() => deleteInquiry(deleteConfirm)}>
                <Trash2 size={14} /> Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
