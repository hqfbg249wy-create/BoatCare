// Skipily Website — statischer Assembler.
// Phase 1: Home (DE/EN). Phase 2: FAQ (live aus Supabase app_faqs + FAQPage-
// Schema), Rechtstexte (Impressum/Datenschutz/AGB) + Konto-Lösch-Seite.
// Aufruf: node skipily-web/build.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'website-skipily');
const OUT = path.join(__dirname, 'dist');

const SUPA_URL = 'https://vcjwlyqkfkszumdrfvtm.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ';

const LOGO = 'https://provider.skipily.app/icon-192.png';

const STR = {
  de: { plus: 'Plus', pricing: 'Preise', provider: 'Für Anbieter', faq: 'FAQ',
        imprint: 'Impressum', privacy: 'Datenschutz', terms: 'AGB', del: 'Konto löschen',
        foot: 'Die App für Bootseigner.' },
  en: { plus: 'Plus', pricing: 'Pricing', provider: 'For providers', faq: 'FAQ',
        imprint: 'Imprint', privacy: 'Privacy', terms: 'Terms', del: 'Delete account',
        foot: 'The app for boat owners.' },
};
// Slugs je Sprache
const URLS = {
  de: { home: '/', pricing: '/preise', faq: '/faq', imprint: '/impressum', privacy: '/datenschutz', terms: '/agb', del: '/account-deletion' },
  en: { home: '/en/', pricing: '/en/pricing', faq: '/en/faq', imprint: '/en/imprint', privacy: '/en/privacy', terms: '/en/terms', del: '/account-deletion' },
};
const FAQ_CAT_LABELS = {
  de: { general: 'Allgemein', getting_started: 'Erste Schritte', features: 'Funktionen', ai: 'KI-Assistent', plus: 'Skipily Plus', account: 'Konto', privacy: 'Datenschutz' },
  en: { general: 'General', getting_started: 'Getting started', features: 'Features', ai: 'AI assistant', plus: 'Skipily Plus', account: 'Account', privacy: 'Privacy' },
};
const FAQ_CAT_ORDER = ['general', 'getting_started', 'features', 'ai', 'plus', 'account', 'privacy'];

