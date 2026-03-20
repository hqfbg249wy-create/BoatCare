import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Heart, Phone, Mail, Globe, Star, Search, Filter, X, Navigation, MapPin, Wrench, ShoppingCart, Fuel, Wind, Anchor, Radio, Waves, Ship, ChevronRight, Tag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-markercluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// ── Category → Icon + Color mapping (matches iOS app) ──
const categoryConfig = {
  werkstatt:    { icon: '🔧', label: 'Werkstatt', color: '#f97316' },
  repair:       { icon: '🔧', label: 'Reparatur', color: '#f97316' },
  motor_service:{ icon: '⚙️', label: 'Motorservice', color: '#f97316' },
  motorservice: { icon: '⚙️', label: 'Motorservice', color: '#f97316' },
  segelmacher:  { icon: '⛵', label: 'Segelmacher', color: '#8b5cf6' },
  sailmaker:    { icon: '⛵', label: 'Sailmaker', color: '#8b5cf6' },
  versorgung:   { icon: '🛒', label: 'Versorgung', color: '#10b981' },
  supplies:     { icon: '🛒', label: 'Supplies', color: '#10b981' },
  marine_supplies: { icon: '🛒', label: 'Marine Supplies', color: '#10b981' },
  shop:         { icon: '🛒', label: 'Shop', color: '#10b981' },
  tankstelle:   { icon: '⛽', label: 'Tankstelle', color: '#ef4444' },
  fuel:         { icon: '⛽', label: 'Fuel', color: '#ef4444' },
  rigg:         { icon: '🔗', label: 'Rigg', color: '#92400e' },
  rigging:      { icon: '🔗', label: 'Rigging', color: '#92400e' },
  elektronik:   { icon: '📡', label: 'Elektronik', color: '#3b82f6' },
  instruments:  { icon: '📡', label: 'Instrumente', color: '#3b82f6' },
  marina:       { icon: '🌊', label: 'Marina', color: '#0ea5e9' },
  werft:        { icon: '🚢', label: 'Werft', color: '#64748b' },
  shipyard:     { icon: '🚢', label: 'Werft', color: '#64748b' },
  bootsbauer:   { icon: '🚢', label: 'Bootsbauer', color: '#64748b' },
  gutachter:    { icon: '📋', label: 'Gutachter', color: '#6366f1' },
  surveyor:     { icon: '📋', label: 'Surveyor', color: '#6366f1' },
  lackiererei:  { icon: '🎨', label: 'Lackiererei', color: '#ec4899' },
  painting:     { icon: '🎨', label: 'Lackierung', color: '#ec4899' },
  winterlager:  { icon: '❄️', label: 'Winterlager', color: '#06b6d4' },
  kran:         { icon: '🏗️', label: 'Kran', color: '#78716c' },
  crane:        { icon: '🏗️', label: 'Crane', color: '#78716c' },
  heizung_klima:{ icon: '🌡️', label: 'Heizung/Klima', color: '#f43f5e' },
}

function getCategoryConfig(category) {
  if (!category) return { icon: '⚓', label: 'Service', color: '#3b82f6' }
  const key = category.toLowerCase().replace(/[/ ]/g, '_')
  return categoryConfig[key] || { icon: '⚓', label: category.replace(/_/g, ' '), color: '#3b82f6' }
}

// ── Rating → Pin color (matches iOS: green=good, yellow=medium, red=bad, blue=none) ──
function getRatingColor(rating) {
  if (!rating || rating === 0) return '#3b82f6'  // blue
  if (rating >= 4.0) return '#10b981'             // green
  if (rating >= 2.0) return '#f59e0b'             // yellow
  return '#ef4444'                                 // red
}

