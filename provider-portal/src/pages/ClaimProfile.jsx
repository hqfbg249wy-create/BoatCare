import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

/**
 * Öffentliche Claim-Seite: /claim/:token
 *
 * Ein Provider, der per Newsletter oder Admin-Einladung einen Link mit
 * seinem Claim-Token bekommen hat, landet hier. Wir zeigen das bereits
 * von Skipily vorbefüllte Profil ("Ist das Ihr Betrieb?"), lassen ihn
 * ein Passwort setzen und beanspruchen das Profil über die Edge Function
 * claim-provider. Danach loggen wir ihn automatisch ein.
 */
export default function ClaimProfile() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { t, setLangFromCountry } = useT()

  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState(null)
  const [error, setError] = useState(null)
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Profil per Token laden (öffentlicher RPC, maskierte E-Mail)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_claimable_provider', {
          p_token: token,
        })
        if (cancelled) return
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row) {
          setError(t('claim.invalidLink'))
        } else if (row.is_claimed) {
          setProvider(row)
          setAlreadyClaimed(true)
        } else {
          setProvider(row)
        }
        // Sprache aus dem hinterlegten Provider-Land vorbelegen.
        if (row?.country) setLangFromCountry(row.country)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (pw1.length < 8) { setError(t('claim.pwTooShort')); return }
    if (pw1 !== pw2)   { setError(t('claim.pwMismatch')); return }

    setSubmitting(true)
    try {
      // 1) Edge Function: Account anlegen + Profil verknüpfen
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-provider`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ token, password: pw1 }),
        }
      )
      const result = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        if (result.already_claimed) setAlreadyClaimed(true)
        throw new Error(result.error || `${t('common.error')} ${resp.status}`)
      }

      // 2) Direkt einloggen (außer der Account existierte schon mit
      //    anderem Passwort — dann zur Login-Seite leiten)
      if (result.existing_account) {
        setDone(true)
        setTimeout(() => navigate('/', { replace: true }), 2500)
        return
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: result.email,
        password: pw1,
      })
      if (signInErr) {
        // Account ist da, Login klemmt — ab zur normalen Anmeldung
        setDone(true)
        setTimeout(() => navigate('/', { replace: true }), 2500)
        return
      }
      // Erfolg → Dashboard
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render-States ───────────────────────────────────────────────────
  const wrap = {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#f1f5f9', padding: 20,
    fontFamily: '-apple-system, Segoe UI, Helvetica, Arial, sans-serif',
  }
  const card = {
    width: '100%', maxWidth: 460, background: '#fff', borderRadius: 14,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden',
  }

  if (loading) {
    return <div style={wrap}><div style={card}>
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>{t('claim.loading')}</div>
    </div></div>
  }

  if (error && !provider) {
    return <div style={wrap}><div style={card}>
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
        <h2 style={{ margin: '0 0 8px', color: '#0B1D3A' }}>{t('claim.linkInvalidTitle')}</h2>
        <p style={{ color: '#64748b' }}>{error}</p>
        <a href="/" style={{ color: '#f97316', fontWeight: 600 }}>{t('claim.toLogin')}</a>
      </div>
    </div></div>
  }

  if (done) {
    return <div style={wrap}><div style={card}>
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h2 style={{ margin: '0 0 8px', color: '#0B1D3A' }}>{t('claim.linkedTitle')}</h2>
        <p style={{ color: '#64748b' }}>{t('claim.linkedBody')}</p>
      </div>
    </div></div>
  }

  return (
    <div style={wrap}>
      <div style={card}>
        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg,#0B1D3A 0%,#1B3866 100%)',
          padding: '28px 30px', textAlign: 'center', position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 12, right: 12 }}>
            <LanguageSwitcher style={{ color: '#cbd5e1' }} />
          </div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>SKIPILY</div>
          <div style={{ color: '#f97316', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
            {t('claim.heroBadge')}
          </div>
        </div>

        <div style={{ padding: 30 }}>
          {alreadyClaimed ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
              <h2 style={{ margin: '0 0 8px', color: '#0B1D3A', fontSize: 20 }}>
                {t('claim.alreadyTitle')}
              </h2>
              <p style={{ color: '#64748b', fontSize: 14 }}>
                {t('claim.alreadyBody', { name: provider?.name || '' })}
              </p>
              <a href="/" style={{
                display: 'inline-block', marginTop: 16, background: '#f97316',
                color: '#fff', padding: '12px 24px', borderRadius: 8,
                textDecoration: 'none', fontWeight: 600,
              }}>{t('claim.toLogin')}</a>
            </div>
          ) : (
            <>
              {/* Frühstarter-Hinweis */}
              <div style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                border: '1px solid #fdba74',
                borderRadius: 10, padding: 14, marginBottom: 16,
                fontSize: 13, color: '#9a3412',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {t('claim.bonusTitle')}
                </div>
                <div style={{ lineHeight: 1.5 }}>
                  {t('claim.bonusBody')}
                </div>
              </div>

              {/* Profil-Vorschau */}
              <p style={{ color: '#334155', fontSize: 15, margin: '0 0 16px' }}>
                {t('claim.intro')}
              </p>
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 10, padding: 16, marginBottom: 20,
              }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#0B1D3A' }}>
                  {provider?.name}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  {[provider?.street, provider?.postal_code, provider?.city]
                    .filter(Boolean).join(', ')}
                </div>
                {provider?.category && (
                  <span style={{
                    display: 'inline-block', marginTop: 8, background: '#fff7ed',
                    color: '#c2410c', padding: '2px 10px', borderRadius: 10,
                    fontSize: 12, fontWeight: 600,
                  }}>{provider.category}</span>
                )}
                {provider?.email && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                    {t('claim.loginWith')} <strong>{provider.email}</strong>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  {t('claim.choosePw')}
                </label>
                <input
                  type="password" value={pw1} onChange={e => setPw1(e.target.value)}
                  placeholder={t('claim.min8')} autoComplete="new-password" required
                  style={inputStyle}
                />
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginTop: 12, display: 'block' }}>
                  {t('claim.confirmPw')}
                </label>
                <input
                  type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                  placeholder={t('claim.repeatPw')} autoComplete="new-password" required
                  style={inputStyle}
                />

                {error && (
                  <div style={{
                    background: '#fee2e2', color: '#991b1b', padding: '10px 14px',
                    borderRadius: 8, fontSize: 13, marginTop: 14,
                  }}>{error}</div>
                )}

                <button type="submit" disabled={submitting} style={{
                  width: '100%', marginTop: 18, background: '#f97316', color: '#fff',
                  border: 'none', padding: '14px', borderRadius: 8, fontSize: 16,
                  fontWeight: 600, cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}>
                  {submitting ? t('claim.submitting') : t('claim.submit')}
                </button>
              </form>

              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, textAlign: 'center' }}>
                {t('claim.acceptPre')}{' '}
                <a href="https://skipily.app/agb" style={{ color: '#94a3b8' }}>{t('claim.terms')}</a> {t('claim.and')}{' '}
                <a href="https://skipily.app/datenschutz" style={{ color: '#94a3b8' }}>{t('layout.privacyShort')}</a>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '12px 14px', marginTop: 6, borderRadius: 8,
  border: '1px solid #cbd5e1', fontSize: 15, boxSizing: 'border-box',
}
