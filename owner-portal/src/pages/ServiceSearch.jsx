import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, X, MapPin, Star, Phone, Mail, Globe, Navigation, Wrench, Heart, ShoppingBag, Tag, ChevronRight } from 'lucide-react'

const serviceCategories = [
  { key: '', label: 'Alle', icon: '🔍' },
  { key: 'werkstatt', label: 'Werkstatt', icon: '🔧' },
  { key: 'motor_service', label: 'Motor', icon: '⚙️' },
  { key: 'segelmacher', label: 'Segel', icon: '⛵' },
  { key: 'elektronik', label: 'Elektronik', icon: '📡' },
  { key: 'marina', label: 'Marina', icon: '🌊' },
  { key: 'werft', label: 'Werft', icon: '🚢' },
  { key: 'tankstelle', label: 'Tankstelle', icon: '⛽' },
  { key: 'winterlager', label: 'Winterlager', icon: '❄️' },
  { key: 'lackiererei', label: 'Lackierung', icon: '🎨' },
  { key: 'gutachter', label: 'Gutachter', icon: '📋' },
  { key: 'versorgung', label: 'Zubehör', icon: '🛒' },
]

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export default function ServiceSearch() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [providers, setProviders] = useState([])
  const [favorites, setFavorites] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [filterCat, setFilterCat] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [providerProducts, setProviderProducts] = useState({}) // providerId -> product count
  const [allProducts, setAllProducts] = useState([]) // all products for provider-level search
  const [searchMode, setSearchMode] = useState('providers') // 'providers' or 'products'
  const [productResults, setProductResults] = useState([])

  useEffect(() => {
    if (user) loadData()
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {}
      )
    }
  }, [user])

  async function loadData() {
    setLoading(true)
    // Load all providers (Supabase default limit is 1000, so paginate)
    let allProviders = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data: batch } = await supabase.from('service_providers').select('*').range(from, from + pageSize - 1)
      if (!batch || batch.length === 0) break
      allProviders = allProviders.concat(batch)
      if (batch.length < pageSize) break
      from += pageSize
    }
    const [{ data: favs }] = await Promise.all([
      supabase.from('user_favorites').select('provider_id').eq('user_id', user.id)
    ])
    setProviders(allProviders)
    setFavorites(new Set((favs || []).map(f => f.provider_id)))

    // Load products for search and counts
    const { data: prodData } = await supabase
      .from('metashop_products')
      .select('id, name, manufacturer, description, provider_id')
      .eq('is_active', true)
    const prods = prodData || []
    setAllProducts(prods)
    const counts = {}
    prods.forEach(p => { counts[p.provider_id] = (counts[p.provider_id] || 0) + 1 })
    setProviderProducts(counts)

    setLoading(false)
  }

  async function searchProducts(query) {
    if (!query || query.length < 2) { setProductResults([]); return }
    const words = query.trim().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) { setProductResults([]); return }
    const conditions = words.flatMap(w => [
      `name.ilike.%${w}%`,
      `manufacturer.ilike.%${w}%`,
      `description.ilike.%${w}%`
    ])
    const { data } = await supabase
      .from('metashop_products')
      .select('*, product_categories(*), service_providers(id, name, city)')
      .eq('is_active', true)
      .or(conditions.join(','))
      .limit(20)
    setProductResults(data || [])
  }

  // When search changes, also search products
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.length >= 2) searchProducts(search)
      else setProductResults([])
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  async function toggleFavorite(e, providerId) {
    e.preventDefault()
    e.stopPropagation()
    if (favorites.has(providerId)) {
      await supabase.from('user_favorites').delete().eq('user_id', user.id).eq('provider_id', providerId)
      setFavorites(prev => { const n = new Set(prev); n.delete(providerId); return n })
    } else {
      await supabase.from('user_favorites').insert({ user_id: user.id, provider_id: providerId })
      setFavorites(prev => new Set(prev).add(providerId))
    }
  }

  // Filter and sort providers
  let filtered = providers.filter(p => {
    if (filterCat) {
      const cat = (p.category || '').toLowerCase()
      const allCats = Array.isArray(p.categories) ? p.categories.map(c => c.toLowerCase()) : []
      const services = Array.isArray(p.services) ? p.services.map(s => s.toLowerCase()) : []
      const searchIn = [cat, ...allCats, ...services].join(' ')
      if (!searchIn.includes(filterCat.toLowerCase())) return false
    }
    if (search) {
      const words = search.toLowerCase().trim().split(/\s+/).filter(w => w.length >= 2)
      if (words.length === 0) return true
      const fields = [p.name, p.category, p.city, p.postal_code, p.street, p.description,
        ...(Array.isArray(p.services) ? p.services : []),
        ...(Array.isArray(p.brands) ? p.brands : []),
        ...(Array.isArray(p.categories) ? p.categories : [])
      ].filter(Boolean)
      const allText = fields.join(' ').toLowerCase()
      // Match if ANY search word is found in provider fields
      if (words.some(w => allText.includes(w))) return true
      // Also match if any of this provider's products match any search word
      const provProducts = allProducts.filter(prod => prod.provider_id === p.id)
      return provProducts.some(prod => {
        const prodText = [prod.name, prod.manufacturer, prod.description].filter(Boolean).join(' ').toLowerCase()
        return words.some(w => prodText.includes(w))
      })
    }
    return true
  })

  filtered = filtered.map(p => ({
    ...p,
    _dist: userLocation && p.latitude && p.longitude
      ? calcDistance(userLocation.lat, userLocation.lon, p.latitude, p.longitude)
      : null,
    _isFav: favorites.has(p.id),
    _productCount: providerProducts[p.id] || 0,
  })).sort((a, b) => {
    if (a._isFav !== b._isFav) return a._isFav ? -1 : 1
    if (a._dist !== null && b._dist !== null) return a._dist - b._dist
    return (b.rating || 0) - (a.rating || 0)
  })

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <h1>Service-Suche</h1>
      <p className="subtitle">{filtered.length} Service-Partner{productResults.length > 0 ? ` · ${productResults.length} Produkte` : ''}</p>

      <div className="filter-bar">
        <div className="search-input" style={{ maxWidth: 400 }}>
          <Search size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, Ort, Service oder Produkt..." />
          {search && <button className="btn-icon" onClick={() => setSearch('')}><X size={14} /></button>}
        </div>
      </div>

      {/* Tabs: Providers / Products */}
      {search.length >= 2 && productResults.length > 0 && (
        <div className="search-tabs">
          <button className={`filter-btn ${searchMode === 'providers' ? 'active' : ''}`} onClick={() => setSearchMode('providers')}>
            🔧 Service-Partner ({filtered.length})
          </button>
          <button className={`filter-btn ${searchMode === 'products' ? 'active' : ''}`} onClick={() => setSearchMode('products')}>
            🛒 Produkte ({productResults.length})
          </button>
        </div>
      )}

      {/* Category filter chips */}
      {searchMode === 'providers' && (
        <div className="shop-categories">
          {serviceCategories.map(c => (
            <button key={c.key} className={`filter-btn ${filterCat === c.key ? 'active' : ''}`} onClick={() => setFilterCat(c.key)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Product results */}
      {searchMode === 'products' && productResults.length > 0 && (
        <div className="shop-product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {productResults.map(p => (
            <Link key={p.id} to={`/shop/product/${p.id}`} className="shop-product-card" style={{ textDecoration: 'none' }}>
              <div className="shop-product-link">
                <div className="shop-product-img-wrap shop-product-no-img">
                  <ShoppingBag size={28} color="#cbd5e1" />
                </div>
                <div className="shop-product-info">
                  {p.service_providers?.name && <span className="shop-product-provider">{p.service_providers.name}</span>}
                  <span className="shop-product-name">{p.name}</span>
                  {p.manufacturer && <span className="shop-product-mfr">{p.manufacturer}</span>}
                  <span className="shop-price">{Number(p.price).toFixed(2).replace('.', ',')} €</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Provider results */}
      {searchMode === 'providers' && (
        <>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <Wrench size={64} color="#cbd5e1" />
              <h2>Keine Service-Partner gefunden</h2>
              <p>Versuchen Sie einen anderen Suchbegriff oder eine andere Kategorie.</p>
            </div>
          ) : (
            <div className="service-list">
              {filtered.map(p => {
                const catKey = (p.category || '').toLowerCase().replace(/[/ ]/g, '_')
                const catIcons = { werkstatt: '🔧', motor_service: '⚙️', segelmacher: '⛵', elektronik: '📡', marina: '🌊', werft: '🚢', tankstelle: '⛽', winterlager: '❄️', lackiererei: '🎨', gutachter: '📋', versorgung: '🛒', marine_supplies: '🛒' }
                const icon = catIcons[catKey] || '⚓'
                const services = Array.isArray(p.services) ? p.services.slice(0, 3) : []

                return (
                  <Link key={p.id} to={`/provider/${p.id}`} className="service-row">
                    <div className="service-row-logo">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt="" />
                      ) : (
                        <div className="service-row-icon">{icon}</div>
                      )}
                    </div>
                    <div className="service-row-content">
                      <div className="service-row-name">{p.name}</div>
                      <div className="service-row-meta">
                        {(p.street || p.city) && <span className="service-row-addr"><MapPin size={12} /> {p.city || p.street}</span>}
                        {p._dist !== null && (
                          <span className="service-row-dist"><Navigation size={12} /> {p._dist < 1 ? `${Math.round(p._dist * 1000)} m` : `${p._dist.toFixed(1)} km`}</span>
                        )}
                      </div>
                      {services.length > 0 && (
                        <div className="service-row-services">
                          {services.map((s, i) => <span key={i}>{s}</span>).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} className="service-sep">·</span>, el], [])}
                        </div>
                      )}
                      {p._productCount > 0 && (
                        <Link to={`/shop?provider=${p.id}`} className="service-row-shop" onClick={e => e.stopPropagation()}>
                          <ShoppingBag size={12} /> {p._productCount} Produkte im Shop
                        </Link>
                      )}
                    </div>
                    <div className="service-row-right">
                      {p.rating > 0 && (
                        <div className="service-row-rating">
                          <Star size={14} fill="#f59e0b" color="#f59e0b" />
                          <span>{Number(p.rating).toFixed(1)}</span>
                        </div>
                      )}
                      <button className="service-fav-btn" onClick={(e) => toggleFavorite(e, p.id)}>
                        <Heart size={18} fill={p._isFav ? '#ef4444' : 'none'} color={p._isFav ? '#ef4444' : '#cbd5e1'} />
                      </button>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
