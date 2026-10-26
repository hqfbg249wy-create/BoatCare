import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { User, MapPin, Save, CheckCircle, Shield, Gift, Copy, Share2, Fingerprint, Trash2, Camera } from 'lucide-react'
import MFASetup from '../components/MFASetup'
import { useT } from '../i18n'

export default function Profile() {
  const { t } = useT()
  const { user, profile, updateProfile, loadReferralStats,
          listPasskeys, enrollPasskey, removePasskey } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [referralStats, setReferralStats] = useState(null)

  useEffect(() => { setAvatarUrl(profile?.avatar_url || '') }, [profile?.avatar_url])

  async function uploadAvatar(file) {
    if (!file || !user) return
    setAvatarBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      // user-photos erlaubt avatars/<uid>.*
      const path = `avatars/${user.id}.${ext}`
      const { error: upErr } = await supabase.storage.from('user-photos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('user-photos').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}` // Cache-Buster
      await updateProfile({ avatar_url: url })
      setAvatarUrl(url)
    } catch (err) {
      alert(t('prof.avatarError') + (err.message ? `: ${err.message}` : ''))
    }
    setAvatarBusy(false)
  }
  const [codeCopied, setCodeCopied] = useState(false)

  // Passkey-Verwaltung
  const [passkeys, setPasskeys] = useState([])
  const [passkeyName, setPasskeyName] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState(null)

  async function reloadPasskeys() {
    try {
      const list = await listPasskeys()
      setPasskeys(list)
    } catch (err) {
      console.warn('listPasskeys failed:', err)
    }
  }

  useEffect(() => { reloadPasskeys() }, [])

  async function handleAddPasskey() {
    setPasskeyError(null)
    setPasskeyBusy(true)
    try {
      await enrollPasskey(passkeyName || 'Mein Gerät')
      setPasskeyName('')
      await reloadPasskeys()
    } catch (err) {
      setPasskeyError(err.message || 'Passkey konnte nicht hinzugefügt werden.')
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function handleRemovePasskey(id) {
    if (!confirm(t('prof.k31'))) return
    try {
      await removePasskey(id)
      await reloadPasskeys()
    } catch (err) {
      alert('Konnte nicht entfernt werden: ' + err.message)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stats = await loadReferralStats()
        if (!cancelled) setReferralStats(stats)
      } catch (err) {
        console.warn('loadReferralStats failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [loadReferralStats])

  function copyCode() {
    if (!referralStats?.my_code) return
    navigator.clipboard.writeText(referralStats.my_code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 1500)
  }

  async function shareCode() {
    if (!referralStats?.my_code) return
    const text = `Ich nutze Skipily fuer mein Boot — Wartung, Equipment-Inventar, Shop und KI-Assistent in einer App. Mit meinem Empfehlungs-Code bekommen wir beide einen Monat Skipily Plus geschenkt.\n\nMein Code: ${referralStats.my_code}\n\nApp: https://app.skipily.app`
    if (navigator.share) {
      try { await navigator.share({ title: 'Skipily', text }) } catch {}
    } else {
      // Fallback: in die Zwischenablage und Hinweis
      navigator.clipboard.writeText(text)
      alert(t('prof.k32'))
    }
  }
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    phone_number: profile?.phone_number || '',
    shipping_street: profile?.shipping_street || '',
    shipping_city: profile?.shipping_city || '',
    shipping_postal_code: profile?.shipping_postal_code || '',
    shipping_country: profile?.shipping_country || 'Deutschland',
  })

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await updateProfile(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
    setSaving(false)
  }

  return (
    <div className="page">
      <h1>{t('prof.k0')}</h1>
      <p className="subtitle">{user?.email}</p>

      <form onSubmit={handleSave}>
        <div className="card">
          <h2><User size={18} /> {t('prof.k1')}</h2>
          <div className="form-group">
            <label>{t('prof.avatar')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                : <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={28} /></div>}
              <label className="btn-secondary" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Camera size={16} /> {avatarBusy ? t('prof.avatarUploading') : t('prof.avatarChange')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadAvatar(e.target.files?.[0])} />
              </label>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('prof.k2')}</label>
              <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder={t('prof.k28')} />
            </div>
            <div className="form-group">
              <label>{t('prof.k3')}</label>
              <input value={form.phone_number} onChange={e => setForm({...form, phone_number: e.target.value})} placeholder="+49 ..." />
            </div>
          </div>
        </div>

        <div className="card">
          <h2><MapPin size={18} /> {t('prof.k4')}</h2>
          <div className="form-group">
            <label>{t('prof.k5')}</label>
            <input value={form.shipping_street} onChange={e => setForm({...form, shipping_street: e.target.value})} placeholder={t('prof.k29')} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>PLZ</label>
              <input value={form.shipping_postal_code} onChange={e => setForm({...form, shipping_postal_code: e.target.value})} placeholder="53129" />
            </div>
            <div className="form-group">
              <label>{t('prof.k6')}</label>
              <input value={form.shipping_city} onChange={e => setForm({...form, shipping_city: e.target.value})} placeholder={t('prof.k30')} />
            </div>
            <div className="form-group">
              <label>{t('prof.k7')}</label>
              <select value={form.shipping_country} onChange={e => setForm({...form, shipping_country: e.target.value})}>
                <option>{t('prof.k8')}</option>
                <option>{t('prof.k9')}</option>
                <option>{t('prof.k10')}</option>
                <option>{t('prof.k11')}</option>
                <option>{t('prof.k12')}</option>
                <option>{t('prof.k13')}</option>
                <option>{t('prof.k14')}</option>
                <option>{t('prof.k15')}</option>
                <option>{t('prof.k16')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saved ? <><CheckCircle size={16} /> {t('prof.k17')}</> : <><Save size={16} /> {saving ? 'Speichern...' : 'Speichern'}</>}
          </button>
        </div>
      </form>

      <div className="card">
        <h2><Gift size={18} /> {t('prof.k18')}</h2>
        <p style={{ color: '#64748b', fontSize: '0.92rem', marginTop: 4 }}>
          {t('prof.k19')}
        </p>

        {referralStats?.my_code ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: 14, marginTop: 12,
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
            }}>
              <div style={{ flex: '1 1 auto' }}>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 2 }}>
                  {t('prof.k20')}
                </div>
                <div style={{
                  fontFamily: 'ui-monospace, SF Mono, monospace',
                  fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.05em',
                }}>
                  {referralStats.my_code}
                </div>
              </div>
              <button type="button" onClick={copyCode}
                      className="btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Copy size={14} /> {codeCopied ? 'Kopiert' : 'Kopieren'}
              </button>
              <button type="button" onClick={shareCode}
                      className="btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Share2 size={14} /> {t('prof.k21')}
              </button>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10, marginTop: 12,
            }}>
              <div style={{
                padding: '10px 8px', background: '#fff',
                border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16a34a' }}>
                  {referralStats.granted_count || 0}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{t('prof.k22')}</div>
              </div>
              <div style={{
                padding: '10px 8px', background: '#fff',
                border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ea580c' }}>
                  {referralStats.pending_count || 0}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{t('prof.k23')}</div>
              </div>
              <div style={{
                padding: '10px 8px', background: '#fff',
                border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0284c7' }}>
                  {referralStats.granted_this_year || 0}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{t('prof.k24')}</div>
              </div>
            </div>
            {referralStats.granted_this_year >= 12 && (
              <p style={{ marginTop: 10, fontSize: '0.82rem', color: '#ea580c' }}>
                {t('prof.k25')}
              </p>
            )}
          </>
        ) : (
          <p style={{ marginTop: 10, fontSize: '0.85rem', color: '#94a3b8' }}>
            {t('prof.k26')}
          </p>
        )}
      </div>

      {/*
        Passkey-Card vorerst ausgeblendet — Supabase WebAuthn ist als
        eigener Login-Provider gedacht (nicht als MFA-Faktor), die
        Client-Library hat noch keine stabile Enrollment-API.
        useAuth.listPasskeys / enrollPasskey / removePasskey bleiben drin,
        damit wir die UI in einem 30-Min-Re-enable wieder anschalten
        koennen, sobald Supabase die API freigibt (~Q3/Q4 2026).
      */}

      <div className="card">
        <h2><Shield size={18} /> {t('prof.k27')}</h2>
        <MFASetup />
      </div>
    </div>
  )
}