// ── SVG Teardrop Pin (matches iOS ServiceProviderPin shape) ──
function createPinIcon(provider, isFavorite, isSelected) {
  const cat = getCategoryConfig(provider.category)
  const pinColor = getRatingColor(provider.rating)
  const size = isSelected ? 48 : 36
  const iconSize = isSelected ? 20 : 16
  const borderWidth = isSelected ? 3 : 2
  const pinHeight = Math.round(size * 1.35)
  // Truncate name for label
  const name = (provider.name || '').length > 18 ? provider.name.substring(0, 16) + '…' : provider.name || ''
  const escapedName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const labelHeight = 16
  const totalHeight = pinHeight + labelHeight + 2

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 40}" height="${totalHeight}" viewBox="${-20} 0 ${size + 40} ${totalHeight}">
    <defs>
      <filter id="shadow${provider.id?.slice(0,4)}" x="-20%" y="-10%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Teardrop shape -->
    <path d="M${size/2} ${pinHeight - 2} C${size/2} ${pinHeight - 2} ${size - borderWidth} ${size * 0.6} ${size - borderWidth} ${size * 0.42}
      A${size/2 - borderWidth} ${size/2 - borderWidth} 0 1 0 ${borderWidth} ${size * 0.42}
      C${borderWidth} ${size * 0.6} ${size/2} ${pinHeight - 2} ${size/2} ${pinHeight - 2}Z"
      fill="${pinColor}" stroke="white" stroke-width="${borderWidth}" filter="url(#shadow${provider.id?.slice(0,4)})"/>
    ${isSelected ? `<circle cx="${size/2}" cy="${size * 0.42}" r="${size/2 - 1}" fill="none" stroke="#f97316" stroke-width="2.5"/>` : ''}
    <!-- Category icon -->
    <text x="${size/2}" y="${size * 0.48}" text-anchor="middle" font-size="${iconSize}" dominant-baseline="central">${cat.icon}</text>
    ${isFavorite ? `
    <circle cx="${size - 6}" cy="6" r="8" fill="white"/>
    <text x="${size - 6}" y="7" text-anchor="middle" font-size="10" dominant-baseline="central">❤️</text>
    ` : ''}
    <!-- Name label -->
    <rect x="${size/2 - name.length * 3.2}" y="${pinHeight}" rx="3" ry="3" width="${Math.max(name.length * 6.4, 40)}" height="${labelHeight}" fill="white" fill-opacity="0.92" stroke="#cbd5e1" stroke-width="0.5"/>
    <text x="${size/2}" y="${pinHeight + labelHeight/2 + 1}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="600" fill="#374151" font-family="system-ui, sans-serif">${escapedName}</text>
  </svg>`

  return L.divIcon({
    html: svg,
    className: 'custom-pin',
    iconSize: [size + 40, totalHeight],
    iconAnchor: [(size + 40) / 2, pinHeight],
    popupAnchor: [0, -pinHeight],
  })
}

// ── Cluster icon ──
function createClusterIcon(count) {
  const size = count < 10 ? 36 : count < 100 ? 42 : 48
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
    </defs>
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="url(#cg)" stroke="white" stroke-width="2.5"/>
    <text x="${size/2}" y="${size/2 + 1}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${size * 0.38}" font-weight="bold">${count}</text>
  </svg>`
  return L.divIcon({
    html: svg,
    className: 'cluster-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function MapController({ center, zoom, bounds, onMoveEnd }) {
  const map = useMap()
  const isFirstRender = useRef(true)
  useEffect(() => {
    // Skip initial render — MapContainer handles the initial position
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (bounds && bounds.length > 0) {
      const latLngs = bounds.map(b => [b[0], b[1]])
      if (latLngs.length === 1) {
        map.flyTo(latLngs[0], 13)
      } else {
        map.flyToBounds(L.latLngBounds(latLngs).pad(0.1), { maxZoom: 14 })
      }
    } else if (center) {
      map.flyTo(center, zoom || 12)
    }
  }, [center, zoom, bounds])
  // Save map position on move
  useEffect(() => {
    const handler = () => {
      const c = map.getCenter()
      const z = map.getZoom()
      if (onMoveEnd) onMoveEnd(c.lat, c.lng, z)
    }
    map.on('moveend', handler)
    return () => map.off('moveend', handler)
  }, [map, onMoveEnd])
  // Ensure tiles render on mount
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
  }, [map])
  return null
}

