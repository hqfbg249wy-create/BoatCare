// FeatureLock
//
// Visuelle Sperre für Features die nur in höheren Tiers verfügbar sind.
// Zeigt einen Hinweis mit Upgrade-CTA, statt das eigentliche Feature.
//
// Beispiel:
//   <FeatureLock requiredTier="Enterprise" feature="Promotions">
//     Mit Promotions kannst du deine Produkte gezielt bewerben.
//   </FeatureLock>

import { Link } from 'react-router-dom'

export default function FeatureLock({
  requiredTier = 'Pro',
  feature      = 'Diese Funktion',
  icon         = '🔒',
  children,
}) {
  const isEnt = requiredTier === 'Enterprise'
  const accent = isEnt ? '#7e22ce' : '#15803d'
  const bg     = isEnt
    ? 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)'
    : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
  const border = isEnt ? '#e9d5ff' : '#bbf7d0'
  const emoji  = isEnt ? '💎' : '⭐'

  return (
    <div style={{
      padding: '32px 24px',
      borderRadius: 14,
      background: bg,
      border: `2px dashed ${border}`,
      textAlign: 'center',
      maxWidth: 540,
      margin: '12px auto',
    }}>
      <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        {feature} ist im {requiredTier}-Tarif enthalten
      </div>
      <div style={{ fontSize: 14, color: '#475569', marginBottom: 18, lineHeight: 1.55, maxWidth: 420, margin: '0 auto 18px' }}>
        {children}
      </div>
      <Link
        to="/profile"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: accent, color: '#fff',
          padding: '10px 18px', borderRadius: 8,
          fontSize: 14, fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {emoji} Jetzt auf {requiredTier} upgraden
      </Link>
    </div>
  )
}
