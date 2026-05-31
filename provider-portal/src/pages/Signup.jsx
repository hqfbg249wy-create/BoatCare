import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Anchor } from 'lucide-react'

const CATEGORIES = [
  { value: 'motorservice', label: 'Motorservice' },
  { value: 'bootsbauer',   label: 'Bootsbauer' },
  { value: 'zubehör',      label: 'Zubehör' },
  { value: 'segelmacher',  label: 'Segelmacher' },
  { value: 'rigg',         label: 'Rigg' },
  { value: 'instrumente',  label: 'Instrumente / Elektronik' },
  { value: 'lackiererei',  label: 'Lackiererei' },
  { value: 'kran',         label: 'Kran / Travel Lift' },
  { value: 'heizung/klima',label: 'Heizung / Klima' },
  { value: 'sonstige',     label: 'Sonstige' },
]

// Aktuelle AGB-Version — bei Anpassung der AGB hochzählen, damit Audit-Trail
// erkennt welcher Stand akzeptiert wurde.
const PROVIDER_AGB_VERSION = '2026-05'

export default function Signup() {
  const { signUp } = useAuth()
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
      setError('Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (!form.agbAccepted) {
      setError('Bitte die Provider-Nutzungsbedingungen lesen und bestätigen.')
      return
    }
    setLoading(true)
    try {
      await signUp({ ...form, agbVersion: PROVIDER_AGB_VERSION })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Registrierung fehlgeschlagen.')
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
            <p>Registrierung erfolgreich</p>
          </div>
          <p style={{ textAlign: 'center', margin: '20px 0', lineHeight: 1.6 }}>
            Wir haben Dir eine Bestätigungs-E-Mail an<br />
            <strong>{form.email}</strong><br />
            geschickt. Bitte klicke den Link, um Dein Konto zu aktivieren.
          </p>
          <Link to="/" className="btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Zurück zum Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/icon-192.png" alt="Skipily" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <h1>Skipily</h1>
          <p>Provider-Registrierung</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>Firmenname</label>
            <input type="text" required value={form.companyName}
                   onChange={set('companyName')} placeholder="Musterwerft GmbH" />
          </div>

          <div className="form-group">
            <label>Kategorie</label>
            <select value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Stadt</label>
            <input type="text" value={form.city} onChange={set('city')}
                   placeholder="Hamburg" />
          </div>

          <div className="form-group">
            <label>E-Mail</label>
            <input type="email" required value={form.email}
                   onChange={set('email')} placeholder="kontakt@muster-werft.de" />
          </div>

          <div className="form-group">
            <label>Passwort (min. 8 Zeichen)</label>
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
              Ich habe die{' '}
              <a href="/provider-agb.html" target="_blank" rel="noopener noreferrer"
                 style={{ color: '#f97316', fontWeight: 600 }}>
                Provider-Nutzungsbedingungen
              </a>
              {' '}gelesen und akzeptiere sie. Insbesondere bestätige ich, dass ich
              für die Erfüllung der Verträge mit Endkunden, die Qualität meiner Produkte/
              Dienstleistungen sowie deren rechtmäßige Bewerbung und Abrechnung selbst
              verantwortlich bin.
            </span>
          </label>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Wird erstellt…' : 'Konto erstellen'}
          </button>
        </form>

        <p className="login-hint" style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 12 }}>
          Mit dem Klick auf „Konto erstellen" akzeptierst du außerdem unsere{' '}
          <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</a>.
        </p>

        <p className="login-hint">
          Schon registriert? <Link to="/">Anmelden</Link>
        </p>
      </div>
    </div>
  )
}
