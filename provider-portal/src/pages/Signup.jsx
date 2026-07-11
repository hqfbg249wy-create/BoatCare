import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { supabase } from '../lib/supabase'
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
  const { t, lang } = useT()
  const [form, setForm] = useState({
    email: '', password: '', companyName: '', category: 'repair', city: '',
    taxId: '', taxNumber: '', isSmallBusiness: false, businessDeclared: false,
    agbAccepted: false,
  })
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [vat, setVat] = useState(null)          // { valid, name, checkable, error } | null
  const [vatChecking, setVatChecking] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // USt-IdNr offiziell über VIES prüfen (Pre-Check, keine DB-Schreibung).
  async function checkVat() {
    const id = form.taxId.trim()
    if (!id) { setVat(null); return }
    setVatChecking(true)
    try {
      const { data, error } = await supabase.functions.invoke('validate-vat', { body: { vat_id: id } })
      if (error) throw error
      setVat(data)
    } catch (e) {
      setVat({ valid: null, checkable: true, error: e.message })
    } finally {
      setVatChecking(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError(t('signup.pwTooShort'))
      return
    }
    // Gewerblich-Nachweis Pflicht — keine Privatpersonen als Provider.
    if (!form.businessDeclared) {
      setError(t('signup.declareBusiness'))
      return
    }
    if (!form.isSmallBusiness) {
      if (!form.taxId.trim()) { setError(t('signup.vatRequired')); return }
      if (!vat || vat.valid !== true) { setError(t('signup.vatNotValid')); return }
    } else {
      // Kleinunternehmer: Steuernummer Pflicht (keine einfache Umgehung).
      if (!form.taxNumber.trim()) { setError(t('signup.taxNumberRequired')); return }
    }
    if (!form.agbAccepted) {
      setError(t('signup.acceptTerms'))
      return
    }
    setLoading(true)
    try {
      await signUp({
        ...form,
        agbVersion: PROVIDER_AGB_VERSION,
        taxId: form.taxId.trim() || null,
        taxNumber: form.taxNumber.trim() || null,
        isSmallBusiness: form.isSmallBusiness,
        businessDeclared: form.businessDeclared,
        locale: lang,
      })
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

          {/* Gewerblicher Nachweis + USt-IdNr (VIES-Prüfung, Migration 106) */}
          <div style={{ borderTop: '1px solid #e2e8f0', margin: '14px 0 4px' }} />
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem',
                          color: '#475569', margin: '6px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.businessDeclared}
              onChange={e => setForm({ ...form, businessDeclared: e.target.checked })}
              style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{t('signup.declareBusinessLabel')}</span>
          </label>

          {!form.isSmallBusiness && (
            <div className="form-group">
              <label>{t('signup.vatLabel')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={form.taxId}
                  onChange={e => { setForm({ ...form, taxId: e.target.value }); setVat(null) }}
                  onBlur={checkVat} placeholder={t('signup.vatPlaceholder')} style={{ flex: 1 }} />
                <button type="button" className="btn-secondary" onClick={checkVat}
                  disabled={vatChecking || !form.taxId.trim()} style={{ whiteSpace: 'nowrap' }}>
                  {vatChecking ? t('signup.vatChecking') : t('signup.vatCheck')}
                </button>
              </div>
              {vat && (
                <div style={{ fontSize: '0.8rem', marginTop: 6,
                  color: vat.valid === true ? '#15803d' : vat.valid === false ? '#b91c1c' : '#b45309' }}>
                  {vat.valid === true
                    ? `✓ ${t('signup.vatValid')}${vat.name ? ' — ' + vat.name : ''}`
                    : vat.valid === false
                      ? `✕ ${t('signup.vatInvalid')}`
                      : `⚠ ${t('signup.vatReview')}`}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>{t('signup.vatHint')}</div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.82rem',
                          color: '#64748b', margin: '6px 0 10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isSmallBusiness}
              onChange={e => setForm({ ...form, isSmallBusiness: e.target.checked, taxId: e.target.checked ? '' : form.taxId })}
              style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{t('signup.smallBusinessLabel')}</span>
          </label>

          {form.isSmallBusiness && (
            <div className="form-group">
              <label>{t('signup.taxNumberLabel')}</label>
              <input type="text" value={form.taxNumber} onChange={set('taxNumber')}
                     placeholder={t('signup.taxNumberPlaceholder')} />
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>{t('signup.taxNumberHint')}</div>
            </div>
          )}
          <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0 12px' }} />

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
