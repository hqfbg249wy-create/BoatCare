// Skipily Plus – Paywall (Google Play Billing / Apple StoreKit via RevenueCat).
//
// Nativ (Android/iOS): lädt die Angebote aus RevenueCat und wickelt den Kauf
// über den jeweiligen Store ab. Im Web wird nicht verkauft — dort erscheint ein
// Hinweis, Plus in der App zu buchen (Store-Richtlinien).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Check, X } from 'lucide-react'
import { usePlus } from '../hooks/usePlus'
import {
  getPlusPackages, purchasePlus, restorePurchases, isUserCancelled, isNative,
} from '../lib/purchases'

const BENEFITS = [
  'Unbegrenzte KI-Chats',
  'Schadens-Foto-Analyse',
  'Ausrüstungs-Empfehlungen',
]

export default function Paywall() {
  const navigate = useNavigate()
  const { isPlus, refresh } = usePlus()
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const pkgs = await getPlusPackages()
      if (!cancelled) { setPackages(pkgs); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function buy(pkg) {
    setBusy(pkg.identifier)
    setError(null)
    try {
      const ok = await purchasePlus(pkg)
      await refresh()
      if (ok) navigate(-1)
    } catch (e) {
      if (!isUserCancelled(e)) setError('Kauf fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setBusy(null)
    }
  }

  async function restore() {
    setBusy('restore')
    setError(null)
    try {
      const ok = await restorePurchases()
      await refresh()
      if (ok) navigate(-1)
      else setError('Kein aktives Abo gefunden.')
    } catch {
      setError('Wiederherstellen fehlgeschlagen.')
    } finally {
      setBusy(null)
    }
  }

  const priceOf = (pkg) => pkg?.product?.priceString ?? ''
  const periodLabel = (pkg) => {
    const id = (pkg?.product?.identifier || pkg?.identifier || '').toLowerCase()
    if (id.includes('year') || id.includes('annual') || pkg?.packageType === 'ANNUAL') return '/ Jahr'
    if (id.includes('month') || pkg?.packageType === 'MONTHLY') return '/ Monat'
    return ''
  }

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <button style={S.close} onClick={() => navigate(-1)} aria-label="Schließen"><X size={22} /></button>
      </div>

      <div style={S.hero}>
        <Sparkles size={48} color="#a855f7" />
        <h1 style={S.title}>Mehr aus deinem Boot herausholen</h1>
        <p style={S.subtitle}>Alle Kernfunktionen bleiben gratis. Plus erweitert die App.</p>
      </div>

      <div style={S.card}>
        <div style={S.cardHead}>
          <Sparkles size={20} color="#a855f7" />
          <span style={S.cardTitle}>Skipily Plus</span>
          {isPlus && <span style={S.activeBadge}>Aktiv</span>}
        </div>
        <ul style={S.benefits}>
          {BENEFITS.map((b) => (
            <li key={b} style={S.benefit}><Check size={18} color="#16a34a" /> {b}</li>
          ))}
        </ul>

        {!isNative() ? (
          <p style={S.webNote}>
            Skipily Plus buchst du direkt in der Skipily-App (App Store / Google Play).
          </p>
        ) : loading ? (
          <p style={S.muted}>Angebote werden geladen…</p>
        ) : packages.length === 0 ? (
          <p style={S.muted}>
            Momentan keine Angebote verfügbar. Bitte später erneut versuchen.
          </p>
        ) : (
          <div style={S.plans}>
            {packages.map((pkg) => (
              <button
                key={pkg.identifier}
                style={S.buyBtn}
                disabled={!!busy || isPlus}
                onClick={() => buy(pkg)}
              >
                {busy === pkg.identifier
                  ? 'Wird verarbeitet…'
                  : `${priceOf(pkg)} ${periodLabel(pkg)} – Abonnieren`}
              </button>
            ))}
          </div>
        )}

        {error && <p style={S.error}>{error}</p>}
      </div>

      {isNative() && (
        <button style={S.restore} onClick={restore} disabled={!!busy}>
          Käufe wiederherstellen
        </button>
      )}

      <div style={S.legal}>
        <p>
          Die Zahlung wird bei Kaufbestätigung deinem Store-Konto belastet. Das Abo
          verlängert sich automatisch, sofern es nicht mindestens 24 Stunden vor
          Ablauf gekündigt wird. Verwaltung/Kündigung in den Einstellungen deines
          Store-Kontos.
        </p>
        <p>
          <a href="https://skipily.app/agb" target="_blank" rel="noreferrer">Nutzungsbedingungen</a>
          {' · '}
          <a href="https://skipily.app/datenschutz" target="_blank" rel="noreferrer">Datenschutz</a>
        </p>
      </div>
    </div>
  )
}

const S = {
  wrap: { maxWidth: 560, margin: '0 auto', padding: '16px 16px 48px' },
  header: { display: 'flex', justifyContent: 'flex-end' },
  close: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: 8 },
  hero: { textAlign: 'center', padding: '8px 8px 24px' },
  title: { fontSize: 24, fontWeight: 700, margin: '12px 0 6px' },
  subtitle: { color: '#6b7280', margin: 0 },
  card: { border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, background: 'var(--card-bg, #fff)' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontWeight: 700, fontSize: 18 },
  activeBadge: { marginLeft: 'auto', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999 },
  benefits: { listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 8 },
  benefit: { display: 'flex', alignItems: 'center', gap: 8 },
  plans: { display: 'grid', gap: 10 },
  buyBtn: { padding: '14px 16px', borderRadius: 12, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' },
  restore: { display: 'block', margin: '16px auto 0', background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  webNote: { color: '#6b7280', margin: 0 },
  muted: { color: '#6b7280' },
  error: { color: '#dc2626', marginTop: 12 },
  legal: { marginTop: 24, fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 },
}
