import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Newspaper, Plus, X, Save, ShoppingCart, Flag, Ship, Package, CheckCircle, Check, Clock, Ban, Megaphone, Sparkles, Pencil, Trash2, Search, MoreVertical, MessageCircle, Share2, Mail, Link as LinkIcon } from 'lucide-react'
import { useT } from '../i18n'
import { FeatureFlags } from '../lib/featureFlags'
import { compressVideo } from '../lib/videoCompress'
import Lightbox from '../components/Lightbox'

const VIDEO_MAX_BYTES = 200 * 1024 * 1024 // 200 MB nach Komprimierung

const empty = { title: '', subtitle: '', boat_ref: '', equipment_ref: '', body: '', product_ids: [] }
const REACTION_EMOJIS = ['👍', '❤️', '⚓', '🔧', '👏']

// Einheitlicher Stil für Einträge im ⋯-Überlaufmenü (Bearbeiten/Löschen/Melden).
const menuItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 14, color: '#334155', textAlign: 'left',
}
const OWNER_SHOP_BASE = 'https://app.skipily.app'

const NEWS_DRAFT_KEY = 'skipily_provider_news_draft'

// Bild vor dem Upload normalisieren (JPEG, max. 2000px) + HEIC/HEIF (iPhone)
// in allen Browsern dekodieren. Vermeidet nicht unterstützte Formate und
// verkleinert die Uploads. Wirft bei nicht dekodierbaren Dateien.
function isHeic(file) {
  const ty = (file.type || '').toLowerCase()
  const nm = (file.name || '').toLowerCase()
  return ty === 'image/heic' || ty === 'image/heif' || nm.endsWith('.heic') || nm.endsWith('.heif')
}
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
    img.src = url
  })
}
async function processNewsImage(file) {
  let src = file
  if (isHeic(file)) {
    const heic2any = (await import('heic2any')).default
    let out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    if (Array.isArray(out)) out = out[0]
    src = out
  }
  const img = await loadImageFromFile(src)
  const MAX = 2000
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('decode')
  if (w > MAX || h > MAX) { const s = Math.min(MAX / w, MAX / h); w = Math.round(w * s); h = Math.round(h * s) }
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) throw new Error('encode')
  return blob
}
function friendlyNewsError(err, t) {
  const m = (err && err.message ? err.message : '').toString()
  if (/mime|not supported|invalid.*type|unsupported/i.test(m)) return t('news.photoFormatGeneric')
  if (/exceed|too large|413|payload|size/i.test(m)) return t('news.photoTooLarge')
  return m || t('news.resError')
}

// Vollbild-Foto mit Pinch-to-Zoom (Touch), Mausrad-Zoom und Doppeltipp.
// YouTube-Video-ID aus einer URL extrahieren.
function ytVideoId(url) {
  if (!url) return ''
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || String(url).match(/^([A-Za-z0-9_-]{11})$/)
  return m ? m[1] : ''
}

function NewsBody({ text, t }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  const longish = text.length > 160 || (text.match(/\n/g) || []).length >= 4
  const clamp = expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
  return (
    <div style={{ margin: '0 0 10px' }}>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#334155', ...clamp }}>{text}</p>
      {longish && (
        <button type="button" onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600, marginTop: 2 }}>
          {expanded ? t('news.less') : t('news.more')}
        </button>
      )}
    </div>
  )
}

function NewsVideo({ src, postId, lang, onQuota, fill }) {
  const [trackUrl, setTrackUrl] = useState(null)
  useEffect(() => {
    let created = null
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.functions.invoke('news-subtitles', { body: { post_id: postId, target_lang: lang || 'de' } })
        if (cancelled) return
        if (data?.vtt) {
          created = URL.createObjectURL(new Blob([data.vtt], { type: 'text/vtt' }))
          setTrackUrl(created)
        } else if (data?.quota_exhausted && onQuota) {
          onQuota(data.upgrade_hint)
        }
      } catch { /* ohne Untertitel */ }
    })()
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created) }
  }, [postId, lang])
  return (
    <video src={src.includes('#') ? src : src + '#t=0.1'} controls playsInline muted preload="metadata"
      style={fill
        ? { width: '100%', height: '100%', display: 'block', background: '#000', objectFit: 'contain' }
        : { width: 'calc(100% - 28px)', maxHeight: 440, display: 'block', margin: '12px 14px 0', borderRadius: 10, background: '#000', objectFit: 'contain' }}>
      {trackUrl && <track kind="subtitles" src={trackUrl} srcLang={lang || 'de'} label={(lang || 'de').toUpperCase()} default />}
    </video>
  )
}

function NewsAuthor({ name, avatar }) {
  const label = (name || '').trim()
  const initial = label ? label[0].toUpperCase() : '?'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 0' }}>
      {avatar
        ? <img src={avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />
        : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{initial}</div>}
      <span style={{ fontWeight: 600, fontSize: 14, color: '#334155' }}>{label || '—'}</span>
    </div>
  )
}

