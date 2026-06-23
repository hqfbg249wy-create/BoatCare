import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? t('login.badCreds')
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageSwitcher />
        </div>
        <div className="login-header">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>{t('app.providerPortal')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>{t('common.email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder={t('common.emailPlaceholder')}
            />
          </div>

          <div className="form-group">
            <label>{t('common.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>

        <p className="login-hint" style={{ marginTop: 12 }}>
          <Link to="/forgot-password">{t('login.forgot')}</Link>
        </p>

        <p className="login-hint">
          {t('login.noAccount')} <Link to="/signup">{t('login.register')}</Link>
        </p>

        <p className="login-hint" style={{ marginTop: 16, fontSize: '0.78rem', color: '#94a3b8' }}>
          <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer">{t('login.privacy')}</a>
        </p>
      </div>
    </div>
  )
}
