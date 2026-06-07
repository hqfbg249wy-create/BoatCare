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
        // Supabase nutzt fuer Web haeufig den PKCE-Flow — der Code kommt
        // dann als ?code=... im Query-String, nicht als #access_token=...
        // im Hash. Wir muessen ihn explizit gegen eine Session tauschen.
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        const errorParam = params.get('error') || params.get('error_description')

        if (errorParam) {
          if (!cancelled) {
            setError(`Apple-Anmeldung abgelehnt: ${errorParam}`)
          }
          return
        }

        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exErr) {
            if (!cancelled) setError(`Code-Exchange fehlgeschlagen: ${exErr.message}`)
            return
          }
          if (!cancelled) navigate('/', { replace: true })
          return
        }

        // Fallback: Implicit-Flow mit Hash — Supabase-Client erkennt das via
        // detectSessionInUrl automatisch, wir warten kurz darauf.
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession()
          if (data?.session) {
            if (!cancelled) navigate('/', { replace: true })
            return
          }
          await new Promise(r => setTimeout(r, 150))
        }
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
