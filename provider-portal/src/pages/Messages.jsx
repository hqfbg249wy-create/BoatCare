import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { MessageSquare, Send } from 'lucide-react'

export default function Messages() {
  const { provider, user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEnd = useRef(null)

  useEffect(() => {
    if (provider) loadConversations()
  }, [provider])

  useEffect(() => {
    if (selected) loadMessages(selected.id)
  }, [selected])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('conversations')
        .select('*, profiles:user_id(full_name, username, email)')
        .eq('provider_id', provider.id)
        .order('last_message_at', { ascending: false })
      setConversations(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(conversationId) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    setMessages(data || [])

    // Mark as read
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'user')
      .eq('is_read', false)
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim() || !selected) return

    setSending(true)
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: user.id,
        sender_type: 'provider',
        content: newMsg.trim(),
      })
      if (error) throw error

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selected.id)

      setNewMsg('')
      loadMessages(selected.id)
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  function getUserName(conv) {
    if (conv.profiles?.full_name) return conv.profiles.full_name
    if (conv.profiles?.username) return conv.profiles.username
    return conv.profiles?.email || 'Unbekannt'
  }

  return (
    <div className="page">
      <h1>Nachrichten</h1>

      <div className="chat-layout">
        <div className="chat-sidebar">
          {loading ? (
            <div className="loading">Laden...</div>
          ) : conversations.length === 0 ? (
            <div className="empty-text">Keine Konversationen</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`chat-contact ${selected?.id === conv.id ? 'active' : ''}`}
                onClick={() => setSelected(conv)}
              >
                <div className="chat-contact-name">{getUserName(conv)}</div>
                <div className="chat-contact-time">
                  {new Date(conv.last_message_at).toLocaleDateString('de-DE')}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="chat-main">
          {!selected ? (
            <div className="empty-state">
              <MessageSquare size={48} />
              <p>Wählen Sie eine Konversation</p>
            </div>
          ) : (
            <>
              <div className="chat-header">
                <strong>{getUserName(selected)}</strong>
              </div>
              <div className="chat-messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`chat-bubble ${msg.sender_type === 'provider' ? 'sent' : 'received'}`}>
                    <p>{msg.content}</p>
                    <span className="chat-time">
                      {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                <div ref={messagesEnd} />
              </div>
              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  placeholder="Nachricht schreiben..."
                  disabled={sending}
                />
                <button type="submit" disabled={sending || !newMsg.trim()}>
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
