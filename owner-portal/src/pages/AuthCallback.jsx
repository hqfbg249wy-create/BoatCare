import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * OAuth-Callback-Landing fuer Apple Sign-In (und andere OAuth-Provider).
 * Apple leitet nach erfolgreichem Login zurueck auf /auth/callback mit
 * den Tokens im URL-Hash. Der Supabase-Client mit detectSessionInUrl=true
 * (Standard) liest den Hash automatisch und legt die Session an —
 * wir warten nur darauf und routen dann zur Haupt-App weiter.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function finish() {
      try {
        // detectSessionInUrl haengt den Token automatisch ab — wir geben dem
        // Supabase-Client kurz Zeit, das zu verarbeiten.
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession()
          if (data?.session) {
            if (!cancelled) navigate('/', { replace: true })
            return
          }
          await new Promise(r => setTimeout(r, 150))
        }
        // Nach 3 Sekunden immer noch keine Session — Fehler anzeigen.
        if (!cancelled) {
          setError('Anmeldung konnte nicht abgeschlossen werden. Bitte erneut versuchen.')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    finish()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: 24, flexDirection: 'column', gap: 12,
    }}>
      {error ? (
        <>
          <p style={{ color: '#b91c1c' }}>{error}</p>
          <button className="btn-secondary" onClick={() => navigate('/', { replace: true })}>
            Zurück zur Anmeldung
          </button>
        </>
      ) : (
        <>
          <div className="spinner" />
          <p style={{ color: '#64748b' }}>Anmeldung wird abgeschlossen …</p>
        </>
      )}
    </div>
  )
}
