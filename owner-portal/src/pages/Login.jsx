import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Mail, Lock, User, Gift } from 'lucide-react'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { signIn, signUp, signInWithApple, applyReferralCode } = useAuth()
  const { t } = useT()
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
      setError(err.message || t('login.appleFailed'))
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

  // Passwort-vergessen-Modus (inline, ohne eigene Route)
  const [isForgot, setIsForgot] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  async function handleForgotSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      // redirectTo muss in Supabase → Auth → Redirect URLs freigegeben sein
      // (https://app.skipily.app/** ist es bereits). Sonst Fallback auf Site-URL.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      })
      if (error) throw error
      setForgotSent(true)
    } catch (err) {
      setError(err.message || t('login.forgotSendError'))
    } finally {
      setLoading(false)
    }
  }

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
            setSuccess(t('login.regOkRefOk'))
          } catch (codeErr) {
            setSuccess(t('login.regOkRefRejected', { msg: codeErr.message }))
          }
        } else {
          setSuccess(t('login.regOkCheckEmail'))
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
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageSwitcher />
        </div>
        <div className="login-logo">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>{isForgot ? t('login.subtitleForgot') : isRegister ? t('login.subtitleRegister') : t('login.subtitleOwner')}</p>
        </div>

        {/* ─── Passwort-vergessen-Modus ─── */}
        {isForgot ? (
          forgotSent ? (
            <>
              <p style={{ textAlign: 'center', margin: '20px 0', lineHeight: 1.6, color: '#334155' }}>
                {t('login.forgotSentBody', { email })}
              </p>
              <button className="btn-primary btn-full"
                      onClick={() => { setIsForgot(false); setForgotSent(false) }}>
                {t('common.backToLogin')}
              </button>
            </>
          ) : (
            <form onSubmit={handleForgotSubmit}>
              <p style={{ margin: '0 0 16px', fontSize: '0.9rem', lineHeight: 1.5, color: '#64748b' }}>
                {t('login.forgotIntro')}
              </p>
              <div className="form-group">
                <label><Mail size={14} /> {t('common.email')}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={t('common.emailPlaceholder')} required />
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <button type="submit" className="btn-primary btn-full" disabled={loading}>
                {loading ? t('login.sending') : t('login.sendResetLink')}
              </button>

              <div className="login-toggle">
                <p><button type="button" onClick={() => { setIsForgot(false); setError('') }}>
                  {t('common.backToLogin')}
                </button></p>
              </div>
            </form>
          )
        ) : (
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label><User size={14} /> {t('login.name')}</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder={t('login.namePlaceholder')} required />
            </div>
          )}
          <div className="form-group">
            <label><Mail size={14} /> {t('common.email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder={t('common.emailPlaceholder')} required />
          </div>
          <div className="form-group">
            <label><Lock size={14} /> {t('common.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')} required minLength={6} />
          </div>
          {isRegister && (
            <div className="form-group">
              <label><Gift size={14} /> {t('login.referralLabel')}</label>
              <input
                type="text"
                value={referralCode}
                onChange={e => setReferralCode(e.target.value.toUpperCase()
                  .replace(/[^A-Z0-9-]/g, ''))}
                placeholder="BOAT-XXXX"
                autoComplete="off"
              />
              <small style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                {t('login.referralHint')}
              </small>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <button type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading ? t('login.loading') : isRegister ? t('login.register') : t('login.signIn')}
          </button>

          {!isRegister && (
            <p style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button"
                      onClick={() => { setIsForgot(true); setError(''); setSuccess('') }}
                      style={{ background: 'none', border: 'none', color: '#f97316',
                               cursor: 'pointer', fontSize: '0.88rem', textDecoration: 'underline' }}>
                {t('login.forgotLink')}
              </button>
            </p>
          )}
        </form>
        )}

        {/*
          Apple Sign-In Button vorerst ausgeblendet — Apple-seitige
          Konfiguration der Services-ID liefert immer noch
          "invalid_request — Invalid client id or web redirect url".
          handleAppleSignIn-Handler + useAuth.signInWithApple bleiben
          drin, damit wir den Button nach dem Apple-Konfig-Fix in
          unter 30 Min wieder anschalten koennen.
        */}

        {!isForgot && (
          <div className="login-toggle">
            {isRegister ? (
              <p>{t('login.haveAccount')} <button onClick={() => setIsRegister(false)}>{t('login.signIn')}</button></p>
            ) : (
              <p>{t('login.noAccount')} <button onClick={() => setIsRegister(true)}>{t('login.register')}</button></p>
            )}
          </div>
        )}

        <p style={{ marginTop: 16, fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center' }}>
          <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer"
             style={{ color: '#94a3b8', textDecoration: 'underline' }}>
            {t('common.privacy')}
          </a>
        </p>
      </div>
    </div>
  )
}
