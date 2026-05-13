import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Save, Loader, CreditCard, ExternalLink, CheckCircle, AlertCircle, Clock, Key, Copy, RefreshCw, Globe, Image as ImageIcon, Upload, Trash2, Tag, Wrench, Plus, X, Eye } from 'lucide-react'

// Storage bucket created by database/038_provider_images_bucket.sql
const PROVIDER_IMAGES_BUCKET = 'provider-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB (matches bucket limit)

export default function Profile() {
  const { provider, loadProvider, user } = useAuth()
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  // Stripe Connect state
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeStatus, setStripeStatus] = useState(null)
  const [stripeMessage, setStripeMessage] = useState(null)

  // API Key state
  const [apiKey, setApiKey] = useState(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [apiKeyCopied, setApiKeyCopied] = useState(false)
  const [generatingKey, setGeneratingKey] = useState(false)

  // Image upload state
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [imageMessage, setImageMessage] = useState(null)
  const logoInputRef = useRef(null)
  const coverInputRef = useRef(null)

  // Services + Brands chip editors (linked to shop products)
  const [services, setServices] = useState([])
  const [brands, setBrands] = useState([])
  const [serviceInput, setServiceInput] = useState('')
  const [brandInput, setBrandInput] = useState('')
  const [products, setProducts] = useState([])

  // Subscription / Professional-Upgrade
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [subscriptionMessage, setSubscriptionMessage] = useState(null)

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
      setServices(Array.isArray(provider.services) ? provider.services : [])
      setBrands(Array.isArray(provider.brands) ? provider.brands : [])

      // Check Stripe URL params for return from onboarding / subscription
      const params = new URLSearchParams(window.location.search)
      if (params.get('stripe') === 'success') {
        setStripeMessage({ type: 'success', text: 'Stripe-Einrichtung abgeschlossen! Ihr Konto wird geprüft.' })
        window.history.replaceState({}, '', '/profile')
        loadProvider(user.id)
      } else if (params.get('stripe') === 'refresh') {
        setStripeMessage({ type: 'info', text: 'Bitte schließen Sie die Stripe-Einrichtung ab.' })
        window.history.replaceState({}, '', '/profile')
      } else if (params.get('subscription') === 'success') {
        setSubscriptionMessage({ type: 'success', text: 'Abo abgeschlossen! Wird mit Stripe synchronisiert…' })
        window.history.replaceState({}, '', '/profile')
        // Aktiv mit Stripe synchronisieren — unabhängig davon ob der
        // Webhook schon angekommen ist
        syncSubscriptionFromStripe(true)
      } else if (params.get('subscription') === 'cancelled') {
        setSubscriptionMessage({ type: 'info', text: 'Abo-Abschluss abgebrochen.' })
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

  // Load API key
  useEffect(() => {
    if (provider) {
      setApiKey(provider.api_key || null)
      setWebhookUrl(provider.webhook_url || '')
    }
  }, [provider])

  // Load shop products (used for auto-suggesting brands/services + linking chips)
  useEffect(() => {
    if (!provider?.id) return
    supabase
      .from('products')
      .select('id, name, manufacturer, tags')
      .eq('provider_id', provider.id)
      .eq('is_active', true)
      .then(({ data }) => setProducts(data || []))
      .catch(() => setProducts([]))
  }, [provider?.id])

  // Auto-suggest brands from product manufacturers that aren't yet on the brand list
  const suggestedBrands = useMemo(() => {
    const fromProducts = new Set(
      products.map(p => (p.manufacturer || '').trim()).filter(Boolean)
    )
    const lowerBrands = new Set(brands.map(b => b.toLowerCase()))
    return [...fromProducts].filter(b => !lowerBrands.has(b.toLowerCase())).slice(0, 12)
  }, [products, brands])

  // Auto-suggest services from product tags
  const suggestedServices = useMemo(() => {
    const fromTags = new Set()
    products.forEach(p => (p.tags || []).forEach(t => t && fromTags.add(t.trim())))
    const lowerServices = new Set(services.map(s => s.toLowerCase()))
    return [...fromTags].filter(s => !lowerServices.has(s.toLowerCase())).slice(0, 12)
  }, [products, services])

  // Count how many shop products match a given brand/service (text match on name/manufacturer/tags)
  function productMatchCount(term) {
    if (!term) return 0
    const t = term.toLowerCase()
    return products.filter(p =>
      (p.manufacturer || '').toLowerCase().includes(t)
      || (p.name || '').toLowerCase().includes(t)
      || (p.tags || []).some(tag => (tag || '').toLowerCase().includes(t))
    ).length
  }

  function addService(s) {
    const v = (s || '').trim()
    if (!v || services.some(x => x.toLowerCase() === v.toLowerCase())) return
    setServices([...services, v])
  }
  function removeService(s) {
    setServices(services.filter(x => x !== s))
  }
  function addBrand(b) {
    const v = (b || '').trim()
    if (!v || brands.some(x => x.toLowerCase() === v.toLowerCase())) return
    setBrands([...brands, v])
  }
  function removeBrand(b) {
    setBrands(brands.filter(x => x !== b))
  }

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

  // ─── Skipily-Abo: vier wählbare Pläne ────────────────────────────────────
  const SUBSCRIPTION_PLANS = [
    { code: 'pro_monthly',  tier: 'Pro',        period: 'Monatlich', price: 79,   per: 'Monat',
      price_id: 'price_1TWIBKAKSxHR03mTLBHJkIvb' },
    { code: 'pro_yearly',   tier: 'Pro',        period: 'Jährlich',  price: 789,  per: 'Jahr',
      price_id: 'price_1TWI7bAKSxHR03mTLIBshinq',  savings: 'Spare 17 %' },
    { code: 'ent_monthly',  tier: 'Enterprise', period: 'Monatlich', price: 199,  per: 'Monat',
      price_id: 'price_1TWIDLAKSxHR03mT7o48URgq' },
    { code: 'ent_yearly',   tier: 'Enterprise', period: 'Jährlich',  price: 1999, per: 'Jahr',
      price_id: 'price_1TWIE6AKSxHR03mT2gFOvwdw', savings: 'Spare 17 %' },
  ]

  async function startSubscriptionCheckout(priceId) {
    setSubscriptionLoading(true)
    setSubscriptionMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-subscription-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id, price_id: priceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout-Fehler')
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('Keine Checkout-URL erhalten')
      }
    } catch (err) {
      setSubscriptionMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setSubscriptionLoading(false)
    }
  }

  async function syncSubscriptionFromStripe(showSuccess = false) {
    if (!provider?.id) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-subscription-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync fehlgeschlagen')

      // Provider-State neu laden, damit das UI den neuen Tier zeigt
      await loadProvider(user.id)

      if (showSuccess && data.status === 'synced') {
        setSubscriptionMessage({
          type: 'success',
          text: `Abo aktiv: ${data.plan?.replace('_', ' · ') || data.tier}.`,
        })
      } else if (showSuccess && data.status === 'no_subscription') {
        setSubscriptionMessage({ type: 'info', text: 'Kein aktives Abo bei Stripe gefunden.' })
      }
    } catch (err) {
      console.warn('Subscription-Sync:', err)
      if (showSuccess) setSubscriptionMessage({ type: 'error', text: 'Sync fehlgeschlagen: ' + err.message })
    }
  }

  async function openBillingPortal() {
    setSubscriptionLoading(true)
    setSubscriptionMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-billing-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Billing-Portal nicht erreichbar')
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('Keine Portal-URL erhalten')
      }
    } catch (err) {
      setSubscriptionMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setSubscriptionLoading(false)
    }
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
          services,
          brands,
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

  async function generateApiKey() {
    setGeneratingKey(true)
    try {
      // Generate a random API key
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      const keyParts = []
      for (let i = 0; i < 4; i++) {
        let part = ''
        for (let j = 0; j < 8; j++) {
          part += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        keyParts.push(part)
      }
      const newKey = `bc_${keyParts.join('_')}`

      const { error } = await supabase
        .from('service_providers')
        .update({ api_key: newKey })
        .eq('id', provider.id)

      if (error) throw error
      setApiKey(newKey)
      setApiKeyVisible(true)
      setMessage({ type: 'success', text: 'API-Schlüssel generiert. Bitte sicher aufbewahren!' })
      loadProvider(user.id)
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    } finally {
      setGeneratingKey(false)
    }
  }

  async function saveWebhookUrl() {
    try {
      const { error } = await supabase
        .from('service_providers')
        .update({ webhook_url: webhookUrl || null })
        .eq('id', provider.id)

      if (error) throw error
      setMessage({ type: 'success', text: 'Webhook-URL gespeichert.' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    }
  }

  // ---------------------------------------------------------------------
  // Image uploads (logo + cover) → Supabase Storage bucket provider-images
  // ---------------------------------------------------------------------

  async function handleImageUpload(kind, file) {
    setImageMessage(null)
    if (!file) return
    if (!provider?.id) {
      setImageMessage({ type: 'error', text: 'Kein Provider-Profil gefunden.' })
      return
    }

    // Basic validation
    if (!file.type.startsWith('image/')) {
      setImageMessage({ type: 'error', text: 'Bitte eine Bilddatei auswählen.' })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageMessage({
        type: 'error',
        text: `Bild ist größer als 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
      })
      return
    }

    const setBusy = kind === 'logo' ? setUploadingLogo : setUploadingCover
    setBusy(true)

    try {
      // Extension from mime or filename, fallback to jpg
      const extFromType = file.type.split('/')[1] || 'jpg'
      const ext = ['jpeg', 'jpg', 'png', 'webp', 'heic', 'heif'].includes(extFromType)
        ? (extFromType === 'jpeg' ? 'jpg' : extFromType)
        : 'jpg'

      const folder = kind === 'logo' ? 'logos' : 'covers'
      const path = `${folder}/${provider.id}.${ext}`

      const { error: upErr } = await supabase.storage
        .from(PROVIDER_IMAGES_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        })

      if (upErr) throw upErr

      // Public URL (bucket is public)
      const { data: pub } = supabase.storage
        .from(PROVIDER_IMAGES_BUCKET)
        .getPublicUrl(path)

      // Bust any CDN cache by appending a short timestamp — the URL itself
      // stays stable on the DB side (upsert overwrote the object).
      const publicUrl = pub.publicUrl

      // Persist on service_providers
      const column = kind === 'logo' ? 'logo_url' : 'cover_image_url'
      const { error: dbErr } = await supabase
        .from('service_providers')
        .update({ [column]: publicUrl })
        .eq('id', provider.id)
      if (dbErr) throw dbErr

      setImageMessage({
        type: 'success',
        text: kind === 'logo' ? 'Logo aktualisiert.' : 'Titelbild aktualisiert.',
      })
      loadProvider(user.id)
    } catch (err) {
      console.error('image upload error:', err)
      setImageMessage({
        type: 'error',
        text: `Upload fehlgeschlagen: ${err.message || err}`,
      })
    } finally {
      setBusy(false)
      // Reset input so the same file can be re-uploaded
      if (kind === 'logo' && logoInputRef.current) logoInputRef.current.value = ''
      if (kind === 'cover' && coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  async function handleImageRemove(kind) {
    setImageMessage(null)
    if (!provider?.id) return

    const column = kind === 'logo' ? 'logo_url' : 'cover_image_url'
    const currentUrl = provider[column]
    if (!currentUrl) return

    if (!confirm(kind === 'logo' ? 'Logo wirklich entfernen?' : 'Titelbild wirklich entfernen?')) {
      return
    }

    const setBusy = kind === 'logo' ? setUploadingLogo : setUploadingCover
    setBusy(true)
    try {
      // Try to delete from storage (only succeeds if the URL points at our bucket)
      if (currentUrl.includes(`/storage/v1/object/public/${PROVIDER_IMAGES_BUCKET}/`)) {
        const marker = `/storage/v1/object/public/${PROVIDER_IMAGES_BUCKET}/`
        const pathInBucket = currentUrl.split(marker)[1]
        if (pathInBucket) {
          await supabase.storage.from(PROVIDER_IMAGES_BUCKET).remove([pathInBucket])
        }
      }

      const { error: dbErr } = await supabase
        .from('service_providers')
        .update({ [column]: null })
        .eq('id', provider.id)
      if (dbErr) throw dbErr

      setImageMessage({
        type: 'success',
        text: kind === 'logo' ? 'Logo entfernt.' : 'Titelbild entfernt.',
      })
      loadProvider(user.id)
    } catch (err) {
      console.error('image remove error:', err)
      setImageMessage({
        type: 'error',
        text: `Entfernen fehlgeschlagen: ${err.message || err}`,
      })
    } finally {
      setBusy(false)
    }
  }

  function copyApiKey() {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setApiKeyCopied(true)
      setTimeout(() => setApiKeyCopied(false), 2000)
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Stammdaten</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            So sehen Kunden dein Profil in der Skipily-App. Leistungen und Marken werden anklickbar und führen Kunden zu passenden Produkten.
          </p>
        </div>
        <a
          href={`/provider/${provider.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          <Eye size={16} /> Live-Vorschau
        </a>
      </div>

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

      {/* ─── Skipily-Abo (Pro / Enterprise / Standard / Admin-Grant) ─── */}
      {(() => {
        const tier            = provider.subscription_tier   || 'standard'
        const status          = provider.subscription_status || 'active'
        const plan            = provider.subscription_plan
        const isProfessional  = tier === 'professional' && status === 'active'
        const isEnterprise    = isProfessional && (plan === 'ent_monthly' || plan === 'ent_yearly')
        const isAdminGrant    = tier === 'admin_grant'
        const validUntil      = tier === 'admin_grant' ? provider.free_until : provider.subscription_period_end
        const accent          = isEnterprise ? '#7e22ce' : isProfessional ? '#15803d' : isAdminGrant ? '#854d0e' : '#475569'
        const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null

        const planLabel = ({
          pro_monthly:  'Pro · monatlich',
          pro_yearly:   'Pro · jährlich',
          ent_monthly:  'Enterprise · monatlich',
          ent_yearly:   'Enterprise · jährlich',
        })[plan] || (isProfessional ? 'Pro' : '')

        return (
          <div className="card" style={{ borderLeft: `4px solid ${accent}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                ⭐ Skipily-Abo
              </h2>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
                background: isEnterprise ? '#f3e8ff' : isProfessional ? '#d1fae5' : isAdminGrant ? '#fef3c7' : '#f1f5f9',
                color: accent,
              }}>
                {isEnterprise   ? `💎 Enterprise${planLabel ? ' · ' + planLabel.split('· ')[1] : ''}` :
                 isProfessional ? `⭐ ${planLabel || 'Pro'}` :
                 isAdminGrant   ? '🎁 Admin-Freischaltung' : 'Standard'}
              </span>
            </div>

            {subscriptionMessage && (
              <div className={`message message-${subscriptionMessage.type}`} style={{ marginBottom: 12 }}>
                {subscriptionMessage.text}
              </div>
            )}

            {validUntil && (
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', marginBottom: 12 }}>
                {isAdminGrant ? 'Kostenfreie Nutzung bis ' : 'Nächste Verlängerung am '}
                <strong>{fmtDate(validUntil)}</strong>
              </p>
            )}

            {tier === 'standard' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                  <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', margin: 0, lineHeight: 1.6, flex: 1, minWidth: 240 }}>
                    Mit <strong>Pro</strong> erhältst du erweiterte Features (API-Zugang,
                    Webhook-Integration, priorisierte Sichtbarkeit). Mit <strong>Enterprise</strong>
                    zusätzlich Werbeplätze, Markt-Analytics und Multi-User-Verwaltung.
                  </p>
                  <button
                    type="button"
                    onClick={() => syncSubscriptionFromStripe(true)}
                    title="Status manuell mit Stripe abgleichen"
                    style={{
                      background: 'transparent', border: '1px solid var(--gray-200)',
                      color: 'var(--gray-500)', padding: '4px 10px', borderRadius: 6,
                      fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                    🔄 Status aktualisieren
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {SUBSCRIPTION_PLANS.map(plan => {
                    const isEnterprise = plan.tier === 'Enterprise'
                    return (
                      <button
                        key={plan.code}
                        type="button"
                        onClick={() => startSubscriptionCheckout(plan.price_id)}
                        disabled={subscriptionLoading}
                        style={{
                          textAlign: 'left',
                          padding: '14px 16px',
                          borderRadius: 12,
                          border: `2px solid ${isEnterprise ? '#a855f7' : '#22c55e'}`,
                          background: '#fff',
                          cursor: subscriptionLoading ? 'wait' : 'pointer',
                          transition: 'transform .12s, box-shadow .12s',
                          position: 'relative',
                        }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                        onMouseOut={e =>  { e.currentTarget.style.transform = '';                  e.currentTarget.style.boxShadow = '' }}
                      >
                        {plan.savings && (
                          <span style={{
                            position: 'absolute', top: -8, right: 12,
                            background: '#facc15', color: '#713f12',
                            padding: '2px 8px', borderRadius: 10,
                            fontSize: 10, fontWeight: 700,
                          }}>{plan.savings}</span>
                        )}
                        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: isEnterprise ? '#7e22ce' : '#15803d', textTransform: 'uppercase' }}>
                          {plan.tier}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                          {plan.price} €
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)' }}> / {plan.per}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                          {plan.period === 'Jährlich'
                            ? `≈ ${(plan.price / 12).toLocaleString('de-DE', { maximumFractionDigits: 0 })} € / Monat`
                            : 'monatlich kündbar'}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {subscriptionLoading && (
                  <p style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-500)' }}>
                    <Loader size={14} className="spin" /> Checkout wird vorbereitet…
                  </p>
                )}
              </div>
            )}

            {isProfessional && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={openBillingPortal}
                  disabled={subscriptionLoading}
                >
                  {subscriptionLoading
                    ? <><Loader size={16} className="spin" /> Lädt…</>
                    : <><ExternalLink size={16} /> Abo verwalten / kündigen</>}
                </button>
                <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--gray-400)' }}>
                  Rechnungen, Zahlungsmethoden und Kündigung im Stripe-Portal.
                </span>
              </div>
            )}

            {isAdminGrant && (
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', marginTop: 8 }}>
                Du nutzt Skipily Professional aktuell <strong>kostenfrei</strong> über eine
                Admin-Freischaltung. Nach Ablauf kannst du regulär upgraden.
              </p>
            )}
          </div>
        )
      })()}

      {/* Images: Logo + Cover — only editable by the provider, not by app users */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <ImageIcon size={20} style={{ color: 'var(--primary)' }} />
          <h2 style={{ margin: 0 }}>Bilder</h2>
        </div>
        <p className="hint" style={{ marginBottom: 16 }}>
          Logo und Titelbild erscheinen auf Ihrem Profil in der Skipily App.
          Nur Sie als Anbieter können diese Bilder ändern. Max. 5 MB, empfohlen: Logo 512×512 px, Titelbild 1600×900 px.
        </p>

        {imageMessage && (
          <div className={`message message-${imageMessage.type}`} style={{ marginBottom: 16 }}>
            {imageMessage.text}
          </div>
        )}

        {/* Logo */}
        <div className="form-group">
          <label>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 12,
                border: '1px solid var(--gray-200)',
                background: 'var(--gray-50)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {provider.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt="Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <ImageIcon size={28} style={{ color: 'var(--gray-300)' }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload('logo', e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                {uploadingLogo
                  ? <><Loader size={14} className="spin" /> Wird hochgeladen...</>
                  : <><Upload size={14} /> {provider.logo_url ? 'Logo ersetzen' : 'Logo hochladen'}</>
                }
              </button>
              {provider.logo_url && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleImageRemove('logo')}
                  disabled={uploadingLogo}
                  title="Logo entfernen"
                >
                  <Trash2 size={14} /> Entfernen
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cover / Titelbild */}
        <div className="form-group" style={{ marginTop: 20 }}>
          <label>Titelbild</label>
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              maxHeight: 260,
              borderRadius: 12,
              border: '1px solid var(--gray-200)',
              background: provider.cover_image_url
                ? 'var(--gray-50)'
                : 'linear-gradient(135deg, #e0e7ff 0%, #fce7f3 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            {provider.cover_image_url ? (
              <img
                src={provider.cover_image_url}
                alt="Titelbild"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div style={{ color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={28} />
                <span>Noch kein Titelbild</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleImageUpload('cover', e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
            >
              {uploadingCover
                ? <><Loader size={14} className="spin" /> Wird hochgeladen...</>
                : <><Upload size={14} /> {provider.cover_image_url ? 'Titelbild ersetzen' : 'Titelbild hochladen'}</>
              }
            </button>
            {provider.cover_image_url && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleImageRemove('cover')}
                disabled={uploadingCover}
                title="Titelbild entfernen"
              >
                <Trash2 size={14} /> Entfernen
              </button>
            )}
          </div>
        </div>
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

        {/* ─── Leistungen (Services) ─────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Wrench size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0 }}>Leistungen</h2>
          </div>
          <p className="hint" style={{ marginBottom: 16 }}>
            Welche Services bietest du an? Diese erscheinen als anklickbare Tags auf deinem Profil. Klickt ein Kunde in der App auf eine Leistung, wird automatisch nach passenden Produkten in deinem Shop gesucht.
          </p>

          {/* Existing services as chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {services.length === 0 && (
              <span style={{ color: 'var(--gray-400)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                Noch keine Leistungen hinterlegt.
              </span>
            )}
            {services.map(s => {
              const cnt = productMatchCount(s)
              return (
                <span key={s} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px 6px 12px', borderRadius: 20,
                  background: '#f0fdf4', color: '#166534',
                  border: '1px solid #bbf7d0', fontSize: 13, fontWeight: 500,
                }}>
                  {s}
                  {cnt > 0 && (
                    <span style={{
                      background: '#dcfce7', color: '#15803d',
                      borderRadius: 10, padding: '1px 7px',
                      fontSize: 11, fontWeight: 700,
                    }} title={`${cnt} passende Produkte im Shop`}>
                      {cnt} 📦
                    </span>
                  )}
                  <button type="button" onClick={() => removeService(s)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: '#166534', padding: 0, display: 'flex', alignItems: 'center',
                    }}
                    title="Entfernen">
                    <X size={14} />
                  </button>
                </span>
              )
            })}
          </div>

          {/* Add input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={serviceInput}
              onChange={e => setServiceInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addService(serviceInput)
                  setServiceInput('')
                }
              }}
              placeholder="z.B. Antifouling, Motorservice, Winterlager…"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-secondary"
              onClick={() => { addService(serviceInput); setServiceInput('') }}>
              <Plus size={14} /> Hinzufügen
            </button>
          </div>

          {/* Suggestions from shop products (tags) */}
          {suggestedServices.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>
                💡 Aus deinen Shop-Produkten erkannt — zum Übernehmen klicken:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestedServices.map(s => (
                  <button key={s} type="button"
                    onClick={() => addService(s)}
                    style={{
                      padding: '4px 10px', borderRadius: 16,
                      background: '#fff', border: '1px dashed #cbd5e1',
                      color: '#475569', fontSize: 12, cursor: 'pointer',
                    }}>
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Marken (Brands) ─────────────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Tag size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0 }}>Marken</h2>
          </div>
          <p className="hint" style={{ marginBottom: 16 }}>
            Welche Marken/Hersteller führst oder servicierst du? Klickt ein Kunde in der App eine Marke an, werden passende Produkte aus deinem Shop angezeigt.
          </p>

          {/* Existing brands as chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {brands.length === 0 && (
              <span style={{ color: 'var(--gray-400)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                Noch keine Marken hinterlegt.
              </span>
            )}
            {brands.map(b => {
              const cnt = productMatchCount(b)
              return (
                <span key={b} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px 6px 12px', borderRadius: 20,
                  background: '#fff7ed', color: '#c2410c',
                  border: '1px solid #fed7aa', fontSize: 13, fontWeight: 500,
                }}>
                  {b}
                  {cnt > 0 && (
                    <span style={{
                      background: '#ffedd5', color: '#9a3412',
                      borderRadius: 10, padding: '1px 7px',
                      fontSize: 11, fontWeight: 700,
                    }} title={`${cnt} Produkte dieser Marke im Shop`}>
                      {cnt} 📦
                    </span>
                  )}
                  <button type="button" onClick={() => removeBrand(b)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: '#c2410c', padding: 0, display: 'flex', alignItems: 'center',
                    }}
                    title="Entfernen">
                    <X size={14} />
                  </button>
                </span>
              )
            })}
          </div>

          {/* Add input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={brandInput}
              onChange={e => setBrandInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addBrand(brandInput)
                  setBrandInput('')
                }
              }}
              placeholder="z.B. Volvo Penta, Yamaha, Raymarine…"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-secondary"
              onClick={() => { addBrand(brandInput); setBrandInput('') }}>
              <Plus size={14} /> Hinzufügen
            </button>
          </div>

          {/* Suggestions from shop products (manufacturers) */}
          {suggestedBrands.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>
                💡 Hersteller aus deinem Shop — zum Übernehmen klicken:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestedBrands.map(b => (
                  <button key={b} type="button"
                    onClick={() => addBrand(b)}
                    style={{
                      padding: '4px 10px', borderRadius: 16,
                      background: '#fff', border: '1px dashed #cbd5e1',
                      color: '#475569', fontSize: 12, cursor: 'pointer',
                    }}>
                    + {b}
                  </button>
                ))}
              </div>
            </div>
          )}

          {products.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>
              {products.length} Produkt{products.length === 1 ? '' : 'e'} in deinem Shop —
              die Zahl neben jedem Chip zeigt, wie viele davon zu dieser Marke/Leistung passen.
            </p>
          )}
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

        {/* API Integration Section */}
        <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Key size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0 }}>API & Integration</h2>
          </div>
          <p className="hint" style={{ marginBottom: '16px' }}>
            Nutze die REST API um Produkte automatisch zu synchronisieren. Dein API-Schlüssel ermöglicht Zugriff auf die Produkt-Verwaltung.
          </p>

          {/* API Key */}
          <div className="form-group">
            <label>API-Schlüssel</label>
            {apiKey ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type={apiKeyVisible ? 'text' : 'password'}
                  value={apiKey}
                  readOnly
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                  onClick={() => setApiKeyVisible(!apiKeyVisible)}
                />
                <button type="button" className="btn-icon" onClick={copyApiKey} title="Kopieren">
                  {apiKeyCopied ? <CheckCircle size={16} style={{ color: 'var(--green)' }} /> : <Copy size={16} />}
                </button>
                <button type="button" className="btn-icon" onClick={generateApiKey} title="Neu generieren" disabled={generatingKey}>
                  <RefreshCw size={16} className={generatingKey ? 'spin' : ''} />
                </button>
              </div>
            ) : (
              <div>
                <button type="button" className="btn-secondary" onClick={generateApiKey} disabled={generatingKey}>
                  {generatingKey ? <><Loader size={14} className="spin" /> Generieren...</> : <><Key size={14} /> API-Schlüssel generieren</>}
                </button>
              </div>
            )}
          </div>

          {/* Webhook URL */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Globe size={14} /> Webhook-URL (optional)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://dein-server.de/webhooks/boatcare"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-secondary" onClick={saveWebhookUrl} style={{ whiteSpace: 'nowrap' }}>
                <Save size={14} /> Speichern
              </button>
            </div>
            <p className="hint" style={{ marginTop: '4px' }}>
              Wird bei Bestelländerungen mit Status-Updates aufgerufen (POST mit JSON-Payload).
            </p>
          </div>

          {/* API Docs Link */}
          {apiKey && (
            <div style={{ marginTop: '12px', padding: '12px', background: 'var(--gray-50)', borderRadius: '8px', fontSize: '0.85rem' }}>
              <strong>API-Endpoint:</strong>{' '}
              <code style={{ background: 'var(--gray-200)', padding: '2px 6px', borderRadius: '4px' }}>
                POST /functions/v1/products-api
              </code>
              <br /><br />
              <strong>Header:</strong>{' '}
              <code style={{ background: 'var(--gray-200)', padding: '2px 6px', borderRadius: '4px' }}>
                x-api-key: {apiKeyVisible ? apiKey : '••••••••'}
              </code>
              <br /><br />
              <span style={{ color: 'var(--gray-500)' }}>
                Produkte erstellen, aktualisieren und abfragen. GET-Anfragen sind ohne Authentifizierung möglich.
              </span>
            </div>
          )}
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
