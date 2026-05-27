import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Search, X, ShoppingCart, Tag, Filter, ChevronRight, Plus, Minus, Check, Star, Package, ArrowLeft } from 'lucide-react'
import {
  classifyProducts, parseSparePartsParams, hasSparePartsContext, BUCKET_META,
} from '../lib/sparePartsSearch'

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Ersatzteil-Modus: wenn Equipment-Daten via URL kommen, andere UI
  const sparePartsEquipment = parseSparePartsParams(searchParams)
  const isSparePartsMode = hasSparePartsContext(sparePartsEquipment)

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
  // Empfehlungen für User-Equipment ("Passende Produkte für Deine Ausrüstung")
  const [equipmentRecommendations, setEquipmentRecommendations] = useState([])
  const PAGE_SIZE = 20

  // Initial-Load + Wechsel zwischen Shop-Modus / Ersatzteil-Modus.
  // Wichtig: Wir hören auf searchParams.toString(), damit beim Wechsel von
  // /shop → /shop?eq_name=... (Equipment-Klick) die Spare-Parts-Suche neu
  // ausgelöst wird, auch wenn die Shop-Komponente bereits gemountet war.
  useEffect(() => {
    if (!user) return
    if (isSparePartsMode) loadSpareParts()
    else loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSparePartsMode, searchParams.toString()])
  useEffect(() => { localStorage.setItem('boatcare_cart', JSON.stringify(cart)) }, [cart])
  // Reload products when search, category, or provider filter changes (Shop-Modus only)
  useEffect(() => {
    if (!loading && !isSparePartsMode) loadProducts(0)
  }, [search, selectedCat, providerFilter])

  // Ersatzteil-Modus: breite Volltextsuche über mfg + model + name (bis zu 80 Treffer)
  async function loadSpareParts() {
    setLoading(true)
    const eq = sparePartsEquipment
    const terms = [eq.manufacturer, eq.model, eq.name]
      .map(s => s.trim()).filter(s => s.length >= 2)
    let query = supabase
      .from('metashop_products')
      .select('*, product_categories(*), service_providers(id, name, city)')
      .eq('is_active', true)
      .limit(80)
    if (terms.length > 0) {
      const conditions = terms.flatMap(w => [
        `name.ilike.%${w}%`,
        `manufacturer.ilike.%${w}%`,
        `description.ilike.%${w}%`,
        `part_number.ilike.%${w}%`,
      ])
      query = query.or(conditions.join(','))
    }
    const { data, error } = await query
    if (error) console.error('Spare parts search error:', error)
    setProducts(data || [])
    setLoading(false)
  }

  // Klassifizierte Treffer im Ersatzteil-Modus (Original / Derivate / Related)
  const classified = useMemo(() => {
    if (!isSparePartsMode) return null
    return classifyProducts(products, sparePartsEquipment)
  }, [isSparePartsMode, products, sparePartsEquipment])

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
    // Parallel: Empfehlungen für User-Equipment laden (nicht-blockierend)
    loadEquipmentRecommendations()
    await loadProducts(0)
    setLoading(false)
  }

  /**
   * Empfehlungs-Sektion "Passende Produkte für Deine Ausrüstung":
   * Holt eine Auswahl der User-Ausrüstung (Marke/Modell/Name) und matcht
   * Produkte aus dem Metashop. Auswahl: bis zu 12 Produkte, sortiert nach
   * Match-Score (Hersteller > Modell > Name).
   */
  async function loadEquipmentRecommendations() {
    if (!user) return
    try {
      // 1) Eigene Boote → Equipment laden
      const { data: boats } = await supabase
        .from('boats').select('id').eq('owner_id', user.id)
      const boatIds = (boats || []).map(b => b.id)
      if (boatIds.length === 0) return setEquipmentRecommendations([])

      const { data: eqs } = await supabase
        .from('equipment')
        .select('name, manufacturer, model, category')
        .in('boat_id', boatIds)
        .limit(20)
      const items = (eqs || []).filter(e => e.manufacturer || e.model || e.name)
      if (items.length === 0) return setEquipmentRecommendations([])

      // 2) Eindeutige Marken sammeln → ILIKE-OR-Suche
      const brands = Array.from(new Set(
        items.map(e => (e.manufacturer || '').trim()).filter(s => s.length >= 2)
      )).slice(0, 5)
      if (brands.length === 0) return setEquipmentRecommendations([])

      const conditions = brands.flatMap(b => [
        `manufacturer.ilike.%${b}%`,
        `name.ilike.%${b}%`,
      ])
      const { data: prods } = await supabase
        .from('metashop_products')
        .select('*, product_categories(*), service_providers(id, name, city)')
        .eq('is_active', true)
        .or(conditions.join(','))
        .limit(12)
      setEquipmentRecommendations(prods || [])
    } catch (err) {
      console.warn('Equipment-Empfehlungen konnten nicht geladen werden:', err)
    }
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

  // ─── Ersatzteil-Modus: iOS-Style 3-Bucket-Layout ────────────────────────
  if (isSparePartsMode && classified) {
    return (
      <SparePartsView
        eq={sparePartsEquipment}
        classified={classified}
        bestPromo={bestPromo}
        isInCart={isInCart}
        addToCart={addToCart}
        onBack={() => navigate(-1)}
        onClearMode={() => navigate('/shop')}
      />
    )
  }

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

      {/* Passende Produkte für Deine Ausrüstung */}
      {equipmentRecommendations.length > 0 && !search && !selectedCat && !providerFilter && (
        <div className="shop-recommendations">
          <div className="shop-recommendations-header">
            <span className="shop-recommendations-icon">⚡</span>
            <div>
              <h3>Passende Produkte für deine Ausrüstung</h3>
              <p>Basierend auf den Marken in deinem Equipment</p>
            </div>
          </div>
          <div className="shop-recommendations-scroll">
            {equipmentRecommendations.map(product => {
              const inCart = isInCart(product.id)
              return (
                <div key={product.id} className="shop-rec-card">
                  <Link to={`/shop/product/${product.id}`} className="shop-rec-link">
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt={product.name} className="shop-rec-img" />
                    ) : (
                      <div className="shop-rec-img shop-rec-no-img">
                        <Package size={28} color="#cbd5e1" />
                      </div>
                    )}
                    <div className="shop-rec-info">
                      {product.manufacturer && <span className="shop-rec-mfr">{product.manufacturer}</span>}
                      <span className="shop-rec-name">{product.name}</span>
                      <span className="shop-rec-price">{Number(product.price).toFixed(2).replace('.', ',')} €</span>
                    </div>
                  </Link>
                  <button
                    className={`shop-rec-cart-btn ${inCart ? 'in-cart' : ''}`}
                    onClick={() => addToCart(product)}
                  >
                    {inCart ? <Check size={14} /> : <ShoppingCart size={14} />}
                  </button>
                </div>
              )
            })}
          </div>
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

// ─────────────────────────────────────────────────────────────────────────
// SparePartsView – iOS-Style 3-Bucket Layout
// ─────────────────────────────────────────────────────────────────────────
function SparePartsView({ eq, classified, bestPromo, isInCart, addToCart, onBack, onClearMode }) {
  const { originals, derivates, related } = classified
  const totalCount = originals.length + derivates.length + related.length
  const contextChips = [eq.name, eq.manufacturer, eq.model, eq.partNumber].filter(Boolean)

  return (
    <div className="page shop-page spare-parts-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-icon" onClick={onBack} aria-label="Zurück">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ marginBottom: 2 }}>Ersatzteile</h1>
            <p className="subtitle">{totalCount} Treffer · 1:1-Suche</p>
          </div>
        </div>
        <button className="btn-secondary" onClick={onClearMode} style={{ padding: '8px 12px' }}>
          <X size={14} /> Modus beenden
        </button>
      </div>

      {/* Context-Chips: zeigen wonach gesucht wurde */}
      {contextChips.length > 0 && (
        <div className="sp-context">
          <span className="sp-context-label">Suche für:</span>
          {contextChips.map((chip, i) => (
            <span key={i} className="sp-context-chip">{chip}</span>
          ))}
        </div>
      )}

      {totalCount === 0 ? (
        <div className="empty-state">
          <Package size={64} color="#cbd5e1" />
          <h2>Keine passenden Artikel gefunden</h2>
          <p>Versuche es im normalen Shop mit anderen Suchbegriffen.</p>
          <button className="btn-primary" onClick={onClearMode}>
            <Search size={16} /> Zum Shop
          </button>
        </div>
      ) : (
        <>
          <SparePartsBucket
            bucket="original" items={originals}
            bestPromo={bestPromo} isInCart={isInCart} addToCart={addToCart}
          />
          <SparePartsBucket
            bucket="derivate" items={derivates}
            bestPromo={bestPromo} isInCart={isInCart} addToCart={addToCart}
          />
          <SparePartsBucket
            bucket="related" items={related}
            bestPromo={bestPromo} isInCart={isInCart} addToCart={addToCart}
          />
        </>
      )}
    </div>
  )
}

