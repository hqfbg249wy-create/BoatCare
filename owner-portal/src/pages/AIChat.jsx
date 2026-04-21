import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Send, Wrench, Trash2, Anchor, Bot } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

export default function AIChat() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(searchParams.get('question') || '')
  const [loading, setLoading] = useState(false)
  const [boatContext, setBoatContext] = useState(null)
  const [autoSent, setAutoSent] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => { if (user) loadBoatContext() }, [user])

  // Auto-send question from URL parameter once boat context is loaded
  const pendingQuestion = useRef(searchParams.get('question') || null)
  useEffect(() => {
    if (pendingQuestion.current && boatContext && !autoSent && messages.length === 0) {
      setAutoSent(true)
      const q = pendingQuestion.current
      pendingQuestion.current = null
      setInput('')
      // Directly trigger the send flow
      const userMessage = { role: 'user', content: q }
      setMessages([userMessage])
      sendWithMessages([userMessage], q)
    }
  }, [boatContext])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadBoatContext() {
    try {
      const { data: boats } = await supabase
        .from('boats')
        .select('*')
        .eq('owner_id', user.id)

      if (!boats || boats.length === 0) {
        setBoatContext({ boats: [] })
        return
      }

      const boatIds = boats.map(b => b.id)
      const { data: equipment } = await supabase
        .from('equipment')
        .select('*')
        .in('boat_id', boatIds)

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

  async function sendWithMessages(msgs) {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { throw new Error('Nicht angemeldet') }

      const apiMessages = msgs.slice(-20).map(m => ({ role: m.role, content: m.content }))

      const response = await fetch(`https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ',
        },
        body: JSON.stringify({
          messages: apiMessages,
          boatContext: boatContext,
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Server-Fehler (${response.status}): ${errText}`)
      }

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
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

  function clearChat() {
    setMessages([])
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
              : 'Ihr BoatCare-Berater'}
          </p>
        </div>
        {messages.length > 0 && (
          <button className="btn-secondary" onClick={clearChat}>
            <Trash2 size={16} /> Chat löschen
          </button>
        )}
      </div>

      <div className="chat-container">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">
              <Anchor size={40} />
            </div>
            <h2>Hallo! 👋</h2>
            <p>Ich bin Ihr BoatCare KI-Berater. Fragen Sie mich zu:</p>
            <div className="chat-suggestions">
              <button onClick={() => { setInput('Was muss ich bei der Winterlagerung beachten?'); }}>
                ❄️ Winterlagerung
              </button>
              <button onClick={() => { setInput('Wann ist die nächste Wartung für meine Ausrüstung fällig?'); }}>
                🔧 Wartungsintervalle
              </button>
              <button onClick={() => { setInput('Welches Antifouling eignet sich für mein Boot?'); }}>
                🎨 Antifouling
              </button>
              <button onClick={() => { setInput('Wie pflege ich meinen Motor richtig?'); }}>
                ⚙️ Motorpflege
              </button>
              <button onClick={() => { setInput('Was gehört zur Sicherheitsausrüstung an Bord?'); }}>
                🛟 Sicherheit
              </button>
              <button onClick={() => { setInput('Welche Elektronik-Updates empfiehlst du?'); }}>
                📡 Elektronik
              </button>
            </div>
            {boatContext?.boats?.length > 0 && (
              <p className="chat-context-info">
                <Anchor size={14} /> Ich kenne Ihre Boote: <strong>{boatNames}</strong> und deren Ausrüstung.
              </p>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="chat-avatar">
                  <Wrench size={16} />
                </div>
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
              <div className="chat-avatar">
                <Wrench size={16} />
              </div>
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
    </div>
  )
}
