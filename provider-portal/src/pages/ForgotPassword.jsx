import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ForgotPassword() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Explizit auf die dedizierte Reset-Seite leiten. Diese URL muss in
      // Supabase → Auth → Redirect URLs eingetragen sein, sonst fällt
      // Supabase auf die Site-URL (Eigner-Portal) zurück.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password'
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err.message || t('forgot.sendError'))
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
            <p>{t('forgot.sentTitle')}</p>
          </div>
          <p style={{ textAlign: 'center', margin: '20px 0', lineHeight: 1.6 }}>
            {t('forgot.sentBody', { email })}
          </p>
          <Link to="/" className="btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
            {t('signup.backToLogin')}
          </Link>
        </div>
      </div>
    )
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
          <p>{t('forgot.title')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>{t('common.email')}</label>
            <input type="email" required value={email}
                   onChange={e => setEmail(e.target.value)}
                   placeholder={t('common.emailPlaceholder')} />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('forgot.sending') : t('forgot.sendLink')}
          </button>
        </form>

        <p className="login-hint">
          <Link to="/">{t('signup.backToLogin')}</Link>
        </p>
      </div>
    </div>
  )
}