function StarRating({ rating, count }) {
  if (!rating || rating <= 0) return null
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <div className="star-rating">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={14}
          fill={i < full ? '#f59e0b' : (i === full && half ? '#f59e0b' : 'none')}
          color={i < full || (i === full && half) ? '#f59e0b' : '#cbd5e1'}
          style={i === full && half ? { clipPath: 'inset(0 50% 0 0)' } : {}}
        />
      ))}
      <span className="rating-value">{Number(rating).toFixed(1)}</span>
      {count > 0 && <span className="rating-count">({count})</span>}
    </div>
  )
}

// ── LocalStorage helpers for map persistence ──
function getSavedMapPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem('boatcare_map_pos'))
    if (saved && saved.lat && saved.lng && saved.zoom) return saved
  } catch {}
  return null
}
function saveMapPosition(lat, lng, zoom) {
  localStorage.setItem('boatcare_map_pos', JSON.stringify({ lat, lng, zoom }))
}
function getRecentLocations() {
  try { return JSON.parse(localStorage.getItem('boatcare_recent_locations') || '[]') } catch { return [] }
}
function addRecentLocation(name, lat, lng) {
  const recents = getRecentLocations().filter(r => r.name !== name)
  recents.unshift({ name, lat, lng, time: Date.now() })
  localStorage.setItem('boatcare_recent_locations', JSON.stringify(recents.slice(0, 8)))
}

