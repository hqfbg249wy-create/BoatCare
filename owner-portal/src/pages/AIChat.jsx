import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Send, Wrench, Trash2, Anchor, Clock, Plus, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

export default function AIChat() {
  const { user } = useAuth()
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

  const messagesEndRef = useRef(null)

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
        equipment: (equipment || []).filter(e => e.boat_id === b.id).map(e => ({
          name: e.name,
          category: e.category,
          manufacturer: e.manufacturer,
          model: e.model,
          installationDate: e.installation_date,
          lastMaintenanceDate: e.last_maintenance,
          nextMaintenanceDate: e.next_maintenance,
          maintenanceCycleYears: e.maintenance_cycle_years,
          serialNumber: e.serial_number,
          location: e.location,
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

  async function saveMessageRow(sid, role, content) {
    if (!sid) return
    try {
      await supabase.from('ai_chat_messages').insert({
        session_id: sid,
        user_id: user.id,
        role,
        content,
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
        .select('id, role, content, created_at')
        .eq('session_id', sid)
        .order('created_at', { ascending: true })
      if (error) throw error
      setSessionId(sid)
      setMessages((data || []).map(m => ({ role: m.role, content: m.content })))
    } catch (err) {
      console.error('Session laden fehlgeschlagen:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteSession(sid, e) {
    e.stopPropagation()
    if (!confirm('Diesen Chat dauerhaft löschen?')) return
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
        await saveMessageRow(sid, 'user', lastUser.content)
      }

      const apiMessages = msgs.slice(-20).map(m => ({ role: m.role, content: m.content }))

      const response = await fetch(`https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ',
        },
        body: JSON.stringify({ messages: apiMessages, boatContext }),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Server-Fehler (${response.status}): ${errText}`)
      }

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      const reply = data.reply
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      if (sid) await saveMessageRow(sid, 'assistant', reply)
      // Update Sessions-Liste (für updated_at)
      loadSessions()
    } catch (err) {
      console.error('AI Chat error:', err)
      setMessages(prev => [...prev, { role: 'assistant', content: `Fehler: ${err.message}. Bitte versuchen Sie es erneut.` }])
    }
    setLoading(false)
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    const userMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    await sendWithMessages(newMessages)
  }

  const boatNames = boatContext?.boats?.map(b => b.name).join(', ')

  return (
    <div className="page chat-page">
      <div className="chat-header">
        <div>
          <h1>KI-Assistent</h1>
          <p className="subtitle">
            {boatContext?.boats?.length
              ? `Ihr Berater für ${boatNames}`
              : 'Ihr Skipily-Berater'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => setHistoryOpen(true)} title="Verlauf öffnen">
            <Clock size={16} /> Verlauf{sessions.length > 0 ? ` (${sessions.length})` : ''}
          </button>
          {(messages.length > 0 || sessionId) && (
            <button className="btn-secondary" onClick={startNewChat} title="Neuer Chat">
              <Plus size={16} /> Neuer Chat
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
            <h2>Hallo! 👋</h2>
            <p>Ich bin Ihr Skipily KI-Berater. Fragen Sie mich zu:</p>
            <div className="chat-suggestions">
              <button onClick={() => setInput('Was muss ich bei der Winterlagerung beachten?')}>❄️ Winterlagerung</button>
              <button onClick={() => setInput('Wann ist die nächste Wartung für meine Ausrüstung fällig?')}>🔧 Wartungsintervalle</button>
              <button onClick={() => setInput('Welches Antifouling eignet sich für mein Boot?')}>🎨 Antifouling</button>
              <button onClick={() => setInput('Wie pflege ich meinen Motor richtig?')}>⚙️ Motorpflege</button>
              <button onClick={() => setInput('Was gehört zur Sicherheitsausrüstung an Bord?')}>🛟 Sicherheit</button>
              <button onClick={() => setInput('Welche Elektronik-Updates empfiehlst du?')}>📡 Elektronik</button>
            </div>
            {boatContext?.boats?.length > 0 && (
              <p className="chat-context-info">
                <Anchor size={14} /> Ich kenne Ihre Boote: <strong>{boatNames}</strong> und deren Ausrüstung.
              </p>
            )}
          </div>
        )}

        {historyLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Verlauf wird geladen…</div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="chat-avatar"><Wrench size={16} /></div>
              )}
              <div className="chat-bubble">
                {msg.content.split('\n').map((line, j) => (
                  <p key={j}>{line || '\u00A0'}</p>
                ))}
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

      {/* Input */}
      <div className="chat-input-bar">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Fragen Sie den KI-Berater..."
          disabled={loading}
        />
        <button className="chat-send-btn" onClick={sendMessage} disabled={!input.trim() || loading}>
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
              <h2 style={{ margin: 0, fontSize: 18 }}>Verlauf</h2>
              <button className="btn-icon" onClick={() => setHistoryOpen(false)}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {sessions.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', marginTop: 32 }}>Noch keine Gespräche.</p>
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
                      title="Löschen"
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
