import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Send, Wrench, Trash2, Anchor, Clock, Plus, X, ImagePlus, Camera, Search, ClipboardList } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { parseChatActions } from '../lib/chatActions'

// Tippbarer Aktions-Chip unter KI-Antworten (Shop-Suche / Ausrüstungsliste).
const chipStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 999,
  background: '#fff7ed', color: '#c2410c',
  border: '1px solid #fdba74', fontSize: 13, cursor: 'pointer',
}

export default function AIChat() {
  const { t } = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(searchParams.get('question') || '')
  const [loading, setLoading] = useState(false)
  const [boatContext, setBoatContext] = useState(null)
  const [autoSent, setAutoSent] = useState(false)

  // Persistenz / Historie
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Foto-Anhänge für die nächste Nachricht ({ file, preview }-Objekte)
  const [attachedImages, setAttachedImages] = useState([])
  const [uploadingImages, setUploadingImages] = useState(false)

  const messagesEndRef = useRef(null)
  const cameraInputRef = useRef(null)
  const libraryInputRef = useRef(null)

  useEffect(() => {
    if (user) {
      loadBoatContext()
      loadSessions()
    }
  }, [user])

  // Auto-send question from URL parameter once boat context is loaded
  const pendingQuestion = useRef(searchParams.get('question') || null)
  useEffect(() => {
    if (pendingQuestion.current && boatContext && !autoSent && messages.length === 0) {
      setAutoSent(true)
      const q = pendingQuestion.current
      pendingQuestion.current = null
      setInput('')
      const userMessage = { role: 'user', content: q }
      setMessages([userMessage])
      sendWithMessages([userMessage], { initialUserText: q })
    }
  }, [boatContext])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadBoatContext() {
    try {
      const { data: boats } = await supabase.from('boats').select('*').eq('owner_id', user.id)
      if (!boats || boats.length === 0) { setBoatContext({ boats: [] }); return }

      const boatIds = boats.map(b => b.id)
      const { data: equipment } = await supabase.from('equipment').select('*').in('boat_id', boatIds)

      const boatsWithEquipment = boats.map(b => ({
        name: b.name,
        type: b.boat_type,
        manufacturer: b.manufacturer,
        model: b.model,
        year: b.year,
        length: b.length_meters,
        engine: b.engine,
        homePort: b.home_port,
        // Schlüssel snake_case — genau so liest sie die ai-chat Edge Function aus
        // (eq.last_maintenance_date, eq.location …). Vorher camelCase + falsche
        // Spaltennamen → die KI bekam Wartungsdaten/Ort nie mit.
        equipment: (equipment || []).filter(e => e.boat_id === b.id).map(e => ({
          name: e.name,
          category: e.category,
          manufacturer: e.manufacturer,
          model: e.model,
          installation_date: e.installation_date,
          last_maintenance_date: e.last_maintenance_date,
          next_maintenance_date: e.next_maintenance_date,
          maintenance_cycle_years: e.maintenance_cycle_years,
          serial_number: e.serial_number,
          location: e.location_on_boat,
        }))
      }))

      setBoatContext({ boats: boatsWithEquipment })
    } catch (err) {
      console.error('Error loading boat context:', err)
      setBoatContext({ boats: [] })
    }
  }

  // ------- Session-Persistenz -------

  async function loadSessions() {
    try {
      const { data, error } = await supabase
        .from('ai_chat_sessions')
        .select('id, title, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setSessions(data || [])
    } catch (err) {
      console.error('Sessions laden fehlgeschlagen:', err)
    }
  }

  async function ensureSession(firstUserText) {
    if (sessionId) return sessionId
    try {
      const title = (firstUserText || 'Neues Gespräch').slice(0, 120)
      const { data, error } = await supabase
        .from('ai_chat_sessions')
        .insert({ user_id: user.id, title, boat_context_snapshot: boatContext })
        .select('id')
        .single()
      if (error) throw error
      setSessionId(data.id)
      // Liste aktualisieren
      loadSessions()
      return data.id
    } catch (err) {
      console.error('Session anlegen fehlgeschlagen:', err)
      return null
    }
  }

  async function saveMessageRow(sid, role, content, attachmentUrls) {
    if (!sid) return
    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: sid,
        user_id: user.id,
        role,
        content,
        attachment_urls: attachmentUrls?.length ? attachmentUrls : null,
      })
    } catch (err) {
      console.error('Message speichern fehlgeschlagen:', err)
    }
  }

  async function openSession(sid) {
    setHistoryLoading(true)
    setHistoryOpen(false)
    try {
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('id, role, content, attachment_urls, created_at')
        .eq('session_id', sid)
        .order('created_at', { ascending: true })
      if (error) throw error
      setSessionId(sid)
      setMessages((data || []).map(m => {
        if (m.role === 'assistant') {
          const parsed = parseChatActions(m.content)
          return {
            role: 'assistant',
            content: parsed.text,
            shopSearchTerms: parsed.shopSearchTerms,
            equipmentChecklist: parsed.equipmentChecklist,
            attachment_urls: m.attachment_urls || undefined,
          }
        }
        return { role: m.role, content: m.content, attachment_urls: m.attachment_urls || undefined }
      }))
    } catch (err) {
      console.error('Session laden fehlgeschlagen:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteSession(sid, e) {
    e.stopPropagation()
    if (!confirm(t('chat.k11'))) return
    try {
      await supabase.from('ai_chat_sessions').delete().eq('id', sid)
      if (sid === sessionId) startNewChat()
      setSessions(prev => prev.filter(s => s.id !== sid))
    } catch (err) {
      console.error('Session löschen fehlgeschlagen:', err)
    }
  }

  function startNewChat() {
    setSessionId(null)
    setMessages([])
    setInput('')
  }

  // ------- Foto-Anhänge -------

  function onPickImages(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // erlaubt erneutes Wählen derselben Datei
    if (!files.length) return
    setAttachedImages(prev => {
      const room = Math.max(0, 5 - prev.length)
      const next = files.slice(0, room).map(file => ({ file, preview: URL.createObjectURL(file) }))
      return [...prev, ...next]
    })
  }

  function removeAttached(idx) {
    setAttachedImages(prev => {
      const copy = [...prev]
      const [gone] = copy.splice(idx, 1)
      if (gone) URL.revokeObjectURL(gone.preview)
      return copy
    })
  }

  // Lädt die angehängten Bilder in den Bucket ai-chat-photos und liefert public URLs.
  async function uploadAttachedImages() {
    if (!attachedImages.length) return []
    setUploadingImages(true)
    const urls = []
    const stamp = Date.now()
    try {
      for (let i = 0; i < attachedImages.length; i++) {
        try {
          const file = attachedImages[i].file
          const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
          const path = `${user.id}/${stamp}_${i}.${ext}`
          const { error } = await supabase.storage.from('ai-chat-photos')
            .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
          if (error) { console.error('AI-Foto-Upload:', error); continue }
          const { data } = supabase.storage.from('ai-chat-photos').getPublicUrl(path)
          if (data?.publicUrl) urls.push(data.publicUrl)
        } catch (err) {
          // Ein fehlgeschlagener Foto-Upload darf das Senden NIE stumm abbrechen.
          console.error('AI-Foto-Upload (Ausnahme):', err)
        }
      }
    } finally {
      setUploadingImages(false)
    }
    return urls
  }

  // ------- Senden -------

  async function sendWithMessages(msgs, opts = {}) {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')

      // Session sicherstellen + User-Message persistieren
      const firstUserText = opts.initialUserText
        || msgs.filter(m => m.role === 'user').slice(-1)[0]?.content
        || 'Neues Gespräch'
      const sid = await ensureSession(firstUserText)
      const lastUser = msgs[msgs.length - 1]
      if (sid && lastUser?.role === 'user') {
        await saveMessageRow(sid, 'user', lastUser.content, lastUser.attachment_urls)
      }

      const apiMessages = msgs.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
        ...(m.attachment_urls?.length ? { attachment_urls: m.attachment_urls } : {}),
      }))

      // Claude braucht mit Kontext/Vision teils >30s — großzügiges Timeout,
      // damit der Browser den Request nicht vorzeitig abbricht.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)
      let response
      try {
        response = await fetch(`https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/ai-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ',
          },
          body: JSON.stringify({ messages: apiMessages, boatContext }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Server-Fehler (${response.status}): ${errText}`)
      }

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      const reply = data.reply
      // Aktions-Block vom sichtbaren Text trennen (Shop-Chips + Checkliste).
      const parsed = parseChatActions(reply)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: parsed.text,
        shopSearchTerms: parsed.shopSearchTerms,
        equipmentChecklist: parsed.equipmentChecklist,
      }])
      // ROH-Text (inkl. Block) persistieren → beim Laden erneut parsen.
      if (sid) await saveMessageRow(sid, 'assistant', reply)
      // Update Sessions-Liste (für updated_at)
      loadSessions()
    } catch (err) {
      console.error('AI Chat error:', err)
      const msg = err.name === 'AbortError'
        ? t('chat.errTimeout')
        : `${t('chat.errPrefix')}${err.message}`
      setMessages(prev => [...prev, { role: 'assistant', content: msg }])
    }
    setLoading(false)
  }

  async function sendMessage() {
    const text = input.trim()
    if ((!text && attachedImages.length === 0) || loading || uploadingImages) return

    // Bilder zuerst hochladen (public URLs), dann als attachment_urls anhängen.
    const urls = await uploadAttachedImages()
    // Preview-Objekte freigeben + Anhang-Leiste leeren
    attachedImages.forEach(a => URL.revokeObjectURL(a.preview))
    setAttachedImages([])

    setInput('')
    const userMessage = {
      role: 'user',
      content: text || (urls.length ? '📷' : ''),
      ...(urls.length ? { attachment_urls: urls } : {}),
    }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    await sendWithMessages(newMessages)
  }

  const boatNames = boatContext?.boats?.map(b => b.name).join(', ')

  return (
    <div className="page chat-page">
      <div className="chat-header">
        <div>
          <h1>{t('chat.k0')}</h1>
          <p className="subtitle">
            {boatContext?.boats?.length
              ? `Ihr Berater für ${boatNames}`
              : 'Ihr Skipily-Berater'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => setHistoryOpen(true)} title={t('chat.k9')}>
            <Clock size={16} /> Verlauf{sessions.length > 0 ? ` (${sessions.length})` : ''}
          </button>
          {(messages.length > 0 || sessionId) && (
            <button className="btn-secondary" onClick={startNewChat} title={t('chat.k1')}>
              <Plus size={16} /> {t('chat.k1')}
            </button>
          )}
        </div>
      </div>

      <div className="chat-container">
        {/* Welcome */}
        {messages.length === 0 && !historyLoading && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">
              <img src="/icon-192.png" alt="" style={{ width: 48, height: 48, borderRadius: 10 }} />
            </div>
            <h2>{t('chat.k2')}</h2>
            <p>{t('chat.k3')}</p>
            <div className="chat-suggestions">
              <button onClick={() => setInput(t('chat.sugWinterPrompt'))}>❄️ {t('chat.sugWinterLabel')}</button>
              <button onClick={() => setInput(t('chat.sugMaintPrompt'))}>🔧 {t('chat.sugMaintLabel')}</button>
              <button onClick={() => setInput(t('chat.sugAntifoulingPrompt'))}>🎨 {t('chat.sugAntifoulingLabel')}</button>
              <button onClick={() => setInput(t('chat.sugMotorPrompt'))}>⚙️ {t('chat.sugMotorLabel')}</button>
              <button onClick={() => setInput(t('chat.sugSafetyPrompt'))}>🛟 {t('chat.sugSafetyLabel')}</button>
              <button onClick={() => setInput(t('chat.sugElectronicsPrompt'))}>📡 {t('chat.sugElectronicsLabel')}</button>
            </div>
            {boatContext?.boats?.length > 0 && (
              <p className="chat-context-info">
                <Anchor size={14} /> {t('chat.k4')} <strong>{boatNames}</strong> {t('chat.boatsSuffix')}
              </p>
            )}
          </div>
        )}

        {historyLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>{t('chat.k5')}</div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="chat-avatar"><Wrench size={16} /></div>
              )}
              <div className="chat-bubble">
                {Array.isArray(msg.attachment_urls) && msg.attachment_urls.length > 0 && (
                  <div className="chat-bubble-images">
                    {msg.attachment_urls.map((url, k) => (
                      <a key={k} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="" />
                      </a>
                    ))}
                  </div>
                )}
                {msg.content.split('\n').map((line, j) => (
                  <p key={j}>{line || '\u00A0'}</p>
                ))}

                {/* Aktionen aus dem KI-Aktionsblock */}
                {msg.role === 'assistant' && Array.isArray(msg.shopSearchTerms) && msg.shopSearchTerms.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{t('chat.shopHeader')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {msg.shopSearchTerms.map((term, k) => (
                        <button key={k} onClick={() => navigate(`/shop?q=${encodeURIComponent(term)}`)}
                          style={chipStyle}>
                          <Search size={13} /> {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {msg.role === 'assistant' && msg.equipmentChecklist && (
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => navigate('/equipment?suggest=1')} style={{ ...chipStyle, fontWeight: 600 }}>
                      <ClipboardList size={14} /> {t('chat.checklistBtn')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-message assistant">
              <div className="chat-avatar"><Wrench size={16} /></div>
              <div className="chat-bubble chat-typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Anhang-Vorschau */}
      {attachedImages.length > 0 && (
        <div className="chat-attach-strip">
          {attachedImages.map((a, i) => (
            <div key={i} className="chat-attach-thumb">
              <img src={a.preview} alt="" />
              <button onClick={() => removeAttached(i)} aria-label={t('inq.remove')}><X size={12} /></button>
            </div>
          ))}
          {uploadingImages && <span className="chat-attach-hint">⏳</span>}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-bar">
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickImages} />
        <input ref={libraryInputRef} type="file" accept="image/*" multiple hidden onChange={onPickImages} />
        <button
          className="chat-attach-btn"
          title="Kamera"
          onClick={() => cameraInputRef.current?.click()}
          disabled={loading || uploadingImages || attachedImages.length >= 5}
        >
          <Camera size={20} />
        </button>
        <button
          className="chat-attach-btn"
          title="Aus Mediathek"
          onClick={() => libraryInputRef.current?.click()}
          disabled={loading || uploadingImages || attachedImages.length >= 5}
        >
          <ImagePlus size={20} />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder={t('chat.k8')}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={(!input.trim() && attachedImages.length === 0) || loading || uploadingImages}
        >
          <Send size={20} />
        </button>
      </div>

      {/* History-Drawer */}
      {historyOpen && (
        <div
          onClick={() => setHistoryOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(420px, 100vw)', height: '100vh', background: '#fff',
              boxShadow: '-4px 0 16px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('chat.k6')}</h2>
              <button className="btn-icon" onClick={() => setHistoryOpen(false)}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {sessions.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', marginTop: 32 }}>{t('chat.k7')}</p>
              ) : (
                sessions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => openSession(s.id)}
                    style={{
                      padding: 12, marginBottom: 8, borderRadius: 10,
                      background: s.id === sessionId ? '#fff7ed' : '#f8fafc',
                      border: s.id === sessionId ? '1px solid #fb923c' : '1px solid transparent',
                      cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.title || 'Neues Gespräch'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        {new Date(s.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <button
                      className="btn-icon"
                      onClick={(e) => deleteSession(s.id, e)}
                      title={t('chat.k10')}
                      style={{ color: '#dc2626' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