// Kommentare zu einem Beitrag: per Klick geöffnet, Liste + Eingabe.
function NewsComments({ postId, user, t, onCountChange }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('news_comments')
        .select('id, author_id, author_name, author_avatar_url, body, created_at')
        .eq('post_id', postId).order('created_at', { ascending: true })
      if (!cancelled) { setList(data || []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [postId])
  async function send() {
    const text = draft.trim(); if (!text || !user) return
    setSending(true)
    const { data: prof } = await supabase.from('profiles').select('full_name, email, avatar_url').eq('id', user.id).maybeSingle()
    const name = prof?.full_name || (prof?.email ? prof.email.split('@')[0] : '')
    const { data, error } = await supabase.from('news_comments')
      .insert({ post_id: postId, body: text, author_name: name, author_avatar_url: prof?.avatar_url || '' })
      .select('id, author_id, author_name, author_avatar_url, body, created_at')
    if (!error && data?.[0]) { setList(l => [...l, data[0]]); setDraft(''); onCountChange && onCountChange(1) }
    setSending(false)
  }
  async function del(id) {
    await supabase.from('news_comments').delete().eq('id', id)
    setList(l => l.filter(c => c.id !== id))
    onCountChange && onCountChange(-1)
  }
  return (
    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {loading ? (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>{t('news.noComments')}</div>
      ) : list.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {c.author_avatar_url
            ? <img src={c.author_avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { e.currentTarget.style.display = 'none' }} />
            : <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{(c.author_name || '?')[0]?.toUpperCase()}</div>}
          <div style={{ flex: 1, minWidth: 0, background: '#f8fafc', borderRadius: 10, padding: '6px 10px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{c.author_name || '—'}</div>
            <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>{c.body}</div>
          </div>
          {user && c.author_id === user.id && (
            <button className="btn-icon" title={t('news.delete')} onClick={() => del(c.id)} style={{ color: '#94a3b8' }}><Trash2 size={14} /></button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={t('news.commentPh')}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 999, border: '1px solid #e2e8f0', fontSize: 13 }} />
        <button className="btn-primary" onClick={send} disabled={sending || !draft.trim()} style={{ padding: '6px 14px' }}>{t('news.commentSend')}</button>
      </div>
    </div>
  )
}

export default function News() {
  const { t, lang } = useT()
  const { user, provider } = useAuth()
  const [feed, setFeed] = useState([])
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [showCompose, setShowCompose] = useState(false)
  const [form, setForm] = useState(empty)
  const [files, setFiles] = useState([])
  const [videos, setVideos] = useState([])
  const [youtubeUrl, setYoutubeUrl] = useState('')   // optionaler YouTube-Link
  const [editId, setEditId] = useState(null)
  const [existingImages, setExistingImages] = useState([])
  const [existingVideos, setExistingVideos] = useState([])
  const [saving, setSaving] = useState(false)
  const [videoWorking, setVideoWorking] = useState(null)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [reactions, setReactions] = useState({})
  const [myReactions, setMyReactions] = useState(() => new Set())
  const [translations, setTranslations] = useState({})
  const [showOriginal, setShowOriginal] = useState(() => new Set())
  const [aiHint, setAiHint] = useState(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [menuOpen, setMenuOpen] = useState(null) // postId des geöffneten ⋯-Menüs
  const [lightboxUrl, setLightboxUrl] = useState(null) // Foto im Vollbild (Pinch-Zoom)
  const [openComments, setOpenComments] = useState(() => new Set())
  const [commentCounts, setCommentCounts] = useState({})
  const [shareData, setShareData] = useState(null)
  const [shareCopied, setShareCopied] = useState(false)

  async function translateFeed(posts) {
    // Immer in die UI-Sprache uebersetzen (auch de): zielsprachige Beitraege
    // gibt translate-news unveraendert zurueck.
    if (!lang || !posts || posts.length === 0) { setTranslations({}); return }
    try {
      const payload = posts.map(p => ({ id: p.id, title: p.title, subtitle: p.subtitle, body: p.body }))
      const { data } = await supabase.functions.invoke('translate-news', { body: { posts: payload, target_lang: lang } })
      if (data?.translations) setTranslations(data.translations)
      if (data?.quota_exhausted) setAiHint(data.upgrade_hint || t('news.aiBudgetHint'))
    } catch (e) { console.warn('translate-news:', e) }
  }

  async function loadReactions(ids) {
    if (!ids || ids.length === 0) { setReactions({}); setMyReactions(new Set()); return }
    const { data } = await supabase.from('news_post_reactions').select('post_id, emoji, user_id').in('post_id', ids)
    const counts = {}; const mine = new Set()
    for (const r of (data || [])) {
      counts[r.post_id] = counts[r.post_id] || {}
      counts[r.post_id][r.emoji] = (counts[r.post_id][r.emoji] || 0) + 1
      if (user && r.user_id === user.id) mine.add(`${r.post_id}:${r.emoji}`)
    }
    setReactions(counts); setMyReactions(mine)
  }

  async function toggleReaction(postId, emoji) {
    const key = `${postId}:${emoji}`
    const had = myReactions.has(key)
    setMyReactions(prev => { const n = new Set(prev); had ? n.delete(key) : n.add(key); return n })
    setReactions(prev => {
      const c = { ...(prev[postId] || {}) }
      c[emoji] = Math.max(0, (c[emoji] || 0) + (had ? -1 : 1))
      if (c[emoji] === 0) delete c[emoji]
      return { ...prev, [postId]: c }
    })
    try {
      if (had) await supabase.from('news_post_reactions').delete().eq('post_id', postId).eq('emoji', emoji).eq('user_id', user.id)
      else await supabase.from('news_post_reactions').insert({ post_id: postId, emoji })
    } catch (e) { console.error('reaction:', e) }
  }

  // Ad-Buchung (Phase 3)
  const todayStr = new Date().toISOString().slice(0, 10)
  const in7 = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10)
  const emptyAd = { start_date: todayStr, end_date: in7, daily_budget_cents: 1000, preferred_hour: '' }
  const [adPost, setAdPost] = useState(null)
  const [adForm, setAdForm] = useState(emptyAd)
  const [adBusy, setAdBusy] = useState(false)
  const [adEstimate, setAdEstimate] = useState(null)
  const [adBanner, setAdBanner] = useState(() => {
    try { const p = new URLSearchParams(window.location.search).get('ad'); return p === 'ok' ? 'ok' : p === 'cancel' ? 'cancel' : null } catch { return null }
  })

  useEffect(() => { loadFeed() }, [])
  // Entwurf (nur Text) laufend sichern, solange eine NEUE Meldung verfasst wird.
  useEffect(() => {
    if (!showCompose || editId) return
    try { localStorage.setItem(NEWS_DRAFT_KEY, JSON.stringify(form)) } catch { /* ignore */ }
  }, [form, showCompose, editId])
  useEffect(() => { setShowOriginal(new Set()); if (feed.length) translateFeed(feed) }, [lang])
  useEffect(() => { if (provider?.id) loadProducts() }, [provider?.id])
  const firstSearch = useRef(true)
  useEffect(() => {
    if (firstSearch.current) { firstSearch.current = false; return }
    const id = setTimeout(() => { loadFeed(query, { silent: true }) }, 300)
    return () => clearTimeout(id)
  }, [query])

  async function loadFeed(q, opts) {
    const silent = opts?.silent === true
    silent ? setSearching(true) : setLoading(true)
    const term = (q ?? '').trim()
    const { data: posts, error } = term
      ? await supabase.rpc('news_search', { p_query: term, p_limit: 40, p_offset: 0 })
      : await supabase.rpc('news_feed', { p_limit: 40, p_offset: 0 })
    if (error) { console.error('news_feed:', error); setFeed([]); setLoading(false); setSearching(false); return }
    const ids = (posts || []).map(p => p.id)
    const mediaByPost = {}
    const productsByPost = {}
    if (ids.length > 0) {
      const { data: media } = await supabase.from('news_post_media')
        .select('post_id, url, media_type, sort_order').in('post_id', ids).order('sort_order')
      for (const m of (media || [])) { (mediaByPost[m.post_id] ||= []).push(m) }
      const { data: pp } = await supabase.from('news_post_products')
        .select('post_id, product_id, sort_order').in('post_id', ids).order('sort_order')
      for (const r of (pp || [])) { (productsByPost[r.post_id] ||= []).push(r.product_id) }
      const { data: cc } = await supabase.from('news_comments').select('post_id').in('post_id', ids)
      const counts = {}
      for (const r of (cc || [])) { counts[r.post_id] = (counts[r.post_id] || 0) + 1 }
      setCommentCounts(counts)
    }
    const built = (posts || []).map(p => ({ ...p, media: mediaByPost[p.id] || [], productIds: productsByPost[p.id] || [] }))
    setFeed(built)
    loadReactions(ids)
    translateFeed(built)
    setLoading(false); setSearching(false)
  }

  async function loadProducts() {
    const { data } = await supabase.from('metashop_products').select('id, name').eq('provider_id', provider.id).order('name')
    setProducts(data || [])
  }

  function openCompose() {
    let draft = empty
    try { const r = localStorage.getItem(NEWS_DRAFT_KEY); if (r) draft = { ...empty, ...JSON.parse(r) } } catch { /* ignore */ }
    setForm(draft); setFiles([]); setVideos([]); setYoutubeUrl(''); setExistingImages([]); setExistingVideos([])
    setEditId(null); setResult(null); setErrorMsg(null); setShowCompose(true)
  }

  function openEdit(p) {
    const pids = (p.productIds && p.productIds.length) ? p.productIds : (p.product_id ? [p.product_id] : [])
    setForm({ title: p.title || '', subtitle: p.subtitle || '', boat_ref: p.boat_ref || '', equipment_ref: p.equipment_ref || '', body: p.body || '', product_ids: pids })
    setFiles([]); setVideos([]); setResult(null); setErrorMsg(null)
    setExistingImages((p.media || []).filter(m => m.media_type === 'image').map(m => m.url))
    setExistingVideos((p.media || []).filter(m => m.media_type === 'video').map(m => m.url))
    setYoutubeUrl(((p.media || []).find(m => m.media_type === 'youtube') || {}).url || '')
    setEditId(p.id); setShowCompose(true)
  }

  async function deletePost(p) {
    if (!window.confirm(t('news.deleteConfirm'))) return
    const { error } = await supabase.from('news_posts').delete().eq('id', p.id)
    if (error) { alert(t('news.resError')); return }
    await loadFeed()
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim() || !provider?.id) return
    setSaving(true); setResult(null); setErrorMsg(null)
    try {
      const urls = []
      for (let i = 0; i < files.length && i < 5; i++) {
        let blob
        try { blob = await processNewsImage(files[i]) }
        catch { throw new Error(t('news.photoFormatError', { n: i + 1 })) }
        const path = `${user.id}/${Date.now()}_${i}.jpg`
        const { error: upErr } = await supabase.storage.from('news-media').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('news-media').getPublicUrl(path)
        urls.push(pub.publicUrl)
      }
      const videoUrls = []
      for (let i = 0; i < videos.length && i < 1; i++) {
        setVideoWorking(t('news.videoCompressing'))
        const v = await compressVideo(videos[i])
        setVideoWorking(null)
        if (v.size > VIDEO_MAX_BYTES) throw new Error(t('news.videoTooLarge'))
        const ext = (v.name.split('.').pop() || 'webm').toLowerCase()
        const path = `${user.id}/${Date.now()}_v${i}.${ext}`
        const { error: upErr } = await supabase.storage.from('news-media').upload(path, v, { upsert: true, contentType: v.type })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('news-media').getPublicUrl(path)
        videoUrls.push(pub.publicUrl)
      }
      const mediaUrls = editId ? [...existingImages, ...urls].slice(0, 5) : urls
      const allVideoUrls = editId ? [...existingVideos, ...videoUrls].slice(0, 1) : videoUrls
      const fn = editId ? 'update-news-post' : 'create-news-post'
      const body = editId
        ? { post_id: editId, title: form.title, subtitle: form.subtitle, boat_ref: form.boat_ref, equipment_ref: form.equipment_ref, body: form.body, product_ids: form.product_ids, media_urls: mediaUrls, video_urls: allVideoUrls, youtube_url: youtubeUrl.trim() }
        : { kind: 'product', provider_id: provider.id, title: form.title, subtitle: form.subtitle, boat_ref: form.boat_ref, equipment_ref: form.equipment_ref, body: form.body, product_ids: form.product_ids, media_urls: mediaUrls, video_urls: allVideoUrls, youtube_url: youtubeUrl.trim() }
      const { data, error } = await supabase.functions.invoke(fn, { body })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      try { localStorage.removeItem(NEWS_DRAFT_KEY) } catch { /* ignore */ }
      setResult({ status: data.status })
      await loadFeed()
    } catch (err) {
      console.error('save news:', err)
      setErrorMsg(friendlyNewsError(err, t))
    }
    setVideoWorking(null)
    setSaving(false)
  }

  async function report(postId) {
    const reason = window.prompt(t('news.reportPrompt'))
    if (reason === null) return
    await supabase.from('news_reports').insert({ post_id: postId, reason: reason || '' })
    alert(t('news.reportThanks'))
  }

  async function sharePost(p) {
    const url = `${OWNER_SHOP_BASE}/p/${p.id}`
    const text = p.title || ''
    if (navigator.share) {
      try { await navigator.share({ title: p.title, text, url }); return } catch { return }
    }
    setShareCopied(false)
    setShareData({ title: p.title, url, text })
  }

  // In den Skipily-Shop verlinken (kein externer Absprung). Das Provider-Portal
  // hat keinen eigenen Shop → Deeplink in die Skipily-App (Eigner-Shop).
  function openShop(p) {
    const pins = (p.productIds && p.productIds.length) ? p.productIds : (p.product_id ? [p.product_id] : [])
    let url
    if (p.provider_id) {
      url = `${OWNER_SHOP_BASE}/shop?provider=${p.provider_id}`
      if (pins.length) url += `&pin=${pins.join(',')}`
    } else if (pins.length === 1) {
      url = `${OWNER_SHOP_BASE}/shop/product/${pins[0]}`
    } else {
      url = `${OWNER_SHOP_BASE}/shop`
    }
    window.open(url, '_blank', 'noopener')
  }

  function adDays(f) {
    const d1 = new Date(f.start_date + 'T00:00:00Z').getTime()
    const d2 = new Date(f.end_date + 'T00:00:00Z').getTime()
    if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1
    return Math.max(1, Math.round((d2 - d1) / 864e5) + 1)
  }

  function openAd(p) { setAdPost(p); setAdForm(emptyAd); setAdEstimate(null) }

  // KI-Schätzung bei Budget-/Zeitraum-Änderung (debounced)
  useEffect(() => {
    if (!adPost) return
    const days = adDays(adForm)
    const h = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke('estimate-ad-conversion', {
          body: { daily_budget_cents: adForm.daily_budget_cents, days, category: adPost.equipment_ref || '' },
        })
        if (data && !data.error) setAdEstimate(data)
      } catch { /* ignore */ }
    }, 400)
    return () => clearTimeout(h)
  }, [adPost, adForm.daily_budget_cents, adForm.start_date, adForm.end_date])

  async function bookAd() {
    if (!adPost) return
    setAdBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-ad-checkout', {
        body: {
          post_id: adPost.id,
          daily_budget_cents: adForm.daily_budget_cents,
          start_date: adForm.start_date, end_date: adForm.end_date,
          preferred_hour: adForm.preferred_hour === '' ? null : Number(adForm.preferred_hour),
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (data.mode === 'checkout' && data.url) { window.location.href = data.url; return }
      // mode === 'free'
      setAdPost(null)
      setAdBanner('free')
      await loadFeed()
    } catch (err) {
      console.error('create-ad-checkout:', err)
      alert(t('ads.error') + (err.message ? `: ${err.message}` : ''))
    }
    setAdBusy(false)
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1><Newspaper size={22} style={{ verticalAlign: '-3px', marginRight: 6 }} />{t('news.title')}</h1>
          <p className="subtitle">{t('news.subtitleProvider')}</p></div>
        <button className="btn-primary" onClick={openCompose}><Plus size={16} /> {t('news.createProduct')}</button>
      </div>

      <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto 14px' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('news.searchPh')}
          style={{ width: '100%', padding: '10px 36px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="clear"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {aiHint && (
        <div style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
          <span style={{ flex: 1, fontSize: 13 }}>{aiHint}</span>
          <button className="btn-icon" onClick={() => setAiHint(null)}><X size={16} /></button>
        </div>
      )}

      {adBanner && (
        <div style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
          background: adBanner === 'cancel' ? '#fef3c7' : '#ecfdf5', color: adBanner === 'cancel' ? '#92400e' : '#065f46',
          border: `1px solid ${adBanner === 'cancel' ? '#fde68a' : '#a7f3d0'}` }}>
          {adBanner === 'cancel' ? <Ban size={16} /> : <CheckCircle size={16} />}
          <span style={{ flex: 1 }}>{adBanner === 'cancel' ? t('ads.canceled') : adBanner === 'free' ? t('ads.activeFree') : t('ads.activePaid')}</span>
          <button className="btn-icon" onClick={() => setAdBanner(null)}><X size={16} /></button>
        </div>
      )}

      {feed.length === 0 ? (
        <div className="empty-state">
          <Newspaper size={64} color="#cbd5e1" />
          <h2>{t('news.emptyTitle')}</h2>
          <p>{query.trim() ? t('news.searchEmpty') : t('news.emptyHintProvider')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, margin: '0 auto' }}>
          {feed.map(p => {
            const tr = translations[p.id]
            const orig = showOriginal.has(p.id)
            const dTitle = (tr && !orig) ? tr.title : p.title
            const dSubtitle = (tr && !orig) ? tr.subtitle : p.subtitle
            const dBody = (tr && !orig) ? tr.body : p.body
            return (
            <article key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
              {p.kind === 'product' && (
                <div style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={13} /> {t('news.sponsored')}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}><NewsAuthor name={p.author_name} avatar={p.author_avatar_url} /></div>
                <div style={{ position: 'relative', padding: '10px 10px 0' }}>
                  <button className="btn-icon" title={t('news.moreActions')} onClick={() => setMenuOpen(menuOpen === p.id ? null : p.id)} style={{ color: '#94a3b8' }}>
                    <MoreVertical size={18} />
                  </button>
                  {menuOpen === p.id && (
                    <>
                      <div onClick={() => setMenuOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                      <div style={{ position: 'absolute', right: 8, top: 38, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 160, overflow: 'hidden' }}>
                        {user && p.author_id === user.id && (
                          <>
                            <button onClick={() => { setMenuOpen(null); openEdit(p) }} style={menuItemStyle}>
                              <Pencil size={15} /> {t('news.edit')}
                            </button>
                            <button onClick={() => { setMenuOpen(null); deletePost(p) }} style={{ ...menuItemStyle, color: '#ef4444' }}>
                              <Trash2 size={15} /> {t('news.delete')}
                            </button>
                          </>
                        )}
                        <button onClick={() => { setMenuOpen(null); report(p.id) }} style={menuItemStyle}>
                          <Flag size={15} /> {t('news.report')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {(() => {
                // Video + Fotos in EINER Zeile, Video zuerst.
                const vids = p.media.filter(m => m.media_type === 'video').slice(0, 1)
                const yts = p.media.filter(m => m.media_type === 'youtube').slice(0, 1)
                const imgs = p.media.filter(m => m.media_type === 'image')
                if (!vids.length && !yts.length && !imgs.length) return null
                const H = 220
                return (
                  <div style={{ display: 'flex', overflowX: 'auto', gap: 6, padding: '12px 14px 0', alignItems: 'center' }}>
                    {vids.map((m, i) => (
                      <div key={'v' + i} style={{ flex: '0 0 auto', height: H, width: 360, maxWidth: '88vw', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                        <NewsVideo src={m.url} postId={p.id} lang={lang} onQuota={(h) => setAiHint(h || t('news.aiBudgetHint'))} fill />
                      </div>
                    ))}
                    {yts.map((m, i) => {
                      const id = ytVideoId(m.url)
                      return id ? (
                        <div key={'yt' + i} style={{ flex: '0 0 auto', height: H, width: 360, maxWidth: '88vw', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                          <iframe title="YouTube" src={`https://www.youtube-nocookie.com/embed/${id}`}
                            style={{ width: '100%', height: '100%', border: 0 }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen loading="lazy" />
                        </div>
                      ) : null
                    })}
                    {imgs.map((m, i) => (
                      <img key={'i' + i} src={m.url} alt="" onClick={() => setLightboxUrl(m.url)}
                        style={{ height: H, maxWidth: '88vw', objectFit: 'cover', flex: '0 0 auto', borderRadius: 10, cursor: 'zoom-in' }}
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                    ))}
                  </div>
                )
              })()}
              <div style={{ padding: '12px 14px' }}>
                <h3 style={{ margin: '0 0 2px', fontSize: 18 }}>{dTitle}</h3>
                {dSubtitle && <p style={{ margin: '0 0 6px', color: '#475569', fontWeight: 600 }}>{dSubtitle}</p>}
                {(p.boat_ref || p.equipment_ref) && (
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'nowrap', overflow: 'hidden' }}>
                    {p.boat_ref && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 }}><Ship size={12} style={{ verticalAlign: '-2px' }} /> {p.boat_ref}</span>}
                    {p.equipment_ref && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 }}><Package size={12} style={{ verticalAlign: '-2px' }} /> {p.equipment_ref}</span>}
                  </p>
                )}
                <NewsBody text={dBody} t={t} />
                {tr && (
                  <button type="button" onClick={() => setShowOriginal(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: 12, marginBottom: 6 }}>
                    🌐 {orig ? t('news.showTranslation') : t('news.autoTranslated')}
                  </button>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {p.kind === 'product' && (
                    <button className="btn-primary" onClick={() => openShop(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ShoppingCart size={15} /> {t('news.toShop')}
                    </button>
                  )}
                  {FeatureFlags.news_ads && p.kind === 'product' && provider?.id && p.provider_id === provider.id && (
                    <button className="btn-secondary" onClick={() => openAd(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Megaphone size={15} /> {t('ads.promote')}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {REACTION_EMOJIS.map(em => {
                    const count = reactions[p.id]?.[em] || 0
                    const mine = myReactions.has(`${p.id}:${em}`)
                    return (
                      <button key={em} onClick={() => toggleReaction(p.id, em)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${mine ? '#3b82f6' : '#e2e8f0'}`,
                          background: mine ? '#eff6ff' : '#fff', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontSize: 14 }}>
                        <span>{em}</span>
                        {count > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: mine ? '#1d4ed8' : '#64748b' }}>{count}</span>}
                      </button>
                    )
                  })}
                  <button onClick={() => setOpenComments(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} title={t('news.comments')} aria-label={t('news.comments')}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, border: '1px solid #e2e8f0', background: openComments.has(p.id) ? '#eff6ff' : '#fff', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', color: '#334155' }}>
                    <MessageCircle size={16} />
                    {commentCounts[p.id] > 0 && <span style={{ fontSize: 12, fontWeight: 700 }}>{commentCounts[p.id]}</span>}
                  </button>
                  <button onClick={() => sharePost(p)} title={t('news.share')} aria-label={t('news.share')}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', color: '#334155' }}>
                    <Share2 size={16} />
                  </button>
                </div>
                {openComments.has(p.id) && <NewsComments postId={p.id} user={user} t={t} onCountChange={(delta) => setCommentCounts(c => ({ ...c, [p.id]: Math.max(0, (c[p.id] || 0) + delta) }))} />}
              </div>
            </article>
            )
          })}
        </div>
      )}

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {shareData && (
        <div className="modal-overlay" onClick={() => setShareData(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2><Share2 size={18} /> {t('news.share')}</h2>
              <button className="btn-icon" onClick={() => setShareData(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{shareData.title}</div>
              <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                <MessageCircle size={16} /> {t('news.shareWhatsApp')}
              </a>
              <a className="btn-secondary" href={`mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodeURIComponent(shareData.text + '\n\n' + shareData.url)}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                <Mail size={16} /> {t('news.shareMail')}
              </a>
              <button className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(shareData.url); setShareCopied(true) } catch { /* ignore */ } }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {shareCopied ? <Check size={16} /> : <LinkIcon size={16} />} {shareCopied ? t('news.shareCopied') : t('news.shareCopy')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompose && (
        // Klick auf den Hintergrund schließt NICHT (schützt Eingaben); nur X/Abbrechen.
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? t('news.edit') : t('news.createProduct')}</h2>
              <button className="btn-icon" onClick={() => setShowCompose(false)}><X size={20} /></button>
            </div>
            {result ? (
              <div className="modal-body" style={{ textAlign: 'center', padding: '24px 16px' }}>
                {result.status === 'published' && <><CheckCircle size={48} color="#10b981" /><h3>{t('news.resPublished')}</h3></>}
                {result.status === 'pending_review' && <><Clock size={48} color="#f59e0b" /><h3>{t('news.resPending')}</h3></>}
                {result.status === 'blocked' && <><Ban size={48} color="#ef4444" /><h3>{t('news.resBlocked')}</h3></>}
                {result.status === 'error' && <><Ban size={48} color="#ef4444" /><h3>{t('news.resError')}</h3><p style={{ color: '#64748b' }}>{result.message}</p></>}
                <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCompose(false)}>OK</button>
              </div>
            ) : (
              <form onSubmit={submit} className="modal-body">
                <div className="form-group"><label>{t('news.fTitleProduct')}</label>
                  <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t('news.fTitleProductPh')} /></div>
                <div className="form-group"><label>{t('news.fSubtitle')}</label>
                  <input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} /></div>
                <div className="form-row">
                  <div className="form-group"><label>{t('news.fBoat')}</label>
                    <input value={form.boat_ref} onChange={e => setForm({ ...form, boat_ref: e.target.value })} placeholder={t('news.fBoatPh')} /></div>
                  <div className="form-group"><label>{t('news.fEquip')}</label>
                    <input value={form.equipment_ref} onChange={e => setForm({ ...form, equipment_ref: e.target.value })} placeholder={t('news.fEquipPh')} /></div>
                </div>
                <div className="form-group"><label>{t('news.fBody')}</label>
                  <textarea rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder={t('news.fBodyProductPh')} /></div>
                <div className="form-group"><label>{t('news.fProducts')}</label>
                  {products.length === 0 ? (
                    <div className="form-label-hint">{t('news.fProductNone')}</div>
                  ) : (
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                      {products.map(p => {
                        const checked = form.product_ids.includes(p.id)
                        return (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                            <input type="checkbox" checked={checked} onChange={() => setForm(f => ({
                              ...f,
                              product_ids: checked ? f.product_ids.filter(x => x !== p.id) : [...f.product_ids, p.id],
                            }))} />
                            <span style={{ fontSize: 14 }}>{p.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {form.product_ids.length > 0 && (
                    <div className="form-label-hint" style={{ marginTop: 4, color: '#b45309' }}>{t('news.fProductsCount', { n: form.product_ids.length })}</div>
                  )}
                  <div className="form-label-hint" style={{ marginTop: 4 }}>{t('news.shopLinkHint')}</div>
                </div>
                <div className="form-group">
                  <label>{t('news.fPhotos')} <span className="form-label-hint">(max. 5)</span></label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {existingImages.map((url, i) => (
                      <div key={'ex' + i} style={{ position: 'relative', width: 64, height: 64 }}>
                        <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                        <button type="button" onClick={() => setExistingImages(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
                      </div>
                    ))}
                    {files.map((f, i) => (
                      <div key={i} style={{ position: 'relative', width: 64, height: 64 }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #93c5fd' }} />
                        <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
                      </div>
                    ))}
                    {existingImages.length + files.length < 5 && (
                      <label style={{ width: 64, height: 64, borderRadius: 8, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
                        <input type="file" accept="image/*,.heic,.heif" multiple style={{ display: 'none' }}
                          onChange={e => { const fs = Array.from(e.target.files || []); const room = 5 - existingImages.length - files.length; setFiles(prev => [...prev, ...fs].slice(0, Math.max(0, room))); e.target.value = '' }} />
                        <Plus size={20} />
                      </label>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>{t('news.fVideo')} <span className="form-label-hint">({t('news.videoHint')})</span></label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {existingVideos.map((url, i) => (
                      <div key={'exv' + i} style={{ fontSize: 12, color: '#334155', background: '#f1f5f9', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🎬 Video {i + 1}
                        <button type="button" onClick={() => setExistingVideos(prev => prev.filter((_, j) => j !== i))}
                          style={{ width: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
                      </div>
                    ))}
                    {videos.map((v, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#334155', background: '#f1f5f9', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🎬 {v.name.length > 22 ? v.name.slice(0, 20) + '…' : v.name}
                        <button type="button" onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))}
                          style={{ width: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11 }}>×</button>
                      </div>
                    ))}
                    {existingVideos.length + videos.length < 1 && (
                      <label style={{ borderRadius: 8, border: '1px dashed #cbd5e1', padding: '8px 12px', cursor: 'pointer', color: '#64748b', fontSize: 13 }}>
                        <input type="file" accept="video/*" style={{ display: 'none' }}
                          onChange={e => { const vs = Array.from(e.target.files || []); setVideos(vs.slice(0, 1)); e.target.value = '' }} />
                        + {t('news.addVideo')}
                      </label>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 4 }}>
                  <input type="url" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
                    placeholder={(t('news.youtubeLabel') || 'YouTube-Link (optional)') + ' – https://youtu.be/…'}
                    style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: 13 }} />
                  <div className="form-label-hint">{t('news.youtubeHint') || 'Das Video wird direkt in Skipily angezeigt.'}</div>
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8' }}>{t('news.quotaHint')}</p>
                {videoWorking && <div className="form-label-hint" style={{ textAlign: 'right' }}>{videoWorking}</div>}
                {errorMsg && (
                  <div style={{ margin: '4px 0 0', padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)', color: '#b91c1c', fontSize: 13 }}>
                    {errorMsg}
                  </div>
                )}
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowCompose(false)}>{t('common.cancel')}</button>
                  <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? (videoWorking || t('news.saving')) : t('news.publish')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {adPost && (
        <div className="modal-overlay" onClick={() => setAdPost(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2><Megaphone size={18} /> {t('ads.title')}</h2>
              <button className="btn-icon" onClick={() => setAdPost(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>{t('ads.intro')} „{adPost.title}"</p>
              <div className="form-row">
                <div className="form-group"><label>{t('ads.start')}</label>
                  <input type="date" value={adForm.start_date} min={todayStr}
                    onChange={e => setAdForm({ ...adForm, start_date: e.target.value })} /></div>
                <div className="form-group"><label>{t('ads.end')}</label>
                  <input type="date" value={adForm.end_date} min={adForm.start_date}
                    onChange={e => setAdForm({ ...adForm, end_date: e.target.value })} /></div>
              </div>
              <div className="form-group">
                <label>{t('ads.dailyBudget')}: <strong>{(adForm.daily_budget_cents / 100).toFixed(0)} €/Tag</strong></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={1000} max={100000} step={500}
                    value={Math.min(adForm.daily_budget_cents, 100000)}
                    onChange={e => setAdForm({ ...adForm, daily_budget_cents: Number(e.target.value) })}
                    style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    <input type="number" min={10} step={5}
                      value={Math.round(adForm.daily_budget_cents / 100)}
                      onChange={e => setAdForm({ ...adForm, daily_budget_cents: Math.max(1000, (parseInt(e.target.value, 10) || 0) * 100) })}
                      style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
                    <span style={{ fontSize: 13, color: '#64748b' }}>€/Tag</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{t('ads.minHint')}</div>
                <div style={{ fontSize: 12.5, color: '#475569', marginTop: 6, lineHeight: 1.45, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 10px' }}>
                  {t('ads.budgetEffect')}
                </div>
              </div>
              <div className="form-group"><label>{t('ads.preferredHour')}</label>
                <select value={adForm.preferred_hour} onChange={e => setAdForm({ ...adForm, preferred_hour: e.target.value })}>
                  <option value="">{t('ads.anyHour')}</option>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select></div>

              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{adDays(adForm)} {t('ads.days')} × {(adForm.daily_budget_cents / 100).toFixed(0)} €</span>
                  <strong>{((adDays(adForm) * adForm.daily_budget_cents) / 100).toFixed(2)} €</strong>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{t('ads.quotaHint')}</div>
              </div>

              {adEstimate && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, padding: '10px 12px' }}>
                  <Sparkles size={16} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 13, color: '#334155' }}>
                    <div><strong>{t('ads.estReach')}:</strong> ~{adEstimate.reach_per_day}/{t('ads.perDay')} · <strong>{t('ads.estConv')}:</strong> ~{adEstimate.conversions_per_day}/{t('ads.perDay')}</div>
                    {adEstimate.note && <div style={{ color: '#64748b', marginTop: 2 }}>{adEstimate.note}</div>}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setAdPost(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" onClick={bookAd} disabled={adBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Megaphone size={16} /> {adBusy ? t('ads.booking') : t('ads.book')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
