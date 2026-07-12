import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getCurrentLocation } from '../lib/geo'
import { Heart, MapPin, Phone, Mail, Globe, Star, Navigation, Tag, Clock, ChevronLeft, ShoppingBag, Wrench, Package, Pencil, Trash2, Send, X, MessageSquarePlus } from 'lucide-react'
import { useT } from '../i18n'
import { translateProviders, translateProducts, isTranslatableLang } from '../lib/dbTranslate'

const categoryConfig = {
  werkstatt: { icon: '🔧', label: 'Werkstatt', color: '#f97316' },
  repair: { icon: '🔧', label: 'Reparatur', color: '#f97316' },
  motor_service: { icon: '⚙️', label: 'Motorservice', color: '#f97316' },
  segelmacher: { icon: '⛵', label: 'Segelmacher', color: '#8b5cf6' },
  versorgung: { icon: '🛒', label: 'Versorgung', color: '#10b981' },
  marine_supplies: { icon: '🛒', label: 'Marine Supplies', color: '#10b981' },
  tankstelle: { icon: '⛽', label: 'Tankstelle', color: '#ef4444' },
  elektronik: { icon: '📡', label: 'Elektronik', color: '#3b82f6' },
  marina: { icon: '🌊', label: 'Marina', color: '#0ea5e9' },
  werft: { icon: '🚢', label: 'Werft', color: '#64748b' },
  winterlager: { icon: '❄️', label: 'Winterlager', color: '#06b6d4' },
  lackiererei: { icon: '🎨', label: 'Lackiererei', color: '#ec4899' },
  gutachter: { icon: '📋', label: 'Gutachter', color: '#6366f1' },
}

function getCat(category) {
  if (!category) return { icon: '⚓', label: 'Service', color: '#3b82f6' }
  const key = category.toLowerCase().replace(/[/ ]/g, '_')
  return categoryConfig[key] || { icon: '⚓', label: category.replace(/_/g, ' '), color: '#3b82f6' }
}

