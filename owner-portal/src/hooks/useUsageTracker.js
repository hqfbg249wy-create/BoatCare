import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Fortlaufende App-Nutzung: schreibt pro Bereichs-/Seitenwechsel ein app_event
// mit der Verweildauer. Best-effort (Fehler werden verschluckt).
function featureFromPath(p) {
  const seg = (p || '/').split('/').filter(Boolean)[0]
  return seg || 'start'
}

export function useUsageTracker(platform) {
  const loc = useLocation()
  const { user } = useAuth()
  const current = useRef({ path: loc.pathname, at: Date.now() })

  const flush = () => {
    const { path, at } = current.current
    const dur = Date.now() - at
    // Nur plausible Dauern (>1,5s, <2h) und nur eingeloggt.
    if (user?.id && dur > 1500 && dur < 7200000) {
      supabase.from('app_events').insert({
        user_id: user.id, platform, feature: featureFromPath(path), duration_ms: dur,
      }).then(() => {}, () => {})
    }
  }

  // Bereichswechsel: vorherigen Aufenthalt buchen, neuen starten.
  useEffect(() => {
    flush()
    current.current = { path: loc.pathname, at: Date.now() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname])

  // Tab schließen/verstecken: aktuellen Aufenthalt buchen.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('visibilitychange', onHide)
    return () => window.removeEventListener('visibilitychange', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
}