export default function MapView() {
  const { user } = useAuth()
  const [providers, setProviders] = useState([])
  const [allProviders, setAllProviders] = useState([])
  const [favorites, setFavorites] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const savedPos = useMemo(() => getSavedMapPosition(), [])
  const [center, setCenter] = useState(savedPos ? [savedPos.lat, savedPos.lng] : [50.7, 7.1])
  const [mapZoom, setMapZoom] = useState(savedPos ? savedPos.zoom : 6)
  const [mapBounds, setMapBounds] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [recentLocations, setRecentLocations] = useState(getRecentLocations())
  const [showRecents, setShowRecents] = useState(false)

  const handleMapMoveEnd = useCallback((lat, lng, zoom) => {
    saveMapPosition(lat, lng, zoom)
  }, [])

  useEffect(() => { if (user) loadData() }, [user])

  async function loadData() {
    setLoading(true)
    // Load all providers (Supabase default limit is 1000, so paginate)
    let allProviders = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data: batch, error } = await supabase.from('service_providers').select('*').range(from, from + pageSize - 1)
      if (error) { console.error('Providers error:', error); break }
      if (!batch || batch.length === 0) break
      allProviders = allProviders.concat(batch)
      if (batch.length < pageSize) break
      from += pageSize
    }

    const { data: favs, error: favErr } = await supabase.from('user_favorites').select('provider_id').eq('user_id', user.id)
    if (favErr) console.error('Favorites error:', favErr)

    // Keep all providers for favorites list, filter for map
    setAllProviders(allProviders)
    const validProvs = allProviders.filter(p => p.latitude && p.longitude && p.latitude !== 0 && p.longitude !== 0)
    setProviders(validProvs)
    const favSet = new Set((favs || []).map(f => f.provider_id))
    setFavorites(favSet)
    console.log('Loaded favorites:', favSet.size, 'from', (favs || []).length, 'entries')

    // Only use geolocation if no saved map position
    if (!getSavedMapPosition() && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {}
      )
    }
    setLoading(false)
  }

  async function toggleFavorite(providerId) {
    if (favorites.has(providerId)) {
      const { error } = await supabase.from('user_favorites').delete().eq('user_id', user.id).eq('provider_id', providerId)
      if (error) { console.error('Remove favorite error:', error); return }
      setFavorites(prev => { const n = new Set(prev); n.delete(providerId); return n })
    } else {
      const { error } = await supabase.from('user_favorites').insert({ user_id: user.id, provider_id: providerId })
      if (error) { console.error('Add favorite error:', error); return }
      setFavorites(prev => new Set(prev).add(providerId))
    }
  }

  const categories = [...new Set(providers.map(p => p.category).filter(Boolean))].sort()

  const filtered = providers.filter(p => {
    if (filterCat && p.category !== filterCat) return false
    if (search) {
      const words = search.toLowerCase().trim().split(/\s+/).filter(w => w.length >= 2)
      if (words.length === 0) return true
      const fields = [p.name, p.category, p.city, p.street, p.postal_code, p.description,
        ...(Array.isArray(p.services) ? p.services : []),
        ...(Array.isArray(p.brands) ? p.brands : []),
        ...(Array.isArray(p.categories) ? p.categories : [])
      ].filter(Boolean)
      const allText = fields.join(' ').toLowerCase()
      return words.some(w => allText.includes(w))
    }
    return true
  })

  // Geocode city search — zoom map to city location
  useEffect(() => {
    if (!search || search.length < 3) return
    const timer = setTimeout(async () => {
      // Check if search looks like a city name (not just a category)
      const s = search.trim()
      if (s.length < 3) return
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(s)}&format=json&limit=1&addressdetails=1`)
        const data = await resp.json()
        if (data.length > 0) {
          const { lat, lon, boundingbox } = data[0]
          // Only zoom to city if it's a place (not a generic word match)
          const type = data[0].type || ''
          const cls = data[0].class || ''
          if (cls === 'place' || cls === 'boundary' || type === 'city' || type === 'town' || type === 'village' || type === 'administrative') {
            setCenter([parseFloat(lat), parseFloat(lon)])
            setMapZoom(12)
            setMapBounds(null)
            // Save to recent locations
            const locName = data[0].display_name?.split(',')[0] || s
            addRecentLocation(locName, parseFloat(lat), parseFloat(lon))
            setRecentLocations(getRecentLocations())
          }
        }
      } catch (e) {
        // Geocoding failed silently
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [search])

  // Auto-zoom to filtered providers when filter changes
  useEffect(() => {
    if (filterCat || search) {
      const pts = filtered.filter(p => p.latitude && p.longitude).map(p => [p.latitude, p.longitude])
      if (pts.length > 0 && pts.length < providers.length) {
        setMapBounds(pts)
      } else {
        setMapBounds(null)
      }
    } else {
      setMapBounds(null)
    }
  }, [filterCat, filtered.length])

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page map-page">
      <h1>Karte</h1>
      <p className="subtitle">{providers.length} Service-Partner · {favorites.size} Favoriten</p>

      <div className="filter-bar">
        <div className="search-input" style={{ position: 'relative' }}>
          <Search size={16} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setShowRecents(false) }}
            onFocus={() => { if (!search && recentLocations.length > 0) setShowRecents(true) }}
            onBlur={() => setTimeout(() => setShowRecents(false), 200)}
            placeholder="Name, Ort oder Kategorie..."
          />
          {search && <button className="btn-icon" onClick={() => setSearch('')}><X size={14} /></button>}
          {/* Recent locations dropdown */}
          {showRecents && recentLocations.length > 0 && (
            <div className="search-recents-dropdown">
              <span className="search-recents-title">Letzte Orte</span>
              {recentLocations.map((loc, i) => (
                <button key={i} className="search-recent-item" onMouseDown={(e) => {
                  e.preventDefault()
                  setCenter([loc.lat, loc.lng])
                  setMapZoom(12)
                  setMapBounds(null)
                  setSearch(loc.name)
                  setShowRecents(false)
                }}>
                  <MapPin size={14} />
                  <span>{loc.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {categories.map(c => {
            const cfg = getCategoryConfig(c)
            return <option key={c} value={c}>{cfg.icon} {cfg.label}</option>
          })}
        </select>
      </div>

      {/* Map legend */}
      <div className="map-legend">
        <span className="legend-title">Bewertung:</span>
        <span className="legend-item"><span className="legend-dot" style={{background: '#10b981'}} /> Sehr gut (4+)</span>
        <span className="legend-item"><span className="legend-dot" style={{background: '#f59e0b'}} /> Mittel (2-4)</span>
        <span className="legend-item"><span className="legend-dot" style={{background: '#ef4444'}} /> Schlecht (&lt;2)</span>
        <span className="legend-item"><span className="legend-dot" style={{background: '#3b82f6'}} /> Keine</span>
        <span className="legend-item">❤️ = Favorit</span>
      </div>

      <div className="map-container" style={{ position: 'relative' }}>
        <MapContainer center={center} zoom={mapZoom} style={{ height: '550px', width: '100%', borderRadius: '12px' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController center={center} zoom={mapZoom} bounds={mapBounds} onMoveEnd={handleMapMoveEnd} />
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            disableClusteringAtZoom={16}
            iconCreateFunction={(cluster) => createClusterIcon(cluster.getChildCount())}
          >
          {filtered.map(p => (
              <Marker
                key={p.id}
                position={[p.latitude, p.longitude]}
                icon={createPinIcon(p, favorites.has(p.id), selectedProvider?.id === p.id)}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    setSelectedProvider(p)
                  }
                }}
              />
          ))}
          </MarkerClusterGroup>
        </MapContainer>

        {/* Provider Detail Card - overlay on the map */}
        {selectedProvider && (
          <ProviderDetailCard
            provider={selectedProvider}
            isFavorite={favorites.has(selectedProvider.id)}
            onToggleFavorite={() => toggleFavorite(selectedProvider.id)}
            onClose={() => setSelectedProvider(null)}
          />
        )}
      </div>

      {/* Favorited Providers List */}
      <div className="provider-list-below">
        <h2>Favorisierte Partner ({favorites.size})</h2>
        {favorites.size === 0 ? (
          <p className="subtitle">Klicken Sie auf ❤️ bei einem Service-Partner, um ihn als Favorit zu speichern.</p>
        ) : (
          <div className="provider-grid">
            {allProviders.filter(p => favorites.has(p.id)).map(p => (
              <ProviderCard key={p.id} provider={p} isFavorite={true} onToggleFavorite={() => toggleFavorite(p.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Provider Detail Card (floating, like iOS map card) ──
function ProviderDetailCard({ provider, isFavorite, onToggleFavorite, onClose }) {
  const cat = getCategoryConfig(provider.category)
  const services = Array.isArray(provider.services) ? provider.services : provider.services ? [provider.services] : []
  const brands = Array.isArray(provider.brands) ? provider.brands : []

  return (
    <div className="provider-detail-card">
      {/* Header with cover image or gradient */}
      <div className="pdc-cover" style={provider.cover_image_url
        ? { backgroundImage: `url(${provider.cover_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: `linear-gradient(135deg, ${cat.color}22, ${cat.color}44)` }
      }>
        <div className="pdc-cover-overlay" />
        <button className="pdc-close" onClick={onClose}><X size={18} /></button>
        <button className={`pdc-fav ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite}>
          <Heart size={20} fill={isFavorite ? '#ef4444' : 'none'} color={isFavorite ? '#ef4444' : 'white'} />
        </button>
      </div>

      <div className="pdc-body">
        {/* Logo + Name */}
        <div className="pdc-header">
          {provider.logo_url ? (
            <img src={provider.logo_url} alt={provider.name} className="pdc-logo" />
          ) : (
            <div className="pdc-logo-placeholder" style={{ background: `${cat.color}15`, color: cat.color }}>
              <span style={{ fontSize: '1.5rem' }}>{cat.icon}</span>
            </div>
          )}
          <div className="pdc-title">
            <h3>{provider.name}</h3>
            <span className="pdc-cat-badge" style={{ background: `${cat.color}15`, color: cat.color }}>
              {cat.icon} {cat.label}
            </span>
            <StarRating rating={provider.rating} count={provider.review_count} />
          </div>
        </div>

        {/* Address */}
        {(provider.street || provider.city) && (
          <div className="pdc-address">
            <MapPin size={16} color="#3b82f6" />
            <span>{provider.street}{provider.street && provider.city ? ', ' : ''}{provider.postal_code ? provider.postal_code + ' ' : ''}{provider.city}</span>
          </div>
        )}

        {/* Contact buttons (like iOS) */}
        <div className="pdc-buttons">
          {provider.latitude && provider.longitude && (
            <a href={`https://maps.apple.com/?daddr=${provider.latitude},${provider.longitude}`} target="_blank" rel="noopener" className="pdc-btn pdc-btn-route">
              <Navigation size={18} />
              <span>Route</span>
            </a>
          )}
          {provider.website && (
            <a href={provider.website.startsWith('http') ? provider.website : `https://${provider.website}`} target="_blank" rel="noopener" className="pdc-btn pdc-btn-web">
              <Globe size={18} />
              <span>Website</span>
            </a>
          )}
          {provider.phone && (
            <a href={`tel:${provider.phone}`} className="pdc-btn pdc-btn-phone">
              <Phone size={18} />
              <span>Anrufen</span>
            </a>
          )}
          {provider.email && (
            <a href={`mailto:${provider.email}`} className="pdc-btn pdc-btn-email">
              <Mail size={18} />
              <span>E-Mail</span>
            </a>
          )}
        </div>

        {/* Services */}
        {services.length > 0 && (
          <div className="pdc-section">
            <strong><Wrench size={14} /> Leistungen</strong>
            <div className="pdc-tags">
              {services.slice(0, 6).map((s, i) => (
                <Link key={i} to={`/services?search=${encodeURIComponent(s)}`} className="pdc-tag pdc-tag-green">{s}</Link>
              ))}
            </div>
          </div>
        )}

        {/* Brands */}
        {brands.length > 0 && (
          <div className="pdc-section">
            <strong><Tag size={14} /> Marken</strong>
            <div className="pdc-tags">
              {brands.slice(0, 6).map((b, i) => (
                <Link key={i} to={`/shop?q=${encodeURIComponent(b)}`} className="pdc-tag pdc-tag-orange">{b}</Link>
              ))}
            </div>
          </div>
        )}

        {/* Promotion banner */}
        {provider.current_promotion && (
          <div className="pdc-promo">
            <Tag size={14} />
            <span>{provider.current_promotion}</span>
          </div>
        )}

        {/* More Details link */}
        <Link to={`/provider/${provider.id}`} className="pdc-detail-link">
          Alle Details anzeigen <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  )
}

