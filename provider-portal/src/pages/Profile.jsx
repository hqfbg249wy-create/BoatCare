import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Save, Loader, CreditCard, ExternalLink, CheckCircle, AlertCircle, Clock } from 'lucide-react'

export default function Profile() {
  const { provider, loadProvider, user } = useAuth()
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  // Stripe Connect state
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeStatus, setStripeStatus] = useState(null)
  const [stripeMessage, setStripeMessage] = useState(null)

  useEffect(() => {
    if (provider) {
      setForm({
        name: provider.name || '',
        description: provider.description || '',
        street: provider.street || '',
        postal_code: provider.postal_code || '',
        city: provider.city || '',
        country: provider.country || '',
        phone: provider.phone || '',
        email: provider.email || '',
        website: provider.website || '',
        opening_hours: provider.opening_hours || '',
        tax_id: provider.tax_id || '',
        shop_description: provider.shop_description || '',
        slogan: provider.slogan || '',
      })

      // Check Stripe URL params for return from onboarding
      const params = new URLSearchParams(window.location.search)
      if (params.get('stripe') === 'success') {
        setStripeMessage({ type: 'success', text: 'Stripe-Einrichtung abgeschlossen! Ihr Konto wird geprüft.' })
        window.history.replaceState({}, '', '/profile')
        loadProvider(user.id)
      } else if (params.get('stripe') === 'refresh') {
        setStripeMessage({ type: 'info', text: 'Bitte schließen Sie die Stripe-Einrichtung ab.' })
        window.history.replaceState({}, '', '/profile')
      }
    }
  }, [provider])

  // Load Stripe account status when provider has stripe_account_id
  useEffect(() => {
    if (provider?.stripe_account_id) {
      loadStripeStatus()
    }
  }, [provider?.stripe_account_id])

  async function loadStripeStatus() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-connect-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })

      if (res.ok) {
        const data = await res.json()
        setStripeStatus({
          charges_enabled: data.charges_enabled,
          payouts_enabled: data.payouts_enabled,
          details_submitted: data.details_submitted,
        })
      }
    } catch (err) {
      console.error('Stripe status error:', err)
    }
  }

  async function startStripeOnboarding() {
    setStripeLoading(true)
    setStripeMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-connect-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Stripe-Fehler')
      }

      const data = await res.json()

      if (data.onboarding_url) {
        window.location.href = data.onboarding_url
      } else {
        throw new Error('Keine Onboarding-URL erhalten')
      }
    } catch (err) {
      setStripeMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setStripeLoading(false)
    }
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('service_providers')
        .update({
          name: form.name,
          description: form.description,
          street: form.street,
          postal_code: form.postal_code,
          city: form.city,
          country: form.country,
          phone: form.phone,
          email: form.email,
          website: form.website,
          opening_hours: form.opening_hours,
          tax_id: form.tax_id,
          shop_description: form.shop_description,
          slogan: form.slogan,
        })
        .eq('id', provider.id)

      if (error) throw error
      setMessage({ type: 'success', text: 'Stammdaten gespeichert.' })
      loadProvider(user.id)
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  function getStripeStatusInfo() {
    if (!provider?.stripe_account_id) {
      return { label: 'Nicht eingerichtet', color: 'var(--gray-400)', icon: AlertCircle }
    }
    if (stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled) {
      return { label: 'Aktiv', color: 'var(--green)', icon: CheckCircle }
    }
    if (stripeStatus?.details_submitted) {
      return { label: 'In Prüfung', color: 'var(--yellow)', icon: Clock }
    }
    return { label: 'Einrichtung ausstehend', color: 'var(--primary)', icon: AlertCircle }
  }

  if (!provider) return <div className="loading">Laden...</div>

  const stripeInfo = getStripeStatusInfo()
  const StripeIcon = stripeInfo.icon

  return (
    <div className="page">
      <h1>Stammdaten</h1>
      <p className="subtitle">Bearbeiten Sie Ihre Unternehmensdaten</p>

      {message && (
        <div className={`message message-${message.type}`}>{message.text}</div>
      )}

      {/* Stripe Connect Section */}
      <div className="card" style={{ borderLeft: `4px solid ${stripeInfo.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={20} />
            Zahlungen & Auszahlungen
          </h2>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
            background: stripeInfo.color === 'var(--green)' ? '#d1fae5' :
                        stripeInfo.color === 'var(--yellow)' ? '#fef3c7' :
                        stripeInfo.color === 'var(--primary)' ? '#ffedd5' : 'var(--gray-100)',
            color: stripeInfo.color === 'var(--green)' ? '#065f46' :
                   stripeInfo.color === 'var(--yellow)' ? '#92400e' :
                   stripeInfo.color === 'var(--primary)' ? '#9a3412' : 'var(--gray-500)',
          }}>
            <StripeIcon size={14} />
            {stripeInfo.label}
          </span>
        </div>

        {stripeMessage && (
          <div className={`message message-${stripeMessage.type}`}>{stripeMessage.text}</div>
        )}

        {!provider.stripe_account_id ? (
          <div>
            <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', marginBottom: 16, lineHeight: 1.6 }}>
              Um Zahlungen von Kunden zu empfangen, verbinden Sie Ihr Konto mit Stripe.
              Sie werden zur sicheren Einrichtung weitergeleitet, wo Sie Ihre Bankdaten hinterlegen.
            </p>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <div className="stripe-feature">
                <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                <span>Kreditkarte, SEPA & Apple Pay</span>
              </div>
              <div className="stripe-feature">
                <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                <span>Automatische Auszahlung</span>
              </div>
              <div className="stripe-feature">
                <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                <span>Sichere Zahlungsabwicklung</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={startStripeOnboarding}
              disabled={stripeLoading}
              style={{ marginTop: 8 }}
            >
              {stripeLoading
                ? <><Loader size={16} className="spin" /> Wird vorbereitet...</>
                : <><CreditCard size={16} /> Stripe-Konto einrichten</>
              }
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div className="stripe-status-item">
                <span className="stripe-status-label">Zahlungen empfangen</span>
                <span className={`stripe-status-value ${stripeStatus?.charges_enabled ? 'active' : ''}`}>
                  {stripeStatus?.charges_enabled ? 'Aktiviert' : 'Ausstehend'}
                </span>
              </div>
              <div className="stripe-status-item">
                <span className="stripe-status-label">Auszahlungen</span>
                <span className={`stripe-status-value ${stripeStatus?.payouts_enabled ? 'active' : ''}`}>
                  {stripeStatus?.payouts_enabled ? 'Aktiviert' : 'Ausstehend'}
                </span>
              </div>
              <div className="stripe-status-item">
                <span className="stripe-status-label">Provision</span>
                <span className="stripe-status-value">{provider.commission_rate || 10}%</span>
              </div>
            </div>

            {(!stripeStatus?.charges_enabled || !stripeStatus?.payouts_enabled) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={startStripeOnboarding}
                disabled={stripeLoading}
              >
                {stripeLoading
                  ? <><Loader size={16} className="spin" /> Wird vorbereitet...</>
                  : <><ExternalLink size={16} /> Einrichtung fortsetzen</>
                }
              </button>
            )}

            {stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled && (
              <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem', marginTop: 4 }}>
                Ihr Stripe-Konto ist vollständig eingerichtet. Auszahlungen erfolgen automatisch.
              </p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2>Unternehmen</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Firmenname *</label>
              <input name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Slogan</label>
              <input name="slogan" value={form.slogan} onChange={handleChange} placeholder="z.B. Ihr Bootsexperte seit 1990" />
            </div>
          </div>
          <div className="form-group">
            <label>Beschreibung</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={4} />
          </div>
          <div className="form-group">
            <label>Shop-Beschreibung</label>
            <textarea name="shop_description" value={form.shop_description} onChange={handleChange} rows={3} placeholder="Text, der im Shop unter Ihrem Namen angezeigt wird" />
          </div>
        </div>

        <div className="card">
          <h2>Adresse</h2>
          <div className="form-group">
            <label>Straße + Hausnr.</label>
            <input name="street" value={form.street} onChange={handleChange} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>PLZ</label>
              <input name="postal_code" value={form.postal_code} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Stadt</label>
              <input name="city" value={form.city} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Land</label>
              <input name="country" value={form.country} onChange={handleChange} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Kontakt</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Telefon</label>
              <input name="phone" value={form.phone} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>E-Mail</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Website</label>
              <input name="website" value={form.website} onChange={handleChange} placeholder="https://" />
            </div>
            <div className="form-group">
              <label>Öffnungszeiten</label>
              <input name="opening_hours" value={form.opening_hours} onChange={handleChange} placeholder="Mo-Fr 8-17 Uhr" />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Geschäftsdaten</h2>
          <div className="form-row">
            <div className="form-group">
              <label>USt-IdNr.</label>
              <input name="tax_id" value={form.tax_id} onChange={handleChange} placeholder="DE123456789" />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <><Loader size={16} className="spin" /> Speichern...</> : <><Save size={16} /> Speichern</>}
          </button>
        </div>
      </form>
    </div>
  )
}
