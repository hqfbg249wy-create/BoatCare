import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Zählt offene Anfragen des Providers, die noch eine Reaktion brauchen:
// noch kein Angebot abgegeben, nicht abgelehnt, nicht bestellt, nicht archiviert.
// -> Badge am Menüpunkt "Anfragen", damit nichts übersehen wird.
export function useOpenInquiries() {
  const { provider } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!provider?.id) return
    let active = true
    const load = async () => {
      const { count: c } = await supabase
        .from('service_inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .eq('provider_archived', false)
        .is('order_id', null)
        .or('offer_status.is.null,offer_status.eq.none')
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
