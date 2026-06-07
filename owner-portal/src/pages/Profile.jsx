import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { User, MapPin, Save, CheckCircle, Shield, Gift, Copy, Share2, Fingerprint, Trash2 } from 'lucide-react'
import MFASetup from '../components/MFASetup'

export default function Profile() {
  const { user, profile, updateProfile, loadReferralStats,
          listPasskeys, enrollPasskey, removePasskey } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [referralStats, setReferralStats] = useState(null)
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
    if (!confirm('Diesen Passkey wirklich entfernen?')) return
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
      alert('Einladungstext in die Zwischenablage kopiert.')
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
      <h1>Mein Profil</h1>
      <p className="subtitle">{user?.email}</p>

      <form onSubmit={handleSave}>
        <div className="card">
          <h2><User size={18} /> Persönliche Daten</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder="Ihr Name" />
            </div>
            <div className="form-group">
              <label>Telefon</label>
              <input value={form.phone_number} onChange={e => setForm({...form, phone_number: e.target.value})} placeholder="+49 ..." />
            </div>
          </div>
        </div>

        <div className="card">
          <h2><MapPin size={18} /> Lieferadresse</h2>
          <div className="form-group">
            <label>Strasse & Hausnummer</label>
            <input value={form.shipping_street} onChange={e => setForm({...form, shipping_street: e.target.value})} placeholder="Musterstrasse 1" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>PLZ</label>
              <input value={form.shipping_postal_code} onChange={e => setForm({...form, shipping_postal_code: e.target.value})} placeholder="53129" />
            </div>
            <div className="form-group">
              <label>Stadt</label>
              <input value={form.shipping_city} onChange={e => setForm({...form, shipping_city: e.target.value})} placeholder="Bonn" />
            </div>
            <div className="form-group">
              <label>Land</label>
              <select value={form.shipping_country} onChange={e => setForm({...form, shipping_country: e.target.value})}>
                <option>Deutschland</option>
                <option>Oesterreich</option>
                <option>Schweiz</option>
                <option>Niederlande</option>
                <option>Frankreich</option>
                <option>Italien</option>
                <option>Spanien</option>
                <option>Kroatien</option>
                <option>Griechenland</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saved ? <><CheckCircle size={16} /> Gespeichert</> : <><Save size={16} /> {saving ? 'Speichern...' : 'Speichern'}</>}
          </button>
        </div>
      </form>

      <div className="card">
        <h2><Gift size={18} /> Freunde einladen</h2>
        <p style={{ color: '#64748b', fontSize: '0.92rem', marginTop: 4 }}>
          Lade Bootseigner zu Skipily ein. Sobald sie 7 Tage dabei sind, bekommt ihr
          beide einen Monat Skipily Plus geschenkt.
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
                  Dein Empfehlungs-Code
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
                <Share2 size={14} /> Teilen
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
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Gutschrift</div>
              </div>
              <div style={{
                padding: '10px 8px', background: '#fff',
                border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ea580c' }}>
                  {referralStats.pending_count || 0}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Offen</div>
              </div>
              <div style={{
                padding: '10px 8px', background: '#fff',
                border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0284c7' }}>
                  {referralStats.granted_this_year || 0}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Dieses Jahr</div>
              </div>
            </div>
            {referralStats.granted_this_year >= 12 && (
              <p style={{ marginTop: 10, fontSize: '0.82rem', color: '#ea580c' }}>
                Jahres-Cap erreicht (12 Empfehlungen). Neue Empfehlungen werden ab
                Januar wieder gutgeschrieben.
              </p>
            )}
          </>
        ) : (
          <p style={{ marginTop: 10, fontSize: '0.85rem', color: '#94a3b8' }}>
            Empfehlungs-Code wird geladen …
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
        <h2><Shield size={18} /> Sicherheit</h2>
        <MFASetup />
      </div>
    </div>
  )
}