// ── Provider Card (grid item, like iOS FavoriteRow) ──
function ProviderCard({ provider, isFavorite, onToggleFavorite }) {
  const cat = getCategoryConfig(provider.category)

  return (
    <div className="provider-card">
      <div className="prov-header">
        {provider.logo_url ? (
          <img src={provider.logo_url} alt={provider.name} className="prov-logo" />
        ) : (
          <div className="prov-logo-placeholder" style={{ background: `${cat.color}15`, color: cat.color }}>
            <span>{cat.icon}</span>
          </div>
        )}
        <div className="prov-info">
          <h3>{provider.name}</h3>
          <span className="prov-category-badge" style={{ background: `${cat.color}15`, color: cat.color }}>
            {cat.icon} {cat.label}
          </span>
          <StarRating rating={provider.rating} count={provider.review_count} />
        </div>
        <button className={`prov-fav-btn ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite}>
          <Heart size={20} fill={isFavorite ? '#ef4444' : 'none'} color={isFavorite ? '#ef4444' : '#cbd5e1'} />
        </button>
      </div>

      {(provider.street || provider.city) && (
        <div className="prov-address"><MapPin size={14} /> {provider.street}{provider.street && provider.city ? ', ' : ''}{provider.city}</div>
      )}

      <div className="prov-actions">
        {provider.phone && <a href={`tel:${provider.phone}`} className="prov-action prov-action-phone"><Phone size={15} /> Anrufen</a>}
        {provider.email && <a href={`mailto:${provider.email}`} className="prov-action prov-action-email"><Mail size={15} /> E-Mail</a>}
        {provider.website && (
          <a href={provider.website.startsWith('http') ? provider.website : `https://${provider.website}`} target="_blank" rel="noopener" className="prov-action prov-action-web"><Globe size={15} /> Website</a>
        )}
        {provider.latitude && provider.longitude && provider.latitude !== 0 && (
          <a href={`https://maps.apple.com/?daddr=${provider.latitude},${provider.longitude}`} target="_blank" rel="noopener" className="prov-action prov-action-route"><Navigation size={15} /> Route</a>
        )}
      </div>

      {provider.current_promotion && (
        <div className="prov-promo"><Tag size={12} /> {provider.current_promotion}</div>
      )}
    </div>
  )
}
