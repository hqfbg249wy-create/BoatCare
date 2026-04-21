import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Heart, MapPin, Phone, Mail, Globe, Star, Navigation, Trash2, Tag, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

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
}

function getCat(category) {
  if (!category) return { icon: '⚓', label: 'Service', color: '#3b82f6' }
  const key = category.toLowerCase().replace(/[/ ]/g, '_')
  return categoryConfig[key] || { icon: '⚓', label: category.replace(/_/g, ' '), color: '#3b82f6' }
}

export default function Favorites() {
  const { user } = useAuth()
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { if (user) loadFavorites() }, [user])

  async function loadFavorites() {
    setLoading(true)
    setError(null)

    try {
      // Step 1: Load favorite IDs
      const { data: favs, error: favError } = await supabase
        .from('user_favorites')
        .select('provider_id')
        .eq('user_id', user.id)

      if (favError) {
        console.error('Error loading user_favorites:', favError)
        setError('Favoriten konnten nicht geladen werden: ' + favError.message)
        setLoading(false)
        return
      }

      console.log('Favorites loaded:', favs?.length || 0, 'entries')

      const favIds = (favs || []).map(f => f.provider_id).filter(Boolean)

      if (favIds.length === 0) {
        setProviders([])
        setLoading(false)
        return
      }

      // Step 2: Load provider details
      const { data: provs, error: provError } = await supabase
        .from('service_providers')
        .select('*')
        .in('id', favIds)

      if (provError) {
        console.error('Error loading providers:', provError)
        setError('Provider-Daten konnten nicht geladen werden: ' + provError.message)
        setLoading(false)
        return
      }

      console.log('Providers loaded:', provs?.length || 0, 'of', favIds.length, 'favorites')
      setProviders(provs || [])
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Unerwarteter Fehler: ' + err.message)
    }
    setLoading(false)
  }

  async function removeFavorite(providerId) {
    const { error: delError } = await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_id', providerId)

    if (delError) {
      console.error('Error removing favorite:', delError)
      return
    }
    setProviders(prev => prev.filter(p => p.id !== providerId))
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Favoriten</h1>
          <p className="subtitle">Ihre gespeicherten Service-Partner</p>
        </div>
        <button className="btn-secondary" onClick={loadFavorites}>
          <RefreshCw size={16} /> Aktualisieren
        </button>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      {providers.length === 0 && !error ? (
        <div className="empty-state">
          <Heart size={64} color="#cbd5e1" />
          <h2>Keine Favoriten</h2>
          <p>Markieren Sie Service-Partner auf der <Link to="/map">Karte</Link> mit einem Herz, um sie hier zu sehen.</p>
          <Link to="/map" className="btn-primary" style={{ marginTop: 12 }}>
            <MapPin size={16} /> Zur Karte
          </Link>
        </div>
      ) : (
        <div className="provider-grid">
          {providers.map(p => {
            const cat = getCat(p.category)
            return (
              <div key={p.id} className="provider-card">
                <div className="prov-header">
                  {p.logo_url ? (
                    <img src={p.logo_url} alt={p.name} className="prov-logo" />
                  ) : (
                    <div className="prov-logo-placeholder" style={{ background: `${cat.color}15`, color: cat.color }}>
                      <span>{cat.icon}</span>
                    </div>
                  )}
                  <div className="prov-info">
                    <h3>{p.name}</h3>
                    <span className="prov-category-badge" style={{ background: `${cat.color}15`, color: cat.color }}>
                      {cat.icon} {cat.label}
                    </span>
                    {p.rating && p.rating > 0 && (
                      <div className="prov-rating">
                        <Star size={14} fill="#f59e0b" color="#f59e0b" />
                        <span>{Number(p.rating).toFixed(1)}</span>
                        {p.review_count > 0 && <span className="review-count">({p.review_count})</span>}
                      </div>
                    )}
                  </div>
                  <button className="btn-icon btn-danger" onClick={() => removeFavorite(p.id)} title="Favorit entfernen">
                    <Heart size={20} fill="#ef4444" color="#ef4444" />
                  </button>
                </div>

                {(p.street || p.city) && (
                  <div className="prov-address"><MapPin size={14} /> {p.street}{p.street && p.city ? ', ' : ''}{p.city}</div>
                )}

                <div className="prov-actions">
                  {p.phone && <a href={`tel:${p.phone}`} className="prov-action prov-action-phone"><Phone size={15} /> Anrufen</a>}
                  {p.email && <a href={`mailto:${p.email}`} className="prov-action prov-action-email"><Mail size={15} /> E-Mail</a>}
                  {p.website && (
                    <a href={p.website.startsWith('http') ? p.website : `https://${p.website}`} target="_blank" rel="noopener" className="prov-action prov-action-web">
                      <Globe size={15} /> Website
                    </a>
                  )}
                  {p.latitude && p.longitude && p.latitude !== 0 && (
                    <a href={`https://maps.apple.com/?daddr=${p.latitude},${p.longitude}`} target="_blank" rel="noopener" className="prov-action prov-action-route">
                      <Navigation size={15} /> Route
                    </a>
                  )}
                </div>

                {p.current_promotion && (
                  <div className="prov-promo"><Tag size={12} /> {p.current_promotion}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
