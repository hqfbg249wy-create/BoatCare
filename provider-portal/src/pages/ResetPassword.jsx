import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Dedizierte Reset-Password-Landing für das Provider-Portal.
 *
 * Supabase hängt beim Klick auf den Recovery-Link ein Token an den
 * URL-Hash. Der Supabase-Client (detectSessionInUrl=true) verarbeitet
 * das automatisch und feuert das PASSWORD_RECOVERY-Event, aus dessen
 * temporärer Session updateUser({ password }) erlaubt ist.
 *
 * WICHTIG (Supabase Dashboard): Diese URL muss in
 *   Authentication → URL Configuration → Redirect URLs
 * eingetragen sein, sonst fällt Supabase auf die Site-URL (Eigner-Portal)
 * zurück:
 *   https://provider.skipily.app/reset-password
 *   https://provider.skipily.app/**
 *
 * Diese Route ist bewusst ÖFFENTLICH (außerhalb des AuthProvider), damit
 * der Recovery-Hash zuverlässig vor jeder Login-/MFA-Logik greift —
 * symmetrisch zum Eigner-Portal.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)

  useEffect(() => {
    // Auf das PASSWORD_RECOVERY-Event warten (wird beim Verarbeiten des
    // Recovery-Token-Hashes gefeuert).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
          setRecoveryReady(true)
        }
      }
    )
    // Falls schon eine Session existiert (z.B. nach Reload)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setRecoveryReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (pw1.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    if (pw1 !== pw2) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 })
      if (error) throw error
      setSuccess(true)
      // Hash entfernen + nach kurzem Hinweis zur Anmeldung
      history.replaceState(null, '', window.location.pathname)
      setTimeout(async () => {
        await supabase.auth.signOut()
        navigate('/', { replace: true })
      }, 2000)
    } catch (err) {
      setError(err.message || 'Passwort konnte nicht gesetzt werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>Neues Passwort setzen</p>
        </div>

        {success ? (
          <p style={{ textAlign: 'center', color: '#16a34a', margin: '20px 0', lineHeight: 1.6 }}>
            Passwort wurde aktualisiert.<br />Du wirst gleich zur Anmeldung weitergeleitet.
          </p>
        ) : !recoveryReady ? (
          <p style={{ textAlign: 'center', color: '#64748b', margin: '20px 0', lineHeight: 1.6 }}>
            Recovery-Link wird verarbeitet …<br />
            Falls hier nichts passiert, ist der Link evtl. abgelaufen —
            fordere bitte einen neuen an.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error-msg">{error}</div>}

            <div className="form-group">
              <label>Neues Passwort</label>
              <input type="password" required value={pw1}
                     onChange={e => setPw1(e.target.value)}
                     autoComplete="new-password"
                     placeholder="mindestens 8 Zeichen" />
            </div>

            <div className="form-group">
              <label>Passwort wiederholen</label>
              <input type="password" required value={pw2}
                     onChange={e => setPw2(e.target.value)}
                     autoComplete="new-password"
                     placeholder="erneut eingeben" />
            </div>

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Speichere …' : 'Passwort speichern'}
            </button>
          </form>
        )}

        <p className="login-hint">
          <Link to="/">Zurück zum Login</Link>
        </p>
      </div>
    </div>
  )
}
