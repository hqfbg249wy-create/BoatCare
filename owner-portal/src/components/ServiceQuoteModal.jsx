import { useEffect, useMemo, useState } from 'react'
import { X, Search, Send, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { providerQueryForItem, buildInquirySubject, buildInquiryMessage } from '../lib/equipmentSearch'

// Strukturierte Angebots-/Serviceanfrage aus einem Ausrüstungsgegenstand.
// Spiegelt die iOS-Logik: keyword-gefilterte Betriebe (find-service-providers),
// Mehrfachauswahl, Filter nach Land + Ort, zwei Anfrage-Arten, mit Rückfrage.
export default function ServiceQuoteModal({ item, boatName, onClose }) {
  const [mode, setMode] = useState('quote') // 'quote' | 'inquiry'
  const [subject, setSubject] = useState(buildInquirySubject(item))
  const [message, setMessage] = useState(buildInquiryMessage(item, boatName))

  const [providers, setProviders] = useState([])
  const [countries, setCountries] = useState([])
  const [selCountries, setSelCountries] = useState(() => new Set())
  const [locFilter, setLocFilter] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setLoadError(null)
      const q = providerQueryForItem(item)
      const { data, error } = await supabase.functions.invoke('find-service-providers', {
        body: { category_allow: q.category_allow, service_terms: q.service_terms, name_terms: q.name_terms || [], name_exclude: q.name_exclude || [], countries: [] },
      })
      if (!alive) return
      if (error || data?.ok !== true) {
        setLoadError(error?.message || data?.error || 'Suche fehlgeschlagen')
      } else {
        setProviders(data.providers || [])
        setCountries(data.countries || [])
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [item])

  const visible = useMemo(() => {
    let list = providers
    if (selCountries.size) list = list.filter(p => selCountries.has(p.country || ''))
    const q = locFilter.trim().toLowerCase()
    if (q) list = list.filter(p => (p.city || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
    return list
  }, [providers, selCountries, locFilter])

  const allVisibleSelected = visible.length > 0 && visible.every(p => selected.has(p.id))

  function toggleCountry(c) {
    setSelCountries(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })
  }
  function toggleProvider(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAllVisible() {
    setSelected(prev => {
      const n = new Set(prev)
      if (allVisibleSelected) visible.forEach(p => n.delete(p.id))
      else visible.forEach(p => n.add(p.id))
      return n
    })
  }

  async function send() {
    const ids = [...selected]
    if (ids.length === 0 || !subject.trim() || !message.trim()) return
    const warn = ids.length >= 10
      ? `${ids.length} Betriebe erhalten deine Anfrage. Nur senden, wenn du wirklich von allen eine Rückmeldung möchtest.`
      : `An ${ids.length} ${ids.length === 1 ? 'Betrieb' : 'Betriebe'} senden?`
    if (!window.confirm(warn)) return
    setSending(true); setResult(null)
    const { data, error } = await supabase.functions.invoke('request-quote', {
      body: {
        provider_ids: ids,
        boat_id: item.boat_id || null,
        subject: subject.trim(),
        message: message.trim(),
        request_type: mode,
      },
    })
    setSending(false)
    if (error || data?.ok !== true) {
      setResult({ ok: false, text: error?.message || data?.error || 'Senden fehlgeschlagen' })
      return
    }
    setResult({ ok: true, text: `Anfrage an ${data.count ?? ids.length} Betriebe gesendet.` })
    setTimeout(onClose, 1200)
  }

  return (
    <div className="inq-modal-overlay" onClick={onClose}>
      <div className="inq-modal" onClick={e => e.stopPropagation()}>
        <div className="inq-modal-header">
          {mode === 'inquiry' ? 'Unverbindliche Anfrage' : 'Bitte um ein Angebot'}
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="inq-modal-body">
          {/* Anfrage-Art */}
          <div className="sq-mode">
            <button className={`filter-btn ${mode === 'inquiry' ? 'active' : ''}`} onClick={() => setMode('inquiry')}>
              Unverbindliche Anfrage
            </button>
            <button className={`filter-btn ${mode === 'quote' ? 'active' : ''}`} onClick={() => setMode('quote')}>
              Bitte um ein Angebot
            </button>
          </div>

          <div className="form-group">
            <label>Betreff</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Nachricht</label>
            <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} />
          </div>

          {/* Länder-Filter */}
          {countries.length > 0 && (
            <div className="form-group">
              <label>Land</label>
              <div className="sq-chips">
                {countries.map(c => (
                  <button key={c.country}
                    className={`sq-chip ${selCountries.has(c.country) ? 'active' : ''}`}
                    onClick={() => toggleCountry(c.country)}>
                    {c.country} ({c.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ort-/Namensfilter */}
          {providers.length > 0 && (
            <div className="form-group">
              <label>Ort oder Name</label>
              <div className="search-input">
                <Search size={16} />
                <input value={locFilter} onChange={e => setLocFilter(e.target.value)} placeholder="z. B. Kiel" />
                {locFilter && <button className="btn-icon" onClick={() => setLocFilter('')}><X size={14} /></button>}
              </div>
            </div>
          )}

          {/* Betriebs-Auswahl */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Betriebe ({visible.length})</span>
              {visible.length > 0 && (
                <button className="btn-link" onClick={toggleAllVisible} style={{ fontSize: '0.82rem' }}>
                  {allVisibleSelected ? 'Auswahl aufheben' : 'Alle auswählen'}
                </button>
              )}
            </label>
            {loading ? (
              <div className="spinner" />
            ) : visible.length === 0 ? (
              <p className="hint">{loadError || 'Keine passenden Betriebe gefunden.'}</p>
            ) : (
              <div className="sq-provider-list">
                {visible.map(p => {
                  const on = selected.has(p.id)
                  return (
                    <button key={p.id} type="button" className={`sq-provider ${on ? 'active' : ''}`} onClick={() => toggleProvider(p.id)}>
                      <span className={`sq-check ${on ? 'on' : ''}`}>{on && <Check size={13} />}</span>
                      <span className="sq-provider-main">
                        <span className="sq-provider-name">{p.name}</span>
                        <span className="sq-provider-loc">{[p.city, p.country].filter(Boolean).join(', ')}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {result && (
            <p className={result.ok ? 'sq-ok' : 'sq-err'}>{result.text}</p>
          )}
        </div>

        <div className="inq-modal-actions">
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={send}
            disabled={sending || selected.size === 0 || !subject.trim() || !message.trim()}>
            <Send size={15} /> {sending ? 'Senden…' : `An ${selected.size} senden`}
          </button>
        </div>
      </div>
    </div>
  )
}
