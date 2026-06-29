// Skipily Website — statischer Assembler (Phase 1: Home DE/EN).
// Wiederverwendet die vorhandenen Inhalte aus website-skipily/ + skipily-style.css,
// umrahmt sie mit gemeinsamem Header/Footer + Sprachumschalter und schreibt
// statisches HTML nach dist/. Deploy: dist/ als statische Vercel-Site.
// Aufruf: node skipily-web/build.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'website-skipily');
const OUT = path.join(__dirname, 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'en'), { recursive: true });

// CSS übernehmen (Theme-Styles) + Site-CSS (Header/Footer) schreiben
fs.copyFileSync(path.join(SRC, 'skipily-style.css'), path.join(OUT, 'skipily-style.css'));

const SITE_CSS = `
/* Schrift laut Style-Guide (wie auf der bisherigen skipily.app) */
body{font-family:'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.sk-h1,.sk-h2,.sk-h3,.sk-hero h1{font-family:'Roboto Slab','Roboto',Georgia,serif;}

/* Header / Footer / Sprachumschalter — ergänzt skipily-style.css */
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
`;
fs.writeFileSync(path.join(OUT, 'site.css'), SITE_CSS);

const LOGO = 'https://provider.skipily.app/icon-192.png';

const STR = {
  de: { nav_features: 'Funktionen', nav_plus: 'Plus', nav_provider: 'Für Anbieter', nav_faq: 'FAQ',
        imprint: 'Impressum', privacy: 'Datenschutz', terms: 'AGB',
        home: '/', enHref: '/en/', foot: 'Die App für Bootseigner.' },
  en: { nav_features: 'Features', nav_plus: 'Plus', nav_provider: 'For providers', nav_faq: 'FAQ',
        imprint: 'Imprint', privacy: 'Privacy', terms: 'Terms',
        home: '/en/', enHref: '/en/', foot: 'The app for boat owners.' },
};

function header(lang) {
  const s = STR[lang];
  const deActive = lang === 'de' ? ' class="active"' : '';
  const enActive = lang === 'en' ? ' class="active"' : '';
  const base = lang === 'en' ? '/en/' : '/';
  return `<header class="sk-topbar">
  <a class="brand" href="${base}"><img src="${LOGO}" alt="Skipily">SKIPILY</a>
  <nav class="sk-topnav">
    <a class="muted hide-sm" href="${base}#plus">${s.nav_plus}</a>
    <a class="muted hide-sm" href="https://provider.skipily.app">${s.nav_provider}</a>
    <span class="sk-lang"><a href="/"${deActive}>DE</a><a href="/en/"${enActive}>EN</a></span>
  </nav>
</header>`;
}

function footer(lang) {
  const s = STR[lang];
  // Rechtstexte zeigen vorerst auf die bestehende (WordPress-)Seite, bis die
  // statischen Rechtsseiten in Phase 2 gebaut sind.
  return `<footer class="sk-sitefooter">
  <p class="tag">ALWAYS · SAFE · READY TO SAIL</p>
  <p>${s.foot}</p>
  <p>
    <a href="https://skipily.app/impressum">${s.imprint}</a> ·
    <a href="https://skipily.app/datenschutz">${s.privacy}</a> ·
    <a href="https://skipily.app/agb">${s.terms}</a>
  </p>
  <p>© ${new Date().getFullYear()} SKIPILY GmbH</p>
</footer>`;
}

function doc({ lang, title, desc, body }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="icon" href="${LOGO}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=Roboto+Slab:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="alternate" hreflang="de" href="https://skipily.app/">
<link rel="alternate" hreflang="en" href="https://skipily.app/en/">
<link rel="stylesheet" href="/skipily-style.css">
<link rel="stylesheet" href="/site.css">
</head>
<body>
${header(lang)}
${body}
${footer(lang)}
</body>
</html>
`;
}

// Home-Inhalte (Fragmente mit sk-* Sektionen) übernehmen
const deHome = fs.readFileSync(path.join(SRC, 'skipily-home.html'), 'utf8');
const enHome = fs.readFileSync(path.join(SRC, 'en', 'skipily-home.html'), 'utf8');

fs.writeFileSync(path.join(OUT, 'index.html'), doc({
  lang: 'de',
  title: 'Skipily — Dein Boot. Dein Assistent. Deine Community.',
  desc: 'Skipily: Werften, Service & Shops auf der Karte, 1:1-Ersatzteilsuche, Wartungsplanung und ein KI-Assistent, der dein Boot kennt.',
  body: deHome,
}));
fs.writeFileSync(path.join(OUT, 'en', 'index.html'), doc({
  lang: 'en',
  title: 'Skipily — Your boat. Your assistant. Your community.',
  desc: 'Skipily: boatyards, services & shops on the map, 1:1 spare-part search, maintenance planning and an AI assistant that knows your boat.',
  body: enHome,
}));

console.log('✓ dist/index.html');
console.log('✓ dist/en/index.html');
console.log('✓ skipily-style.css + site.css');
console.log('\\nPhase 1 (Home DE/EN) gebaut nach skipily-web/dist/');
