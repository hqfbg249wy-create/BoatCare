import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Anchor, Mail, Lock, User, Gift } from 'lucide-react'

export default function Login() {
  const { signIn, signUp, signInWithApple, applyReferralCode } = useAuth()
  const [appleLoading, setAppleLoading] = useState(false)

  async function handleAppleSignIn() {
    setError('')
    setAppleLoading(true)
    try {
      // Bei Erfolg leitet Supabase per Redirect zu Apple um → nach Apple-Login
      // zurueck auf /auth/callback. Wir setzen setAppleLoading also nicht
      // mehr auf false — die Page wird neu geladen.
      await signInWithApple()
    } catch (err) {
      setError(err.message || 'Apple-Anmeldung fehlgeschlagen.')
      setAppleLoading(false)
    }
  }
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (isRegister) {
        await signUp(email, password, fullName)
        // Empfehlungs-Code einloesen (falls eingegeben). Fehler werden NICHT
        // hochgereicht — Sign-Up war erfolgreich, Code-Fehler darf das nicht
        // ueberschreiben.
        const trimmed = referralCode.trim()
        if (trimmed) {
          try {
            await applyReferralCode(trimmed)
            setSuccess('Registrierung erfolgreich! Empfehlungs-Code eingeloest — Bonus nach 7 Tagen.')
          } catch (codeErr) {
            setSuccess(`Registrierung erfolgreich! Empfehlungs-Code wurde abgelehnt: ${codeErr.message}`)
          }
        } else {
          setSuccess('Registrierung erfolgreich! Bitte pruefen Sie Ihre E-Mail.')
        }
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>{isRegister ? 'Konto erstellen' : 'Bootseigner-Portal'}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label><User size={14} /> Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Ihr vollstaendiger Name" required />
            </div>
          )}
          <div className="form-group">
            <label><Mail size={14} /> E-Mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="ihre@email.de" required />
          </div>
          <div className="form-group">
            <label><Lock size={14} /> Passwort</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Passwort" required minLength={6} />
          </div>
          {isRegister && (
            <div className="form-group">
              <label><Gift size={14} /> Empfehlungs-Code (optional)</label>
              <input
                type="text"
                value={referralCode}
                onChange={e => setReferralCode(e.target.value.toUpperCase()
                  .replace(/[^A-Z0-9-]/g, ''))}
                placeholder="BOAT-XXXX"
                autoComplete="off"
              />
              <small style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                Wurdest Du eingeladen? Trag den Code ein — Du und der Werber bekommen
                je 1 Monat Skipily Plus, sobald Du 7 Tage dabei bist.
              </small>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <button type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading ? 'Laden...' : isRegister ? 'Registrieren' : 'Anmelden'}
          </button>
        </form>

        {/* Apple Sign-In — alternative Login-Methode mit Face/Touch ID auf
            Apple-Geraeten (Passkey-aequivalente UX, ohne Passwort). */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '16px 0', fontSize: '0.82rem', color: '#94a3b8',
        }}>
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          <span>oder</span>
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        </div>

        <button
          type="button"
          onClick={handleAppleSignIn}
          disabled={appleLoading || loading}
          style={{
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '11px 16px',
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: '0.95rem',
            fontWeight: 500,
            cursor: appleLoading ? 'wait' : 'pointer',
            opacity: appleLoading ? 0.7 : 1,
          }}
        >
          <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor"
               aria-hidden="true">
            <path d="M13.36 9.55c-.02-2.07 1.69-3.07 1.77-3.12-.97-1.4-2.47-1.59-3-1.62-1.28-.13-2.5.75-3.14.75-.66 0-1.66-.74-2.73-.72-1.4.02-2.7.81-3.42 2.06-1.46 2.53-.37 6.27 1.05 8.32.69 1.01 1.51 2.13 2.59 2.09 1.05-.04 1.44-.67 2.7-.67 1.26 0 1.61.67 2.71.65 1.12-.02 1.83-1.02 2.52-2.03.79-1.17 1.12-2.31 1.14-2.37-.02-.01-2.18-.84-2.2-3.34zM11.31 3.45c.58-.7.97-1.67.87-2.65-.83.04-1.84.55-2.44 1.25-.53.61-1 1.6-.88 2.55.93.07 1.87-.47 2.45-1.15z"/>
          </svg>
          {appleLoading ? 'Weiterleitung zu Apple…' : 'Mit Apple anmelden'}
        </button>

        <p style={{
          marginTop: 10, fontSize: '0.78rem', color: '#94a3b8',
          textAlign: 'center', lineHeight: 1.4,
        }}>
          Auf iPhone/Mac wirst Du per Face ID oder Touch ID angemeldet —
          ohne Passwort.
        </p>

        <div className="login-toggle">
          {isRegister ? (
            <p>Bereits ein Konto? <button onClick={() => setIsRegister(false)}>Anmelden</button></p>
          ) : (
            <p>Noch kein Konto? <button onClick={() => setIsRegister(true)}>Registrieren</button></p>
          )}
        </div>

        <p style={{ marginTop: 16, fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center' }}>
          <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer"
             style={{ color: '#94a3b8', textDecoration: 'underline' }}>
            Datenschutzerklärung
          </a>
        </p>
      </div>
    </div>
  )
}
