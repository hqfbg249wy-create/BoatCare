import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/'
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err.message || 'Fehler beim Senden.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
            <h1>Skipily</h1>
            <p>E-Mail gesendet</p>
          </div>
          <p style={{ textAlign: 'center', margin: '20px 0', lineHeight: 1.6 }}>
            Wir haben Dir einen Link an<br />
            <strong>{email}</strong><br />
            geschickt. Bitte klicke darauf, um ein neues Passwort zu setzen.
          </p>
          <Link to="/" className="btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Zurück zum Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>Passwort vergessen</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>E-Mail</label>
            <input type="email" required value={email}
                   onChange={e => setEmail(e.target.value)}
                   placeholder="ihre@email.de" />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Wird gesendet…' : 'Reset-Link senden'}
          </button>
        </form>

        <p className="login-hint">
          <Link to="/">Zurück zum Login</Link>
        </p>
      </div>
    </div>
  )
}