const SITE_CSS = `
/* Schrift laut Style-Guide (wie auf der bisherigen skipily.app) */
body{font-family:'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.sk-h1,.sk-h2,.sk-h3,.sk-hero h1{font-family:'Roboto',-apple-system,'Segoe UI',sans-serif;}

/* Header / Footer / Sprachumschalter */
.sk-topbar{position:sticky;top:0;z-index:50;background:rgba(11,29,58,.92);backdrop-filter:saturate(140%) blur(8px);
  display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid #1b2f52;}
.sk-topbar a{color:#fff;text-decoration:none;}
.sk-topbar .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:2px;font-size:15px;}
.sk-topbar .brand img{width:30px;height:30px;border-radius:7px;display:block;}
.sk-topnav{display:flex;align-items:center;gap:18px;font-size:14px;}
.sk-topnav .muted{color:#cbd5e1;}
.sk-lang{display:flex;gap:6px;}
.sk-lang a{border:1px solid #27457a;border-radius:7px;padding:3px 9px;font-size:12px;font-weight:700;color:#cbd5e1;}
.sk-lang a.active{background:#f97316;border-color:#f97316;color:#0B1D3A;}
.sk-sitefooter{background:#0B1D3A;color:#94a3b8;text-align:center;padding:34px 20px;font-size:13px;line-height:1.9;}
.sk-sitefooter a{color:#94a3b8;}
.sk-sitefooter .tag{color:#f97316;font-weight:700;letter-spacing:2px;font-size:12px;}
@media(max-width:560px){.sk-topnav{gap:10px;font-size:13px;} .sk-topnav .hide-sm{display:none;}}

/* Rechtstexte + FAQ */
.sk-legal{max-width:820px;margin:0 auto;padding:42px 22px 64px;color:#1a1a2e;line-height:1.7;}
.sk-legal h1{font-family:'Roboto',sans-serif;font-size:1.9rem;color:#0B1D3A;margin:0 0 .4rem;}
.sk-legal h2{font-family:'Roboto',sans-serif;font-size:1.25rem;color:#0B1D3A;margin-top:2rem;border-bottom:2px solid #f97316;padding-bottom:.35rem;}
.sk-legal h3,.sk-legal h4{color:#0B1D3A;margin-top:1.4rem;}
.sk-legal a{color:#f97316;}
.sk-legal table{border-collapse:collapse;width:100%;font-size:.92rem;}
.sk-legal th,.sk-legal td{border:1px solid #e2e8f0;padding:8px;text-align:left;}
.sk-legal .warn{background:#fef2f2;border-left:4px solid #ef4444;padding:.75rem 1rem;border-radius:4px;margin:1rem 0;font-size:.9rem;}
.sk-legal .highlight{background:#fff7ed;border-left:4px solid #f97316;padding:.75rem 1rem;border-radius:4px;margin:1rem 0;}
.sk-legal .revoke-box{background:#eff6ff;border:1px solid #93c5fd;padding:1rem 1.25rem;border-radius:8px;margin:1.5rem 0;}
.sk-faq-cat{font-family:'Roboto',sans-serif;color:#0B1D3A;font-size:1.2rem;margin:1.8rem 0 .6rem;}
.sk-faq-item{border:1px solid #e2e8f0;border-radius:10px;margin:8px 0;background:#fff;overflow:hidden;}
.sk-faq-item summary{cursor:pointer;padding:14px 16px;font-weight:600;color:#0B1D3A;list-style:none;}
.sk-faq-item summary::-webkit-details-marker{display:none;}
.sk-faq-item summary::after{content:'+';float:right;color:#f97316;font-weight:700;}
.sk-faq-item[open] summary::after{content:'–';}
.sk-faq-item .a{padding:0 16px 14px;color:#334155;}

/* Preisvergleich (Spaltendarstellung) */
.sk-pricing{max-width:1120px;margin:0 auto;padding:40px 18px 8px;color:#0B1D3A;}
.sk-pricing .lead{max-width:720px;margin:.2rem 0 0;color:#475569;line-height:1.6;}
.sk-pricing h1{font-family:'Roboto',sans-serif;font-size:2rem;margin:0 0 .3rem;}
.sk-price-block{margin:38px 0 6px;}
.sk-price-block .blockhead{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:0 0 4px;}
.sk-price-block h2{font-family:'Roboto',sans-serif;font-size:1.45rem;color:#0B1D3A;margin:0;
  border-bottom:3px solid #f97316;padding-bottom:.25rem;}
.sk-price-block .blocksub{color:#64748b;font-size:.95rem;}
.sk-price-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:16px;
  border:1px solid #e2e8f0;border-radius:14px;}
.sk-price-table{border-collapse:separate;border-spacing:0;width:100%;min-width:720px;font-size:.9rem;}
.sk-price-table th,.sk-price-table td{padding:12px 14px;text-align:center;border-bottom:1px solid #eef2f7;}
.sk-price-table thead th{vertical-align:top;background:#f8fafc;position:sticky;top:0;padding-top:26px;}
.sk-price-table .feat{text-align:left;font-weight:500;color:#334155;position:sticky;left:0;background:#fff;
  min-width:230px;box-shadow:1px 0 0 #eef2f7;}
.sk-price-table thead .feat{background:#f8fafc;}
.sk-price-table .tier{font-family:'Roboto',sans-serif;}
.sk-price-table .tier .name{display:block;font-weight:800;color:#0B1D3A;font-size:1rem;}
.sk-price-table .tier .aud{display:block;color:#64748b;font-size:.72rem;font-weight:500;margin:3px 0 8px;line-height:1.25;}
.sk-price-table .tier .price{display:block;font-weight:800;color:#0B1D3A;font-size:1.15rem;}
.sk-price-table .tier .per{display:block;color:#94a3b8;font-size:.72rem;font-weight:500;}
.sk-price-table .tier .year{display:block;color:#f97316;font-size:.72rem;font-weight:600;margin-top:2px;}
.sk-price-table .tier .trial{display:block;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;
  border-radius:999px;font-size:.66rem;font-weight:700;margin:8px auto 0;padding:2px 8px;width:fit-content;}
.sk-price-table tbody tr:hover td,.sk-price-table tbody tr:hover .feat{background:#fffaf5;}
.sk-price-table .yes{color:#16a34a;font-weight:700;font-size:1.05rem;}
.sk-price-table .no{color:#cbd5e1;}
.sk-price-table .txt{color:#0B1D3A;font-weight:600;font-size:.82rem;}
.sk-price-table col.hot,.sk-col-hot{background:#fff7ed;}
.sk-price-table thead th.hot{background:#ffedd5;}
.sk-price-table .hotbadge{position:absolute;top:5px;left:50%;transform:translateX(-50%);z-index:1;
  background:#f97316;color:#fff;font-size:.62rem;font-weight:800;letter-spacing:.5px;padding:2px 10px;
  border-radius:999px;text-transform:uppercase;white-space:nowrap;box-shadow:0 2px 6px rgba(249,115,22,.35);}
.sk-price-hint{color:#94a3b8;font-size:.8rem;margin:10px 2px 0;}
.sk-price-cta{text-align:center;margin:26px 0 4px;}
.sk-price-cta a{display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:700;
  padding:13px 28px;border-radius:10px;}
@media(max-width:560px){.sk-pricing h1{font-size:1.6rem;}.sk-price-scroll .hint-swipe{display:block;}}
`;

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// WordPress-Bild-URLs durch selbst gehostete englische Screenshots ersetzen
// (entfernt zugleich die wp-content-Abhängigkeit).
const IMG_MAP = {
  'cropped-cropped-Skipily_Icon_512.png': '/assets/logo.png',
  'screenshot-karte.png': '/assets/feature-map.jpg',
  'screenshot-ersatzteile-scaled.png': '/assets/feature-parts.jpg',
  'screenshot-anfrage-scaled.png': '/assets/feature-request.jpg',
  'screenshot-wartung-scaled.png': '/assets/feature-maintenance.jpg',
  'screenshot-ki-scaled.png': '/assets/feature-ai.jpg',
  'screenshot-bewertungen-scaled.png': '/assets/feature-reviews.jpg',
};
function localizeImages(html) {
  return html.replace(/https:\/\/skipily\.app\/wp-content\/uploads\/[0-9/]+\/([A-Za-z0-9_-]+\.(?:png|jpe?g))/g,
    (m, file) => IMG_MAP[file] || m);
}

