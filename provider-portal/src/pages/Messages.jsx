import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { MessageSquare, Send, Search } from 'lucide-react'

export default function Messages() {
  const { provider, user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [unreadCounts, setUnreadCounts] = useState({})
  const messagesEnd = useRef(null)

  const loadConversations = useCallback(async () => {
    if (!provider) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('conversations')
        .select('*, profiles:user_id(full_name, username, email)')
        .eq('provider_id', provider.id)
        .order('last_message_at', { ascending: false })

      const convList = data || []
      setConversations(convList)

      // Load unread counts per conversation
      const counts = {}
      for (const conv of convList) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('sender_type', 'user')
          .eq('is_read', false)
        counts[conv.id] = count || 0
      }
      setUnreadCounts(counts)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [provider])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (selected) loadMessages(selected.id)
  }, [selected])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription for new messages
  useEffect(() => {
    if (!provider) return

    const channel = supabase
      .channel('provider-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const msg = payload.new
          // Check if message belongs to one of our conversations
          const conv = conversations.find(c => c.id === msg.conversation_id)
          if (!conv) return

          if (msg.sender_type === 'user') {
            // If we're viewing this conversation, add message and mark read
            if (selected?.id === msg.conversation_id) {
              setMessages(prev => [...prev, msg])
              supabase
                .from('messages')
                .update({ is_read: true })
                .eq('id', msg.id)
                .then(() => {})
            } else {
              // Update unread count
              setUnreadCounts(prev => ({
                ...prev,
                [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1,
              }))
            }
          } else if (msg.sender_id === user?.id && selected?.id === msg.conversation_id) {
            // Own message sent (may arrive via realtime too)
            setMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev
              return [...prev, msg]
            })
          }

          // Update conversation list order
          loadConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [provider, conversations, selected, user, loadConversations])

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

    setUnreadCounts(prev => ({ ...prev, [conversationId]: 0 }))
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

  const filteredConversations = conversations.filter(conv => {
    if (!searchTerm) return true
    const name = getUserName(conv).toLowerCase()
    return name.includes(searchTerm.toLowerCase())
  })

  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0)

  return (
    <div className="page">
      <h1>
        Nachrichten
        {totalUnread > 0 && (
          <span style={{
            background: '#ef4444', color: 'white', borderRadius: 12,
            padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600,
            marginLeft: 8, verticalAlign: 'middle',
          }}>
            {totalUnread}
          </span>
        )}
      </h1>

      <div className="chat-layout">
        <div className="chat-sidebar">
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gray-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--gray-50)', borderRadius: 8, padding: '6px 10px' }}>
              <Search size={14} style={{ color: 'var(--gray-400)' }} />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Suchen..."
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', width: '100%' }}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading">Laden...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="empty-text">Keine Konversationen</div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                className={`chat-contact ${selected?.id === conv.id ? 'active' : ''}`}
                onClick={() => setSelected(conv)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="chat-contact-name">{getUserName(conv)}</div>
                  {unreadCounts[conv.id] > 0 && (
                    <span style={{
                      background: selected?.id === conv.id ? 'rgba(255,255,255,0.3)' : '#ef4444',
                      color: 'white', borderRadius: '50%',
                      minWidth: 20, height: 20, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, padding: '0 4px',
                    }}>
                      {unreadCounts[conv.id]}
                    </span>
                  )}
                </div>
                <div className="chat-contact-time">
                  {new Date(conv.last_message_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                {messages.length === 0 ? (
                  <div className="empty-text" style={{ padding: 40 }}>Noch keine Nachrichten</div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} className={`chat-bubble ${msg.sender_type === 'provider' ? 'sent' : 'received'}`}>
                      <p>{msg.content}</p>
                      <span className="chat-time">
                        {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
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
