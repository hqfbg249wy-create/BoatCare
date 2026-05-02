import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Stars({ rating, size = 18 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= Math.round(rating) ? '#f59e0b' : '#e2e8f0'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  )
}

function Tag({ children, color = '#f1f5f9', text = '#475569' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      background: color, color: text, fontSize: 13, fontWeight: 500,
    }}>
      {children}
    </span>
  )
}

function InfoRow({ icon, label, value, href }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 18, width: 24, flexShrink: 0, textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>{value}</a>
          : <div style={{ color: '#1e293b', wordBreak: 'break-word' }}>{value}</div>
        }
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProviderPublicProfile() {
  const { id } = useParams()
  const [provider, setProvider] = useState(null)
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase
        .from('service_providers')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('reviews')
        .select('id, rating, comment, created_at, user_id')
        .eq('service_provider_id', id)
        .order('created_at', { ascending: false }),
    ]).then(([provRes, revRes]) => {
      if (provRes.error) { setError('Provider nicht gefunden.'); setLoading(false); return }
      setProvider(provRes.data)
      setReviews(revRes.data || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <p style={{ color: '#64748b', marginTop: 12 }}>Lade Profil…</p>
    </div>
  )

  if (error || !provider) return (
    <div style={styles.center}>
      <p style={{ fontSize: 48 }}>😕</p>
      <h2 style={{ marginTop: 8 }}>Provider nicht gefunden</h2>
      <p style={{ color: '#64748b', marginTop: 4 }}>{error}</p>
    </div>
  )

  const cats = [provider.category, provider.category2, provider.category3].filter(Boolean)
  const brands   = Array.isArray(provider.brands)   ? provider.brands   : []
  const services = Array.isArray(provider.services) ? provider.services : []
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null
  const address = [provider.street, provider.postal_code, provider.city, provider.country]
    .filter(Boolean).join(', ')
  const mapsUrl = provider.latitude && provider.longitude
    ? `https://www.google.com/maps?q=${provider.latitude},${provider.longitude}`
    : address ? `https://www.google.com/maps/search/${encodeURIComponent(address)}` : null

  return (
    <div style={styles.page}>
      {/* Back link */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/" style={{ color: '#64748b', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Zurück
        </Link>
      </div>

      {/* Header Card */}
      <div style={styles.card}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={styles.avatar}>
            {provider.name?.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{provider.name}</h1>
              {provider.is_verified && (
                <span title="Verifiziert" style={{ color: '#3b82f6', fontSize: 18 }}>✓</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {cats.map(c => <Tag key={c}>{c}</Tag>)}
            </div>

            {avgRating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Stars rating={parseFloat(avgRating)} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{avgRating}</span>
                <span style={{ color: '#94a3b8', fontSize: 14 }}>({reviews.length} Bewertung{reviews.length !== 1 ? 'en' : ''})</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {provider.phone && (
                <a href={`tel:${provider.phone}`} style={styles.actionBtn}>📞 Anrufen</a>
              )}
              {provider.email && (
                <a href={`mailto:${provider.email}`} style={styles.actionBtn}>✉️ E-Mail</a>
              )}
              {provider.website && (
                <a href={provider.website.startsWith('http') ? provider.website : `https://${provider.website}`}
                   target="_blank" rel="noopener noreferrer" style={styles.actionBtn}>🌐 Website</a>
              )}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.actionBtn, background: '#dcfce7', color: '#166534' }}>
                  📍 Route
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.grid}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Beschreibung */}
          {provider.description && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Über uns</h2>
              <p style={{ color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{provider.description}</p>
            </div>
          )}

          {/* Kontakt & Standort */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Kontakt & Standort</h2>
            <InfoRow icon="📍" label="Adresse" value={address} href={mapsUrl} />
            <InfoRow icon="📞" label="Telefon" value={provider.phone} href={`tel:${provider.phone}`} />
            <InfoRow icon="✉️" label="E-Mail" value={provider.email} href={`mailto:${provider.email}`} />
            <InfoRow icon="🌐" label="Website" value={provider.website}
              href={provider.website?.startsWith('http') ? provider.website : `https://${provider.website}`} />
            {provider.opening_hours && (
              <InfoRow icon="🕐" label="Öffnungszeiten" value={provider.opening_hours} />
            )}
          </div>

          {/* Mini-Karte via OpenStreetMap Embed */}
          {provider.latitude && provider.longitude && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Karte</h2>
              <div style={{ borderRadius: 10, overflow: 'hidden', height: 260 }}>
                <iframe
                  title="Standort"
                  width="100%"
                  height="100%"
                  style={{ border: 0, display: 'block' }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${provider.longitude - 0.01},${provider.latitude - 0.01},${provider.longitude + 0.01},${provider.latitude + 0.01}&layer=mapnik&marker=${provider.latitude},${provider.longitude}`}
                />
              </div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', textAlign: 'center', marginTop: 8, fontSize: 13, color: '#3b82f6' }}
              >
                In Google Maps öffnen →
              </a>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Marken */}
          {brands.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>🔧 Marken</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {brands.map(b => <Tag key={b} color="#eff6ff" text="#1d4ed8">{b}</Tag>)}
              </div>
            </div>
          )}

          {/* Services */}
          {services.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>⚙️ Leistungen</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {services.map(s => <Tag key={s} color="#f0fdf4" text="#166534">{s}</Tag>)}
              </div>
            </div>
          )}

          {/* Bewertungen */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>
              ⭐ Bewertungen
              {reviews.length > 0 && (
                <span style={{ fontSize: 14, fontWeight: 400, color: '#64748b', marginLeft: 8 }}>
                  ∅ {avgRating} · {reviews.length} Einträge
                </span>
              )}
            </h2>

            {reviews.length === 0 ? (
              <p style={{ color: '#94a3b8', fontStyle: 'italic', marginTop: 8 }}>Noch keine Bewertungen vorhanden.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                {reviews.map(r => (
                  <div key={r.id} style={styles.reviewCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Stars rating={r.rating} size={16} />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(r.created_at)}</span>
                    </div>
                    {r.comment && (
                      <p style={{ color: '#334155', lineHeight: 1.6, fontSize: 14, margin: 0, whiteSpace: 'pre-line' }}>
                        „{r.comment}"
                      </p>
                    )}
                    <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                      — Eigner
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Meta-Infos */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>ℹ️ Details</h2>
            {provider.created_at && (
              <InfoRow icon="📅" label="Eingetragen am" value={formatDate(provider.created_at)} />
            )}
            {provider.review_count != null && (
              <InfoRow icon="💬" label="Bewertungen" value={`${provider.review_count}`} />
            )}
            {provider.rating != null && provider.rating > 0 && (
              <InfoRow icon="⭐" label="Ø Bewertung" value={`${Number(provider.rating).toFixed(1)} / 5`} />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 32, paddingBottom: 24 }}>
        Powered by <strong style={{ color: '#f97316' }}>Skipily</strong>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', textAlign: 'center', padding: 24,
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #e2e8f0',
    borderTop: '3px solid #f97316', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    border: '1px solid #f1f5f9',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: '1px solid #f1f5f9',
  },
  avatar: {
    width: 64, height: 64, borderRadius: 14,
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#fff', fontSize: 28, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  actionBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '7px 14px', borderRadius: 8,
    background: '#eff6ff', color: '#1d4ed8',
    fontSize: 14, fontWeight: 500, textDecoration: 'none',
    border: '1px solid #bfdbfe',
  },
  reviewCard: {
    background: '#f8fafc',
    borderRadius: 10,
    padding: '12px 16px',
    borderLeft: '3px solid #f59e0b',
  },
}
