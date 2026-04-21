import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ShoppingCart, Check, Package, Truck, Star, Tag, Plus, Minus, MapPin } from 'lucide-react'

export default function ProductDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)
  const [similar, setSimilar] = useState([])
  const [promo, setPromo] = useState(null)
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('boatcare_cart') || '[]') } catch { return [] }
  })

  useEffect(() => { if (id) loadProduct() }, [id])
  useEffect(() => { localStorage.setItem('boatcare_cart', JSON.stringify(cart)) }, [cart])

  async function loadProduct() {
    setLoading(true)
    const { data } = await supabase
      .from('metashop_products')
      .select('*, product_categories(*), service_providers(id, name, city, logo_url)')
      .eq('id', id)
      .single()

    setProduct(data)

    if (data) {
      // Load similar products
      const { data: sim } = await supabase
        .from('metashop_products')
        .select('*, product_categories(*)')
        .eq('category_id', data.category_id)
        .neq('id', data.id)
        .eq('is_active', true)
        .limit(4)
      setSimilar(sim || [])

      // Load promotion
      const { data: promos } = await supabase
        .from('provider_promotions')
        .select('*')
        .eq('provider_id', data.provider_id)
        .eq('is_active', true)
      const now = new Date().toISOString().slice(0, 10)
      const validPromo = (promos || []).find(p => {
        if (p.valid_from && p.valid_from > now) return false
        if (p.valid_until && p.valid_until < now) return false
        if (p.filter_categories?.length && !p.filter_categories.includes(data.category_id)) return false
        return true
      })
      setPromo(validPromo || null)
    }

    setLoading(false)
  }

  function addToCart() {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i)
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, quantity, provider_id: product.provider_id, image: product.images?.[0] }]
    })
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (!product) return <div className="page"><div className="alert alert-error">Produkt nicht gefunden.</div></div>

  const inCart = cart.some(i => i.id === product.id)
  const discountedPrice = promo
    ? promo.discount_type === 'percent'
      ? product.price * (1 - promo.discount_value / 100)
      : Math.max(0, product.price - promo.discount_value)
    : null

  return (
    <div className="page product-detail-page">
      <button className="btn-back" onClick={() => navigate(-1)}>
        <ChevronLeft size={20} /> Zurück
      </button>

      <div className="pd-layout">
        {/* Images */}
        <div className="pd-images">
          {product.images?.length > 0 ? (
            <>
              <div className="pd-main-image">
                <img src={product.images[selectedImage]} alt={product.name} />
                {promo && (
                  <span className="shop-discount-badge" style={{ fontSize: '1rem', padding: '6px 14px' }}>
                    {promo.discount_type === 'percent' ? `-${promo.discount_value}%` : `-${Number(promo.discount_value).toFixed(0)}€`}
                  </span>
                )}
              </div>
              {product.images.length > 1 && (
                <div className="pd-image-thumbs">
                  {product.images.map((img, i) => (
                    <img key={i} src={img} alt="" className={`pd-thumb ${i === selectedImage ? 'active' : ''}`} onClick={() => setSelectedImage(i)} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pd-main-image pd-no-image">
              <Package size={64} color="#cbd5e1" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="pd-info">
          {product.product_categories && (
            <span className="pd-product-cat">{product.product_categories.name_de || product.product_categories.slug}</span>
          )}
          {product.service_providers && (
            <Link to={`/provider/${product.service_providers.id}`} className="pd-product-provider-link">
              {product.service_providers.name}{product.service_providers.city ? `, ${product.service_providers.city}` : ''}
            </Link>
          )}

          <h1>{product.name}</h1>
          {product.manufacturer && <p className="pd-manufacturer">{product.manufacturer}{product.part_number ? ` · ${product.part_number}` : ''}</p>}

          {/* Promo banner */}
          {promo && (
            <div className="pd-promo-inline">
              <Tag size={16} />
              <span>{promo.name}: {promo.discount_type === 'percent' ? `${promo.discount_value}% Rabatt` : `${Number(promo.discount_value).toFixed(2).replace('.', ',')} € Rabatt`}</span>
            </div>
          )}

          {/* Price */}
          <div className="pd-price-section">
            {discountedPrice !== null ? (
              <>
                <span className="pd-price-old">{Number(product.price).toFixed(2).replace('.', ',')} €</span>
                <span className="pd-price-current pd-price-discount">{discountedPrice.toFixed(2).replace('.', ',')} €</span>
              </>
            ) : (
              <span className="pd-price-current">{Number(product.price).toFixed(2).replace('.', ',')} €</span>
            )}
            {product.shipping_cost !== null && product.shipping_cost !== undefined && (
              <span className="pd-shipping">
                <Truck size={14} /> {Number(product.shipping_cost) === 0 ? 'Kostenloser Versand' : `+ ${Number(product.shipping_cost).toFixed(2).replace('.', ',')} € Versand`}
              </span>
            )}
          </div>

          {/* Availability */}
          <div className="pd-availability">
            {product.in_stock ? (
              <span className="pd-stock-ok"><Check size={14} /> Auf Lager{product.stock_quantity && product.stock_quantity < 5 ? ` (nur noch ${product.stock_quantity})` : ''}</span>
            ) : (
              <span className="pd-stock-out">Nicht verfügbar</span>
            )}
            {product.delivery_days && <span className="pd-delivery">Lieferzeit: {product.delivery_days} Tage</span>}
          </div>

          {/* Quantity + Cart */}
          <div className="pd-cart-section">
            <div className="pd-qty-stepper">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={16} /></button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)}><Plus size={16} /></button>
            </div>
            <button className={`btn-primary pd-add-cart ${inCart ? 'in-cart' : ''}`} onClick={addToCart}>
              {inCart ? <><Check size={18} /> Im Warenkorb</> : <><ShoppingCart size={18} /> In den Warenkorb</>}
            </button>
          </div>

          {/* Description */}
          {product.description && (
            <div className="pd-description">
              <h3>Beschreibung</h3>
              <p>{product.description}</p>
            </div>
          )}

          {/* Compatibility */}
          {(product.fits_boat_types?.length > 0 || product.fits_manufacturers?.length > 0) && (
            <div className="pd-compat">
              <h3>Kompatibilität</h3>
              <div className="pd-tag-list">
                {product.fits_boat_types?.map((t, i) => <span key={`bt-${i}`} className="pd-tag pd-tag-blue">{t}</span>)}
                {product.fits_manufacturers?.map((m, i) => <span key={`mf-${i}`} className="pd-tag pd-tag-orange">{m}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Similar products */}
      {similar.length > 0 && (
        <div className="pd-section" style={{ marginTop: 32 }}>
          <h3>Ähnliche Produkte</h3>
          <div className="shop-product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {similar.map(p => (
              <Link key={p.id} to={`/shop/product/${p.id}`} className="shop-product-card" style={{ textDecoration: 'none' }}>
                <div className="shop-product-link">
                  {p.images?.[0] ? (
                    <div className="shop-product-img-wrap"><img src={p.images[0]} alt={p.name} /></div>
                  ) : (
                    <div className="shop-product-img-wrap shop-product-no-img"><Package size={24} color="#cbd5e1" /></div>
                  )}
                  <div className="shop-product-info">
                    <span className="shop-product-name">{p.name}</span>
                    <span className="shop-price">{Number(p.price).toFixed(2).replace('.', ',')} €</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
