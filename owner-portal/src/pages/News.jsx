import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Newspaper, Plus, X, Save, ShoppingCart, Flag, Ship, Package, CheckCircle, Clock, Ban, Pencil, Trash2, Search, MoreVertical, Copy, Check, Sparkles, MessageCircle, Share2, Mail, Link as LinkIcon } from 'lucide-react'
import { useT } from '../i18n'
import { compressVideo } from '../lib/videoCompress'
import Lightbox from '../components/Lightbox'
import DragScroll from '../components/DragScroll'

// YouTube-Video-ID aus einer URL extrahieren (watch/embed/shorts/youtu.be/live).
function ytVideoId(url) {
  if (!url) return ''
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || String(url).match(/^([A-Za-z0-9_-]{11})$/)
  return m ? m[1] : ''
}

const VIDEO_MAX_BYTES = 200 * 1024 * 1024 // 200 MB nach Komprimierung
const empty = { title: '', boat_ref: '', equipment_ref: '', body: '' }
const REACTION_EMOJIS = ['👍', '❤️', '⚓', '🔧', '👏']

// Einheitlicher Stil für Einträge im ⋯-Überlaufmenü (Bearbeiten/Löschen/Melden).
const menuItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 14, color: '#334155', textAlign: 'left',
}

const NEWS_DRAFT_KEY = 'skipily_news_draft'

