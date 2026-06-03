import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Reset-Password-Landing. Supabase legt beim Klick auf den Recovery-Link
 * automatisch eine temporaere Session via URL-Hash an
 * (detectSessionInUrl=true), aus der updateUser({ password }) erlaubt ist.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)

  useEffect(() => {
    // Wartet auf das PASSWORD_RECOVERY-Event von Supabase, das beim Aufruf
    // mit gueltigem Recovery-Token-Hash gefeuert wird.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
          setRecoveryReady(true)
        }
      }
    )
    // Falls die Seite refresht wurde und schon eine Session existiert
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setRecoveryReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Mindestens 8 Zeichen.'); return
    }
    if (password !== confirm) {
      setError('Die beiden Passwoerter stimmen nicht ueberein.'); return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSuccess(true)
      // Nach 2s zur Login-Seite — Supabase signt den User dann ab und er
      // kann sich mit dem neuen Passwort einloggen.
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
    <div className="login-screen" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px' }}>
      <div style={{ maxWidth:420, width:'100%', background:'#fff', padding:'32px', borderRadius:12, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ marginTop:0, fontSize:'1.5rem' }}>Neues Passwort setzen</h1>

        {success ? (
          <p style={{ color:'#16a34a' }}>
            Passwort wurde aktualisiert. Du wirst gleich zur Anmeldung weitergeleitet.
          </p>
        ) : !recoveryReady ? (
          <p style={{ color:'#64748b' }}>
            Recovery-Link wird verarbeitet … Falls hier nichts passiert,
            ist der Link evtl. abgelaufen — fordere bitte einen neuen an.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display:'block', marginBottom:12 }}>
              Neues Passwort
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                style={{ width:'100%', padding:'10px 12px', marginTop:4, border:'1px solid #cbd5e1', borderRadius:6 }}
              />
            </label>
            <label style={{ display:'block', marginBottom:16 }}>
              Passwort wiederholen
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                style={{ width:'100%', padding:'10px 12px', marginTop:4, border:'1px solid #cbd5e1', borderRadius:6 }}
              />
            </label>
            {error && (
              <p style={{ color:'#b91c1c', fontSize:'0.9rem', marginTop:0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width:'100%', padding:'12px', border:'none', borderRadius:6,
                background:'#0ea5e9', color:'#fff', fontWeight:600, cursor:'pointer',
                opacity: submitting ? 0.6 : 1
              }}
            >
              {submitting ? 'Speichere …' : 'Passwort speichern'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
