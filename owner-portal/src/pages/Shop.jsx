import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Search, X, ShoppingCart, Tag, Filter, ChevronRight, Plus, Minus, Check, Star, Package } from 'lucide-react'

// Map SF Symbol names from DB to emojis
const sfSymbolToEmoji = {
  'paintbrush.fill': '🎨', 'engine.combustion.fill': '⚙️', 'wrench.and.screwdriver.fill': '🔧',
  'sail': '⛵', 'antenna.radiowaves.left.and.right': '📡', 'helm': '⚓',
  'figure.sailing': '🏄', 'lifepreserver.fill': '🛟', 'drop.fill': '💧',
  'sparkles': '✨', 'car.rear.and.tire.marks': '🚗', 'tshirt.fill': '👕',
  'fuelpump.fill': '⛽', 'battery.100': '🔋', 'shippingbox.fill': '📦',
}
function mapIcon(icon) { return sfSymbolToEmoji[icon] || '' }

export default function Shop() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [promotions, setPromotions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [selectedCat, setSelectedCat] = useState(searchParams.get('category') || '')
  const [providerFilter, setProviderFilter] = useState(searchParams.get('provider') || '')
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('boatcare_cart') || '[]') } catch { return [] }
  })
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [cartToast, setCartToast] = useState(null)
  const PAGE_SIZE = 20

  useEffect(() => { loadInitial() }, [user])
  useEffect(() => { localStorage.setItem('boatcare_cart', JSON.stringify(cart)) }, [cart])
  // Reload products when search, category, or provider filter changes
  useEffect(() => {
    if (!loading) loadProducts(0)
  }, [search, selectedCat, providerFilter])

  async function loadInitial() {
    setLoading(true)
    const [{ data: cats }, { data: promos }] = await Promise.all([
      supabase.from('product_categories').select('*').is('parent_id', null).order('sort_order'),
      supabase.from('provider_promotions').select('*, service_providers(id, name)').eq('is_active', true)
    ])
    setCategories(cats || [])
    setPromotions((promos || []).filter(p => {
      const now = new Date().toISOString().slice(0, 10)
      if (p.valid_from && p.valid_from > now) return false
      if (p.valid_until && p.valid_until < now) return false
      return true
    }))
    await loadProducts(0)
    setLoading(false)
  }

  async function loadProducts(pageNum, append = false) {
    let query = supabase
      .from('metashop_products')
      .select('*, product_categories(*), service_providers(id, name, city)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (search) {
      // Split search into words and match any word in name, manufacturer, or description
      const words = search.trim().split(/\s+/).filter(w => w.length >= 2)
      if (words.length === 1) {
        query = query.or(`name.ilike.%${words[0]}%,manufacturer.ilike.%${words[0]}%,description.ilike.%${words[0]}%`)
      } else if (words.length > 1) {
        // Match any word in any field — builds OR conditions for each word
        const conditions = words.flatMap(w => [
          `name.ilike.%${w}%`,
          `manufacturer.ilike.%${w}%`,
          `description.ilike.%${w}%`
        ])
        query = query.or(conditions.join(','))
      }
    }
    if (selectedCat) query = query.eq('category_id', selectedCat)
    if (providerFilter) query = query.eq('provider_id', providerFilter)

    const { data, error } = await query
    if (error) { console.error('Products error:', error); return }
    setHasMore((data || []).length === PAGE_SIZE)
    if (append) {
      setProducts(prev => [...prev, ...(data || [])])
    } else {
      setProducts(data || [])
    }
    setPage(pageNum)
  }

  function handleSearch() {
    loadProducts(0)
  }

  function handleCategorySelect(catId) {
    setSelectedCat(catId === selectedCat ? '' : catId)
    setTimeout(() => loadProducts(0), 0)
  }

  // Cart functions
  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, quantity: 1, provider_id: product.provider_id, image: product.images?.[0] }]
    })
    setCartToast(product.name)
    setTimeout(() => setCartToast(null), 2000)
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(i => i.id !== productId))
  }

  function updateQuantity(productId, delta) {
    setCart(prev => prev.map(i => {
      if (i.id !== productId) return i
      const newQty = i.quantity + delta
      return newQty <= 0 ? null : { ...i, quantity: newQty }
    }).filter(Boolean))
  }

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const isInCart = (productId) => cart.some(i => i.id === productId)

  // Find best promotion for a product
  function bestPromo(product) {
    return promotions.find(p => {
      if (p.provider_id !== product.provider_id) return false
      if (p.filter_categories?.length && !p.filter_categories.includes(product.category_id)) return false
      return true
    })
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page shop-page">
      <div className="page-header">
        <div>
          <h1>Shop</h1>
          <p className="subtitle">{products.length} Produkte</p>
        </div>
        {cartCount > 0 && (
          <Link to="/orders" className="shop-cart-badge">
            <ShoppingCart size={20} />
            <span>{cartCount}</span>
            <span className="cart-total">{cartTotal.toFixed(2).replace('.', ',')} €</span>
          </Link>
        )}
      </div>

      {/* Search bar */}
      <div className="filter-bar">
        <div className="search-input" style={{ maxWidth: 400 }}>
          <Search size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Produkt, Marke oder Beschreibung..."
          />
          {search && <button className="btn-icon" onClick={() => { setSearch(''); setTimeout(() => loadProducts(0), 0) }}><X size={14} /></button>}
        </div>
        <button className="btn-primary" onClick={handleSearch} style={{ padding: '8px 16px' }}>
          <Search size={16} /> Suchen
        </button>
      </div>

      {/* Promotions banner */}
      {promotions.length > 0 && (
        <div className="shop-promos-scroll">
          {promotions.map(p => (
            <div key={p.id} className="shop-promo-card" onClick={() => { setProviderFilter(p.provider_id); loadProducts(0) }}>
              <Tag size={16} />
              <div>
                <strong>{p.name}</strong>
                <span className="promo-discount">
                  {p.discount_type === 'percent' ? `${p.discount_value}% Rabatt` : `${Number(p.discount_value).toFixed(2).replace('.', ',')} € Rabatt`}
                </span>
                {p.service_providers?.name && <span className="promo-provider">{p.service_providers.name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category chips */}
      <div className="shop-categories">
        <button className={`filter-btn ${!selectedCat ? 'active' : ''}`} onClick={() => handleCategorySelect('')}>Alle</button>
        {categories.map(c => (
          <button key={c.id} className={`filter-btn ${selectedCat === c.id ? 'active' : ''}`} onClick={() => handleCategorySelect(c.id)}>
            {mapIcon(c.icon)}{mapIcon(c.icon) ? ' ' : ''}{c.name_de || c.slug}
          </button>
        ))}
      </div>

      {providerFilter && (
        <div className="shop-filter-info">
          <span>Gefiltert nach Anbieter</span>
          <button className="btn-icon" onClick={() => { setProviderFilter(''); loadProducts(0) }}><X size={14} /> Filter entfernen</button>
        </div>
      )}

      {/* Product grid */}
      {products.length === 0 ? (
        <div className="empty-state">
          <Package size={64} color="#cbd5e1" />
          <h2>Keine Produkte gefunden</h2>
          <p>Versuchen Sie einen anderen Suchbegriff oder eine andere Kategorie.</p>
        </div>
      ) : (
        <>
          <div className="shop-product-grid">
            {products.map(product => {
              const promo = bestPromo(product)
              const inCart = isInCart(product.id)
              const discountedPrice = promo
                ? promo.discount_type === 'percent'
                  ? product.price * (1 - promo.discount_value / 100)
                  : Math.max(0, product.price - promo.discount_value)
                : null

              return (
                <div key={product.id} className="shop-product-card">
                  <Link to={`/shop/product/${product.id}`} className="shop-product-link">
                    {product.images?.[0] ? (
                      <div className="shop-product-img-wrap">
                        <img src={product.images[0]} alt={product.name} />
                        {promo && (
                          <span className="shop-discount-badge">
                            {promo.discount_type === 'percent' ? `-${promo.discount_value}%` : `-${Number(promo.discount_value).toFixed(0)}€`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="shop-product-img-wrap shop-product-no-img">
                        <Package size={32} color="#cbd5e1" />
                        {promo && (
                          <span className="shop-discount-badge">
                            {promo.discount_type === 'percent' ? `-${promo.discount_value}%` : `-${Number(promo.discount_value).toFixed(0)}€`}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="shop-product-info">
                      {product.service_providers?.name && (
                        <span className="shop-product-provider">{product.service_providers.name}</span>
                      )}
                      <span className="shop-product-name">{product.name}</span>
                      {product.manufacturer && <span className="shop-product-mfr">{product.manufacturer}</span>}
                      <div className="shop-product-price-row">
                        {discountedPrice !== null ? (
                          <>
                            <span className="shop-price-old">{Number(product.price).toFixed(2).replace('.', ',')} €</span>
                            <span className="shop-price-new">{discountedPrice.toFixed(2).replace('.', ',')} €</span>
                          </>
                        ) : (
                          <span className="shop-price">{Number(product.price).toFixed(2).replace('.', ',')} €</span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <button
                    className={`shop-cart-btn ${inCart ? 'in-cart' : ''}`}
                    onClick={() => addToCart(product)}
                  >
                    {inCart ? <><Check size={16} /> Im Warenkorb</> : <><ShoppingCart size={16} /> In den Warenkorb</>}
                  </button>
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => loadProducts(page + 1, true)}>
                Mehr laden...
              </button>
            </div>
          )}
        </>
      )}

      {/* Cart sidebar / mini-cart */}
      {cart.length > 0 && (
        <div className="shop-mini-cart">
          <h3><ShoppingCart size={18} /> Warenkorb ({cartCount})</h3>
          <div className="mini-cart-items">
            {cart.map(item => (
              <div key={item.id} className="mini-cart-item">
                <div className="mini-cart-item-info">
                  <span className="mini-cart-name">{item.name}</span>
                  <span className="mini-cart-price">{(item.price * item.quantity).toFixed(2).replace('.', ',')} €</span>
                </div>
                <div className="mini-cart-qty">
                  <button onClick={() => updateQuantity(item.id, -1)}><Minus size={14} /></button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)}><Plus size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="mini-cart-total">
            <span>Gesamt</span>
            <strong>{cartTotal.toFixed(2).replace('.', ',')} €</strong>
          </div>
          <button className="btn-primary btn-full" onClick={() => window.location.href = '/checkout'}>
            Zur Kasse
          </button>
        </div>
      )}

      {/* Toast */}
      {cartToast && (
        <div className="cart-toast">
          <Check size={16} /> {cartToast} zum Warenkorb hinzugefügt
        </div>
      )}
    </div>
  )
}
