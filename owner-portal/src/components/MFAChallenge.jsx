import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ShieldCheck, LogOut } from 'lucide-react'

export default function MFAChallenge() {
  const { verifyMFA, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(true)

  async function handleSubmit(e) {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    setError('')
    try {
      await verifyMFA(code, rememberDevice)
    } catch {
      setError('Code ungültig oder abgelaufen. Bitte erneut versuchen.')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mfa-screen">
      <div className="mfa-card">
        <div className="mfa-icon"><ShieldCheck size={40} color="#f97316" /></div>
        <h2>Zwei-Faktor-Authentifizierung</h2>
        <p>Gib den 6-stelligen Code aus deiner Authenticator-App ein.</p>

        <form onSubmit={handleSubmit} className="mfa-form">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoFocus
            autoComplete="one-time-code"
            className="mfa-code-input"
          />
          {error && <div className="mfa-error">{error}</div>}

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '12px 0 16px', fontSize: '0.88rem',
            color: '#475569', cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={e => setRememberDevice(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>Diesen Browser 7 Tage merken</span>
          </label>

          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Wird geprüft…' : 'Bestätigen'}
          </button>
        </form>

        <button className="mfa-logout" onClick={signOut}>
          <LogOut size={14} /> Abmelden
        </button>
      </div>
    </div>
  )
}