function header(lang) {
  const s = STR[lang], u = URLS[lang];
  return `<header class="sk-topbar">
  <a class="brand" href="${u.home}"><img src="${LOGO}" alt="Skipily">SKIPILY</a>
  <nav class="sk-topnav">
    <a class="muted hide-sm" href="${u.pricing}">${s.pricing}</a>
    <a class="muted hide-sm" href="${u.faq}">${s.faq}</a>
    <a class="muted hide-sm" href="https://provider.skipily.app">${s.provider}</a>
    <span class="sk-lang"><a href="/"${lang === 'de' ? ' class="active"' : ''}>DE</a><a href="/en/"${lang === 'en' ? ' class="active"' : ''}>EN</a></span>
  </nav>
</header>`;
}

function footer(lang) {
  const s = STR[lang], u = URLS[lang];
  return `<footer class="sk-sitefooter">
  <p class="tag">ALWAYS · SAFE · READY TO SAIL</p>
  <p>${s.foot}</p>
  <p>
    <a href="${u.pricing}">${s.pricing}</a> ·
    <a href="${u.imprint}">${s.imprint}</a> ·
    <a href="${u.privacy}">${s.privacy}</a> ·
    <a href="${u.terms}">${s.terms}</a> ·
    <a href="${u.del}">${s.del}</a>
  </p>
  <p>© ${new Date().getFullYear()} SKIPILY GmbH</p>
</footer>`;
}

