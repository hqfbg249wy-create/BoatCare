import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'

/**
 * OAuth-Callback-Landing fuer Apple Sign-In (und andere OAuth-Provider).
 * Apple leitet nach erfolgreichem Login zurueck auf /auth/callback mit
 * den Tokens im URL-Hash. Der Supabase-Client mit detectSessionInUrl=true
 * (Standard) liest den Hash automatisch und legt die Session an —
 * wir warten nur darauf und routen dann zur Haupt-App weiter.
 */
export default function AuthCallback() {
  const { t } = useT()
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
            setError(t('acb.appleRejected', { error: errorParam }))
          }
          return
        }

        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exErr) {
            if (!cancelled) setError(t('acb.exchangeFailed', { error: exErr.message }))
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
          setError(t('acb.failed'))
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
            {t('acb.backToLogin')}
          </button>
        </>
      ) : (
        <>
          <div className="spinner" />
          <p style={{ color: '#64748b' }}>{t('acb.finishing')}</p>
        </>
      )}
    </div>
  )
}
