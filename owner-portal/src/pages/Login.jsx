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

        {/*
          Apple Sign-In Button vorerst ausgeblendet — Apple-seitige
          Konfiguration der Services-ID liefert immer noch
          "invalid_request — Invalid client id or web redirect url".
          handleAppleSignIn-Handler + useAuth.signInWithApple bleiben
          drin, damit wir den Button nach dem Apple-Konfig-Fix in
          unter 30 Min wieder anschalten koennen.
        */}

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