function doc({ lang, title, desc, body, jsonld }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="${LOGO}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<link rel="alternate" hreflang="de" href="https://skipily.app/">
<link rel="alternate" hreflang="en" href="https://skipily.app/en/">
<link rel="stylesheet" href="/skipily-style.css">
<link rel="stylesheet" href="/site.css">${jsonld ? `\n<script type="application/ld+json">${jsonld}</script>` : ''}
</head>
<body>
${header(lang)}
${body}
${footer(lang)}
</body>
</html>
`;
}

// Skipily-gebrandete Danke-/Bestätigungsseite — Ziel der CleverReach-Weiterleitung.
function dankeBody(lang) {
  const t = lang === 'de' ? {
    h: 'Fast geschafft!',
    p: 'Bitte bestätige deine Anmeldung über den Link in der E-Mail, die wir dir gerade geschickt haben. Erst danach bist du dabei.',
    note: 'Keine Mail bekommen? Schau auch im Spam-Ordner nach.',
    btn: 'Zurück zur Startseite',
  } : {
    h: 'Almost there!',
    p: 'Please confirm your subscription via the link in the email we just sent you. Only then are you in.',
    note: 'No email? Please also check your spam folder.',
    btn: 'Back to homepage',
  };
  const home = URLS[lang].home;
  return `<section class="sk-section sk-section-light" style="min-height:60vh;display:flex;align-items:center;">
  <div class="sk-container sk-narrow sk-center" style="max-width:560px;margin:0 auto;text-align:center;padding:48px 22px;">
    <img src="${LOGO}" alt="Skipily" style="width:72px;height:72px;border-radius:16px;box-shadow:0 8px 24px rgba(11,29,58,.18);margin-bottom:22px;">
    <h1 class="sk-h1" style="color:#0B1D3A;font-size:2rem;margin:0 0 .6rem;">${t.h}</h1>
    <p style="color:#334155;font-size:1.08rem;line-height:1.7;margin:0 auto 1.4rem;max-width:440px;">${t.p}</p>
    <p style="color:#64748b;font-size:.92rem;margin:0 0 1.8rem;">${t.note}</p>
    <a href="${home}" class="sk-btn sk-btn-primary" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:10px;">${t.btn}</a>
  </div>
</section>`;
}

// Preisvergleich als Spaltendarstellung (Bootseigner + Service-Anbieter).
// Quelle: "Skipily Go/BoactCare Standard und Premiumfunktion.xlsx".
function pricingBody(lang) {
  const de = lang === 'de';
  const YES = true, NO = false;
  const t = de ? {
    h1: 'Preise & Leistungen', title2: 'Transparent vergleichen',
    lead: 'Was steckt in jedem Tarif? Vergleiche alle Funktionen Spalte für Spalte — für Bootseigner und für Service-Anbieter.',
    ownersH: 'Für Bootseigner', ownersSub: 'Vom kostenlosen Einstieg bis Skipily Plus.',
    provH: 'Für Service-Anbieter', provSub: 'Von der Basis-Listung bis zum vollen Marktplatz-Zugang.',
    feature: 'Funktion', pop: 'Beliebt', free: 'kostenlos', mo: '/ Monat', trial: '7 Tage gratis testen',
    yr: (y) => `oder ${y} €/Jahr`, hintSwipe: '← Zum Vergleichen seitlich wischen →',
    ctaO: 'Skipily App laden', ctaP: 'Anbieter werden',
    note: 'Alle Preise inkl. gesetzl. USt. „Künftig" = in Entwicklung. Es gilt das jeweils in der App/im Portal angezeigte Angebot.',
  } : {
    h1: 'Pricing & features', title2: 'Compare transparently',
    lead: 'What is included in each plan? Compare every feature column by column — for boat owners and for service providers.',
    ownersH: 'For boat owners', ownersSub: 'From a free start to Skipily Plus.',
    provH: 'For service providers', provSub: 'From a basic listing to full marketplace access.',
    feature: 'Feature', pop: 'Popular', free: 'free', mo: '/ month', trial: '7-day free trial',
    yr: (y) => `or €${y}/year`, hintSwipe: '← Swipe sideways to compare →',
    ctaO: 'Get the Skipily app', ctaP: 'Become a provider',
    note: 'All prices incl. statutory VAT. “Upcoming” = in development. The offer shown in the app/portal at the time applies.',
  };

  const owners = {
    tiers: de ? [
      { name: 'Free', aud: 'Ausprobieren', price: '0 €' },
      { name: 'Free +', aud: 'mit Registrierung', price: '0 €' },
      { name: 'Skipily Basic', aud: 'Skipper', price: '1,99 €', per: t.mo, year: t.yr('19,99') },
      { name: 'Skipily Plus', aud: 'Skipper & Eignergemeinschaften', price: '4,99 €', per: t.mo, year: t.yr('49'), hot: true },
    ] : [
      { name: 'Free', aud: 'Try it', price: '€0' },
      { name: 'Free +', aud: 'with registration', price: '€0' },
      { name: 'Skipily Basic', aud: 'Skippers', price: '€1.99', per: t.mo, year: t.yr('19.99') },
      { name: 'Skipily Plus', aud: 'Skippers & owner groups', price: '€4.99', per: t.mo, year: t.yr('49'), hot: true },
    ],
    // Reihenfolge: ERST die in „Free +" enthaltenen Grundfunktionen (grüner
    // Haken) untereinander, DANN KI und die bezahlten Mehrwerte — so ist auf
    // einen Blick sichtbar, was Basic und Plus jeweils zusätzlich bringen.
    // Spalten: [Free, Free+, Basic, Plus]
    rows: [
      // ── in Free + enthalten ──
      [de ? 'Karte mit Providern' : 'Provider map', [YES, YES, YES, YES]],
      [de ? 'Bewertungen hinterlegen' : 'Leave reviews', [NO, YES, YES, YES]],
      [de ? 'Filter' : 'Filters', [NO, YES, YES, YES]],
      [de ? 'Direktsuche über hinterlegte Ausrüstung' : 'Direct search via saved equipment', [NO, YES, YES, YES]],
      [de ? 'Eigene Boote anlegen' : 'Add your own boats', [NO, YES, '1', '1–2']],
      [de ? 'Ausrüstung mit Wartungszyklus' : 'Equipment with maintenance cycle', [NO, YES, YES, YES]],
      [de ? 'Wartungs-Erinnerungen' : 'Maintenance reminders', [NO, YES, YES, YES]],
      [de ? 'Service-Favoriten speichern' : 'Save service favourites', [NO, YES, YES, YES]],
      // ── KI & bezahlte Mehrwerte ──
      [de ? 'KI-Boots-Assistent (Chat)' : 'AI boat assistant (chat)', [NO, de ? '10 einmalig' : '10 once', de ? '5 / Tag' : '5 / day', de ? '15 / Tag' : '15 / day']],
      [de ? 'Schadens-Foto-/Video-Analyse' : 'Damage photo/video analysis', [NO, NO, YES, YES]],
      [de ? 'Skipily-Rabatte nutzen' : 'Use Skipily discounts', [NO, NO, YES, YES]],
      [de ? 'Stärkere KI (Opus) für tiefergehende Analysen' : 'Stronger AI (Opus) for in-depth analysis', [NO, NO, NO, YES]],
      [de ? 'Family-Modus (bis zu 5 Eigner)' : 'Family mode (up to 5 owners)', [NO, NO, NO, YES]],
      [de ? 'Ausrüstung per Excel importieren (inkl. Segelmessblatt & Tauwerk)' : 'Import equipment via Excel (incl. sail sheet & rigging)', [NO, NO, NO, YES]],
      [de ? 'Wartungsreport als PDF – je Boot getrennt' : 'Maintenance report as PDF – separately per boat', [NO, NO, NO, YES]],
    ],
    cta: { href: 'https://skipily.app/clip', label: t.ctaO },
  };

  const providers = {
    tiers: de ? [
      { name: 'Basic Listing', aud: 'Grundeintrag', price: '0 €' },
      { name: 'Provider Starter', aud: 'Einstieg', price: '0 €' },
      { name: 'Provider Pro', aud: 'Shop & Anfragen', price: '79 €', per: t.mo, year: t.yr('790'), hot: true },
      { name: 'Provider Enterprise', aud: 'Voller Marktplatz-Zugang', price: '199 €', per: t.mo, year: t.yr('1.999') },
    ] : [
      { name: 'Basic Listing', aud: 'Base entry', price: '€0' },
      { name: 'Provider Starter', aud: 'Entry', price: '€0' },
      { name: 'Provider Pro', aud: 'Shop & requests', price: '€79', per: t.mo, year: t.yr('790'), hot: true },
      { name: 'Provider Enterprise', aud: 'Full marketplace access', price: '€199', per: t.mo, year: t.yr('1,999') },
    ],
    rows: [
      [de ? 'Profil- & Stammdatenpflege' : 'Profile & master data', [YES, YES, YES, YES]],
      [de ? 'Bewertungen ansehen' : 'View reviews', [NO, YES, YES, YES]],
      [de ? 'Eigenen Shop führen' : 'Run your own shop', [NO, YES, YES, YES]],
      [de ? 'Produkte im Shop' : 'Products in the shop', [NO, de ? 'bis 10' : 'up to 10', de ? 'unbegrenzt' : 'unlimited', de ? 'unbegrenzt' : 'unlimited']],
      [de ? 'Anfragen empfangen & beantworten' : 'Receive & answer requests', [NO, NO, YES, YES]],
      [de ? 'API-Zugang' : 'API access', [NO, NO, YES, YES]],
      [de ? 'Webhook-URL' : 'Webhook URL', [NO, NO, YES, YES]],
      [de ? 'Priorisierte Sichtbarkeit in der App' : 'Priority visibility in the app', [NO, NO, YES, YES]],
      [de ? 'Multi-User (mehrere Logins)' : 'Multi-user (several logins)', [NO, NO, YES, YES]],
      [de ? 'Markt-Analytics' : 'Market analytics', [NO, NO, NO, YES]],
      [de ? 'Promotions / Werbeplätze' : 'Promotions / ad slots', [NO, NO, NO, YES]],
    ],
    cta: { href: 'https://provider.skipily.app', label: t.ctaP },
  };

  const cell = (v, hot) => {
    const cls = hot ? ' sk-col-hot' : '';
    if (v === true) return `<td class="yes${cls}">✓</td>`;
    if (v === false || v == null || v === '') return `<td class="no${cls}">–</td>`;
    return `<td class="txt${cls}">${esc(v)}</td>`;
  };

  function table(block) {
    const cols = block.tiers.map(t2 => `<col${t2.hot ? ' class="hot"' : ''}>`).join('');
    const head = block.tiers.map(t2 => `<th class="tier${t2.hot ? ' hot' : ''}">${t2.hot ? `<span class="hotbadge">${t.pop}</span>` : ''}<span class="name">${esc(t2.name)}</span><span class="aud">${esc(t2.aud)}</span><span class="price">${esc(t2.price)}</span>${t2.per ? `<span class="per">${esc(t2.per)}</span>` : `<span class="per">${t.free}</span>`}${t2.year ? `<span class="year">${esc(t2.year)}</span>` : ''}${t2.trial ? `<span class="trial">🎁 ${esc(t2.trial)}</span>` : ''}</th>`).join('');
    const body = block.rows.map(([label, vals]) =>
      `<tr><th class="feat">${esc(label)}</th>${vals.map((v, i) => cell(v, block.tiers[i].hot)).join('')}</tr>`
    ).join('');
    return `<div class="sk-price-scroll"><table class="sk-price-table"><colgroup><col class="feat">${cols}</colgroup>
<thead><tr><th class="feat">${t.feature}</th>${head}</tr></thead>
<tbody>${body}</tbody></table></div>`;
  }

  function block(b, h, sub) {
    return `<section class="sk-price-block">
  <div class="blockhead"><h2>${esc(h)}</h2><span class="blocksub">${esc(sub)}</span></div>
  <p class="sk-price-hint">${t.hintSwipe}</p>
  ${table(b)}
  <div class="sk-price-cta"><a href="${b.cta.href}">${esc(b.cta.label)}</a></div>
</section>`;
  }

  return `<div class="sk-pricing">
  <h1>${t.h1}</h1>
  <p class="lead">${t.lead}</p>
  ${block(owners, t.ownersH, t.ownersSub)}
  ${block(providers, t.provH, t.provSub)}
  <p class="sk-price-hint">${t.note}</p>
</div>`;
}

function write(rel, html) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
  console.log('✓', rel);
}

// sk-legal-Fragment einbinden; volle HTML-Dokumente (AGB) auf den Body reduzieren
function legalBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let inner = m ? m[1] : html;
  if (!/class="sk-legal"/.test(inner)) inner = `<div class="sk-legal">${inner}</div>`;
  return inner;
}

async function fetchFaqs() {
  const url = `${SUPA_URL}/rest/v1/app_faqs?select=category,sort_order,question,answer,translations&is_published=eq.true&order=category,sort_order`;
  const r = await fetch(url, { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } });
  if (!r.ok) throw new Error('FAQ-Fetch HTTP ' + r.status);
  return r.json();
}

function faqLocalized(f, lang) {
  if (lang === 'de') return { q: f.question, a: f.answer };
  const t = (f.translations || {})[lang] || {};
  return { q: t.question || f.question, a: t.answer || f.answer };
}

function faqPage(faqs, lang) {
  const labels = FAQ_CAT_LABELS[lang];
  let body = `<div class="sk-legal"><h1>${lang === 'de' ? 'Häufige Fragen' : 'Frequently asked questions'}</h1>`;
  const qa = [];
  for (const cat of FAQ_CAT_ORDER) {
    const items = faqs.filter(f => f.category === cat);
    if (!items.length) continue;
    body += `<h2 class="sk-faq-cat">${esc(labels[cat] || cat)}</h2>`;
    for (const f of items) {
      const { q, a } = faqLocalized(f, lang);
      qa.push({ q, a });
      body += `<details class="sk-faq-item"><summary>${esc(q)}</summary><div class="a">${esc(a)}</div></details>`;
    }
  }
  body += '</div>';
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qa.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  });
  return { body, jsonld };
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(path.join(SRC, 'skipily-style.css'), path.join(OUT, 'skipily-style.css'));
  fs.writeFileSync(path.join(OUT, 'site.css'), SITE_CSS);
  fs.cpSync(path.join(__dirname, 'assets'), path.join(OUT, 'assets'), { recursive: true });
  // Apple App Site Association (App-Clip + Universal Links) mit ausliefern,
  // sonst 404 → App-Clip (skipily.app/clip) wird auf iOS nicht ausgelöst.
  fs.cpSync(path.join(SRC, '.well-known'), path.join(OUT, '.well-known'), { recursive: true });

  // Home
  write('index.html', doc({ lang: 'de',
    title: 'Skipily — Dein Boot. Dein Assistent. Deine Community.',
    desc: 'Skipily: Werften, Service & Shops auf der Karte, 1:1-Ersatzteilsuche, Wartungsplanung und ein KI-Assistent, der dein Boot kennt.',
    body: localizeImages(fs.readFileSync(path.join(SRC, 'skipily-home.html'), 'utf8')) }));
  write('en/index.html', doc({ lang: 'en',
    title: 'Skipily — Your boat. Your assistant. Your community.',
    desc: 'Skipily: boatyards, services & shops on the map, 1:1 spare-part search, maintenance planning and an AI assistant that knows your boat.',
    body: localizeImages(fs.readFileSync(path.join(SRC, 'en', 'skipily-home.html'), 'utf8')) }));

  // Preise & Leistungen (Spaltenvergleich, DE + EN)
  write('preise/index.html', doc({ lang: 'de',
    title: 'Preise & Leistungen — Skipily',
    desc: 'Alle Skipily-Tarife im Spaltenvergleich: Free, Basic & Plus für Bootseigner sowie Basic, Starter, Pro & Enterprise für Service-Anbieter.',
    body: pricingBody('de') }));
  write('en/pricing/index.html', doc({ lang: 'en',
    title: 'Pricing & features — Skipily',
    desc: 'All Skipily plans compared column by column: Free, Basic & Plus for boat owners plus Basic, Starter, Pro & Enterprise for service providers.',
    body: pricingBody('en') }));

  // Newsletter-Danke (Ziel der CleverReach-Weiterleitung nach Anmeldung)
  write('newsletter-danke/index.html', doc({ lang: 'de',
    title: 'Fast geschafft — Skipily Newsletter', desc: 'Bitte bestätige deine Newsletter-Anmeldung.',
    body: dankeBody('de') }));
  write('en/newsletter-thanks/index.html', doc({ lang: 'en',
    title: 'Almost there — Skipily newsletter', desc: 'Please confirm your newsletter subscription.',
    body: dankeBody('en') }));

  // Rechtstexte
  const legal = [
    ['de', 'impressum/index.html', 'skipily-impressum.html', 'Impressum — Skipily'],
    ['de', 'datenschutz/index.html', 'skipily-datenschutz.html', 'Datenschutz — Skipily'],
    ['de', 'agb/index.html', 'skipily-agb.html', 'AGB — Skipily'],
    ['en', 'en/imprint/index.html', 'en/skipily-impressum.html', 'Imprint — Skipily'],
    ['en', 'en/privacy/index.html', 'en/skipily-datenschutz.html', 'Privacy — Skipily'],
    ['en', 'en/terms/index.html', 'en/skipily-agb.html', 'Terms — Skipily'],
  ];
  for (const [lang, out, file, title] of legal) {
    const html = fs.readFileSync(path.join(SRC, file), 'utf8');
    write(out, doc({ lang, title, desc: title, body: legalBody(html) }));
  }

  // Konto löschen (eigenständig, bereits zweisprachig) — 1:1 übernehmen
  write('account-deletion/index.html', fs.readFileSync(path.join(SRC, 'account-deletion.html'), 'utf8'));

  // Clip-Aufsteller-Landing (QR-Ziel skipily.app/clip) — eigenständig,
  // plattform-erkennend: iPhone → App Store, Android → Web-App.
  write('clip/index.html', fs.readFileSync(path.join(SRC, 'skipily-clip.html'), 'utf8'));

  // Link-in-Bio-Landing (skipily.app/start) — für Social-Profile.
  const social = path.join(ROOT, 'marketing', 'social');
  write('start/index.html', fs.readFileSync(path.join(social, 'link-in-bio.html'), 'utf8'));
  for (const img of ['app-map.jpg', 'app-boats.jpg', 'app-ki.jpg']) {
    fs.mkdirSync(path.join(OUT, 'start', 'assets'), { recursive: true });
    fs.copyFileSync(path.join(social, 'assets', img), path.join(OUT, 'start', 'assets', img));
  }

  // FAQ live aus Supabase
  try {
    const faqs = await fetchFaqs();
    for (const [lang, out] of [['de', 'faq/index.html'], ['en', 'en/faq/index.html']]) {
      const { body, jsonld } = faqPage(faqs, lang);
      write(out, doc({ lang, title: lang === 'de' ? 'FAQ — Häufige Fragen | Skipily' : 'FAQ | Skipily',
        desc: lang === 'de' ? 'Antworten auf häufige Fragen zu Skipily.' : 'Answers to frequently asked questions about Skipily.',
        body, jsonld }));
    }
    console.log(`  (${faqs.length} FAQ aus Supabase)`);
  } catch (e) {
    console.warn('⚠ FAQ-Build übersprungen:', e.message);
  }

  // Sitemap + robots.txt
  const SITE = 'https://skipily.app';
  const routes = ['/', '/preise', '/faq', '/impressum', '/datenschutz', '/agb', '/account-deletion',
    '/en/', '/en/pricing', '/en/faq', '/en/imprint', '/en/privacy', '/en/terms'];
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    routes.map(r => `  <url><loc>${SITE}${r}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap);
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  console.log('✓ sitemap.xml + robots.txt');

  console.log('\\nBuild fertig → skipily-web/dist/');
}

main();
