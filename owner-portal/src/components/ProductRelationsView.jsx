// Zeigt dem Bootseigner die provider-kuratierten Produkt-Verknüpfungen
// (Migration 120): erforderliches/optionales Zubehör, Alternativen, Bundle —
// jeweils mit dem Hinweistext des Providers. Verifizierte Empfehlungen,
// keine KI-Erfindung. Hilft bei der Planung (z. B. DC-DC-Charger zur LiFePO4).

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import { supabase } from '../lib/supabase'

const GROUPS = [
  { type: 'zubehoer_erforderlich', de: 'Erforderliches Zubehör', en: 'Required accessories' },
  { type: 'alternative',           de: 'Alternativen',           en: 'Alternatives' },
  { type: 'zubehoer_optional',     de: 'Optionales Zubehör',     en: 'Optional accessories' },
  { type: 'bundle',                de: 'Passt dazu',             en: 'Goes well together' },
]

export default function ProductRelationsView({ productId, lang = 'de' }) {
  const [rels, setRels] = useState([])

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    supabase
      .from('product_relations')
      .select('id, relation_type, note, target:metashop_products!product_relations_target_product_id_fkey(id,name,price,images)')
      .eq('source_product_id', productId)
      .order('sort_order').order('created_at')
      .then(({ data }) => { if (!cancelled) setRels((data || []).filter(r => r.target)) })
    return () => { cancelled = true }
  }, [productId])

  if (rels.length === 0) return null

  const groups = GROUPS
    .map(g => ({ ...g, items: rels.filter(r => r.relation_type === g.type) }))
    .filter(g => g.items.length > 0)

  return (
    <>
      {groups.map(g => (
        <div key={g.type} className="pd-section" style={{ marginTop: 32 }}>
          <h3>{lang === 'de' ? g.de : g.en}</h3>
          <div className="shop-product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {g.items.map(r => (
              <div key={r.id}>
                <Link to={`/shop/product/${r.target.id}`} className="shop-product-card" style={{ textDecoration: 'none' }}>
                  <div className="shop-product-link">
                    {r.target.images?.[0] ? (
                      <div className="shop-product-img-wrap"><img src={r.target.images[0]} alt={r.target.name} /></div>
                    ) : (
                      <div className="shop-product-img-wrap shop-product-no-img"><Package size={24} color="#cbd5e1" /></div>
                    )}
                    <div className="shop-product-info">
                      <span className="shop-product-name">{r.target.name}</span>
                      <span className="shop-price">{Number(r.target.price).toFixed(2).replace('.', ',')} €</span>
                    </div>
                  </div>
                </Link>
                {r.note && (
                  <p style={{ fontSize: 13, color: '#64748b', margin: '4px 2px 0', lineHeight: 1.4 }}>{r.note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
