import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { ShieldCheck, ShieldOff, QrCode, Check, X } from 'lucide-react'

export default function MFASetup() {
  const { t } = useT()
  const { enrollMFA, confirmMFAEnrollment, unenrollMFA, mfaFactors, refreshMFAStatus } = useAuth()
  const [step, setStep] = useState('idle') // idle | enrolling | confirming | done
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const enrolled = mfaFactors.length > 0

  async function startEnroll() {
    setLoading(true)
    setError('')
    try {
      const data = await enrollMFA()
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
      setStep('confirming')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await confirmMFAEnrollment(factorId, code)
      setStep('done')
      setCode('')
    } catch {
      setError(t('mfas.invalidCode'))
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnenroll() {
    if (!confirm(t('mfas.confirmDisable'))) return
    setLoading(true)
    try {
      await unenrollMFA(mfaFactors[0].id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (enrolled && step !== 'done') {
    return (
      <div className="mfa-setup-section">
        <div className="mfa-status active">
          <ShieldCheck size={20} color="#10b981" />
          <div>
            <strong>{t('mfas.active')}</strong>
            <p>{t('mfas.activeDesc')}</p>
          </div>
        </div>
        {error && <div className="mfa-error">{error}</div>}
        <button
          className="btn-secondary"
          onClick={handleUnenroll}
          disabled={loading}
          style={{ marginTop: 12 }}
        >
          <ShieldOff size={15} /> {t('mfas.disable')}
        </button>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="mfa-setup-section">
        <div className="mfa-status active">
          <Check size={20} color="#10b981" />
          <div>
            <strong>{t('mfas.enabledSuccess')}</strong>
            <p>{t('mfas.enabledSuccessDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirming') {
    return (
      <div className="mfa-setup-section">
        <h4><QrCode size={16} /> {t('mfas.scanQr')}</h4>
        <p className="mfa-hint">
          {t('mfas.scanQrDesc')}
        </p>

        {qrCode && (
          <div className="mfa-qr-wrapper">
            <img src={qrCode} alt="QR Code" className="mfa-qr" />
          </div>
        )}

        <button
          className="mfa-secret-toggle"
          onClick={() => setShowSecret(v => !v)}
          type="button"
        >
          {showSecret ? t('mfas.hideCode') : t('mfas.enterManually')}
        </button>
        {showSecret && (
          <div className="mfa-secret">
            <code>{secret}</code>
          </div>
        )}

        <form onSubmit={handleConfirm} className="mfa-form" style={{ marginTop: 16 }}>
          <label className="mfa-label">{t('mfas.enterCodeConfirm')}</label>
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
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || code.length !== 6}
            >
              {loading ? t('mfas.activating') : t('mfas.activate')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setStep('idle'); setCode(''); setError('') }}
            >
              {t('mfas.cancel')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="mfa-setup-section">
      <div className="mfa-status inactive">
        <ShieldOff size={20} color="#f59e0b" />
        <div>
          <strong>{t('mfas.inactive')}</strong>
          <p>{t('mfas.inactiveDesc')}</p>
        </div>
      </div>
      {error && <div className="mfa-error">{error}</div>}
      <button
        className="btn-primary"
        onClick={startEnroll}
        disabled={loading}
        style={{ marginTop: 12 }}
      >
        <ShieldCheck size={15} /> {loading ? t('mfas.preparing') : t('mfas.setup')}
      </button>
    </div>
  )
}
