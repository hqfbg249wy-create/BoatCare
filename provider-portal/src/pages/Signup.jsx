import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

const CATEGORIES = [
  { value: 'motorservice', key: 'signup.cat.motorservice' },
  { value: 'bootsbauer',   key: 'signup.cat.bootsbauer' },
  { value: 'zubehör',      key: 'signup.cat.zubehoer' },
  { value: 'segelmacher',  key: 'signup.cat.segelmacher' },
  { value: 'rigg',         key: 'signup.cat.rigg' },
  { value: 'instrumente',  key: 'signup.cat.instrumente' },
  { value: 'lackiererei',  key: 'signup.cat.lackiererei' },
  { value: 'kran',         key: 'signup.cat.kran' },
  { value: 'heizung/klima',key: 'signup.cat.heizungklima' },
  { value: 'sonstige',     key: 'signup.cat.sonstige' },
]

// Aktuelle AGB-Version — bei Anpassung der AGB hochzählen, damit Audit-Trail
// erkennt welcher Stand akzeptiert wurde.
const PROVIDER_AGB_VERSION = '2026-05'

export default function Signup() {
  const { signUp } = useAuth()
  const { t } = useT()
  const [form, setForm] = useState({
    email: '', password: '', companyName: '', category: 'repair', city: '',
    agbAccepted: false,
  })
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError(t('signup.pwTooShort'))
      return
    }
    if (!form.agbAccepted) {
      setError(t('signup.acceptTerms'))
      return
    }
    setLoading(true)
    try {
      await signUp({ ...form, agbVersion: PROVIDER_AGB_VERSION })
      setSuccess(true)
    } catch (err) {
      setError(err.message || t('signup.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
            <h1>Skipily</h1>
            <p>{t('signup.successTitle')}</p>
          </div>
          <p style={{ textAlign: 'center', margin: '20px 0', lineHeight: 1.6 }}>
            {t('signup.successBody', { email: form.email })}
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
          <p>{t('signup.title')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>{t('signup.company')}</label>
            <input type="text" required value={form.companyName}
                   onChange={set('companyName')} placeholder={t('signup.companyPlaceholder')} />
          </div>

          <div className="form-group">
            <label>{t('signup.category')}</label>
            <select value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{t(c.key)}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>{t('signup.city')}</label>
            <input type="text" value={form.city} onChange={set('city')}
                   placeholder={t('signup.cityPlaceholder')} />
          </div>

          <div className="form-group">
            <label>{t('common.email')}</label>
            <input type="email" required value={form.email}
                   onChange={set('email')} placeholder={t('signup.emailPlaceholder')} />
          </div>

          <div className="form-group">
            <label>{t('signup.passwordLabel')}</label>
            <input type="password" required value={form.password}
                   onChange={set('password')} placeholder="••••••••" />
          </div>

          {/* Provider-AGB Pflicht-Annahme — wird in agb_accepted_at / agb_accepted_version gespeichert */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem',
                          color: '#475569', margin: '12px 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.agbAccepted}
              onChange={e => setForm({ ...form, agbAccepted: e.target.checked })}
              style={{ marginTop: 3, flexShrink: 0 }}
            />
            <span>
              {t('signup.termsPre')}{' '}
              <a href="/provider-agb.html" target="_blank" rel="noopener noreferrer"
                 style={{ color: '#f97316', fontWeight: 600 }}>
                {t('signup.termsLink')}
              </a>
              {' '}{t('signup.termsPost')}
            </span>
          </label>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('signup.creating') : t('signup.createAccount')}
          </button>
        </form>

        <p className="login-hint" style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 12 }}>
          {t('signup.privacyNotePre')}{' '}
          <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer">{t('login.privacy')}</a>.
        </p>

        <p className="login-hint">
          {t('signup.alreadyRegistered')} <Link to="/">{t('signup.signInLink')}</Link>
        </p>
      </div>
    </div>
  )
}