function StarRating({ rating, count }) {
  const { t } = useT()
  if (!rating || rating <= 0) return null
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <div className="star-rating">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={16}
          fill={i < full || (i === full && half) ? '#f59e0b' : 'none'}
          color={i < full || (i === full && half) ? '#f59e0b' : '#cbd5e1'}
        />
      ))}
      <span className="rating-value">{Number(rating).toFixed(1)}</span>
      {count > 0 && <span className="rating-count">({count} Bewertungen)</span>}
    </div>
  )
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export default function ProviderDetail() {
  const { t, lang } = useT()
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [provider, setProvider] = useState(null)
  const [tp, setTp] = useState(null) // übersetzte { services, description, slogan }
  const [trProducts, setTrProducts] = useState({}) // id -> { name, description }
  const [products, setProducts] = useState([])
  const [reviews, setReviews] = useState([])
  const [isFavorite, setIsFavorite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState(null)
  const [distance, setDistance] = useState(null)
  const [servicePrompt, setServicePrompt] = useState(null) // { label, query }
  // Reviews
  const [myReview, setMyReview] = useState(null)      // eigene vorhandene Bewertung
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewHover, setReviewHover] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  // Inquiry state
  const [showInquiryForm, setShowInquiryForm] = useState(false)
  const [inquirySubject, setInquirySubject] = useState('')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [inquiryBoatId, setInquiryBoatId] = useState('')
  const [inquiryNotes, setInquiryNotes] = useState('')
  const [inquirySaving, setInquirySaving] = useState(false)
  const [boats, setBoats] = useState([])
  const [boatEquipment, setBoatEquipment] = useState([])
  const [selectedEquipIds, setSelectedEquipIds] = useState([])
  const [equipSearch, setEquipSearch] = useState('')
  const [shipLocation, setShipLocation] = useState(null) // { lat, lon }
  const [locating, setLocating] = useState(false)

  async function attachShipLocation() {
    setLocating(true)
    try {
      const { lat, lon } = await getCurrentLocation()
      setShipLocation({ lat, lon })
    } catch (err) {
      alert(t('inq.locationError') + ' ' + (err.message || ''))
    } finally {
      setLocating(false)
    }
  }

  useEffect(() => {
    if (user && id) { loadProvider(); loadBoats() }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      }, () => {})
    }
  }, [user, id])

  // Provider-Freitext (services/description/slogan) on-demand übersetzen
  useEffect(() => {
    if (!provider || !isTranslatableLang(lang)) { setTp(null); return }
    const c = provider.translations?.[lang]
    if (c?.services) { setTp(c); return }
    setTp(null)
    translateProviders([provider.id], lang).then(m => { if (m[provider.id]) setTp(m[provider.id]) })
  }, [provider, lang])

  // Produkt-Namen/-Beschreibungen des Providers on-demand übersetzen
  useEffect(() => {
    if (!products.length || !isTranslatableLang(lang)) { setTrProducts({}); return }
    const base = {}; const missing = []
    for (const p of products) {
      const c = p.translations?.[lang]
      if (c?.name) base[p.id] = c; else missing.push(p.id)
    }
    setTrProducts(base)
    if (missing.length) translateProducts(missing, lang).then(m => setTrProducts(prev => ({ ...prev, ...m })))
  }, [products, lang])

  // ?inquiry=1 → Anfrage-Formular auto-öffnen.
  // sessionStorage liefert ggf. vorausgefüllte Daten (kommt aus Equipment-Anfrage),
  // aber auch ohne sessionStorage soll das Formular aufgehen, damit der User
  // direkt eine leere Anfrage schreiben kann.
  useEffect(() => {
    if (searchParams.get('inquiry') !== '1') return
    try {
      const pending = JSON.parse(sessionStorage.getItem('pending_inquiry') || 'null')
      if (pending) {
        setInquirySubject(pending.subject || '')
        setInquiryMessage(pending.message || '')
        setInquiryBoatId(pending.boat_id || '')
      }
    } catch (e) {
      console.warn('Could not parse pending_inquiry from sessionStorage')
    }
    // Form IMMER öffnen wenn ?inquiry=1 — auch wenn sessionStorage leer ist
    setShowInquiryForm(true)
  }, [searchParams])

  useEffect(() => {
    if (userLocation && provider?.latitude && provider?.longitude) {
      setDistance(calcDistance(userLocation.lat, userLocation.lon, provider.latitude, provider.longitude))
    }
  }, [userLocation, provider])

  async function loadProvider() {
    setLoading(true)
    const [{ data: prov }, { data: favs }, { data: prods }, { data: revs }] = await Promise.all([
      supabase.from('service_providers').select('*').eq('id', id).single(),
      supabase.from('user_favorites').select('id').eq('user_id', user.id).eq('provider_id', id),
      supabase.from('metashop_products').select('*, product_categories(*)').eq('provider_id', id).eq('is_active', true).limit(6),
      supabase.from('reviews').select('id, rating, comment, created_at, author_id, is_approved, is_reported')
        .eq('service_provider_id', id).order('created_at', { ascending: false }),
    ])
    setProvider(prov)
    setIsFavorite((favs || []).length > 0)
    setProducts(prods || [])
    const allRevs = revs || []
    setReviews(allRevs)
    // Eigene Bewertung herausfiltern
    const own = allRevs.find(r => r.author_id === user.id) || null
    setMyReview(own)
    if (own) { setReviewRating(own.rating); setReviewComment(own.comment || '') }
    setLoading(false)
  }

  async function submitReview() {
    if (reviewRating === 0) { alert(t('prov.k31')); return }
    setReviewSaving(true)
    try {
      let savedId = myReview?.id

      if (myReview) {
        const { error } = await supabase.from('reviews')
          .update({ rating: reviewRating, comment: reviewComment || null, updated_at: new Date().toISOString() })
          .eq('id', myReview.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('reviews')
          .insert({
            service_provider_id: id,
            author_id: user.id,
            rating: reviewRating,
            comment: reviewComment || null,
          })
          .select('id')
          .single()
        if (error) throw error
        savedId = data.id
      }

      // KI-Moderation läuft jetzt serverseitig per DB-Trigger (AFTER INSERT auf
      // reviews) mit dem gespeicherten Inhalt — kein Client-Aufruf mehr nötig.
      // Grund: der frühere öffentliche moderate-review-Aufruf erlaubte das
      // Verstecken fremder Reviews (Zensur) und das Umgehen der Moderation.

      setShowReviewForm(false)
      await loadProvider()
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message)
    }
    setReviewSaving(false)
  }

  async function deleteReview() {
    if (!confirm(t('prov.k32'))) return
    const { error } = await supabase.from('reviews').delete().eq('id', myReview.id)
    if (error) { alert('Fehler: ' + error.message); return }
    setMyReview(null)
    setReviewRating(0)
    setReviewComment('')
    setShowReviewForm(false)
    await loadProvider()
  }

  async function handleServiceClick(service) {
    // Check if this provider has matching products in their shop
    const { data } = await supabase
      .from('metashop_products')
      .select('id')
      .eq('provider_id', id)
      .eq('is_active', true)
      .ilike('name', `%${service}%`)
      .limit(1)
    if (data && data.length > 0) {
      navigate(`/shop?provider=${id}&q=${encodeURIComponent(service)}`)
    } else {
      setServicePrompt({ label: service, query: encodeURIComponent(service) })
    }
  }

  async function toggleFavorite() {
    if (isFavorite) {
      await supabase.from('user_favorites').delete().eq('user_id', user.id).eq('provider_id', id)
      setIsFavorite(false)
    } else {
      await supabase.from('user_favorites').insert({ user_id: user.id, provider_id: id })
      setIsFavorite(true)
    }
  }

  async function loadBoats() {
    const { data } = await supabase.from('boats').select('*').eq('owner_id', user.id)
    setBoats(data || [])
  }

  // Ausrüstung des gewählten Boots laden (für „Ausrüstung anhängen")
  useEffect(() => {
    setEquipSearch('')
    if (!inquiryBoatId) { setBoatEquipment([]); setSelectedEquipIds([]); return }
    supabase.from('equipment')
      .select('id, name, category, manufacturer, model, serial_number')
      .eq('boat_id', inquiryBoatId)
      .order('category')
      .then(({ data }) => setBoatEquipment(data || []))
  }, [inquiryBoatId])

  // Anfrage-Text mit Schiffs- und Ausrüstungsdaten zusammenstellen.
  function composeInquiryBody() {
    const parts = [inquiryMessage.trim()]
    const boat = boats.find(b => String(b.id) === String(inquiryBoatId))
    if (boat) {
      const rows = [
        [t('inq.fBoat'), boat.name],
        [t('inq.fType'), boat.boat_type],
        [t('inq.fMakeModel'), [boat.manufacturer, boat.model].filter(Boolean).join(' ')],
        [t('inq.fYear'), boat.year],
        [t('inq.fLength'), boat.length_meters ? boat.length_meters + ' m' : ''],
        [t('inq.fEngine'), boat.engine],
        [t('inq.fPort'), boat.home_port],
      ].filter(([, v]) => v)
      if (rows.length) parts.push('\n' + t('inq.shipData') + ':\n' + rows.map(([k, v]) => `• ${k}: ${v}`).join('\n'))
    }
    const eq = boatEquipment.filter(e => selectedEquipIds.includes(e.id))
    if (eq.length) {
      parts.push('\n' + t('inq.equipData') + ':\n' + eq.map(e => {
        const d = [e.manufacturer, e.model].filter(Boolean).join(' ')
        const sn = e.serial_number ? ', ' + t('inq.fSerial') + ' ' + e.serial_number : ''
        return `• ${e.name}${d ? ' (' + d + ')' : ''}${sn}`
      }).join('\n'))
    }
    if (shipLocation) {
      parts.push('\n' + t('inq.shipLocation') + ':\n'
        + `• ${shipLocation.lat.toFixed(5)}, ${shipLocation.lon.toFixed(5)}\n`
        + `• https://maps.google.com/?q=${shipLocation.lat},${shipLocation.lon}`)
    }
    return parts.filter(Boolean).join('\n')
  }

  function openInquiryForm() {
    setInquirySubject('')
    setInquiryMessage('')
    setInquiryBoatId('')
    setInquiryNotes('')
    setShipLocation(null)
    setShowInquiryForm(true)
  }

  // mode: 'draft' = nur speichern · 'send' = speichern + per Eigner-Mailaccount (mailto) senden
  async function saveOrSendInquiry(mode) {
    if (!inquirySubject.trim() || !inquiryMessage.trim()) {
      alert(t('prov.k33'))
      return
    }
    setInquirySaving(true)
    try {
      const fullMessage = composeInquiryBody()
      const payload = {
        owner_id: user.id,
        provider_id: id,
        boat_id: inquiryBoatId || null,
        subject: inquirySubject.trim(),
        message: fullMessage,
        owner_notes: inquiryNotes.trim() || null,
        status: mode === 'send' ? 'sent' : 'draft',
      }
      const { error } = await supabase.from('service_inquiries').insert(payload)
      if (error) throw error
      setShowInquiryForm(false)
      // Pending-Inquiry-Kontext aufräumen (war von Equipment-Anfrage gesetzt)
      sessionStorage.removeItem('pending_inquiry')
      if (mode === 'send') {
        // 0) Konversations-Thread anlegen/finden + Anfrage als erste Nachricht
        //    posten → beide Seiten sehen den Verlauf (conversations/messages).
        try {
          const { data: conv } = await supabase.from('conversations')
            .upsert({ user_id: user.id, provider_id: id }, { onConflict: 'user_id,provider_id' })
            .select('id').single()
          if (conv) {
            const { data: firstMsg } = await supabase.from('messages').insert({
              conversation_id: conv.id, sender_id: user.id, sender_type: 'user',
              content: `${inquirySubject.trim()}\n\n${fullMessage}`,
            }).select('id').single()
            await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id)
            // Provider serverseitig per E-Mail benachrichtigen (Resend, mit Portal-Hinweis)
            if (firstMsg) {
              try {
                const { data: { session } } = await supabase.auth.getSession()
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
                await fetch(`${supabaseUrl}/functions/v1/notify-message`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                  body: JSON.stringify({ message_id: firstMsg.id }),
                })
              } catch (notifyErr) { console.warn('notify-message:', notifyErr) }
            }
          }
        } catch (convErr) { console.warn('Konversation anlegen:', convErr) }
        // Das mailto öffnet der „Per E-Mail senden"-Link SELBST als Nutzer-Geste
        // (sonst blockiert der Browser die automatische Mail-Erstellung).
        // Hier nur speichern + weiterleiten, kein window.location.
        setTimeout(() => navigate('/inquiries'), 300)
      } else {
        alert(t('prov.k34'))
      }
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
    setInquirySaving(false)
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (!provider) return <div className="page"><div className="alert alert-error">{t('prov.k0')}</div></div>

  const cat = getCat(provider.category)
  const srcServices = Array.isArray(tp?.services) ? tp.services
    : Array.isArray(provider.services) ? provider.services : provider.services ? [provider.services] : []
  const services = srcServices
  const brands = Array.isArray(provider.brands) ? provider.brands : []
  const allCategories = Array.isArray(provider.categories) ? provider.categories : []

  return (
    <div className="page provider-detail-page">
      {/* Cover image - big header */}
      <div className="pd-cover-hero" style={provider.cover_image_url ? {
        backgroundImage: `url(${provider.cover_image_url})`
      } : { background: `linear-gradient(135deg, ${cat.color}22, ${cat.color}44)` }}>
        <div className="pd-cover-gradient" />
        <button className="pd-back-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} /> {t('prov.k1')}
        </button>
        <button className={`pd-fav-float ${isFavorite ? 'active' : ''}`} onClick={toggleFavorite}>
          <Heart size={22} fill={isFavorite ? '#ef4444' : 'none'} color={isFavorite ? '#ef4444' : 'white'} />
        </button>
      </div>

      {/* Logo overlapping the cover bottom */}
      <div className="pd-logo-overlap">
        {provider.logo_url ? (
          <img src={provider.logo_url} alt={provider.name} className="pd-logo-img" />
        ) : (
          <div className="pd-logo-fallback" style={{ background: `${cat.color}15`, color: cat.color }}>
            <span>{cat.icon}</span>
          </div>
        )}
      </div>

      {/* Name + Category + Rating */}
      <div className="pd-name-section">
        <h1>
          {provider.name}
          {(provider.is_verified || provider.user_id) && (
            <span className="pd-verified-badge" title={t('prov.k28')}>
              ✓ Verifizierter Service-Betrieb
            </span>
          )}
        </h1>
        {(tp?.slogan || provider.slogan) && <p className="pd-slogan">{tp?.slogan || provider.slogan}</p>}
        <div className="pd-badges">
          <span className="pd-cat-badge" style={{ background: `${cat.color}15`, color: cat.color }}>
            {cat.icon} {cat.label}
          </span>
          {allCategories.filter(c => c !== provider.category).map((c, i) => {
            const cc = getCat(c)
            return <span key={i} className="pd-cat-badge" style={{ background: `${cc.color}10`, color: cc.color }}>{cc.icon} {cc.label}</span>
          })}
        </div>
        <StarRating rating={provider.rating} count={provider.review_count} />
      </div>

      {/* Address + Distance */}
      <div className="pd-section">
        <div className="pd-address-row">
          <MapPin size={18} color="#ef4444" />
          <div>
            {provider.street && <div>{provider.street}</div>}
            <div>{provider.postal_code ? provider.postal_code + ' ' : ''}{provider.city}{provider.country ? ', ' + provider.country : ''}</div>
          </div>
          {distance !== null && (
            <span className="pd-distance">
              <Navigation size={14} />
              {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}
            </span>
          )}
        </div>
      </div>

      {/* Contact buttons */}
      <div className="pd-contact-grid">
        {provider.latitude && provider.longitude && (
          <a href={`https://maps.apple.com/?daddr=${provider.latitude},${provider.longitude}`} target="_blank" rel="noopener" className="pd-contact-btn pd-btn-route">
            <Navigation size={22} />
            <span>{t('prov.k2')}</span>
          </a>
        )}
        {provider.website && (
          <a href={provider.website.startsWith('http') ? provider.website : `https://${provider.website}`} target="_blank" rel="noopener" className="pd-contact-btn pd-btn-web">
            <Globe size={22} />
            <span>{t('prov.k3')}</span>
          </a>
        )}
        {provider.phone && (
          <a href={`tel:${provider.phone}`} className="pd-contact-btn pd-btn-phone">
            <Phone size={22} />
            <span>{t('prov.k4')}</span>
          </a>
        )}
        {provider.email && (
          <a href={`mailto:${provider.email}`} className="pd-contact-btn pd-btn-email">
            <Mail size={22} />
            <span>{t('prov.k5')}</span>
          </a>
        )}
        <button className="pd-contact-btn pd-btn-inquiry" onClick={openInquiryForm}>
          <MessageSquarePlus size={22} />
          <span>{t('prov.k6')}</span>
        </button>
      </div>

      {/* Promotion */}
      {provider.current_promotion && (
        <div className="pd-promo-banner">
          <Tag size={18} />
          <div>
            <strong>{t('prov.k7')}</strong>
            <p>{provider.current_promotion}</p>
          </div>
          <Link to={`/shop?provider=${provider.id}`} className="pd-promo-shop-btn">
            <ShoppingBag size={14} /> {t('prov.k8')}
          </Link>
        </div>
      )}

      {/* Description */}
      {(tp?.description || provider.description) && (
        <div className="pd-section">
          <p className="pd-description">{tp?.description || provider.description}</p>
        </div>
      )}

      {/* Services */}
      {services.length > 0 && (
        <div className="pd-section">
          <h3><Wrench size={16} /> {t('prov.k9')}</h3>
          <div className="pd-tag-list">
            {services.map((s, i) => (
              <button key={i} className="pd-tag-btn pd-tag-green" onClick={() => handleServiceClick(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Service search prompt — shown when provider has no matching products */}
      {servicePrompt && (
        <div className="pd-overlay" onClick={() => setServicePrompt(null)}>
          <div className="pd-prompt-card" onClick={e => e.stopPropagation()}>
            <p className="pd-prompt-text">
              Für <strong>„{servicePrompt.label}"</strong> gibt es bei {provider.name} keine Produkte im Shop.
              Wie möchtest du weitersuchen?
            </p>
            <div className="pd-prompt-btns" style={{ flexDirection: 'column' }}>
              <button className="pd-prompt-confirm" onClick={() => {
                setServicePrompt(null)
                navigate(`/shop?q=${servicePrompt.query}`)
              }}>🛒 Im Shop weitere Anbieter suchen</button>
              <button className="pd-prompt-confirm" style={{ background: '#7c3aed' }} onClick={() => {
                setServicePrompt(null)
                navigate(`/services?search=${servicePrompt.query}`)
              }}>🔍 Anderen Service-Partner finden</button>
              <button className="pd-prompt-cancel" onClick={() => setServicePrompt(null)}>{t('prov.k10')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Brands */}
      {brands.length > 0 && (
        <div className="pd-section">
          <h3><Tag size={16} /> {t('prov.k11')}</h3>
          <div className="pd-tag-list">
            {brands.map((b, i) => (
              <button key={i} className="pd-tag-btn pd-tag-orange" onClick={() => handleServiceClick(b)}>
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Opening hours */}
      {provider.opening_hours && (
        <div className="pd-section">
          <h3><Clock size={16} /> {t('prov.k12')}</h3>
          <p className="pd-hours-text">{provider.opening_hours}</p>
        </div>
      )}

      {/* Products from this provider */}
      {products.length > 0 && (
        <div className="pd-section">
          <div className="pd-section-header">
            <h3><Package size={16} /> {t('prov.k13')}</h3>
            <Link to={`/shop?provider=${provider.id}`} className="card-link">{t('prov.k14')}</Link>
          </div>
          <div className="pd-products-grid">
            {products.map(p => (
              <Link key={p.id} to={`/shop/product/${p.id}`} className="pd-product-card">
                {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="pd-product-img" />}
                <div className="pd-product-info">
                  <span className="pd-product-name">{trProducts[p.id]?.name || p.name}</span>
                  <span className="pd-product-price">{Number(p.price).toFixed(2).replace('.', ',')} €</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Reviews */}
      <div className="pd-section">
        <div className="pd-section-header">
          <h3>
            <Star size={16} /> Bewertungen
            {reviews.length > 0 && ` · ∅ ${(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}`}
          </h3>
          {!myReview && !showReviewForm && (
            <button className="pd-write-review-btn" onClick={() => setShowReviewForm(true)}>
              <Pencil size={14} /> {t('prov.k15')}
            </button>
          )}
        </div>

        {/* Review-Formular (neu oder bearbeiten) */}
        {showReviewForm && (
          <div className="pd-review-form">
            <div className="pd-review-form-header">
              <span>{myReview ? 'Bewertung bearbeiten' : 'Neue Bewertung'}</span>
              <button className="btn-icon" onClick={() => setShowReviewForm(false)}><X size={16} /></button>
            </div>

            {/* Sterne-Auswahl */}
            <div className="pd-star-picker">
              {[1,2,3,4,5].map(i => (
                <button key={i} className="pd-star-btn"
                  onMouseEnter={() => setReviewHover(i)}
                  onMouseLeave={() => setReviewHover(0)}
                  onClick={() => setReviewRating(i)}>
                  <Star size={32}
                    fill={(reviewHover || reviewRating) >= i ? '#f59e0b' : 'none'}
                    color={(reviewHover || reviewRating) >= i ? '#f59e0b' : '#cbd5e1'}
                  />
                </button>
              ))}
              <span className="pd-star-label">
                {['', 'Mangelhaft', 'Ausreichend', 'Gut', 'Sehr gut', 'Ausgezeichnet'][reviewHover || reviewRating] || 'Bitte wählen'}
              </span>
            </div>

            {/* Kommentar */}
            <textarea
              className="pd-review-textarea"
              rows={4}
              placeholder={t('prov.k24')}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
            />

            <div className="pd-review-form-actions">
              {myReview && (
                <button className="pd-review-delete-btn" onClick={deleteReview}>
                  <Trash2 size={14} /> {t('prov.k16')}
                </button>
              )}
              <button className="pd-review-submit-btn" onClick={submitReview} disabled={reviewSaving || reviewRating === 0}>
                <Send size={14} /> {reviewSaving ? 'Speichern...' : myReview ? 'Aktualisieren' : 'Abschicken'}
              </button>
            </div>
          </div>
        )}

        {/* Eigene vorhandene Bewertung (wenn kein Formular offen) */}
        {myReview && !showReviewForm && (
          <div className="pd-review-card pd-review-mine">
            <div className="pd-review-header">
              <div className="pd-review-stars">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} size={14} fill={i <= myReview.rating ? '#f59e0b' : 'none'} color={i <= myReview.rating ? '#f59e0b' : '#cbd5e1'} />
                ))}
              </div>
              <span className="pd-review-mine-label">{t('prov.k17')}</span>
              <span className="pd-review-date">{new Date(myReview.created_at).toLocaleDateString('de-DE')}</span>
              <button className="btn-icon" style={{ marginLeft: 'auto' }} onClick={() => setShowReviewForm(true)} title={t('prov.k29')}>
                <Pencil size={14} />
              </button>
            </div>
            {myReview.comment && <p className="pd-review-comment">„{myReview.comment}"</p>}
            {myReview.is_approved === false && (
              <p style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '4px 10px', marginTop: 6 }}>
                ⏳ Wird noch geprüft – nach Freigabe für alle sichtbar
              </p>
            )}
          </div>
        )}

        {/* Alle anderen Bewertungen */}
        {reviews.filter(r => r.author_id !== user?.id).length === 0 && !myReview ? (
          <p className="pd-empty-reviews">{t('prov.k18')}</p>
        ) : (
          <div className="pd-reviews-list">
            {reviews.filter(r => r.author_id !== user?.id).map(r => (
              <div key={r.id} className="pd-review-card">
                <div className="pd-review-header">
                  <div className="pd-review-stars">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={14} fill={i <= r.rating ? '#f59e0b' : 'none'} color={i <= r.rating ? '#f59e0b' : '#cbd5e1'} />
                    ))}
                  </div>
                  <span className="pd-review-date">
                    {new Date(r.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                </div>
                {r.comment && <p className="pd-review-comment">„{r.comment}"</p>}
                <div className="pd-review-author">— Bootsbesitzer</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Inquiry compose modal ──────────────────────────────────────── */}
      {showInquiryForm && (
        <div className="inq-modal-overlay" onClick={() => setShowInquiryForm(false)}>
          <div className="inq-modal" onClick={e => e.stopPropagation()}>
            <div className="inq-modal-header">
              <MessageSquarePlus size={18} color="#3b82f6" />
              <span>Anfrage an {provider.name}</span>
              <button className="btn-icon" onClick={() => setShowInquiryForm(false)}><X size={18} /></button>
            </div>
            <div className="inq-modal-body">
              {boats.length > 0 && (
                <div className="form-group">
                  <label>{t('prov.k19')}</label>
                  <select value={inquiryBoatId} onChange={e => setInquiryBoatId(e.target.value)}>
                    <option value="">{t('prov.k30')}</option>
                    {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {inquiryBoatId && boatEquipment.length > 0 && (() => {
                const q = equipSearch.trim().toLowerCase()
                const filtered = q
                  ? boatEquipment.filter(e => `${e.name || ''} ${e.manufacturer || ''} ${e.model || ''} ${e.serial_number || ''}`.toLowerCase().includes(q))
                  : boatEquipment
                return (
                  <div className="form-group">
                    <label>{t('inq.attachEquip')}</label>
                    <input type="text" value={equipSearch} onChange={e => setEquipSearch(e.target.value)}
                           placeholder={t('inq.searchEquip')} style={{ marginBottom: 8 }} />
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      {filtered.length === 0 ? (
                        <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 14 }}>{t('inq.noEquipMatch')}</div>
                      ) : filtered.map(e => {
                        const checked = selectedEquipIds.includes(e.id)
                        const parts = [e.name, [e.manufacturer, e.model].filter(Boolean).join(' ')].filter(Boolean)
                        const label = parts.join(' — ') || t('inq.equipData')
                        return (
                          <div key={e.id}
                            onClick={() => setSelectedEquipIds(prev => checked ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: checked ? '#fff7ed' : '#fff' }}>
                            <span style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? '#f97316' : '#cbd5e1'}`, background: checked ? '#f97316' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{checked ? '✓' : ''}</span>
                            <span style={{ flex: 1, fontSize: 14, color: '#1e293b' }}>{label}</span>
                          </div>
                        )
                      })}
                    </div>
                    {selectedEquipIds.length > 0 && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{selectedEquipIds.length} {t('inq.selected')}</div>
                    )}
                  </div>
                )
              })()}
              <div className="form-group">
                <label>{t('inq.shipLocation')}</label>
                {shipLocation ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>📍 {shipLocation.lat.toFixed(5)}, {shipLocation.lon.toFixed(5)}</span>
                    <a href={`https://maps.google.com/?q=${shipLocation.lat},${shipLocation.lon}`} target="_blank" rel="noopener" style={{ fontSize: 13 }}>{t('inq.showMap')}</a>
                    <button type="button" className="btn-ghost" onClick={() => setShipLocation(null)}>{t('inq.remove')}</button>
                  </div>
                ) : (
                  <button type="button" className="btn-secondary" onClick={attachShipLocation} disabled={locating} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={14} /> {locating ? t('inq.locating') : t('inq.sendLocation')}
                  </button>
                )}
                <p className="form-label-hint" style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>{t('inq.locationHint')}</p>
              </div>
              <div className="form-group">
                <label>{t('prov.k20')}</label>
                <input
                  type="text"
                  value={inquirySubject}
                  onChange={e => setInquirySubject(e.target.value)}
                  placeholder={t('prov.k25')}
                  maxLength={200}
                />
              </div>
              <div className="form-group">
                <label>{t('prov.k21')}</label>
                <textarea
                  rows={6}
                  value={inquiryMessage}
                  onChange={e => setInquiryMessage(e.target.value)}
                  placeholder={t('prov.k26')}
                />
              </div>
              <div className="form-group">
                <label>{t('prov.k22')} <span className="form-label-hint">(nur für dich sichtbar)</span></label>
                <textarea
                  rows={2}
                  value={inquiryNotes}
                  onChange={e => setInquiryNotes(e.target.value)}
                  placeholder={t('prov.k27')}
                />
              </div>
            </div>
            <div className="inq-modal-actions">
              <button className="btn-ghost" onClick={() => setShowInquiryForm(false)}>{t('prov.k10')}</button>
              <button className="btn-secondary" onClick={() => saveOrSendInquiry('draft')} disabled={inquirySaving}>
                <Clock size={14} /> {t('prov.k23')}
              </button>
              {provider.email ? (
                <a
                  className="btn-primary"
                  href={`mailto:${provider.email}?subject=${encodeURIComponent(inquirySubject.trim())}&body=${encodeURIComponent(composeInquiryBody() + '\n\n' + t('inq.mailPortalHint'))}`}
                  onClick={(e) => {
                    if (!inquirySubject.trim() || !inquiryMessage.trim()) { e.preventDefault(); alert(t('prov.k33')); return }
                    saveOrSendInquiry('send')
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                  <Mail size={14} /> {t('inq.sendEmail')}
                </a>
              ) : (
                <button className="btn-primary" onClick={() => saveOrSendInquiry('send')} disabled={inquirySaving}>
                  <Mail size={14} /> {inquirySaving ? '…' : t('inq.sendEmail')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
