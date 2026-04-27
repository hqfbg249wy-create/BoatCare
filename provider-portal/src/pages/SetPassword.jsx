import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Wird angezeigt nach Klick auf einen Recovery- oder Invite-Link in der
 * Bestätigungs-E-Mail. Supabase legt anhand des URL-Hashes automatisch eine
 * Session an, wir lassen den User dann ein neues Passwort setzen.
 */
export default function SetPassword({ flowType = 'recovery', email = '' }) {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Hash entfernen, damit ein Reload nicht erneut diese Seite zeigt
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
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
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 })
      if (error) throw error
      // Nach Erfolg ins Dashboard
      navigate('/', { replace: true })
      window.location.reload()
    } catch (err) {
      setError(err.message || 'Fehler beim Speichern.')
    } finally {
      setLoading(false)
    }
  }

  const title = flowType === 'invite' ? 'Passwort festlegen' : 'Passwort zurücksetzen'

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>{title}</p>
        </div>

        {email && (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 14, marginBottom: 16 }}>
            für <strong>{email}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>Neues Passwort (min. 8 Zeichen)</label>
            <input type="password" required minLength={8} autoComplete="new-password"
                   value={pw1} onChange={e => setPw1(e.target.value)} placeholder="••••••••" />
          </div>

          <div className="form-group">
            <label>Passwort wiederholen</label>
            <input type="password" required minLength={8} autoComplete="new-password"
                   value={pw2} onChange={e => setPw2(e.target.value)} placeholder="••••••••" />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Wird gespeichert…' : 'Passwort speichern und einloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
