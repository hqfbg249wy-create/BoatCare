import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { MessageSquare, Send, Search } from 'lucide-react'
import { useT } from '../i18n'

// Eigner-Nachrichten: nutzt dasselbe conversations/messages-System wie das
// Provider-Portal. Aus Eigner-Sicht: eigene Nachrichten = sender_type 'user',
// Provider-Nachrichten = sender_type 'provider'.
export default function Messages() {
  const { user } = useAuth()
  const { t } = useT()
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [unread, setUnread] = useState({})
  const endRef = useRef(null)

  const loadConversations = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('conversations')
        .select('*, provider:provider_id(id, name, logo_url)')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
      const list = data || []
      setConversations(list)
      const counts = {}
      for (const c of list) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .eq('sender_type', 'provider')
          .eq('is_read', false)
        counts[c.id] = count || 0
      }
      setUnread(counts)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => { if (selected) loadMessages(selected.id) }, [selected])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Realtime: neue Nachrichten in Echtzeit
  useEffect(() => {
    if (!user) return
    const channel = supabase.channel('owner-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new
        const conv = conversations.find(c => c.id === msg.conversation_id)
        if (!conv) return
        if (msg.sender_type === 'provider') {
          if (selected?.id === msg.conversation_id) {
            setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
            supabase.from('messages').update({ is_read: true }).eq('id', msg.id).then(() => {})
          } else {
            setUnread(prev => ({ ...prev, [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1 }))
          }
        }
        loadConversations()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, conversations, selected, loadConversations])

  async function loadMessages(conversationId) {
    const { data } = await supabase
      .from('messages').select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    await supabase.from('messages').update({ is_read: true })
      .eq('conversation_id', conversationId).eq('sender_type', 'provider').eq('is_read', false)
    setUnread(prev => ({ ...prev, [conversationId]: 0 }))
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim() || !selected) return
    setSending(true)
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: user.id,
        sender_type: 'user',
        content: newMsg.trim(),
      })
      if (error) throw error
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selected.id)
      // Signal an den Provider erfolgt IN-APP (Ungelesen-Badge) — kein Auto-Mailversand.
      setNewMsg('')
      loadMessages(selected.id)
    } finally {
      setSending(false)
    }
  }

  const provName = (c) => c.provider?.name || t('msg.unknownProvider')
  const filtered = conversations.filter(c => !search || provName(c).toLowerCase().includes(search.toLowerCase()))
  const totalUnread = Object.values(unread).reduce((s, c) => s + c, 0)

  return (
    <div className="page">
      <h1>{t('nav.messages')}{totalUnread > 0 && (
        <span style={{ background: '#ef4444', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600, marginLeft: 8, verticalAlign: 'middle' }}>{totalUnread}</span>
      )}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, alignItems: 'stretch', minHeight: 460, marginTop: 12 }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 8, padding: '6px 10px' }}>
              <Search size={14} style={{ color: '#94a3b8' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('msg.searchProvider')}
                     style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', width: '100%' }} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? <div style={{ padding: 16, color: '#94a3b8' }}>{t('common.loading')}</div>
              : filtered.length === 0 ? <div style={{ padding: 16, color: '#94a3b8', fontSize: 14 }}>{t('msg.noConversations')}</div>
              : filtered.map(c => (
                <div key={c.id} onClick={() => setSelected(c)}
                     style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selected?.id === c.id ? '#eff6ff' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{provName(c)}</span>
                    {unread[c.id] > 0 && (
                      <span style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, padding: '0 4px' }}>{unread[c.id]}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {new Date(c.last_message_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 10 }}>
              <MessageSquare size={48} /><p>{t('msg.selectConversation')}</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{provName(selected)}</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc' }}>
                {messages.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>{t('msg.noMessages')}</div>
                  : messages.map(m => {
                    const mine = m.sender_type === 'user'
                    return (
                      <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', background: mine ? '#f97316' : '#fff', color: mine ? '#fff' : '#1e293b', border: mine ? 'none' : '1px solid #e2e8f0', borderRadius: 12, padding: '8px 12px' }}>
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.4 }}>{m.content}</div>
                        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: 'right' }}>{new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )
                  })}
                <div ref={endRef} />
              </div>
              <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e2e8f0' }}>
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder={t('msg.inputPlaceholder')} disabled={sending} style={{ flex: 1 }} />
                <button type="submit" className="btn-primary" disabled={sending || !newMsg.trim()}><Send size={18} /></button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
