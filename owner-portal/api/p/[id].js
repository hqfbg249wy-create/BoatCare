// Serverseitig gerenderte Landingpage eines geteilten News-Beitrags.
// Enthält Open-Graph-/Twitter-Meta-Tags, damit WhatsApp/Social/Mail eine
// Vorschau (Bild + Titel + Text) zeigen, und einen App-Download-Block.
// Daten über die öffentliche RPC news_post_public (nur veröffentlichte Beiträge).

const SUPABASE_URL = 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ'
const APP_STORE_URL = 'https://apps.apple.com/app/id6757314378'
const WEB_APP_URL = 'https://app.skipily.app'
const SITE_URL = 'https://skipily.app'
const LOGO_URL = 'https://skipily.app/media/logo.png'
const DEFAULT_IMAGE = 'https://skipily.app/media/logo.png'

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export default async function handler(req, res) {
  const id = req.query?.id || ''
  let post = null
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/news_post_public`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: id }),
    })
    if (r.ok) post = await r.json()
  } catch { /* ignore */ }

  const pageUrl = `${WEB_APP_URL}/p/${esc(id)}`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600')

  if (!post || !post.id) {
    res.status(200).send(shell({
      title: 'Skipily', description: 'Tipps & Tricks für Bootseigner', image: '', url: pageUrl,
      bodyHtml: `<div class="card" style="text-align:center">
        <h1>Beitrag nicht verfügbar</h1>
        <p class="muted">Dieser Beitrag ist nicht (mehr) öffentlich verfügbar.</p>
        <a class="btn" href="${WEB_APP_URL}">Skipily öffnen</a></div>` + downloadBlock(),
    }))
    return
  }

  const media = Array.isArray(post.media) ? post.media : []
  const postImage = (media.find((m) => m.media_type !== 'video') || {}).url || post.author_avatar_url || ''
  const image = postImage || DEFAULT_IMAGE
  const video = media.find((m) => m.media_type === 'video')
  const images = media.filter((m) => m.media_type !== 'video')
  // Für die Social-Vorschau: alle Foto-URLs (mehrere og:image) + Video-URL (og:video).
  const imageUrls = images.map((m) => m.url).filter(Boolean)
  const videoUrl = video ? video.url : ''
  const descRaw = (post.body || post.subtitle || '').replace(/\s+/g, ' ').trim()
  const description = descRaw.length > 200 ? descRaw.slice(0, 200) + '…' : descRaw

  const authorInitial = esc((post.author_name || '?').slice(0, 1).toUpperCase())
  const authorHtml = post.author_avatar_url
    ? `<img class="avatar" src="${esc(post.author_avatar_url)}" alt="">`
    : `<div class="avatar ph">${authorInitial}</div>`

  const mediaHtml = (video
    ? `<video src="${esc(video.url)}" controls playsinline preload="metadata" class="media"></video>`
    : '') + (images.length
    ? `<div class="imgs">${images.map((m) => `<img src="${esc(m.url)}" alt="">`).join('')}</div>`
    : '')

  const refs = []
  if (post.boat_ref) refs.push(`⛵ ${esc(post.boat_ref)}`)
  if (post.equipment_ref) refs.push(`📦 ${esc(post.equipment_ref)}`)

  const bodyHtml = `
    <article class="card">
      <div class="author">${authorHtml}<div class="name">${esc(post.author_name || 'Skipily')}</div>
        ${post.kind === 'product' ? '<span class="badge">Produktvorstellung</span>' : ''}</div>
      ${mediaHtml}
      <div class="content">
        <h1>${esc(post.title)}</h1>
        ${post.subtitle ? `<p class="sub">${esc(post.subtitle)}</p>` : ''}
        ${refs.length ? `<p class="refs">${refs.join('&nbsp;&nbsp;')}</p>` : ''}
        ${post.body ? `<p class="body">${esc(post.body)}</p>` : ''}
      </div>
    </article>` + downloadBlock()

  res.status(200).send(shell({
    title: post.title || 'Skipily',
    description: description || 'Tipps & Tricks für Bootseigner',
    image, largeImage: !!postImage, url: pageUrl, bodyHtml,
    images: imageUrls, video: videoUrl,
  }))
}

function downloadBlock() {
  return `
    <section class="cta">
      <div class="cta-title">Skipily: Tipps &amp; Tricks für Bootseigner</div>
      <p class="cta-sub">Lösungen aus der Community, Ausrüstungsverwaltung, Wartung, Shop und mehr. Hol dir die App.</p>
      <div class="cta-btns">
        <a class="btn light" href="${APP_STORE_URL}" target="_blank" rel="noopener"> App Store</a>
        <a class="btn" href="${WEB_APP_URL}" target="_blank" rel="noopener">Web-App öffnen</a>
      </div>
      <p class="cta-note">Android: nutze die Web-App unter app.skipily.app</p>
    </section>`
}

function shell({ title, description, image, largeImage, url, bodyHtml, images, video }) {
  // Mehrere og:image (Poster zuerst, dann alle Fotos, dedupliziert). Facebook &
  // Co. zeigen so eine Bildergalerie; das erste Bild bleibt das Hauptbild.
  const imgSet = [];
  const addImg = (u) => { if (u && !imgSet.includes(u)) imgSet.push(u); };
  addImg(image);
  (Array.isArray(images) ? images : []).forEach(addImg);

  const og = [
    `<meta property="og:type" content="${video ? 'video.other' : 'article'}">`,
    `<meta property="og:site_name" content="Skipily">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    ...imgSet.map((u) => `<meta property="og:image" content="${esc(u)}">`),
    // Video im Preview (Facebook/X spielen es inline ab); Poster = erstes Bild.
    video ? `<meta property="og:video" content="${esc(video)}">` : '',
    video ? `<meta property="og:video:secure_url" content="${esc(video)}">` : '',
    video ? `<meta property="og:video:type" content="video/mp4">` : '',
    video ? `<meta property="og:video:width" content="1280">` : '',
    video ? `<meta property="og:video:height" content="720">` : '',
    `<meta name="twitter:card" content="${image && largeImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
  ].filter(Boolean).join('\n    ')

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Skipily</title>
<meta name="description" content="${esc(description)}">
${og}
<link rel="canonical" href="${esc(url)}">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f1f5f9; color:#0f172a; font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { background:#fff; border-bottom:1px solid #e2e8f0; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; position:sticky; top:0; z-index:10; }
  .brand { display:flex; align-items:center; gap:10px; text-decoration:none; color:#0B1D3A; }
  .brand-logo { border-radius:9px; display:block; }
  .brand-text { display:flex; flex-direction:column; line-height:1.15; }
  .brand-name { font-weight:800; font-size:18px; }
  .brand-slogan { font-size:12px; color:#5b6b85; font-weight:600; }
  .head-actions { display:flex; gap:8px; flex-shrink:0; }
  .btn-sm { text-decoration:none; font-weight:700; font-size:13px; padding:8px 12px; border-radius:10px; white-space:nowrap; }
  .btn-sm.primary { background:#0066FF; color:#fff; }
  .btn-sm.light { background:#F5F7FA; color:#0B1D3A; border:1px solid #dbe2ea; }
  @media (max-width:520px){ .brand-slogan { display:none; } .btn-sm { padding:8px 10px; } }
  main { max-width:680px; margin:0 auto; padding:16px; }
  .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; }
  .author { display:flex; align-items:center; gap:10px; padding:14px 16px 0; }
  .avatar { width:36px; height:36px; border-radius:50%; object-fit:cover; }
  .avatar.ph { background:#e2e8f0; color:#475569; display:flex; align-items:center; justify-content:center; font-weight:700; }
  .name { font-weight:700; }
  .badge { margin-left:auto; font-size:12px; font-weight:700; color:#1d4ed8; background:#eff6ff; padding:3px 10px; border-radius:999px; }
  .media { width:calc(100% - 32px); margin:12px 16px 0; border-radius:12px; background:#000; max-height:460px; }
  .imgs { display:flex; gap:8px; overflow-x:auto; padding:12px 16px 0; }
  .imgs img { height:220px; max-width:100%; object-fit:cover; border-radius:12px; flex:0 0 auto; }
  .content { padding:16px; }
  h1 { font-size:24px; margin:0 0 4px; line-height:1.2; }
  .sub { color:#475569; font-weight:600; margin:0 0 8px; }
  .refs { font-size:13px; color:#64748b; margin:0 0 10px; }
  .body { white-space:pre-wrap; color:#334155; font-size:16px; line-height:1.55; margin:0; }
  .muted { color:#64748b; }
  .cta { background:#0B1D3A; color:#fff; border-radius:16px; padding:20px; margin-top:16px; text-align:center; }
  .cta-title { font-size:18px; font-weight:800; margin-bottom:4px; }
  .cta-sub { color:#cbd5e1; margin:0 0 14px; font-size:14px; }
  .cta-btns { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
  .btn { background:#0066FF; color:#fff; text-decoration:none; font-weight:700; padding:10px 16px; border-radius:12px; display:inline-block; }
  .btn.light { background:#fff; color:#0B1D3A; }
  .cta-note { color:#64748b; font-size:12px; margin:12px 0 0; }
  main { padding-bottom:92px; }
  .install-bar { position:fixed; left:0; right:0; bottom:0; z-index:50; display:flex; align-items:center; gap:12px;
    max-width:680px; margin:0 auto; padding:10px 14px; background:#0B1D3A; color:#fff;
    border-radius:16px 16px 0 0; box-shadow:0 -6px 24px rgba(0,0,0,0.25); }
  .install-txt { display:flex; flex-direction:column; line-height:1.2; flex:1; min-width:0; }
  .install-txt strong { font-size:15px; }
  .install-txt span { font-size:12px; color:#cbd5e1; }
  .install-btn { flex:0 0 auto; background:#0066FF; color:#fff; text-decoration:none; font-weight:800;
    padding:11px 16px; border-radius:12px; font-size:14px; white-space:nowrap; }
  @media (max-width:520px){ .install-txt span { display:none; } }
</style>
</head>
<body>
  <header>
    <a class="brand" href="${SITE_URL}">
      <img class="brand-logo" src="${LOGO_URL}" alt="Skipily" width="34" height="34">
      <span class="brand-text">
        <span class="brand-name">Skipily</span>
        <span class="brand-slogan">Dein Boot. Dein Assistent. Deine Community.</span>
      </span>
    </a>
    <div class="head-actions">
      <a class="btn-sm light" href="${APP_STORE_URL}" target="_blank" rel="noopener"> App Store</a>
      <a class="btn-sm primary" href="${WEB_APP_URL}" target="_blank" rel="noopener">Web-App</a>
    </div>
  </header>
  <main>${bodyHtml}</main>

  <!-- Immer sichtbare Install-Leiste: macht Betrachter auf die App aufmerksam
       und führt plattformgerecht zur Installation (iOS App Store, sonst Web-App). -->
  <div class="install-bar" id="install-bar">
    <img src="${LOGO_URL}" alt="Skipily" width="40" height="40" style="border-radius:10px;flex:0 0 auto;">
    <div class="install-txt">
      <strong>Skipily App</strong>
      <span>Alles rund ums Boot in einer App.</span>
    </div>
    <a class="install-btn" id="install-link" href="${WEB_APP_URL}" target="_blank" rel="noopener">App installieren</a>
  </div>
  <script>
    (function () {
      try {
        var ua = navigator.userAgent || '';
        var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && 'ontouchend' in document);
        var link = document.getElementById('install-link');
        if (link) {
          if (isIOS) { link.href = '${APP_STORE_URL}'; link.textContent = 'Im App Store laden'; }
          else { link.href = '${WEB_APP_URL}'; link.textContent = 'App jetzt öffnen'; }
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`
}
