import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Erzwingt die Einrichtung eines TOTP-Faktors (z.B. Google Authenticator,
 * 1Password) für Provider, deren service_providers.mfa_required = true ist
 * und die noch keinen aktiven MFA-Faktor haben.
 *
 * Flow:
 *   1) supabase.auth.mfa.enroll({ factorType: 'totp' }) → liefert QR-Code + Secret
 *   2) User scannt mit Authenticator-App, gibt 6-stelligen Code ein
 *   3) supabase.auth.mfa.challenge + verify → Faktor wird aktiviert
 *   4) Reload → Dashboard
 */
export default function MfaSetup({ onDone }) {
  const [factorId, setFactorId] = useState(null)
  const [qrSvg,   setQrSvg]   = useState(null)
  const [secret,  setSecret]  = useState(null)
  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => { startEnroll() }, [])

  async function startEnroll() {
    setLoading(true); setError('')
    try {
      // Falls schon ein nicht verifizierter Faktor existiert, vorher aufräumen.
      const { data: list } = await supabase.auth.mfa.listFactors()
      const stale = (list?.totp ?? []).filter(f => f.status !== 'verified')
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id })

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Skipily Provider' })
      if (error) throw error
      setFactorId(data.id)
      setQrSvg(data.totp.qr_code)
      setSecret(data.totp.secret)
    } catch (err) {
      setError(err.message || 'Enrollment fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    if (code.length !== 6) { setError('Bitte den 6-stelligen Code aus der App eingeben.'); return }
    setVerifying(true); setError('')
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      })
      if (verErr) throw verErr
      // Erfolg → Dashboard
      onDone ? onDone() : window.location.reload()
    } catch (err) {
      setError(err.message || 'Verifizierung fehlgeschlagen')
    } finally {
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Sicherheitssetup wird vorbereitet…</p>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-header">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>2-Faktor-Authentifizierung einrichten</p>
        </div>

        <p style={{ fontSize: 14, color: '#475569', marginBottom: 16 }}>
          Dein Account ist auf 2FA-Pflicht gesetzt. Bitte richte einen Authenticator (z.B. <strong>Google Authenticator</strong>, <strong>1Password</strong>, <strong>Authy</strong>) einmalig ein.
        </p>

        <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
          <li>Authenticator-App auf dem Smartphone öffnen</li>
          <li>QR-Code unten scannen <em>oder</em> Geheimcode manuell eintragen</li>
          <li>Den 6-stelligen Code aus der App unten eingeben</li>
        </ol>

        {qrSvg && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}
               dangerouslySetInnerHTML={{ __html: qrSvg }} />
        )}

        {secret && (
          <div style={{ background: '#f1f5f9', padding: 10, borderRadius: 8, fontFamily: 'monospace', fontSize: 13, textAlign: 'center', marginBottom: 16, wordBreak: 'break-all' }}>
            {secret}
          </div>
        )}

        <form onSubmit={handleVerify}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>6-stelliger Code aus der App</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={verifying || code.length !== 6}>
            {verifying ? 'Wird geprüft…' : 'Aktivieren'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16, textAlign: 'center' }}>
          Probleme? Admin kann die 2FA-Pflicht im Admin-Panel deaktivieren.
        </p>
      </div>
    </div>
  )
}
