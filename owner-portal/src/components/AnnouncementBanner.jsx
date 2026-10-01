import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAnnouncements } from '../hooks/useAnnouncements'
import { accentColor, localizedAnnouncement } from '../lib/announcements'
import { enableWebPush, webPushPermission } from '../lib/webpush'
import { useT } from '../i18n'

// Globales In-App-Banner (iOS-typisch) für die neueste ungelesene Ankündigung.
export default function AnnouncementBanner() {
  const { items, markRead, dismiss } = useAnnouncements()
  const navigate = useNavigate()
  const { t, lang } = useT()
  const [hidden, setHidden] = useState(false)

  // Web-Push still auffrischen (und Locale aktualisieren), wenn bereits erlaubt.
  useEffect(() => { if (webPushPermission() === 'granted') enableWebPush(lang) }, [lang])

  const current = useMemo(
    () => items.find(a => !a.dismissed_at && !a.read_at) || null,
    [items]
  )
  if (!current || hidden) return null

  const accent = accentColor(current.accent)
  const loc = localizedAnnouncement(current, lang)

  const open = async () => {
    await markRead(current.id)
    setHidden(true)
    if (current.action_url) {
      if (/^https?:\/\//i.test(current.action_url)) window.open(current.action_url, '_blank', 'noopener')
      else navigate(current.action_url)
    } else {
      navigate('/messages')
    }
  }
  const close = async (e) => { e.stopPropagation(); await dismiss(current.id); setHidden(true) }

  return (
    <div
      onClick={open}
      role="button"
      style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 4000, width: 'min(560px, calc(100vw - 24px))',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--card-bg, #fff)', color: 'inherit',
        borderRadius: 14, padding: '10px 10px 10px 0',
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)', cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: 5, alignSelf: 'stretch', background: accent, borderRadius: 3, marginLeft: 0 }} />
      <img src="/icon-192.png" alt="Skipily" width={34} height={34}
        style={{ flex: 'none', marginLeft: 4, borderRadius: 8 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {loc.title}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {loc.body}
        </div>
      </div>
      <button onClick={close} aria-label={t('announcement.dismiss')}
        style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: 8, flex: 'none' }}>
        <X size={16} />
      </button>
    </div>
  )
}
