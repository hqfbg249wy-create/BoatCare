// Öffentliche Landingpage eines geteilten News-Beitrags (ohne Login).
// Liest über die SECURITY-DEFINER-RPC news_post_public (nur veröffentlichte
// Beiträge) und führt zum App-Download bzw. in die Web-App.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const APP_STORE_URL = 'https://apps.apple.com/app/id6757314378'
const WEB_APP_URL = 'https://app.skipily.app'
const SITE_URL = 'https://skipily.app'

export default function PublicPost() {
  const { id } = useParams()
  const [post, setPost] = useState(undefined) // undefined = lädt, null = nicht gefunden
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.rpc('news_post_public', { p_id: id })
      if (!cancelled) setPost(data || null)
    })()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (post?.title) document.title = `${post.title} · Skipily`
  }, [post])

  const media = Array.isArray(post?.media) ? post.media : []
  const video = media.find(m => m.media_type === 'video')
  const images = media.filter(m => m.media_type !== 'video')

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#0f172a', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      {/* Kopf */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <a href={SITE_URL} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#0f172a' }}>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>⚓ Skipily</span>
        </a>
        <a href={isIOS ? APP_STORE_URL : WEB_APP_URL} target="_blank" rel="noopener noreferrer"
          style={{ background: '#2563eb', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '8px 14px', borderRadius: 10 }}>
          App holen
        </a>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '16px' }}>
        {post === undefined ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Lädt…</div>
        ) : post === null ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Beitrag nicht verfügbar</h1>
            <p style={{ color: '#64748b', margin: '0 0 16px' }}>Dieser Beitrag ist nicht (mehr) öffentlich verfügbar.</p>
            <a href={WEB_APP_URL} style={{ color: '#2563eb', fontWeight: 700 }}>Skipily öffnen</a>
          </div>
        ) : (
          <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
            {/* Autor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
              {post.author_avatar_url
                ? <img src={post.author_avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(post.author_name || '?')[0]?.toUpperCase()}</div>}
              <div style={{ fontWeight: 700 }}>{post.author_name || 'Skipily'}</div>
              {post.kind === 'product' && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '3px 10px', borderRadius: 999 }}>Produktvorstellung</span>}
            </div>

            {/* Medien */}
            {video && (
              <video src={video.url} controls playsInline preload="metadata"
                style={{ width: 'calc(100% - 32px)', margin: '12px 16px 0', borderRadius: 12, background: '#000', maxHeight: 460 }} />
            )}
            {images.length > 0 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px 0' }}>
                {images.map((m, i) => (
                  <img key={i} src={m.url} alt="" style={{ height: 220, maxWidth: '100%', objectFit: 'cover', borderRadius: 12, flex: '0 0 auto' }} />
                ))}
              </div>
            )}

            {/* Text */}
            <div style={{ padding: 16 }}>
              <h1 style={{ fontSize: 24, margin: '0 0 4px', lineHeight: 1.2 }}>{post.title}</h1>
              {post.subtitle && <p style={{ color: '#475569', fontWeight: 600, margin: '0 0 8px' }}>{post.subtitle}</p>}
              {(post.boat_ref || post.equipment_ref) && (
                <p style={{ fontSize: 13, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 10px' }}>
                  {post.boat_ref && <span>⛵ {post.boat_ref}</span>}
                  {post.equipment_ref && <span>📦 {post.equipment_ref}</span>}
                </p>
              )}
              {post.body && <p style={{ whiteSpace: 'pre-wrap', color: '#334155', fontSize: 16, lineHeight: 1.55, margin: 0 }}>{post.body}</p>}
            </div>
          </article>
        )}

        {/* Download-Aufruf */}
        <section style={{ background: '#0f172a', color: '#fff', borderRadius: 16, padding: 20, marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Skipily: Tipps & Tricks für Bootseigner</div>
          <p style={{ color: '#cbd5e1', margin: '0 0 14px', fontSize: 14 }}>Lösungen aus der Community, Ausrüstungsverwaltung, Wartung, Shop und mehr. Hol dir die App.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"
              style={{ background: '#fff', color: '#0f172a', textDecoration: 'none', fontWeight: 700, padding: '10px 16px', borderRadius: 12 }}>
               App Store
            </a>
            <a href={WEB_APP_URL} target="_blank" rel="noopener noreferrer"
              style={{ background: '#2563eb', color: '#fff', textDecoration: 'none', fontWeight: 700, padding: '10px 16px', borderRadius: 12 }}>
              Web-App öffnen
            </a>
          </div>
          <p style={{ color: '#64748b', fontSize: 12, margin: '12px 0 0' }}>Android: nutze die Web-App unter app.skipily.app</p>
        </section>
      </main>
    </div>
  )
}
