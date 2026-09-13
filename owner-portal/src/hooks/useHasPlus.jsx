// Server-seitige Plus-Prüfung für das Web-Portal.
//
// Der Client-`isPlus` aus usePlus ist auf Web IMMER false (Kauf läuft nativ).
// Die verlässliche Wahrheit liefert die DB-Funktion `user_has_plus`
// (SECURITY DEFINER, für `authenticated` freigegeben) — sie deckt Individual,
// Family (auch als Mitglied), Fleet und Enterprise ab. Wir cachen das Ergebnis
// pro Session leichtgewichtig.

import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

export function useHasPlus() {
  const { user } = useAuth()
  const [hasPlus, setHasPlus] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) { setHasPlus(false); setLoading(false); return }
    let cancel = false
    setLoading(true)
    supabase.rpc('user_has_plus', { p_user_id: user.id, p_boat_id: null })
      .then(({ data, error }) => {
        if (cancel) return
        // Bei Fehler konservativ auf false (Soft-Gate zeigt dann Upsell).
        setHasPlus(error ? false : data === true)
        setLoading(false)
      })
    return () => { cancel = true }
  }, [user?.id])

  return { hasPlus, loading }
}
