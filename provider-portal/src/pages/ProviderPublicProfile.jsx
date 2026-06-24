import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Stars({ rating, size = 18 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
             fill={i <= Math.round(rating) ? '#f59e0b' : '#d1d5db'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  )
}

function Tag({ children, bg = '#f0fdf4', color = '#166534', border = '#bbf7d0' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '5px 12px', borderRadius: 20,
      background: bg, color, fontSize: 13, fontWeight: 500,
      border: `1px solid ${border}`,
    }}>
      {children}
    </span>
  )
}

function ActionBtn({ icon, label, href, bg = '#eff6ff', color = '#1d4ed8' }) {
  return (
    <a href={href} target={href?.startsWith('http') ? '_blank' : undefined}
       rel="noopener noreferrer"
       style={{
         display: 'flex', flexDirection: 'column', alignItems: 'center',
         gap: 6, padding: '14px 8px', borderRadius: 12,
         background: bg, color, textDecoration: 'none',
         fontSize: 13, fontWeight: 600, flex: 1,
         border: '1px solid rgba(0,0,0,0.06)',
         transition: 'opacity .15s',
       }}
       onMouseOver={e => e.currentTarget.style.opacity = '.8'}
       onMouseOut={e => e.currentTarget.style.opacity = '1'}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      {label}
    </a>
  )
}

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <h3 style={s.sectionTitle}>{title}</h3>
      {children}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProviderPublicProfile() {
  const { t } = useT()
  const { id } = useParams()
  const [provider, setProvider] = useState(null)
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('service_providers').select('*').eq('id', id).single(),
      supabase.from('reviews')
        .select('id, rating, comment, created_at')
        .eq('service_provider_id', id)
        .order('created_at', { ascending: false }),
    ]).then(([pRes, rRes]) => {
      if (pRes.error) { setError(t('pub.notFoundMsg')); setLoading(false); return }
      setProvider(pRes.data)
      setReviews(rRes.data || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div style={s.center}>
      <div style={s.spinner} />
      <p style={{ color: '#64748b', marginTop: 12 }}>{t('pub.loading')}</p>
    </div>
  )

  if (error || !provider) return (
    <div style={s.center}>
      <p style={{ fontSize: 48 }}>😕</p>
      <h2 style={{ marginTop: 8 }}>{t('pub.notFound')}</h2>
      <p style={{ color: '#64748b', marginTop: 4 }}>{error}</p>
    </div>
  )

  const cats     = [provider.category, provider.category2, provider.category3].filter(Boolean)
  const brands   = Array.isArray(provider.brands)   ? provider.brands   : []
  const services = Array.isArray(provider.services) ? provider.services : []
  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null
  const address  = [provider.street, provider.postal_code, provider.city, provider.country]
    .filter(Boolean).join(', ')
  const mapsUrl  = provider.latitude && provider.longitude
    ? `https://www.google.com/maps?q=${provider.latitude},${provider.longitude}`
    : address ? `https://www.google.com/maps/search/${encodeURIComponent(address)}` : null
  const website  = provider.website
    ? (provider.website.startsWith('http') ? provider.website : `https://${provider.website}`) : null

  return (
    <div style={s.page}>

      {/* ── Hero Banner ─────────────────────────────────────────── */}
      <div style={s.hero}>
        <Link to="/" style={s.backBtn}>‹ Zurück</Link>
        {/* Großes, zentriertes Logo */}
        <div style={s.avatarWrap}>
          {provider.logo_url
            ? <img src={provider.logo_url} alt={provider.name}
                   style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 20 }} />
            : <span style={{ fontSize: 44, color: '#94a3b8' }}>⚓</span>
          }
        </div>
      </div>

      {/* ── Identity ─────────────────────────────────────────────── */}
      <div style={s.identity}>
        <h1 style={s.name}>{provider.name}</h1>

        {cats.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {cats.map(c => (
              <span key={c} style={s.catPill}>
                <span style={{ marginRight: 4 }}>⚓</span>{c}
              </span>
            ))}
          </div>
        )}

        {avgRating && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <Stars rating={parseFloat(avgRating)} size={18} />
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{avgRating}</span>
            <span style={{ color: '#94a3b8', fontSize: 14 }}>
              ({reviews.length} Bewertung{reviews.length !== 1 ? 'en' : ''})
            </span>
          </div>
        )}

        {address && (
          <a href={mapsUrl || '#'} target="_blank" rel="noopener noreferrer" style={s.addressRow}>
            <span style={{ color: '#ef4444', fontSize: 16 }}>📍</span>
            <span style={{ color: '#475569', fontSize: 14 }}>{address}</span>
          </a>
        )}
      </div>

      {/* ── Action Buttons ───────────────────────────────────────── */}
      {(mapsUrl || website || provider.phone || provider.email) && (
        <div style={s.actionRow}>
          {mapsUrl    && <ActionBtn icon="↗" label="Route"    href={mapsUrl} bg="#eef2ff" color="#4338ca" />}
          {website    && <ActionBtn icon="🌐" label="Website"  href={website} bg="#f5f3ff" color="#7c3aed" />}
          {provider.phone && <ActionBtn icon="📞" label="Anrufen" href={`tel:${provider.phone}`} bg="#f0fdf4" color="#15803d" />}
          {provider.email && <ActionBtn icon="✉️" label="E-Mail"  href={`mailto:${provider.email}`} bg="#eff6ff" color="#1d4ed8" />}
        </div>
      )}

      {/* ── Content Card ─────────────────────────────────────────── */}
      <div style={s.card}>

        {/* Beschreibung */}
        {provider.description && (
          <div style={{ padding: '16px 0', borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ color: '#475569', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>
              {provider.description}
            </p>
          </div>
        )}

        {/* Kontakt-Details */}
        {(provider.opening_hours || provider.phone || provider.email || website) && (
          <Section title={t('pub.contact')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {provider.opening_hours && (
                <div style={s.infoRow}>
                  <span style={s.infoIcon}>🕐</span>
                  <div><div style={s.infoLabel}>{t('profile.hours')}</div>{provider.opening_hours}</div>
                </div>
              )}
              {provider.phone && (
                <div style={s.infoRow}>
                  <span style={s.infoIcon}>📞</span>
                  <div><div style={s.infoLabel}>{t('profile.phone')}</div>
                    <a href={`tel:${provider.phone}`} style={{ color: '#3b82f6' }}>{provider.phone}</a>
                  </div>
                </div>
              )}
              {provider.email && (
                <div style={s.infoRow}>
                  <span style={s.infoIcon}>✉️</span>
                  <div><div style={s.infoLabel}>{t('profile.email')}</div>
                    <a href={`mailto:${provider.email}`} style={{ color: '#3b82f6', wordBreak: 'break-all' }}>{provider.email}</a>
                  </div>
                </div>
              )}
              {website && (
                <div style={s.infoRow}>
                  <span style={s.infoIcon}>🌐</span>
                  <div><div style={s.infoLabel}>{t('profile.website')}</div>
                    <a href={website} target="_blank" rel="noopener noreferrer"
                       style={{ color: '#3b82f6', wordBreak: 'break-all' }}>{provider.website}</a>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Leistungen */}
        {services.length > 0 && (
          <Section title={t('pub.services')}>
            <div style={s.tagRow}>
              {services.map(s2 => <Tag key={s2}>{s2}</Tag>)}
            </div>
          </Section>
        )}

        {/* Marken */}
        {brands.length > 0 && (
          <Section title={t('pub.brands')}>
            <div style={s.tagRow}>
              {brands.map(b => <Tag key={b} bg="#fff7ed" color="#c2410c" border="#fed7aa">{b}</Tag>)}
            </div>
          </Section>
        )}

        {/* Bewertungen */}
        <Section title={`⭐ Bewertungen${avgRating ? `  ·  ∅ ${avgRating}` : ''}`}>
          {reviews.length === 0 ? (
            <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>{t('pub.noReviews')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reviews.map(r => (
                <div key={r.id} style={s.reviewCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Stars rating={r.rating} size={15} />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(r.created_at)}</span>
                  </div>
                  {r.comment && (
                    <p style={{ color: '#334155', fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                      „{r.comment}"
                    </p>
                  )}
                  <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>— Eigner</div>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>

      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '16px 0 32px' }}>
        Powered by <strong style={{ color: '#f97316' }}>Skipily</strong>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: {
    maxWidth: 640,
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#f8fafc',
    minHeight: '100vh',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: 24,
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #e2e8f0',
    borderTop: '3px solid #f97316', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  // ── Hero ──
  hero: {
    position: 'relative',
    height: 180,
    background: 'linear-gradient(160deg, #94a3b8 0%, #cbd5e1 60%, #e2e8f0 100%)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute', top: 16, left: 16,
    background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
    border: 'none', borderRadius: 20, padding: '6px 14px',
    fontSize: 14, fontWeight: 600, color: '#334155',
    textDecoration: 'none', cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
  avatarWrap: {
    width: 100, height: 100,
    background: '#fff',
    borderRadius: 22,
    border: '3px solid #fff',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: -48,  // halb rausragen lassen
    zIndex: 10,
  },
  // ── Identity ──
  identity: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '60px 20px 16px',  // oben Platz für heraussteckendes Avatar
    textAlign: 'center',
  },
  name: {
    fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8,
  },
  catPill: {
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 12px', borderRadius: 20,
    background: '#f0f9ff', color: '#0369a1',
    fontSize: 13, fontWeight: 600,
    border: '1px solid #bae6fd',
  },
  addressRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    textDecoration: 'none', padding: '6px 0',
  },
  // ── Action Buttons ──
  actionRow: {
    display: 'flex', gap: 10, padding: '0 16px 16px',
  },
  // ── Card ──
  card: {
    background: '#fff',
    borderRadius: 16,
    margin: '0 12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    border: '1px solid #f1f5f9',
    overflow: 'hidden',
  },
  section: {
    padding: '16px 20px',
    borderBottom: '1px solid #f8fafc',
  },
  sectionTitle: {
    fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 12,
  },
  tagRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  infoRow: {
    display: 'flex', gap: 12, alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 18, width: 24, flexShrink: 0, textAlign: 'center', marginTop: 2,
  },
  infoLabel: {
    fontSize: 11, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  reviewCard: {
    background: '#f8fafc', borderRadius: 10,
    padding: '12px 14px', borderLeft: '3px solid #f59e0b',
  },
}
