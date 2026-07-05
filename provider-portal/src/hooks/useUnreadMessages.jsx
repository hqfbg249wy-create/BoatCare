import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Zählt ungelesene Eigner-Nachrichten in den Konversationen des Providers
// (conversations/messages) = In-App-Signal für neue Nachrichten/Anfragen.
export function useUnreadMessages() {
  const { provider } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!provider?.id) return
    let active = true
    const load = async () => {
      const { data: convs } = await supabase.from('conversations').select('id').eq('provider_id', provider.id)
      const ids = (convs || []).map(c => c.id)
      if (!ids.length) { if (active) setCount(0); return }
      const { count: c } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', ids)
        .eq('sender_type', 'user')
        .eq('is_read', false)
      if (active) setCount(c || 0)
    }
    load()
    const iv = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { active = false; clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [provider?.id])

  return count
}
