import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { User, MapPin, Save, CheckCircle } from 'lucide-react'

export default function Profile() {
  const { user, profile, updateProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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
          <h2><User size={18} /> Persoenliche Daten</h2>
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
    </div>
  )
}
