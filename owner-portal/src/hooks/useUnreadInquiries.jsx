import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Zählt Anfragen mit Status "replied" (Provider hat geantwortet) = Signal für
// „neue Nachricht". Aktualisiert sanft im Intervall und beim Fokussieren.
export function useUnreadInquiries() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      const { count: c } = await supabase
        .from('service_inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .eq('status', 'replied')
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