function SparePartsBucket({ bucket, items, bestPromo, isInCart, addToCart }) {
  if (items.length === 0) return null
  const meta = BUCKET_META[bucket]
  return (
    <section className="sp-section">
      <div className="sp-section-header" style={{ color: meta.color }}>
        <span className="sp-section-icon" style={{ background: meta.color }}>{meta.icon}</span>
        <span className="sp-section-title">{meta.label}</span>
        <span className="sp-section-count">({items.length})</span>
      </div>
      <p className="sp-section-sublabel">{meta.sublabel}</p>
      <div className="sp-list">
        {items.map(({ product, reason }) => (
          <SparePartsRow
            key={product.id}
            product={product}
            reason={reason}
            bucket={bucket}
            promo={bestPromo(product)}
            inCart={isInCart(product.id)}
            onAdd={() => addToCart(product)}
          />
        ))}
      </div>
    </section>
  )
}

function SparePartsRow({ product, reason, bucket, promo, inCart, onAdd }) {
  const meta = BUCKET_META[bucket]
  const inStock = product.in_stock ?? (product.stock_quantity > 0)
  return (
    <div
      className="sp-row"
      style={{ borderColor: meta.borderColor, background: meta.bgColor }}
    >
      {/* Reason-Badge */}
      <div className="sp-reason-badge" style={{ background: meta.color }}>
        {meta.icon} {reason || 'Treffer'}
      </div>

      <Link to={`/shop/product/${product.id}`} className="sp-row-content">
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} className="sp-row-img" />
        ) : (
          <div className="sp-row-img sp-row-img-placeholder">
            <Package size={24} color="#94a3b8" />
          </div>
        )}
        <div className="sp-row-info">
          <span className="sp-row-name">{product.name}</span>
          {product.manufacturer && <span className="sp-row-mfg">{product.manufacturer}</span>}
          {product.part_number && (
            <span className="sp-row-part">Art.-Nr.: {product.part_number}</span>
          )}
        </div>
        <div className="sp-row-meta">
          <span className="sp-row-price">
            {Number(product.price).toFixed(2).replace('.', ',')} €
          </span>
          <span className={`sp-row-stock ${inStock ? 'in' : 'out'}`}>
            <span className="sp-stock-dot" />
            {inStock ? 'Auf Lager' : 'Nicht verfügbar'}
          </span>
        </div>
      </Link>

      <button
        className={`sp-row-cart-btn ${inCart ? 'in-cart' : ''}`}
        onClick={onAdd}
        aria-label="In den Warenkorb"
      >
        {inCart ? <Check size={16} /> : <ShoppingCart size={16} />}
      </button>
    </div>
  )
}
