import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Truck, MapPin, CreditCard, Check, ChevronLeft, ChevronRight, Package, AlertTriangle } from 'lucide-react'

const COUNTRIES = [
  { code: 'DE', name: 'Deutschland' },
  { code: 'AT', name: 'Österreich' },
  { code: 'CH', name: 'Schweiz' },
  { code: 'NL', name: 'Niederlande' },
  { code: 'FR', name: 'Frankreich' },
  { code: 'IT', name: 'Italien' },
  { code: 'ES', name: 'Spanien' },
  { code: 'HR', name: 'Kroatien' },
  { code: 'GR', name: 'Griechenland' },
]

export default function Checkout() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [cart, setCart] = useState([])
  const [step, setStep] = useState(0) // 0=address, 1=review, 2=payment, 3=done
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [orderNumbers, setOrderNumbers] = useState([])
  const [clientSecret, setClientSecret] = useState(null)
  const [publishableKey, setPublishableKey] = useState(null)
  const [createdOrders, setCreatedOrders] = useState([])
  const cardElementRef = useRef(null)
  const stripeRef = useRef(null)
  const elementsRef = useRef(null)

  // Shipping form
  const [shipping, setShipping] = useState({
    name: profile?.full_name || '',
    street: profile?.shipping_street || '',
    city: profile?.shipping_city || '',
    postalCode: profile?.shipping_postal_code || '',
    country: profile?.shipping_country || 'DE',
    note: '',
  })

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('boatcare_cart') || '[]')
    if (stored.length === 0 && step !== 3) navigate('/shop')
    setCart(stored)
  }, [])

  useEffect(() => {
    if (profile) {
      setShipping(prev => ({
        ...prev,
        name: prev.name || profile.full_name || '',
        street: prev.street || profile.shipping_street || '',
        city: prev.city || profile.shipping_city || '',
        postalCode: prev.postalCode || profile.shipping_postal_code || '',
        country: prev.country || profile.shipping_country || 'DE',
      }))
    }
  }, [profile])

  // Check URL for redirect return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const redirectStatus = params.get('redirect_status')
    const orderIdsParam = params.get('order_ids')

    if (redirectStatus === 'succeeded' && orderIdsParam) {
      localStorage.removeItem('boatcare_cart')
      setOrderNumbers(orderIdsParam.split(','))
      setStep(3)
    } else if (redirectStatus === 'failed') {
      setError('Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.')
    }
  }, [])

  // Mount Stripe Card Element when step=2 and clientSecret is ready
  useEffect(() => {
    if (step === 2 && clientSecret && publishableKey && !cardElementRef.current) {
      mountStripeElement()
    }
  }, [step, clientSecret, publishableKey])

  function mountStripeElement() {
    if (!window.Stripe) {
      setError('Stripe.js konnte nicht geladen werden. Bitte Seite neu laden.')
      return
    }
    const stripe = window.Stripe(publishableKey)
    stripeRef.current = stripe

    const elements = stripe.elements({ clientSecret, appearance: { theme: 'stripe' } })
    elementsRef.current = elements

    const paymentElement = elements.create('payment')
    const container = document.getElementById('stripe-payment-element')
    if (container) {
      paymentElement.mount(container)
      cardElementRef.current = paymentElement
    }
  }

  // Group cart items by provider
  const groupedByProvider = cart.reduce((groups, item) => {
    const key = item.provider_id || 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
    return groups
  }, {})

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  function validateAddress() {
    if (!shipping.name || !shipping.street || !shipping.city || !shipping.postalCode) {
      setError('Bitte füllen Sie alle Pflichtfelder aus.')
      return false
    }
    setError(null)
    return true
  }

  async function createOrdersAndPaymentIntent() {
    setLoading(true)
    setError(null)

    try {
      const orders = []

      for (const [providerId, items] of Object.entries(groupedByProvider)) {
        const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
        const shippingCost = 0

        let commissionRate = 10
        if (providerId !== 'unknown') {
          const { data: prov } = await supabase
            .from('service_providers')
            .select('commission_rate')
            .eq('id', providerId)
            .single()
          if (prov?.commission_rate) commissionRate = prov.commission_rate
        }

        const commissionAmount = subtotal * (commissionRate / 100)
        const total = subtotal + shippingCost

        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert({
            buyer_id: user.id,
            provider_id: providerId !== 'unknown' ? providerId : null,
            status: 'pending',
            subtotal,
            shipping_cost: shippingCost,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
            total,
            currency: 'EUR',
            shipping_name: shipping.name,
            shipping_street: shipping.street,
            shipping_city: shipping.city,
            shipping_postal_code: shipping.postalCode,
            shipping_country: shipping.country,
            payment_status: 'pending',
            buyer_note: shipping.note || null,
          })
          .select()
          .single()

        if (orderErr) throw new Error('Bestellung konnte nicht erstellt werden: ' + orderErr.message)

        const orderItems = items.map(item => ({
          order_id: order.id,
          product_id: item.id,
          quantity: item.quantity,
          unit_price: item.price,
          total: item.price * item.quantity,
          product_name: item.name,
          product_manufacturer: item.manufacturer || null,
        }))

        const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
        if (itemsErr) throw new Error('Artikel konnten nicht gespeichert werden: ' + itemsErr.message)

        orders.push(order)
      }

      setCreatedOrders(orders)

      // Call create-payment-intent Edge Function
      const totalCents = Math.round(cartTotal * 100)
      const orderIds = orders.map(o => o.id)

      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(`https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ',
        },
        body: JSON.stringify({
          amount: totalCents,
          currency: 'eur',
          order_ids: orderIds,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Payment-Fehler (${response.status})`)
      }

      const paymentData = await response.json()
      setClientSecret(paymentData.client_secret)
      setPublishableKey(paymentData.publishable_key)
      setStep(2) // Go to payment step

    } catch (err) {
      console.error('Checkout error:', err)
      setError(err.message)
    }

    setLoading(false)
  }

  async function handlePayment() {
    if (!stripeRef.current || !elementsRef.current) {
      setError('Stripe ist noch nicht geladen. Bitte warten.')
      return
    }

    setLoading(true)
    setError(null)

    const orderIds = createdOrders.map(o => o.id)

    const { error: stripeError } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?order_ids=${orderIds.join(',')}&redirect_status=succeeded`,
        payment_method_data: {
          billing_details: {
            name: shipping.name,
            address: {
              line1: shipping.street,
              city: shipping.city,
              postal_code: shipping.postalCode,
              country: shipping.country,
            },
          },
        },
      },
      redirect: 'if_required',
    })

    if (stripeError) {
      if (stripeError.type === 'card_error' || stripeError.type === 'validation_error') {
        setError(stripeError.message)
      } else {
        setError('Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.')
      }
      setLoading(false)
      return
    }

    // Payment succeeded without redirect
    setOrderNumbers(createdOrders.map(o => o.order_number))
    localStorage.removeItem('boatcare_cart')
    setStep(3)
    setLoading(false)
  }

  if (cart.length === 0 && step !== 3) {
    return (
      <div className="page">
        <div className="empty-state">
          <ShoppingCart size={64} color="#cbd5e1" />
          <h2>Warenkorb ist leer</h2>
          <button className="btn-primary" onClick={() => navigate('/shop')}>Zum Shop</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page checkout-page">
      <button className="btn-back" onClick={() => {
        if (step === 2) setStep(1)
        else if (step > 0 && step < 3) setStep(step - 1)
        else navigate('/shop')
      }}>
        <ChevronLeft size={20} /> {step === 0 ? 'Zurück zum Shop' : 'Zurück'}
      </button>

      <h1>Bestellung aufgeben</h1>

      {/* Progress steps */}
      <div className="checkout-steps">
        <div className={`checkout-step ${step >= 0 ? 'active' : ''} ${step > 0 ? 'done' : ''}`}>
          <div className="step-circle">{step > 0 ? <Check size={16} /> : '1'}</div>
          <span>Lieferadresse</span>
        </div>
        <div className="step-line" />
        <div className={`checkout-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
          <div className="step-circle">{step > 1 ? <Check size={16} /> : '2'}</div>
          <span>Überprüfen</span>
        </div>
        <div className="step-line" />
        <div className={`checkout-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
          <div className="step-circle">{step > 2 ? <Check size={16} /> : '3'}</div>
          <span>Bezahlung</span>
        </div>
      </div>

      {error && <div className="alert alert-error"><AlertTriangle size={16} /> {error}</div>}

      {/* Step 0: Shipping address */}
      {step === 0 && (
        <div className="card">
          <h2><MapPin size={18} /> Lieferadresse</h2>
          <div className="form-group">
            <label>Name *</label>
            <input value={shipping.name} onChange={e => setShipping({ ...shipping, name: e.target.value })} placeholder="Vor- und Nachname" />
          </div>
          <div className="form-group">
            <label>Straße und Hausnummer *</label>
            <input value={shipping.street} onChange={e => setShipping({ ...shipping, street: e.target.value })} placeholder="Musterstraße 123" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>PLZ *</label>
              <input value={shipping.postalCode} onChange={e => setShipping({ ...shipping, postalCode: e.target.value })} placeholder="12345" />
            </div>
            <div className="form-group">
              <label>Stadt *</label>
              <input value={shipping.city} onChange={e => setShipping({ ...shipping, city: e.target.value })} placeholder="Musterstadt" />
            </div>
          </div>
          <div className="form-group">
            <label>Land</label>
            <select value={shipping.country} onChange={e => setShipping({ ...shipping, country: e.target.value })}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Hinweis zur Lieferung (optional)</label>
            <textarea value={shipping.note} onChange={e => setShipping({ ...shipping, note: e.target.value })} rows={2} placeholder="z.B. Zugang über Hintereingang..." />
          </div>
          <button className="btn-primary btn-full" onClick={() => validateAddress() && setStep(1)}>
            Weiter zur Überprüfung <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Step 1: Review order */}
      {step === 1 && (
        <div className="card">
          <h2><Package size={18} /> Bestellübersicht</h2>

          <div className="checkout-address-preview">
            <strong>{shipping.name}</strong>
            <span>{shipping.street}</span>
            <span>{shipping.postalCode} {shipping.city}, {COUNTRIES.find(c => c.code === shipping.country)?.name}</span>
            {shipping.note && <span className="checkout-note">Hinweis: {shipping.note}</span>}
          </div>

          {Object.entries(groupedByProvider).map(([providerId, items]) => (
            <div key={providerId} className="checkout-group">
              <div className="checkout-group-header">
                <Truck size={16} /> Lieferung {providerId !== 'unknown' ? `(Provider)` : ''}
              </div>
              {items.map(item => (
                <div key={item.id} className="checkout-item">
                  <div className="checkout-item-info">
                    <span className="checkout-item-name">{item.name}</span>
                    <span className="checkout-item-qty">{item.quantity}x {Number(item.price).toFixed(2).replace('.', ',')} €</span>
                  </div>
                  <span className="checkout-item-total">{(item.price * item.quantity).toFixed(2).replace('.', ',')} €</span>
                </div>
              ))}
            </div>
          ))}

          <div className="checkout-totals">
            <div className="checkout-total-row">
              <span>Zwischensumme</span>
              <span>{cartTotal.toFixed(2).replace('.', ',')} €</span>
            </div>
            <div className="checkout-total-row">
              <span>Versand</span>
              <span>Kostenlos</span>
            </div>
            <div className="checkout-total-row checkout-grand-total">
              <span>Gesamt</span>
              <span>{cartTotal.toFixed(2).replace('.', ',')} €</span>
            </div>
          </div>

          <button className="btn-primary btn-full" onClick={createOrdersAndPaymentIntent} disabled={loading}>
            {loading ? 'Bestellung wird erstellt...' : <><CreditCard size={16} /> Weiter zur Bezahlung ({cartTotal.toFixed(2).replace('.', ',')} €)</>}
          </button>
        </div>
      )}

      {/* Step 2: Payment with embedded Stripe Element */}
      {step === 2 && (
        <div className="card">
          <h2><CreditCard size={18} /> Bezahlung</h2>

          <div className="checkout-test-notice">
            <AlertTriangle size={16} />
            <span>Testmodus: Verwenden Sie die Kartennummer <strong>4242 4242 4242 4242</strong> mit beliebigem Datum und CVC.</span>
          </div>

          <div className="checkout-totals" style={{ marginBottom: 20 }}>
            <div className="checkout-total-row checkout-grand-total">
              <span>Zu bezahlen</span>
              <span>{cartTotal.toFixed(2).replace('.', ',')} €</span>
            </div>
          </div>

          {/* Stripe Payment Element mounts here */}
          <div id="stripe-payment-element" style={{ minHeight: 120, padding: '12px 0' }} />

          <button className="btn-primary btn-full" onClick={handlePayment} disabled={loading} style={{ marginTop: 20 }}>
            {loading ? 'Zahlung wird verarbeitet...' : <><CreditCard size={16} /> Jetzt bezahlen</>}
          </button>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 3 && (
        <div className="card checkout-success">
          <div className="success-icon">
            <Check size={40} />
          </div>
          <h2>Bestellung erfolgreich!</h2>
          <p>Vielen Dank für Ihre Bestellung.</p>
          {orderNumbers.length > 0 && (
            <div className="success-orders">
              <strong>Bestellnummern:</strong>
              {orderNumbers.map((nr, i) => <span key={i} className="success-order-nr">{nr}</span>)}
            </div>
          )}
          <div className="success-details">
            <p>Lieferung an: <strong>{shipping.name}</strong></p>
            <p>{shipping.street}, {shipping.postalCode} {shipping.city}</p>
            <p className="success-total">Bezahlt: <strong>{cartTotal.toFixed(2).replace('.', ',')} €</strong></p>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
            <button className="btn-primary" onClick={() => navigate('/orders')}>
              Meine Bestellungen
            </button>
            <button className="btn-secondary" onClick={() => navigate('/shop')}>
              Weiter einkaufen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
