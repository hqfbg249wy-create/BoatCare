import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Anchor, Mail, Lock, User } from 'lucide-react'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
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
        setSuccess('Registrierung erfolgreich! Bitte pruefen Sie Ihre E-Mail.')
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
          <Anchor size={40} />
          <h1>BoatCare</h1>
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

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <button type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading ? 'Laden...' : isRegister ? 'Registrieren' : 'Anmelden'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? (
            <p>Bereits ein Konto? <button onClick={() => setIsRegister(false)}>Anmelden</button></p>
          ) : (
            <p>Noch kein Konto? <button onClick={() => setIsRegister(true)}>Registrieren</button></p>
          )}
        </div>
      </div>
    </div>
  )
}
