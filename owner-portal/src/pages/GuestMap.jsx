import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { Download, LogIn, MapPin, Navigation } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCurrentLocation } from '../lib/geo'
import { useT } from '../i18n'
import 'leaflet/dist/leaflet.css'

// Einfache Kategorie-Emojis (leichtgewichtig, ohne MapView-Interna).
const CAT_EMOJI = {
  werkstatt: '🔧', repair: '🔧', reparatur: '🔧', motor_service: '⚙️', motorservice: '⚙️',
  segelmacher: '⛵', sailmaker: '⛵', versorgung: '🛒', supplies: '🛒', shop: '🛒',
  tankstelle: '⛽', fuel: '⛽', rigg: '🔗', rigging: '🔗', elektronik: '📡', electronics: '📡',
}
function emojiFor(cat) {
  return CAT_EMOJI[(cat || '').toLowerCase()] || '📍'
}
function pinIcon(cat) {
  return L.divIcon({
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0b1929;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">
      <span style="transform:rotate(45deg);font-size:14px">${emojiFor(cat)}</span></div>`,
    className: 'guest-pin', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  })
}

function Recenter({ center }) {
  const map = useMap()
  useEffect(() => { if (center) map.setView(center, 11) }, [center, map])
  return null
}

export default function GuestMap() {
  const t = useT()
  const [providers, setProviders] = useState([])
  const [center, setCenter] = useState(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  // Provider anonym laden (RLS erlaubt anon-Lesen).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('service_providers')
        .select('id, name, category, city, street, latitude, longitude, rating')
        .not('latitude', 'is', null)
        .limit(2000)
      setProviders((data || []).filter(p => p.latitude && p.longitude && p.latitude !== 0))
    })()
  }, [])

  // Standort für die Zentrierung (best effort).
  useEffect(() => {
    getCurrentLocation()
      .then(loc => { if (loc?.latitude) setCenter([loc.latitude, loc.longitude]) })
      .catch(() => {})
  }, [])

  // PWA-Installations-Angebot einfangen (Android/Chrome).
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  const initialCenter = center || [50.5, 7.0] // Fallback: Mitteleuropa

  const markers = useMemo(() => providers.map(p => (
    <Marker key={p.id} position={[p.latitude, p.longitude]} icon={pinIcon(p.category)}>
      <Popup>
        <strong>{p.name}</strong>
        {p.city && <div style={{ color: '#64748b', fontSize: 13 }}>{[p.street, p.city].filter(Boolean).join(', ')}</div>}
        <a href={`https://maps.apple.com/?daddr=${p.latitude},${p.longitude}`} target="_blank" rel="noopener"
           style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, color: '#2563eb', fontSize: 13 }}>
          <Navigation size={13} /> {t('guest.route')}
        </a>
      </Popup>
    </Marker>
  )), [providers, t])

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Kopf */}
      <div style={{ background: '#0b1929', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={18} />
          <div>
            <div style={{ fontWeight: 700, lineHeight: 1.1 }}>Skipily</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{t('guest.subtitle')}</div>
          </div>
        </div>
      </div>

      {/* Karte */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MapContainer center={initialCenter} zoom={center ? 11 : 6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Recenter center={center} />
          {markers}
        </MapContainer>
      </div>

      {/* CTA-Leiste */}
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e2e8f0', background: '#fff' }}>
        {deferredPrompt && (
          <button onClick={install} className="btn-primary" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Download size={16} /> {t('guest.install')}
          </button>
        )}
        <Link to="/" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, background: '#f97316', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
          <LogIn size={16} /> {t('guest.openApp')}
        </Link>
      </div>
    </div>
  )
}
