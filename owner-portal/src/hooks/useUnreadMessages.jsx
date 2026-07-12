import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Zählt ungelesene Provider-Nachrichten in den Konversationen des Eigners
// (conversations/messages). Aktualisiert im Intervall und beim Fokussieren.
export function useUnreadMessages() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      const { data: convs } = await supabase.from('conversations').select('id').eq('user_id', user.id)
      const ids = (convs || []).map(c => c.id)
      if (!ids.length) { if (active) setCount(0); return }
      const { count: c } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', ids)
        .eq('sender_type', 'provider')
        .eq('is_read', false)
      if (active) setCount(c || 0)
    }
    load()
    const iv = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { active = false; clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [user])

  return count
}
