/**
 * AddBusinessModal – Inline-Formular zum Vorschlagen eines neuen
 * Service-Anbieters für die Karte. Pendant zur iOS-Funktion
 * "Betrieb hinzufügen" (siehe map.add_business in Localizable.strings).
 *
 * Workflow:
 *  1. User füllt Pflichtfelder + Adresse aus
 *  2. "Koordinaten holen" via Nominatim (OpenStreetMap, kostenlos, kein Key)
 *  3. Submit → INSERT in service_providers (is_approved=false → Pending)
 *  4. Erscheint auf der Karte sobald ein Admin approved
 */
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { X, Save, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react'

const categories = [
  { value: 'werkstatt',    label: '🔧 Werkstatt' },
  { value: 'motor_service',label: '⚙️ Motor-Service' },
  { value: 'segelmacher',  label: '⛵ Segelmacher' },
  { value: 'elektronik',   label: '📡 Marine Elektronik' },
  { value: 'marina',       label: '🌊 Marina' },
  { value: 'werft',        label: '🚢 Werft' },
  { value: 'tankstelle',   label: '⛽ Tankstelle' },
  { value: 'winterlager',  label: '❄️ Winterlager' },
  { value: 'lackiererei',  label: '🎨 Lackiererei' },
  { value: 'gutachter',    label: '📋 Gutachter' },
  { value: 'versorgung',   label: '🛒 Versorgung / Marine Supplies' },
]

const countries = [
  { value: 'DE', label: 'Deutschland' },
  { value: 'AT', label: 'Österreich' },
  { value: 'CH', label: 'Schweiz' },
  { value: 'NL', label: 'Niederlande' },
  { value: 'FR', label: 'Frankreich' },
  { value: 'IT', label: 'Italien' },
  { value: 'ES', label: 'Spanien' },
  { value: 'HR', label: 'Kroatien' },
  { value: 'GR', label: 'Griechenland' },
]

const emptyForm = {
  name: '', category: 'werkstatt',
  street: '', postal_code: '', city: '', country: 'DE',
  phone: '', email: '', website: '',
  description: '',
  brands: '', services: '',
  latitude: null, longitude: null,
}

export default function AddBusinessModal({ open, onClose, onSubmitted }) {
  const { user } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [done, setDone] = useState(false)

  if (!open) return null

  function reset() {
    setForm(emptyForm)
    setDone(false)
  }

  function close() {
    reset()
    onClose()
  }

  // Adresse → Koordinaten via Nominatim (OpenStreetMap)
  async function fetchCoordinates() {
    const { street, postal_code, city, country } = form
    if (!street || !city) {
      alert('Bitte mindestens Straße und Ort eingeben, um die Koordinaten zu holen.')
      return
    }
    setGeocoding(true)
    try {
      const q = encodeURIComponent(`${street}, ${postal_code || ''} ${city}, ${country}`)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {
        headers: { 'Accept-Language': 'de' },
      })
      const data = await res.json()
      if (!data || data.length === 0) {
        alert('Keine Koordinaten gefunden. Bitte Adresse prüfen.')
        return
      }
      const lat = parseFloat(data[0].lat)
      const lon = parseFloat(data[0].lon)
      setForm(f => ({ ...f, latitude: lat, longitude: lon }))
    } catch (err) {
      alert('Geocoding-Fehler: ' + err.message)
    } finally {
      setGeocoding(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.street.trim() || !form.city.trim()) {
      alert('Bitte Pflichtfelder ausfüllen (Name, Straße, Ort).')
      return
    }
    if (form.latitude == null || form.longitude == null) {
      alert('Bitte zuerst Koordinaten holen.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        street: form.street.trim() || null,
        postal_code: form.postal_code.trim() || null,
        city: form.city.trim() || null,
        country: form.country,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        brands: form.brands.trim() ? form.brands.split(',').map(s => s.trim()).filter(Boolean) : null,
        services: form.services.trim() ? form.services.split(',').map(s => s.trim()).filter(Boolean) : null,
        latitude: form.latitude,
        longitude: form.longitude,
        is_approved: false,
        submitted_by: user?.id || null,
      }
      const { error } = await supabase.from('service_providers').insert(payload)
      if (error) throw error
      setDone(true)
      if (onSubmitted) onSubmitted()
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Success-State nach Submit
  if (done) {
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <CheckCircle2 size={64} color="#10b981" style={{ marginBottom: 16 }} />
            <h2 style={{ marginBottom: 8 }}>Vielen Dank!</h2>
            <p style={{ color: '#475569', marginBottom: 20 }}>
              Dein Vorschlag wurde eingereicht. Sobald ein Admin den Betrieb
              freigegeben hat, erscheint er auf der Karte.
            </p>
            <button className="btn-primary" onClick={close}>Schließen</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2><MapPin size={20} /> Betrieb anlegen</h2>
          <button className="btn-icon" onClick={close}><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="modal-body">
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 18 }}>
            Schlage einen neuen Service-Anbieter vor. Nach Prüfung durch
            einen Admin erscheint er auf der Karte.
          </p>

          {/* Pflichtangaben */}
          <div className="form-row">
            <div className="form-group" style={{ flex: '1 1 280px' }}>
              <label>Name des Betriebs *</label>
              <input required value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Yacht-Service Hamburg" />
            </div>
            <div className="form-group" style={{ flex: '1 1 220px' }}>
              <label>Kategorie *</label>
              <select required value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}>
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Adresse */}
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: '#64748b',
                        marginTop: 12, marginBottom: 8 }}>
            Adresse
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: '2 1 280px' }}>
              <label>Straße & Nr. *</label>
              <input required value={form.street}
                onChange={e => setForm({ ...form, street: e.target.value })}
                placeholder="Musterstr. 12" />
            </div>
            <div className="form-group" style={{ flex: '1 1 120px' }}>
              <label>PLZ</label>
              <input value={form.postal_code}
                onChange={e => setForm({ ...form, postal_code: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: '2 1 200px' }}>
              <label>Ort *</label>
              <input required value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '1 1 180px' }}>
              <label>Land</label>
              <select value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value })}>
                {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Koordinaten-Check */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                        padding: 10, marginBottom: 12,
                        background: form.latitude != null ? '#f0fdf4' : '#fff7ed',
                        border: `1px solid ${form.latitude != null ? '#86efac' : '#fdba74'}`,
                        borderRadius: 8 }}>
            {form.latitude != null ? (
              <>
                <CheckCircle2 size={18} color="#10b981" />
                <span style={{ fontSize: 13, color: '#15803d', flex: 1 }}>
                  Koordinaten gesetzt: {form.latitude.toFixed(4)}, {form.longitude.toFixed(4)}
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={18} color="#f97316" />
                <span style={{ fontSize: 13, color: '#c2410c', flex: 1 }}>
                  Noch keine Koordinaten geholt
                </span>
              </>
            )}
            <button type="button" className="btn-secondary"
              onClick={fetchCoordinates} disabled={geocoding}
              style={{ padding: '6px 12px' }}>
              {geocoding ? 'Suche…' : 'Koordinaten holen'}
            </button>
          </div>

          {/* Kontakt */}
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: '#64748b',
                        marginTop: 12, marginBottom: 8 }}>
            Kontakt (optional)
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Telefon</label>
              <input type="tel" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label>E-Mail</label>
              <input type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Website</label>
              <input type="url" value={form.website}
                onChange={e => setForm({ ...form, website: e.target.value })}
                placeholder="https://" />
            </div>
          </div>

          {/* Details */}
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: '#64748b',
                        marginTop: 12, marginBottom: 8 }}>
            Details (optional)
          </div>
          <div className="form-group">
            <label>Beschreibung</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Was bietet dieser Betrieb an?" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Marken (Komma-getrennt)</label>
              <input value={form.brands}
                onChange={e => setForm({ ...form, brands: e.target.value })}
                placeholder="Yanmar, Volvo Penta, ..." />
            </div>
            <div className="form-group">
              <label>Leistungen (Komma-getrennt)</label>
              <input value={form.services}
                onChange={e => setForm({ ...form, services: e.target.value })}
                placeholder="Reparatur, Wartung, ..." />
            </div>
          </div>

          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            * Pflichtfelder. Der Eintrag wird vor der Veröffentlichung geprüft.
          </p>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={close}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={saving || form.latitude == null}>
              <Save size={16} /> {saving ? 'Speichern…' : 'Vorschlagen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