// Bild vor dem Upload normalisieren: auf max. 2000px verkleinern und als JPEG
// re-encodieren. Das verkleinert die Datei (wichtig bei 5 Fotos) und vermeidet
// nicht unterstützte Formate wie HEIC (iPhone), die der Bucket ablehnt.
// Wirft bei nicht dekodierbaren Dateien, damit der Aufrufer sie klar benennen kann.
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
    img.src = url
  })
}
function isHeic(file) {
  const ty = (file.type || '').toLowerCase()
  const nm = (file.name || '').toLowerCase()
  return ty === 'image/heic' || ty === 'image/heif' || nm.endsWith('.heic') || nm.endsWith('.heif')
}
async function processNewsImage(file) {
  let src = file
  // HEIC/HEIF (iPhone) in allen Browsern nach JPEG wandeln (lazy geladen).
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
// Technische Fehler in eine verständliche Meldung übersetzen.
function friendlyNewsError(err, t) {
  const m = (err && err.message ? err.message : '').toString()
  if (/mime|not supported|invalid.*type|unsupported/i.test(m)) return t('news.photoFormatGeneric')
  if (/exceed|too large|413|payload|size/i.test(m)) return t('news.photoTooLarge')
  return m || t('news.resError')
}

// Vollbild-Foto mit Pinch-to-Zoom (Touch), Mausrad-Zoom und Doppeltipp.
// Beschreibung: max. 4 Zeilen, Rest über „mehr" ausklappbar.
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

// Video mit automatischen Untertiteln in der Nutzersprache (news-subtitles).
// fill=true: füllt eine feste Karte (für die gemeinsame Medien-Zeile).
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

// Autor-Kopf mit Profilbild (oder Initiale als Fallback).
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

// Kommentare zu einem Beitrag: per Klick geöffnet, Liste + Eingabe (wie Facebook).
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
  const { user } = useAuth()
  const navigate = useNavigate()
  const [feed, setFeed] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompose, setShowCompose] = useState(false)
  const [form, setForm] = useState(empty)
  const [files, setFiles] = useState([])
  const [videos, setVideos] = useState([])
  const [youtubeUrl, setYoutubeUrl] = useState('')   // optionaler YouTube-Link
  const [editId, setEditId] = useState(null)
  const [existingImages, setExistingImages] = useState([]) // bestehende Bild-URLs (beim Bearbeiten)
  const [existingVideos, setExistingVideos] = useState([]) // bestehende Video-URLs
  const [saving, setSaving] = useState(false)
  const [videoWorking, setVideoWorking] = useState(null)
  const [result, setResult] = useState(null) // { status } nur bei Erfolg/Moderation
  const [errorMsg, setErrorMsg] = useState(null) // Fehler bleibt im Formular, Eingaben erhalten
  const [reactions, setReactions] = useState({}) // postId -> { emoji: count }
  const [myReactions, setMyReactions] = useState(() => new Set()) // `${postId}:${emoji}`
  const [translations, setTranslations] = useState({}) // postId -> { title, subtitle, body }
  const [showOriginal, setShowOriginal] = useState(() => new Set())
  const [aiHint, setAiHint] = useState(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [menuOpen, setMenuOpen] = useState(null) // postId des geöffneten ⋯-Menüs
  const [lightboxUrl, setLightboxUrl] = useState(null) // Foto im Vollbild (Pinch-Zoom)
  const [partsModal, setPartsModal] = useState(null) // { loading, items, paid, hint }
  const [copiedPart, setCopiedPart] = useState(null)
  const [openComments, setOpenComments] = useState(() => new Set())
  const [commentCounts, setCommentCounts] = useState({}) // postId -> n
  const [shareData, setShareData] = useState(null) // { title, url, text }
  const [shareCopied, setShareCopied] = useState(false)

  async function translateFeed(posts) {
    // Immer in die UI-Sprache uebersetzen (auch de): zielsprachige Beitraege
    // gibt translate-news unveraendert zurueck. So werden z. B. niederlaendische
    // Beitraege auch fuer deutsche Nutzer uebersetzt.
    if (!lang || !posts || posts.length === 0) { setTranslations({}); return }
    try {
      const payload = posts.map(p => ({ id: p.id, title: p.title, subtitle: p.subtitle, body: p.body }))
      const { data } = await supabase.functions.invoke('translate-news', { body: { posts: payload, target_lang: lang } })
      if (data?.translations) setTranslations(data.translations)
      if (data?.quota_exhausted) setAiHint(data.upgrade_hint || t('news.aiBudgetHint'))
    } catch (e) { console.warn('translate-news:', e) }
  }

  useEffect(() => { loadFeed() }, [])
  // Bei Sprachwechsel neu übersetzen
  useEffect(() => { setShowOriginal(new Set()); if (feed.length) translateFeed(feed) }, [lang])
  // Entwurf (nur Text) laufend sichern, solange eine NEUE Meldung verfasst wird.
  useEffect(() => {
    if (!showCompose || editId) return
    try { localStorage.setItem(NEWS_DRAFT_KEY, JSON.stringify(form)) } catch { /* ignore */ }
  }, [form, showCompose, editId])
  // Suche (entprellt): leer -> normaler Feed, sonst Volltext-Suche.
  // Erstes Rendern überspringen (initialer Feed-Load läuft bereits).
  const firstSearch = useRef(true)
  useEffect(() => {
    if (firstSearch.current) { firstSearch.current = false; return }
    const id = setTimeout(() => { loadFeed(query, { silent: true }) }, 300)
    return () => clearTimeout(id)
  }, [query])

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
    // optimistisch
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

  async function loadFeed(q, opts) {
    const silent = opts?.silent === true
    silent ? setSearching(true) : setLoading(true)
    const term = (q ?? '').trim()
    const { data: posts, error } = term
      ? await supabase.rpc('news_search', { p_query: term, p_limit: 40, p_offset: 0 })
      : await supabase.rpc('news_feed', { p_limit: 40, p_offset: 0 })
    if (error) { console.error('news_feed:', error); setFeed([]); setLoading(false); setSearching(false); return }
    const ids = (posts || []).map(p => p.id)
    let mediaByPost = {}
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

  function openCompose() {
    // Entwurf (nur Text) wiederherstellen, damit eine abgebrochene/fehlgeschlagene
    // Meldung nicht verloren ist. Fotos/Videos lassen sich technisch nicht sichern.
    let draft = empty
    try { const r = localStorage.getItem(NEWS_DRAFT_KEY); if (r) draft = { ...empty, ...JSON.parse(r) } } catch { /* ignore */ }
    setForm(draft); setFiles([]); setVideos([]); setYoutubeUrl(''); setExistingImages([]); setExistingVideos([])
    setEditId(null); setResult(null); setErrorMsg(null); setShowCompose(true)
  }

  function openEdit(p) {
    setForm({ title: p.title || '', boat_ref: p.boat_ref || '', equipment_ref: p.equipment_ref || '', body: p.body || '' })
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
    if (!form.title.trim()) return
    setSaving(true); setResult(null); setErrorMsg(null)
    try {
      // Fotos: HEIC/HEIF (iPhone) -> JPEG, verkleinern, dann hochladen.
      const urls = []
      for (let i = 0; i < files.length && i < 5; i++) {
        let blob
        try { blob = await processNewsImage(files[i]) }
        catch { throw new Error(t('news.photoFormatError', { n: i + 1 })) }
        const path = `${user.id}/${Date.now()}_${i}.jpg`
        const { error: upErr } = await supabase.storage.from('news-media')
          .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('news-media').getPublicUrl(path)
        urls.push(pub.publicUrl)
      }
      // Videos komprimieren (wie YouTube: 720p + Bitrate-Limit) und hochladen (max 2)
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
      const yt = youtubeUrl.trim()
      const body = editId
        ? { post_id: editId, title: form.title, boat_ref: form.boat_ref, equipment_ref: form.equipment_ref, body: form.body, media_urls: mediaUrls, video_urls: allVideoUrls, youtube_url: yt }
        : { kind: 'solution', title: form.title, boat_ref: form.boat_ref, equipment_ref: form.equipment_ref, body: form.body, media_urls: mediaUrls, video_urls: allVideoUrls, youtube_url: yt }
      const { data, error } = await supabase.functions.invoke(fn, { body })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      try { localStorage.removeItem(NEWS_DRAFT_KEY) } catch { /* ignore */ }
      setResult({ status: data.status })
      await loadFeed()
    } catch (err) {
      // Fehler NICHT das Formular ersetzen lassen: Eingaben + Fotos bleiben erhalten,
      // Nutzer sieht die Ursache und kann direkt erneut senden.
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

  // Immer in den Skipily-Shop verlinken (kein externer Absprung):
  // konkretes Produkt, sonst der Shop des Anbieters.
  // Erwähnte Artikel eines Lösungsbeitrags im Shop finden (KI + Shop-Suche).
  async function findParts(p) {
    setPartsModal({ loading: true, items: [], paid: false, hint: null })
    try {
      const { data, error } = await supabase.functions.invoke('find-post-parts', { body: { post_id: p.id } })
      if (error) throw error
      if (data?.quota_exhausted) { setPartsModal({ loading: false, items: [], paid: false, hint: data.upgrade_hint, quotaExhausted: true }); return }
      setPartsModal({ loading: false, items: data?.items || [], paid: !!data?.paid, hint: data?.upgrade_hint || null })
    } catch (err) {
      console.error('find-post-parts:', err)
      setPartsModal({ loading: false, items: [], paid: false, hint: null, error: true })
    }
  }

  async function copyPart(it) {
    const lines = [it.query]
    if (it.fallback?.article_number) lines.push(`${t('news.findPartsArticleNo')}: ${it.fallback.article_number}`)
    if (it.fallback?.description) lines.push(it.fallback.description)
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopiedPart(it.query); setTimeout(() => setCopiedPart(null), 2000) } catch { /* ignore */ }
  }
  function askAIAboutPart(it) {
    const art = it.fallback?.article_number ? ` (Artikelnummer ${it.fallback.article_number})` : ''
    const desc = it.fallback?.description ? ` ${it.fallback.description}` : ''
    const q = `Ich suche Bezugsquellen für das Bootsteil „${it.query}"${art}.${desc} Wo bekomme ich das Teil, und welche passenden Alternativen gibt es?`
    setPartsModal(null)
    navigate(`/chat?question=${encodeURIComponent(q)}`)
  }

  async function sharePost(p) {
    const url = `${window.location.origin}/p/${p.id}`
    const text = p.title || ''
    if (navigator.share) {
      try { await navigator.share({ title: p.title, text, url }); return } catch { return }
    }
    setShareCopied(false)
    setShareData({ title: p.title, url, text })
  }

  function openShop(p) {
    const pins = (p.productIds && p.productIds.length) ? p.productIds : (p.product_id ? [p.product_id] : [])
    if (p.provider_id) {
      navigate(`/shop?provider=${p.provider_id}${pins.length ? `&pin=${pins.join(',')}` : ''}`)
    } else if (pins.length === 1) {
      navigate(`/shop/product/${pins[0]}`)
    } else {
      navigate('/shop')
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1><Newspaper size={22} style={{ verticalAlign: '-3px', marginRight: 6 }} />{t('news.title')}</h1>
          <p className="subtitle">{t('news.subtitle')}</p></div>
        <button className="btn-primary" onClick={openCompose}><Plus size={16} /> {t('news.create')}</button>
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
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => navigate('/plus')}>{t('news.toSubscription')}</button>
          <button className="btn-icon" onClick={() => setAiHint(null)}><X size={16} /></button>
        </div>
      )}

      {feed.length === 0 ? (
        <div className="empty-state">
          <Newspaper size={64} color="#cbd5e1" />
          {query.trim() ? (
            <>
              <h2>{t('news.emptyTitle')}</h2>
              <p>{t('news.searchEmpty')}</p>
            </>
          ) : (
            <>
              <h2>{t('news.emptyTitle')}</h2>
              <p>{t('news.emptyHint')}</p>
            </>
          )}
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
                // Video + Fotos in EINER Zeile, Video zuerst (Upload-Video, dann
                // YouTube, dann Fotos). Alles gleich hoch, horizontal scrollbar.
                const vids = p.media.filter(m => m.media_type === 'video').slice(0, 1)
                const yts = p.media.filter(m => m.media_type === 'youtube').slice(0, 1)
                const imgs = p.media.filter(m => m.media_type === 'image')
                if (!vids.length && !yts.length && !imgs.length) return null
                const H = 220
                return (
                  <DragScroll style={{ display: 'flex', gap: 6, padding: '12px 14px 0', alignItems: 'center' }}>
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
                      <img key={'i' + i} src={m.url} alt="" draggable={false} onClick={() => setLightboxUrl(m.url)}
                        style={{ height: H, maxWidth: '88vw', objectFit: 'cover', flex: '0 0 auto', borderRadius: 10, cursor: 'zoom-in' }}
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                    ))}
                  </DragScroll>
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
                {p.kind === 'product' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn-primary" onClick={() => openShop(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ShoppingCart size={15} /> {t('news.toShop')}
                    </button>
                  </div>
                )}
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
                  {p.kind !== 'product' && (
                    <button onClick={() => findParts(p)} title={t('news.findParts')} aria-label={t('news.findParts')}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', color: '#334155' }}>
                      <Search size={16} />
                    </button>
                  )}
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

      {showCompose && (
        // Klick auf den Hintergrund schließt NICHT (schützt Eingaben); nur X/Abbrechen.
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? t('news.edit') : t('news.create')}</h2>
              <button className="btn-icon" onClick={() => setShowCompose(false)}><X size={20} /></button>
            </div>
            {result ? (
              <div className="modal-body" style={{ textAlign: 'center', padding: '24px 16px' }}>
                {result.status === 'published' && <><CheckCircle size={48} color="#10b981" /><h3>{t('news.resPublished')}</h3></>}
                {result.status === 'pending_review' && <><Clock size={48} color="#f59e0b" /><h3>{t('news.resPending')}</h3></>}
                {result.status === 'blocked' && <><Ban size={48} color="#ef4444" /><h3>{t('news.resBlocked')}</h3></>}
                {result.status === 'error' && <><Ban size={48} color="#ef4444" /><h3>{t('news.resError')}</h3><p style={{ color: '#64748b' }}>{result.message}</p></>}
                <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCompose(false)}>{t('common.close') === 'common.close' ? 'OK' : t('common.close')}</button>
              </div>
            ) : (
              <form onSubmit={submit} className="modal-body">
                <div className="form-group"><label>{t('news.fTitle')}</label>
                  <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t('news.fTitlePh')} /></div>
                <div className="form-row">
                  <div className="form-group"><label>{t('news.fBoat')}</label>
                    <input value={form.boat_ref} onChange={e => setForm({ ...form, boat_ref: e.target.value })} placeholder={t('news.fBoatPh')} /></div>
                  <div className="form-group"><label>{t('news.fEquip')}</label>
                    <input value={form.equipment_ref} onChange={e => setForm({ ...form, equipment_ref: e.target.value })} placeholder={t('news.fEquipPh')} /></div>
                </div>
                <div className="form-group"><label>{t('news.fBody')}</label>
                  <textarea rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder={t('news.fBodyPh')} /></div>
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
                      <div key={i} style={{ position: 'relative', fontSize: 12, color: '#334155', background: '#f1f5f9', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    placeholder={t('news.youtubeLabel') + ' – https://youtu.be/…'}
                    style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: 13 }} />
                  <div className="form-label-hint">{t('news.youtubeHint')}</div>
                </div>
                {videoWorking && <div className="form-label-hint" style={{ textAlign: 'right' }}>{videoWorking}</div>}
                {errorMsg && (
                  <div style={{ margin: '4px 0 0', padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)', color: '#b91c1c', fontSize: 13 }}>
                    {errorMsg}
                  </div>
                )}
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowCompose(false)}>{t('eq.k19')}</button>
                  <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? (videoWorking || t('news.saving')) : t('news.publish')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Teilen */}
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

      {/* Ersatzteil-/Artikelfinder (KI + Shop-Suche) */}
      {partsModal && (
        <div className="modal-overlay" onClick={() => setPartsModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2><Search size={18} /> {t('news.findParts')}</h2>
              <button className="btn-icon" onClick={() => setPartsModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {partsModal.loading ? (
                <p style={{ color: '#64748b' }}>{t('news.findPartsLoading')}</p>
              ) : partsModal.quotaExhausted ? (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
                  <p style={{ margin: '0 0 8px' }}>{partsModal.hint}</p>
                  <button className="btn-primary" onClick={() => navigate('/plus')}>{t('news.toSubscription')}</button>
                </div>
              ) : partsModal.error ? (
                <p style={{ color: '#dc2626' }}>{t('news.resError')}</p>
              ) : partsModal.items.length === 0 ? (
                <p style={{ color: '#64748b' }}>{t('news.findPartsEmpty')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {partsModal.items.map((it, i) => (
                    <div key={i}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: '#334155' }}>{it.query}</div>
                      {it.matches.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {it.matches.map(m => (
                            <button key={m.id} onClick={() => { setPartsModal(null); navigate(`/shop/product/${m.id}`) }}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, cursor: 'pointer' }}>
                              {m.image
                                ? <img src={m.image} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />
                                : <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={18} color="#cbd5e1" /></div>}
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>{[m.manufacturer, m.part_number].filter(Boolean).join(' · ')}</span>
                              </span>
                              {m.price != null && <span style={{ fontSize: 13, fontWeight: 700 }}>{Number(m.price).toFixed(2)} {m.currency}</span>}
                            </button>
                          ))}
                        </div>
                      ) : it.fallback ? (
                        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span>{t('news.findPartsNoShop')}</span>
                            {(it.fallback.installed_match || it.fallback.confidence === 'high') && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '1px 8px' }}>
                                {it.fallback.installed_match ? t('news.likelyInstalled') : t('news.likelyArticle')}
                              </span>
                            )}
                          </div>
                          {it.fallback.article_number && <div style={{ fontSize: 14, fontWeight: 700, userSelect: 'text' }}>{t('news.findPartsArticleNo')}: {it.fallback.article_number}</div>}
                          {it.fallback.description && <div style={{ fontSize: 13, color: '#334155', marginTop: 2, userSelect: 'text' }}>{it.fallback.description}</div>}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                              onClick={() => copyPart(it)}>
                              {copiedPart === it.query ? <Check size={13} /> : <Copy size={13} />} {copiedPart === it.query ? t('news.copied') : t('news.copy')}
                            </button>
                            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                              onClick={() => askAIAboutPart(it)}>
                              <Sparkles size={13} /> {t('news.askAI')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>{t('news.findPartsNoShop')}</div>
                      )}
                    </div>
                  ))}
                  {partsModal.hint && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{partsModal.hint}</span>
                      <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => navigate('/plus')}>{t('news.toSubscription')}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
