import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ProductRelationsView from '../components/ProductRelationsView'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight, ShoppingCart, Check, Package, Truck, Star, Tag, Plus, Minus, MapPin } from 'lucide-react'
import { useT } from '../i18n'
import { translateProducts, isTranslatableLang } from '../lib/dbTranslate'
import { isColorOption, swatchBackground } from '../lib/variantColors'

export default function ProductDetail() {
  const { t, lang } = useT()
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)
  const [touchStartX, setTouchStartX] = useState(null)
  const [similar, setSimilar] = useState([])
  const [promo, setPromo] = useState(null)
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('boatcare_cart') || '[]') } catch { return [] }
  })
  const [tr, setTr] = useState(null) // { name, description } in aktiver Sprache
  const [variants, setVariants] = useState([])   // product_variants
  const [variantSel, setVariantSel] = useState({}) // { OptionName: Wert }

  useEffect(() => { if (id) loadProduct() }, [id])

  // DB-Freitext (Name/Beschreibung) on-demand in Zielsprache übersetzen + cachen
  useEffect(() => {
    if (!product) { setTr(null); return }
    if (!isTranslatableLang(lang)) { setTr(null); return }
    const cached = product.translations?.[lang]
    if (cached?.name) { setTr(cached); return }
    setTr(null)
    translateProducts([product.id], lang).then(map => {
      if (map[product.id]) setTr(map[product.id])
    })
  }, [product, lang])
  useEffect(() => { localStorage.setItem('boatcare_cart', JSON.stringify(cart)) }, [cart])
  // Beim Wechsel der Variantenauswahl auf das erste (Titel-)Bild zuruecksetzen.
  useEffect(() => { setSelectedImage(0) }, [JSON.stringify(variantSel)])

  async function loadProduct() {
    setLoading(true)
    const { data } = await supabase
      .from('metashop_products')
      .select('*, product_categories(*), service_providers(id, name, city, logo_url)')
      .eq('id', id)
      .single()

    setProduct(data)

    if (data) {
      // Varianten laden (falls definiert)
      if (Array.isArray(data.variant_options) && data.variant_options.length) {
        const { data: vs } = await supabase
          .from('product_variants')
          .select('*')
          .eq('product_id', data.id)
          .eq('is_active', true)
          .order('sort_order')
        setVariants(vs || [])
      } else {
        setVariants([])
      }

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
    const opts = Array.isArray(product.variant_options) ? product.variant_options : []
    const withVariants = opts.length > 0 && variants.length > 0
    const chosen = opts.every(o => variantSel[o.name])
    const v = withVariants && chosen
      ? (variants.find(x => opts.every(o => String(x.attributes?.[o.name]) === String(variantSel[o.name]))) || null)
      : null
    if (withVariants && !v) return // Variante muss vollstaendig gewaehlt sein
    const id = v ? `${product.id}:${v.id}` : product.id
    const price = v?.price != null ? Number(v.price) : Number(product.price)
    const attrLabel = v ? Object.entries(v.attributes || {}).map(([k, val]) => `${tr?.vopts?.[k] || k}: ${tr?.vopts?.[val] || val}`).join(', ') : ''
    const dispName = attrLabel ? `${product.name} (${attrLabel})` : product.name
    setCart(prev => {
      const existing = prev.find(i => i.id === id)
      if (existing) return prev.map(i => i.id === id ? { ...i, quantity: i.quantity + quantity } : i)
      return [...prev, {
        id, product_id: product.id, variant_id: v?.id || null, variant_sku: v?.sku || null,
        name: dispName, price, quantity, provider_id: product.provider_id,
        image: (v && ((Array.isArray(v.images) && v.images[0]) || v.image_url)) || product.images?.[0],
      }]
    })
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (!product) return <div className="page"><div className="alert alert-error">{t('prod.k0')}</div></div>

  // ── Varianten ──
  const options = Array.isArray(product.variant_options) ? product.variant_options : []
  const hasVariants = options.length > 0 && variants.length > 0
  const allChosen = options.every(o => variantSel[o.name])
  const selectedVariant = hasVariants && allChosen
    ? (variants.find(v => options.every(o => String(v.attributes?.[o.name]) === String(variantSel[o.name]))) || null)
    : null
  // Nur Werte anbieten, die es (in Kombination mit der bisherigen Auswahl) gibt.
  const valueAvailable = (optName, val) => variants.some(v =>
    String(v.attributes?.[optName]) === String(val) &&
    options.every(o => o.name === optName || !variantSel[o.name] || String(v.attributes?.[o.name]) === String(variantSel[o.name])))
  const basePrice = selectedVariant?.price != null ? Number(selectedVariant.price) : Number(product.price)
  // Galerie: hat die gewaehlte Variante eigene Bilder, ersetzen sie die Produktbilder.
  const variantImages = selectedVariant
    ? (Array.isArray(selectedVariant.images) && selectedVariant.images.length
        ? selectedVariant.images
        : (selectedVariant.image_url ? [selectedVariant.image_url] : []))
    : []
  const galleryImages = variantImages.length ? variantImages : (product.images || [])
  const inStockEff = hasVariants ? (selectedVariant ? selectedVariant.in_stock : true) : product.in_stock

  const lineId = selectedVariant ? `${product.id}:${selectedVariant.id}` : product.id
  const inCart = cart.some(i => i.id === lineId)
  const discountedPrice = promo
    ? promo.discount_type === 'percent'
      ? basePrice * (1 - promo.discount_value / 100)
      : Math.max(0, basePrice - promo.discount_value)
    : null

  return (
    <div className="page product-detail-page">
      <button className="btn-back" onClick={() => navigate(-1)}>
        <ChevronLeft size={20} /> {t('prod.k1')}
      </button>

      <div className="pd-layout">
        {/* Images */}
        <div className="pd-images">
          {galleryImages.length > 0 ? (
            <>
              <div
                className="pd-main-image"
                onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
                onTouchEnd={(e) => {
                  if (touchStartX == null || galleryImages.length < 2) { setTouchStartX(null); return }
                  const dx = e.changedTouches[0].clientX - touchStartX
                  if (Math.abs(dx) > 40) {
                    const n = galleryImages.length
                    setSelectedImage(prev => dx < 0 ? (prev + 1) % n : (prev - 1 + n) % n)
                  }
                  setTouchStartX(null)
                }}
              >
                <img src={galleryImages[Math.min(selectedImage, galleryImages.length - 1)]} alt={product.name} />
                {promo && (
                  <span className="shop-discount-badge" style={{ fontSize: '1rem', padding: '6px 14px' }}>
                    {promo.discount_type === 'percent' ? `-${promo.discount_value}%` : `-${Number(promo.discount_value).toFixed(0)}€`}
                  </span>
                )}
                {galleryImages.length > 1 && (
                  <>
                    <button type="button" className="pd-nav-btn prev" aria-label="prev"
                      onClick={() => setSelectedImage(prev => (prev - 1 + galleryImages.length) % galleryImages.length)}>
                      <ChevronLeft size={22} />
                    </button>
                    <button type="button" className="pd-nav-btn next" aria-label="next"
                      onClick={() => setSelectedImage(prev => (prev + 1) % galleryImages.length)}>
                      <ChevronRight size={22} />
                    </button>
                    <span className="pd-image-counter">{Math.min(selectedImage, galleryImages.length - 1) + 1} / {galleryImages.length}</span>
                  </>
                )}
              </div>
              {galleryImages.length > 1 && (
                <div className="pd-image-thumbs">
                  {galleryImages.map((img, i) => (
                    <img key={i} src={img} alt="" className={`pd-thumb ${i === Math.min(selectedImage, galleryImages.length - 1) ? 'active' : ''}`} onClick={() => setSelectedImage(i)} />
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
            <span className="pd-product-cat">{product.product_categories['name_' + lang] || product.product_categories.name_de || product.product_categories.slug}</span>
          )}
          {product.service_providers && (
            <Link to={`/provider/${product.service_providers.id}`} className="pd-product-provider-link">
              {product.service_providers.name}{product.service_providers.city ? `, ${product.service_providers.city}` : ''}
            </Link>
          )}

          <h1>{tr?.name || product.name}</h1>
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
                <span className="pd-price-old">{basePrice.toFixed(2).replace('.', ',')} €</span>
                <span className="pd-price-current pd-price-discount">{discountedPrice.toFixed(2).replace('.', ',')} €</span>
              </>
            ) : (
              <span className="pd-price-current">{basePrice.toFixed(2).replace('.', ',')} €</span>
            )}
            {product.shipping_cost !== null && product.shipping_cost !== undefined && (
              <span className="pd-shipping">
                <Truck size={14} /> {Number(product.shipping_cost) === 0 ? 'Kostenloser Versand' : `+ ${Number(product.shipping_cost).toFixed(2).replace('.', ',')} € Versand`}
              </span>
            )}
          </div>

          {/* Varianten-Auswahl (z. B. Durchmesser, Farbe, Größe) */}
          {hasVariants && (
            <div className="pd-variants">
              {options.map(o => {
                const colorOpt = isColorOption(o)
                return (
                <div key={o.name} className="pd-variant-opt">
                  <label className="pd-variant-label">{tr?.vopts?.[o.name] || o.name}</label>
                  <div className="pd-variant-values">
                    {(o.values || []).map(val => {
                      const active = String(variantSel[o.name]) === String(val)
                      const avail = valueAvailable(o.name, val)
                      const swatch = colorOpt ? swatchBackground(o, val) : null
                      return (
                        <button key={val} type="button"
                          className={`pd-variant-chip ${active ? 'active' : ''} ${swatch ? 'has-swatch' : ''}`}
                          disabled={!avail}
                          title={val}
                          onClick={() => setVariantSel(prev => ({ ...prev, [o.name]: val }))}>
                          {swatch && <span className="pd-variant-swatch" style={{ background: swatch }} />}
                          {tr?.vopts?.[val] || val}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )})}
              {!allChosen && <p className="pd-variant-hint">{t('prod.chooseVariant')}</p>}
              {allChosen && !selectedVariant && <p className="pd-variant-hint" style={{ color: '#dc2626' }}>{t('prod.variantUnavailable')}</p>}
            </div>
          )}

          {/* Availability */}
          <div className="pd-availability">
            {inStockEff ? (
              (() => {
                const low = selectedVariant?.stock_quantity && selectedVariant.stock_quantity < 5
                  ? selectedVariant.stock_quantity
                  : (!hasVariants && product.stock_quantity && product.stock_quantity < 5 ? product.stock_quantity : null)
                return (
                  <span className="pd-stock-ok"><Check size={14} /> {t('prod.inStock')}{low ? ` ${t('prod.onlyLeft', { n: low })}` : ''}</span>
                )
              })()
            ) : (
              <span className="pd-stock-out">{t('prod.k2')}</span>
            )}
            {product.delivery_days && <span className="pd-delivery">{t('prod.deliveryDays', { n: product.delivery_days })}</span>}
          </div>

          {/* Quantity + Cart */}
          <div className="pd-cart-section">
            <div className="pd-qty-stepper">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={16} /></button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)}><Plus size={16} /></button>
            </div>
            <button className={`btn-primary pd-add-cart ${inCart ? 'in-cart' : ''}`} onClick={addToCart}
              disabled={hasVariants && !selectedVariant}>
              {inCart ? <><Check size={18} /> {t('prod.k3')}</> : <><ShoppingCart size={18} /> {t('prod.k4')}</>}
            </button>
          </div>

          {/* Direkt zur Kasse, sobald etwas im Warenkorb ist — sonst müsste man
              erst zurück in den Shop navigieren, um den Kauf abzuschließen. */}
          {cart.length > 0 && (
            <button className="btn-secondary pd-to-checkout" onClick={() => navigate('/checkout')}
              style={{ width: '100%', marginTop: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ShoppingCart size={18} /> {t('prod.toCheckout')} ({cart.reduce((n, i) => n + i.quantity, 0)})
            </button>
          )}

          {/* Description */}
          {(tr?.description || product.description) && (
            <div className="pd-description">
              <h3>{t('prod.k5')}</h3>
              <p>{tr?.description || product.description}</p>
            </div>
          )}

          {/* Compatibility */}
          {(product.fits_boat_types?.length > 0 || product.fits_manufacturers?.length > 0) && (
            <div className="pd-compat">
              <h3>{t('prod.k6')}</h3>
              <div className="pd-tag-list">
                {product.fits_boat_types?.map((t, i) => <span key={`bt-${i}`} className="pd-tag pd-tag-blue">{t}</span>)}
                {product.fits_manufacturers?.map((m, i) => <span key={`mf-${i}`} className="pd-tag pd-tag-orange">{m}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Provider-kuratierte Verknüpfungen (Zubehör/Alternativen/Bundle) */}
      <ProductRelationsView productId={product.id} lang={lang} />

      {/* Similar products */}
      {similar.length > 0 && (
        <div className="pd-section" style={{ marginTop: 32 }}>
          <h3>{t('prod.k7')}</h3>
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
