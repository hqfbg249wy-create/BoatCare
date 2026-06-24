import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'

/**
 * Reset-Password-Landing. Supabase legt beim Klick auf den Recovery-Link
 * automatisch eine temporaere Session via URL-Hash an
 * (detectSessionInUrl=true), aus der updateUser({ password }) erlaubt ist.
 */
export default function ResetPassword() {
  const { t } = useT()
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
      setError(t('rsp.minChars')); return
    }
    if (password !== confirm) {
      setError(t('rsp.noMatch')); return
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
      setError(err.message || t('rsp.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px' }}>
      <div style={{ maxWidth:420, width:'100%', background:'#fff', padding:'32px', borderRadius:12, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ marginTop:0, fontSize:'1.5rem' }}>{t('rsp.title')}</h1>

        {success ? (
          <p style={{ color:'#16a34a' }}>
            {t('rsp.updated')}
          </p>
        ) : !recoveryReady ? (
          <p style={{ color:'#64748b' }}>
            {t('rsp.processing')}
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display:'block', marginBottom:12 }}>
              {t('rsp.newPassword')}
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
              {t('rsp.repeatPassword')}
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
              {submitting ? t('rsp.saving') : t('rsp.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
