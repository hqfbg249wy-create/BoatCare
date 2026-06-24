import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ShieldCheck, LogOut } from 'lucide-react'
import { useT } from '../i18n'

export default function MFAChallenge() {
  const { verifyMFA, signOut } = useAuth()
  const { t } = useT()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    setError('')
    try {
      await verifyMFA(code)
    } catch {
      setError(t('mfa.codeInvalid'))
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mfa-screen">
      <div className="mfa-card">
        <div className="mfa-icon"><ShieldCheck size={40} color="#f97316" /></div>
        <h2>{t('mfa.title')}</h2>
        <p>{t('mfa.enterCode')}</p>

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
          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? t('mfa.checking') : t('mfa.confirm')}
          </button>
        </form>

        <button className="mfa-logout" onClick={signOut}>
          <LogOut size={14} /> {t('layout.logout')}
        </button>
      </div>
    </div>
  )
}
