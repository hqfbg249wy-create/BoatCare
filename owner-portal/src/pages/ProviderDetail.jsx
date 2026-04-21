import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Heart, MapPin, Phone, Mail, Globe, Star, Navigation, Tag, Clock, ChevronLeft, ShoppingBag, Wrench, Package } from 'lucide-react'

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
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [provider, setProvider] = useState(null)
  const [products, setProducts] = useState([])
  const [isFavorite, setIsFavorite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState(null)
  const [distance, setDistance] = useState(null)

  useEffect(() => {
    if (user && id) loadProvider()
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      }, () => {})
    }
  }, [user, id])

  useEffect(() => {
    if (userLocation && provider?.latitude && provider?.longitude) {
      setDistance(calcDistance(userLocation.lat, userLocation.lon, provider.latitude, provider.longitude))
    }
  }, [userLocation, provider])

  async function loadProvider() {
    setLoading(true)
    const [{ data: prov }, { data: favs }, { data: prods }] = await Promise.all([
      supabase.from('service_providers').select('*').eq('id', id).single(),
      supabase.from('user_favorites').select('id').eq('user_id', user.id).eq('provider_id', id),
      supabase.from('metashop_products').select('*, product_categories(*)').eq('provider_id', id).eq('is_active', true).limit(6)
    ])
    setProvider(prov)
    setIsFavorite((favs || []).length > 0)
    setProducts(prods || [])
    setLoading(false)
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

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (!provider) return <div className="page"><div className="alert alert-error">Provider nicht gefunden.</div></div>

  const cat = getCat(provider.category)
  const services = Array.isArray(provider.services) ? provider.services : provider.services ? [provider.services] : []
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
          <ChevronLeft size={20} /> Zurück
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
        <h1>{provider.name}</h1>
        {provider.slogan && <p className="pd-slogan">{provider.slogan}</p>}
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
            <span>Route</span>
          </a>
        )}
        {provider.website && (
          <a href={provider.website.startsWith('http') ? provider.website : `https://${provider.website}`} target="_blank" rel="noopener" className="pd-contact-btn pd-btn-web">
            <Globe size={22} />
            <span>Website</span>
          </a>
        )}
        {provider.phone && (
          <a href={`tel:${provider.phone}`} className="pd-contact-btn pd-btn-phone">
            <Phone size={22} />
            <span>Anrufen</span>
          </a>
        )}
        {provider.email && (
          <a href={`mailto:${provider.email}`} className="pd-contact-btn pd-btn-email">
            <Mail size={22} />
            <span>E-Mail</span>
          </a>
        )}
      </div>

      {/* Promotion */}
      {provider.current_promotion && (
        <div className="pd-promo-banner">
          <Tag size={18} />
          <div>
            <strong>Aktion</strong>
            <p>{provider.current_promotion}</p>
          </div>
          <Link to={`/shop?provider=${provider.id}`} className="pd-promo-shop-btn">
            <ShoppingBag size={14} /> Zum Shop
          </Link>
        </div>
      )}

      {/* Description */}
      {provider.description && (
        <div className="pd-section">
          <p className="pd-description">{provider.description}</p>
        </div>
      )}

      {/* Services - clickable buttons to shop */}
      {services.length > 0 && (
        <div className="pd-section">
          <h3><Wrench size={16} /> Leistungen</h3>
          <div className="pd-tag-list">
            {services.map((s, i) => (
              <Link key={i} to={`/services?search=${encodeURIComponent(s)}`} className="pd-tag-btn pd-tag-green">
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Brands - clickable buttons to shop */}
      {brands.length > 0 && (
        <div className="pd-section">
          <h3><Tag size={16} /> Marken</h3>
          <div className="pd-tag-list">
            {brands.map((b, i) => (
              <Link key={i} to={`/shop?q=${encodeURIComponent(b)}`} className="pd-tag-btn pd-tag-orange">
                {b}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Opening hours */}
      {provider.opening_hours && (
        <div className="pd-section">
          <h3><Clock size={16} /> Öffnungszeiten</h3>
          <p className="pd-hours-text">{provider.opening_hours}</p>
        </div>
      )}

      {/* Products from this provider */}
      {products.length > 0 && (
        <div className="pd-section">
          <div className="pd-section-header">
            <h3><Package size={16} /> Produkte</h3>
            <Link to={`/shop?provider=${provider.id}`} className="card-link">Alle anzeigen →</Link>
          </div>
          <div className="pd-products-grid">
            {products.map(p => (
              <Link key={p.id} to={`/shop/product/${p.id}`} className="pd-product-card">
                {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="pd-product-img" />}
                <div className="pd-product-info">
                  <span className="pd-product-name">{p.name}</span>
                  <span className="pd-product-price">{Number(p.price).toFixed(2).replace('.', ',')} €</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      {provider.latitude && provider.longitude && provider.latitude !== 0 && (
        <div className="pd-section">
          <h3><MapPin size={16} /> Standort</h3>
          <div className="pd-static-map">
            <img
              src={`https://staticmap.openstreetmap.de/staticmap.php?center=${provider.latitude},${provider.longitude}&zoom=14&size=600x300&maptype=mapnik&markers=${provider.latitude},${provider.longitude},red-pushpin`}
              alt="Standort"
              className="pd-map-img"
            />
          </div>
        </div>
      )}
    </div>
  )
}
