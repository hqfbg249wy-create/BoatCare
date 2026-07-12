// Baut alle Social-Media-Grafiken als eigenstaendige SVG-Dateien mit
// eingebettetem Original-Logo (icon-192.png als base64 Data-URI).
// Aufruf:  node marketing/social/build-graphics.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'marketing', 'social', 'graphics');
fs.mkdirSync(OUT, { recursive: true });

const b64 = fs.readFileSync(path.join(ROOT, 'provider-portal', 'public', 'icon-192.png')).toString('base64');
const LOGO = 'data:image/png;base64,' + b64;
const img = (x, y, s) => `<image href="${LOGO}" xlink:href="${LOGO}" x="${x}" y="${y}" width="${s}" height="${s}"/>`;

const F = '"Arial,Helvetica,sans-serif"'.slice(1, -1); // font stack
const feedHead = (tag) =>
  `<rect x="0" y="0" width="680" height="680" fill="#0B1D3A"/>` +
  `<path d="M0,632 C200,602 430,668 680,618 L680,680 L0,680 Z" fill="#13294d"/>` +
  img(60, 44, 56) +
  `<text x="130" y="78" fill="#ffffff" font-family="${F}" font-size="30" font-weight="700" letter-spacing="6">SKIPILY</text>` +
  `<text x="132" y="99" fill="#f97316" font-family="${F}" font-size="12" font-weight="700" letter-spacing="2.5">${tag}</text>`;
const storyHead = (tag) =>
  `<rect x="0" y="0" width="680" height="1209" fill="#0B1D3A"/>` +
  `<path d="M0,1150 C200,1120 430,1192 680,1140 L680,1209 L0,1209 Z" fill="#13294d"/>` +
  img(312, 90, 56) +
  `<text x="340" y="186" fill="#ffffff" font-family="${F}" font-size="34" font-weight="700" letter-spacing="8" text-anchor="middle">SKIPILY</text>` +
  `<text x="340" y="214" fill="#f97316" font-family="${F}" font-size="13" font-weight="700" letter-spacing="3" text-anchor="middle">${tag}</text>`;
const wrap = (vb, title, inner) =>
  `<svg width="100%" viewBox="${vb}" role="img" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><title>${title}</title>${inner}</svg>\n`;

const TAG_DEFAULT = 'ALWAYS · SAFE · READY TO SAIL';
const t = (x, y, size, fill, weight, str, extra = '') =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="${F}" font-size="${size}" font-weight="${weight}"${extra}>${str}</text>`;
const cta = (w, label, footer, footerEnd = true, y = 548, py = 38) =>
  `<rect x="60" y="${y}" width="${w}" height="58" rx="29" fill="#f97316"/>` +
  t(60 + w / 2, y + py, 22, '#0B1D3A', 700, label, ' text-anchor="middle"') +
  (footerEnd
    ? t(620, y + py + 2, footer.length > 16 ? 17 : 18, '#cbd5e1', 500, footer, ' text-anchor="end"')
    : '');

// ---- Motive ----------------------------------------------------------------
const mapMotif =
  `<rect x="190" y="150" width="300" height="185" rx="16" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  [255, 340, 425].map((x) => `<line x1="${x}" y1="150" x2="${x}" y2="335" stroke="#213b66" stroke-width="1"/>`).join('') +
  [212, 274].map((y) => `<line x1="190" y1="${y}" x2="490" y2="${y}" stroke="#213b66" stroke-width="1"/>`).join('') +
  `<path d="M225,300 C285,250 365,300 455,205" fill="none" stroke="#f97316" stroke-width="3" stroke-dasharray="7 7" stroke-linecap="round"/>` +
  `<g><circle cx="250" cy="252" r="13" fill="#e2e8f0"/><polygon points="240,260 260,260 250,280" fill="#e2e8f0"/><circle cx="250" cy="252" r="5" fill="#0B1D3A"/></g>` +
  `<g><circle cx="430" cy="232" r="13" fill="#e2e8f0"/><polygon points="420,240 440,240 430,260" fill="#e2e8f0"/><circle cx="430" cy="232" r="5" fill="#0B1D3A"/></g>` +
  `<g><circle cx="340" cy="205" r="23" fill="#f97316"/><polygon points="322,221 358,221 340,252" fill="#f97316"/><circle cx="340" cy="205" r="9" fill="#ffffff"/></g>`;
const bellMotif =
  `<circle cx="330" cy="248" r="98" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  `<path d="M295,300 C295,232 312,210 330,210 C348,210 365,232 365,300 Z" fill="#ffffff"/>` +
  `<rect x="284" y="298" width="92" height="13" rx="6.5" fill="#ffffff"/><circle cx="330" cy="206" r="7" fill="#ffffff"/><circle cx="330" cy="322" r="10" fill="#ffffff"/>` +
  `<circle cx="388" cy="290" r="30" fill="#f97316"/><path d="M374,291 l9,9 l18,-20" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
const partMotif =
  `<polygon points="368,235 344,278 296,278 272,235 296,192 344,192" fill="#13294d" stroke="#f97316" stroke-width="6" stroke-linejoin="round"/>` +
  `<circle cx="320" cy="235" r="19" fill="#0B1D3A" stroke="#f97316" stroke-width="5"/>` +
  `<circle cx="402" cy="300" r="36" fill="#0B1D3A" stroke="#ffffff" stroke-width="9"/><line x1="428" y1="326" x2="460" y2="358" stroke="#ffffff" stroke-width="11" stroke-linecap="round"/>`;
const shopMotif =
  `<rect x="272" y="262" width="140" height="86" rx="6" fill="#ffffff"/><rect x="264" y="244" width="156" height="22" rx="4" fill="#f97316"/>` +
  `<rect x="322" y="304" width="40" height="44" fill="#0B1D3A"/><rect x="286" y="280" width="28" height="20" rx="3" fill="#cbd5e1"/><rect x="370" y="280" width="28" height="20" rx="3" fill="#cbd5e1"/>` +
  `<g><circle cx="342" cy="190" r="25" fill="#f97316"/><polygon points="323,207 361,207 342,242" fill="#f97316"/><circle cx="342" cy="190" r="10" fill="#ffffff"/></g>`;
const chartMotif =
  `<rect x="205" y="150" width="270" height="195" rx="16" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  `<line x1="235" y1="315" x2="445" y2="315" stroke="#27457a" stroke-width="2.5"/>` +
  `<rect x="250" y="262" width="40" height="53" fill="#cbd5e1"/><rect x="305" y="226" width="40" height="89" fill="#94a3b8"/><rect x="360" y="186" width="40" height="129" fill="#f97316"/>` +
  `<polyline points="270,250 325,214 380,178 425,166" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polygon points="425,166 411,164 419,178" fill="#ffffff"/>`;
const communityMotif =
  [[445, 235], [393, 326], [287, 326], [235, 235], [287, 144], [393, 144]]
    .map(([x, y]) => `<line x1="${x}" y1="${y}" x2="340" y2="235" stroke="#f97316" stroke-width="2.5" stroke-dasharray="6 6"/>`).join('') +
  `<g>` +
  [[445, 235], [393, 326], [287, 326], [235, 235], [287, 144], [393, 144]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="17" fill="#13294d" stroke="#cbd5e1" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="6" fill="#cbd5e1"/>`).join('') +
  `</g>` +
  `<circle cx="340" cy="235" r="46" fill="#f97316"/>` +
  `<line x1="330" y1="227" x2="353" y2="224" stroke="#ffffff" stroke-width="2.5"/><line x1="353" y1="224" x2="343" y2="249" stroke="#ffffff" stroke-width="2.5"/><line x1="343" y1="249" x2="330" y2="227" stroke="#ffffff" stroke-width="2.5"/>` +
  `<circle cx="330" cy="227" r="5" fill="#ffffff"/><circle cx="353" cy="224" r="5" fill="#ffffff"/><circle cx="343" cy="249" r="5" fill="#ffffff"/>`;

// Stern-Helfer (5-zackig)
const star = (cx, cy, R, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? R : R * 0.42;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};

// Motiv Post 7: Karte mit Lücke + großem ➕-Button (Betrieb eintragen)
const mapAddMotif =
  `<rect x="190" y="150" width="300" height="185" rx="16" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  [255, 340, 425].map((x) => `<line x1="${x}" y1="150" x2="${x}" y2="335" stroke="#213b66" stroke-width="1"/>`).join('') +
  [212, 274].map((y) => `<line x1="190" y1="${y}" x2="490" y2="${y}" stroke="#213b66" stroke-width="1"/>`).join('') +
  `<g><circle cx="245" cy="205" r="12" fill="#e2e8f0"/><polygon points="235,213 255,213 245,231" fill="#e2e8f0"/><circle cx="245" cy="205" r="4.5" fill="#0B1D3A"/></g>` +
  `<g><circle cx="315" cy="252" r="12" fill="#e2e8f0"/><polygon points="305,260 325,260 315,278" fill="#e2e8f0"/><circle cx="315" cy="252" r="4.5" fill="#0B1D3A"/></g>` +
  `<circle cx="405" cy="210" r="16" fill="none" stroke="#f97316" stroke-width="2.5" stroke-dasharray="5 5"/>` +
  `<text x="405" y="217" fill="#f97316" font-family="${F}" font-size="20" font-weight="800" text-anchor="middle">?</text>` +
  `<circle cx="470" cy="318" r="31" fill="#f97316"/>` +
  `<line x1="470" y1="303" x2="470" y2="333" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round"/>` +
  `<line x1="455" y1="318" x2="485" y2="318" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round"/>`;

// Motiv Post 8: Bewertungs-Karte mit 5 Sternen
const starMotif =
  `<rect x="205" y="158" width="270" height="160" rx="16" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  [0, 1, 2, 3, 4].map((k) => star(255 + k * 45, 210, 20, '#f97316')).join('') +
  `<rect x="238" y="258" width="204" height="11" rx="5.5" fill="#cbd5e1" opacity="0.6"/>` +
  `<rect x="238" y="282" width="150" height="11" rx="5.5" fill="#cbd5e1" opacity="0.35"/>`;

// Story-Motive (verschobene Koordinaten)
const mapMotifS =
  `<rect x="160" y="360" width="360" height="240" rx="18" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  [240, 340, 440].map((x) => `<line x1="${x}" y1="360" x2="${x}" y2="600" stroke="#213b66" stroke-width="1"/>`).join('') +
  [440, 520].map((y) => `<line x1="160" y1="${y}" x2="520" y2="${y}" stroke="#213b66" stroke-width="1"/>`).join('') +
  `<path d="M210,560 C280,500 380,560 470,425" fill="none" stroke="#f97316" stroke-width="3.5" stroke-dasharray="8 8" stroke-linecap="round"/>` +
  `<g><circle cx="235" cy="500" r="15" fill="#e2e8f0"/><polygon points="224,509 246,509 235,531" fill="#e2e8f0"/><circle cx="235" cy="500" r="6" fill="#0B1D3A"/></g>` +
  `<g><circle cx="450" cy="470" r="15" fill="#e2e8f0"/><polygon points="439,479 461,479 450,501" fill="#e2e8f0"/><circle cx="450" cy="470" r="6" fill="#0B1D3A"/></g>` +
  `<g><circle cx="340" cy="440" r="27" fill="#f97316"/><polygon points="319,459 361,459 340,496" fill="#f97316"/><circle cx="340" cy="440" r="11" fill="#ffffff"/></g>`;
const bellMotifS =
  `<circle cx="340" cy="490" r="130" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  `<path d="M298,560 C298,455 318,425 340,425 C362,425 382,455 382,560 Z" fill="#ffffff"/>` +
  `<rect x="286" y="556" width="108" height="16" rx="8" fill="#ffffff"/><circle cx="340" cy="420" r="9" fill="#ffffff"/><circle cx="340" cy="586" r="13" fill="#ffffff"/>` +
  `<circle cx="404" cy="548" r="36" fill="#f97316"/><path d="M387,549 l11,11 l21,-24" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
const partMotifS =
  `<polygon points="375,475 345,527 285,527 255,475 285,423 345,423" fill="#13294d" stroke="#f97316" stroke-width="7" stroke-linejoin="round"/>` +
  `<circle cx="315" cy="475" r="24" fill="#0B1D3A" stroke="#f97316" stroke-width="6"/>` +
  `<circle cx="420" cy="560" r="46" fill="#0B1D3A" stroke="#ffffff" stroke-width="11"/><line x1="452" y1="592" x2="492" y2="632" stroke="#ffffff" stroke-width="14" stroke-linecap="round"/>`;
const shopMotifS =
  `<rect x="250" y="470" width="180" height="120" rx="8" fill="#ffffff"/><rect x="240" y="444" width="200" height="30" rx="5" fill="#f97316"/>` +
  `<rect x="315" y="530" width="50" height="60" fill="#0B1D3A"/><rect x="268" y="496" width="36" height="26" rx="3" fill="#cbd5e1"/><rect x="376" y="496" width="36" height="26" rx="3" fill="#cbd5e1"/>` +
  `<g><circle cx="340" cy="372" r="32" fill="#f97316"/><polygon points="316,394 364,394 340,440" fill="#f97316"/><circle cx="340" cy="372" r="13" fill="#ffffff"/></g>`;
const chartMotifS =
  `<rect x="175" y="360" width="330" height="250" rx="18" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  `<line x1="235" y1="580" x2="445" y2="580" stroke="#27457a" stroke-width="3"/>` +
  `<rect x="255" y="520" width="46" height="60" fill="#cbd5e1"/><rect x="315" y="470" width="46" height="110" fill="#94a3b8"/><rect x="375" y="420" width="46" height="160" fill="#f97316"/>` +
  `<polyline points="278,505 338,460 400,415 448,400" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><polygon points="448,400 432,398 441,414" fill="#ffffff"/>`;

const communityMotifS =
  [[490, 480], [415, 610], [265, 610], [190, 480], [265, 350], [415, 350]]
    .map(([x, y]) => `<line x1="${x}" y1="${y}" x2="340" y2="480" stroke="#f97316" stroke-width="3" stroke-dasharray="7 7"/>`).join('') +
  `<g>` +
  [[490, 480], [415, 610], [265, 610], [190, 480], [265, 350], [415, 350]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="20" fill="#13294d" stroke="#cbd5e1" stroke-width="3"/><circle cx="${x}" cy="${y}" r="8" fill="#cbd5e1"/>`).join('') +
  `</g>` +
  `<circle cx="340" cy="480" r="58" fill="#f97316"/>` +
  `<line x1="327" y1="470" x2="357" y2="466" stroke="#ffffff" stroke-width="3"/><line x1="357" y1="466" x2="344" y2="500" stroke="#ffffff" stroke-width="3"/><line x1="344" y1="500" x2="327" y2="470" stroke="#ffffff" stroke-width="3"/>` +
  `<circle cx="327" cy="470" r="6" fill="#ffffff"/><circle cx="357" cy="466" r="6" fill="#ffffff"/><circle cx="344" cy="500" r="6" fill="#ffffff"/>`;

// Motiv Post 7 (Story): Karte mit Lücke + ➕-Button
const mapAddMotifS =
  `<rect x="160" y="360" width="360" height="240" rx="18" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  [240, 340, 440].map((x) => `<line x1="${x}" y1="360" x2="${x}" y2="600" stroke="#213b66" stroke-width="1"/>`).join('') +
  [440, 520].map((y) => `<line x1="160" y1="${y}" x2="520" y2="${y}" stroke="#213b66" stroke-width="1"/>`).join('') +
  `<g><circle cx="230" cy="435" r="15" fill="#e2e8f0"/><polygon points="219,444 241,444 230,466" fill="#e2e8f0"/><circle cx="230" cy="435" r="6" fill="#0B1D3A"/></g>` +
  `<g><circle cx="320" cy="500" r="15" fill="#e2e8f0"/><polygon points="309,509 331,509 320,531" fill="#e2e8f0"/><circle cx="320" cy="500" r="6" fill="#0B1D3A"/></g>` +
  `<circle cx="430" cy="440" r="19" fill="none" stroke="#f97316" stroke-width="3" stroke-dasharray="6 6"/>` +
  `<text x="430" y="449" fill="#f97316" font-family="${F}" font-size="24" font-weight="800" text-anchor="middle">?</text>` +
  `<circle cx="498" cy="580" r="36" fill="#f97316"/>` +
  `<line x1="498" y1="562" x2="498" y2="598" stroke="#ffffff" stroke-width="7.5" stroke-linecap="round"/>` +
  `<line x1="480" y1="580" x2="516" y2="580" stroke="#ffffff" stroke-width="7.5" stroke-linecap="round"/>`;

// Motiv Post 8 (Story): Bewertungs-Karte mit 5 Sternen
const starMotifS =
  `<rect x="170" y="400" width="340" height="185" rx="18" fill="#13294d" stroke="#27457a" stroke-width="1.5"/>` +
  [0, 1, 2, 3, 4].map((k) => star(228 + k * 56, 465, 26, '#f97316')).join('') +
  `<rect x="205" y="520" width="270" height="13" rx="6.5" fill="#cbd5e1" opacity="0.6"/>` +
  `<rect x="205" y="548" width="195" height="13" rx="6.5" fill="#cbd5e1" opacity="0.35"/>`;

// Headline-Helfer 3 Zeilen Feed (44px)
const h3 = (l1, l2, l3, y1 = 412) =>
  t(60, y1, 44, '#ffffff', 800, l1) + t(60, y1 + 50, 44, '#ffffff', 800, l2) + t(60, y1 + 100, 44, '#f97316', 800, l3);

const files = [];
// ---- FEED DE ----
files.push(['01-karte-de.svg', wrap('0 0 680 680', 'Skipily: Jede Werft auf einer Karte',
  feedHead(TAG_DEFAULT) + mapMotif + h3('Jede Werft.', 'Jeder Service.', 'Eine Karte.') + cta(290, 'Jetzt App laden', 'skipily.app'))]);
files.push(['02-wartung-de.svg', wrap('0 0 680 680', 'Skipily: Nie wieder Wartung vergessen',
  feedHead(TAG_DEFAULT) + bellMotif + h3('Nie wieder', 'Wartung', 'vergessen.', 438) + cta(290, 'Jetzt App laden', 'skipily.app', true, 566))]);
files.push(['03-ersatzteil-de.svg', wrap('0 0 680 680', 'Skipily: Das richtige Ersatzteil in Sekunden',
  feedHead(TAG_DEFAULT) + partMotif + h3('Das richtige', 'Ersatzteil —', 'in Sekunden.', 430) + cta(290, 'Jetzt App laden', 'skipily.app', true, 560))]);
files.push(['04-claim-de.svg', wrap('0 0 680 680', 'Skipily B2B: Werden Sie gefunden',
  feedHead('FÜR WERFTEN · SERVICE · SHOPS') + shopMotif +
  t(60, 436, 44, '#ffffff', 800, 'Werden Sie') + t(60, 486, 44, '#f97316', 800, 'gefunden.') +
  t(60, 524, 21, '#cbd5e1', 500, 'Von Bootseignern in Ihrer Region.') +
  cta(340, 'Profil beanspruchen', 'provider.skipily.app', true, 556))]);
files.push(['05-marktanalyse-de.svg', wrap('0 0 680 680', 'Skipily B2B: KI-Marktanalyse',
  feedHead('KI-MARKTANALYSE · FÜR PROFIS') + chartMotif +
  t(60, 430, 42, '#ffffff', 800, 'Wissen, was die') +
  t(60, 478, 42, '#ffffff', 800, 'Flotte <tspan fill="#f97316">wirklich</tspan>') +
  t(60, 526, 42, '#f97316', 800, 'braucht.') +
  cta(340, 'Im Provider-Portal', 'provider.skipily.app', true, 558))]);
files.push(['06-community-de.svg', wrap('0 0 680 680', 'Skipily: Mach den KI-Bootsingenieur schlauer',
  feedHead('COMMUNITY · KI-BOOTSINGENIEUR') + communityMotif +
  h3('Mach den KI-', 'Bootsingenieur', 'schlauer.').replace(/font-size="44"/g, 'font-size="43"').replace('y="412"', 'y="412"').replace('y="462"', 'y="461"').replace('y="512"', 'y="510"') +
  cta(300, 'Jetzt mitmachen', 'skipily.app', true, 546))]);
files.push(['07-eintragen-de.svg', wrap('0 0 680 680', 'Skipily: Fehlende Betriebe eintragen',
  feedHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Fehlt hier deine') +
  t(60, 480, 44, '#f97316', 800, 'Lieblingswerft?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Trag sie mit dem +-Button ein.') +
  cta(300, 'Mit + eintragen', 'skipily.app', true, 552))]);
files.push(['07-motorservice-de.svg', wrap('0 0 680 680', 'Skipily: Motorservice eintragen',
  feedHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Fehlt hier dein') +
  t(60, 480, 44, '#f97316', 800, 'Motorservice?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Trag ihn mit dem +-Button ein.') +
  cta(300, 'Mit + eintragen', 'skipily.app', true, 552))]);
files.push(['07-segelmacher-de.svg', wrap('0 0 680 680', 'Skipily: Segelmacher eintragen',
  feedHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Fehlt hier dein') +
  t(60, 480, 44, '#f97316', 800, 'Segelmacher?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Trag ihn mit dem +-Button ein.') +
  cta(300, 'Mit + eintragen', 'skipily.app', true, 552))]);
files.push(['07-zubehoer-de.svg', wrap('0 0 680 680', 'Skipily: Zubehörhändler eintragen',
  feedHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Fehlt hier dein') +
  t(60, 480, 44, '#f97316', 800, 'Zubehörhändler?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Trag ihn mit dem +-Button ein.') +
  cta(300, 'Mit + eintragen', 'skipily.app', true, 552))]);
files.push(['08-bewerten-de.svg', wrap('0 0 680 680', 'Skipily: Betriebe bewerten',
  feedHead('COMMUNITY · ECHTE BEWERTUNGEN') + starMotif +
  t(60, 430, 44, '#ffffff', 800, 'Gute Werft?') +
  t(60, 480, 44, '#f97316', 800, "Sag's weiter.") +
  t(60, 518, 21, '#cbd5e1', 500, 'Deine Bewertung hilft dem nächsten Skipper.') +
  cta(290, 'Jetzt bewerten', 'skipily.app', true, 552))]);

// ---- FEED EN ----
files.push(['01-karte-en.svg', wrap('0 0 680 680', 'Skipily: every yard on one map',
  feedHead(TAG_DEFAULT) + mapMotif + h3('Every yard.', 'Every service.', 'One map.') + cta(270, 'Download free', 'skipily.app'))]);
files.push(['02-wartung-en.svg', wrap('0 0 680 680', 'Skipily: never miss a service again',
  feedHead(TAG_DEFAULT) + bellMotif + h3('Never miss', 'a service', 'again.', 438) + cta(270, 'Download free', 'skipily.app', true, 566))]);
files.push(['03-ersatzteil-en.svg', wrap('0 0 680 680', 'Skipily: the right spare part in seconds',
  feedHead(TAG_DEFAULT) + partMotif + h3('The right', 'spare part —', 'in seconds.', 430) + cta(270, 'Download free', 'skipily.app', true, 560))]);
files.push(['04-claim-en.svg', wrap('0 0 680 680', 'Skipily B2B: get found',
  feedHead('FOR YARDS · SERVICE · SHOPS') + shopMotif +
  t(60, 436, 46, '#ffffff', 800, 'Get') + t(160, 436, 46, '#f97316', 800, 'found.') +
  t(60, 476, 21, '#cbd5e1', 500, 'By boat owners in your region.') +
  cta(300, 'Claim your profile', 'provider.skipily.app', true, 512))]);
files.push(['05-marktanalyse-en.svg', wrap('0 0 680 680', 'Skipily B2B: know what the fleet really needs',
  feedHead('AI MARKET ANALYSIS · FOR PROS') + chartMotif +
  t(60, 430, 42, '#ffffff', 800, 'Know what the') +
  t(60, 478, 42, '#ffffff', 800, 'fleet <tspan fill="#f97316">really</tspan>') +
  t(60, 526, 42, '#f97316', 800, 'needs.') +
  cta(340, 'In the provider portal', 'provider.skipily.app', true, 558))]);
files.push(['06-community-en.svg', wrap('0 0 680 680', 'Skipily: make the AI boat engineer smarter',
  feedHead('COMMUNITY · AI BOAT ENGINEER') + communityMotif +
  h3('Make the AI', 'boat engineer', 'smarter.') +
  cta(230, 'Join in', 'skipily.app'))]);
files.push(['07-eintragen-en.svg', wrap('0 0 680 680', 'Skipily: add missing businesses',
  feedHead('COMMUNITY · COMPLETE THE MAP') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Is your favourite') +
  t(60, 480, 44, '#f97316', 800, 'yard missing?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Add it with the + button.') +
  cta(250, 'Add it with +', 'skipily.app', true, 552))]);
files.push(['07-motorservice-en.svg', wrap('0 0 680 680', 'Skipily: add engine service',
  feedHead('COMMUNITY · COMPLETE THE MAP') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Missing an') +
  t(60, 480, 44, '#f97316', 800, 'engine service?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Add it with the + button.') +
  cta(250, 'Add it with +', 'skipily.app', true, 552))]);
files.push(['07-segelmacher-en.svg', wrap('0 0 680 680', 'Skipily: add sailmaker',
  feedHead('COMMUNITY · COMPLETE THE MAP') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Missing a') +
  t(60, 480, 44, '#f97316', 800, 'sailmaker?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Add it with the + button.') +
  cta(250, 'Add it with +', 'skipily.app', true, 552))]);
files.push(['07-zubehoer-en.svg', wrap('0 0 680 680', 'Skipily: add chandler',
  feedHead('COMMUNITY · COMPLETE THE MAP') + mapAddMotif +
  t(60, 430, 44, '#ffffff', 800, 'Missing a') +
  t(60, 480, 44, '#f97316', 800, 'chandler?') +
  t(60, 518, 21, '#cbd5e1', 500, 'Add it with the + button.') +
  cta(250, 'Add it with +', 'skipily.app', true, 552))]);
files.push(['08-bewerten-en.svg', wrap('0 0 680 680', 'Skipily: review businesses',
  feedHead('COMMUNITY · REAL REVIEWS') + starMotif +
  t(60, 430, 44, '#ffffff', 800, 'Great yard?') +
  t(60, 480, 44, '#f97316', 800, 'Spread the word.') +
  t(60, 518, 21, '#cbd5e1', 500, 'Your review helps the next skipper.') +
  cta(270, 'Leave a review', 'skipily.app', true, 552))]);

// ---- STORY DE (9:16) ----
const h3s = (l1, l2, l3, size = 50, y1 = 800) =>
  t(60, y1, size, '#ffffff', 800, l1) + t(60, y1 + 58, size, '#ffffff', 800, l2) + t(60, y1 + 116, size, '#f97316', 800, l3);
const ctaS = (w, label, footer, y = 985) =>
  `<rect x="60" y="${y}" width="${w}" height="66" rx="33" fill="#f97316"/>` +
  t(60 + w / 2, y + 43, label.length > 16 ? 23 : 24, '#0B1D3A', 700, label, ' text-anchor="middle"') +
  t(340, 1110, 20, '#cbd5e1', 500, footer, ' text-anchor="middle"');
files.push(['story-01-karte-de.svg', wrap('0 0 680 1209', 'Skipily Story: Jede Werft auf einer Karte',
  storyHead(TAG_DEFAULT) + mapMotifS + h3s('Jede Werft.', 'Jeder Service.', 'Eine Karte.') + ctaS(310, 'Jetzt App laden', 'skipily.app · App Store'))]);
files.push(['story-02-wartung-de.svg', wrap('0 0 680 1209', 'Skipily Story: Nie wieder Wartung vergessen',
  storyHead(TAG_DEFAULT) + bellMotifS + h3s('Nie wieder', 'Wartung', 'vergessen.') + ctaS(310, 'Jetzt App laden', 'skipily.app · App Store'))]);
files.push(['story-03-ersatzteil-de.svg', wrap('0 0 680 1209', 'Skipily Story: Das richtige Ersatzteil in Sekunden',
  storyHead(TAG_DEFAULT) + partMotifS + h3s('Das richtige', 'Ersatzteil —', 'in Sekunden.') + ctaS(310, 'Jetzt App laden', 'skipily.app · App Store'))]);
files.push(['story-04-claim-de.svg', wrap('0 0 680 1209', 'Skipily Story B2B: Werden Sie gefunden',
  storyHead('FÜR WERFTEN · SERVICE · SHOPS') + shopMotifS +
  t(60, 790, 50, '#ffffff', 800, 'Werden Sie') + t(60, 848, 50, '#f97316', 800, 'gefunden.') +
  t(60, 900, 23, '#cbd5e1', 500, 'Von Bootseignern in Ihrer Region.') +
  ctaS(360, 'Profil beanspruchen', 'provider.skipily.app', 965))]);
files.push(['story-05-marktanalyse-de.svg', wrap('0 0 680 1209', 'Skipily Story B2B: KI-Marktanalyse',
  storyHead('KI-MARKTANALYSE · FÜR PROFIS') + chartMotifS +
  t(60, 800, 48, '#ffffff', 800, 'Wissen, was die') +
  t(60, 856, 48, '#ffffff', 800, 'Flotte <tspan fill="#f97316">wirklich</tspan>') +
  t(60, 912, 48, '#f97316', 800, 'braucht.') +
  ctaS(350, 'Im Provider-Portal', 'provider.skipily.app'))]);
files.push(['story-06-community-de.svg', wrap('0 0 680 1209', 'Skipily Story: Mach den KI-Bootsingenieur schlauer',
  storyHead('COMMUNITY · KI-BOOTSINGENIEUR') + communityMotifS +
  h3s('Mach den KI-', 'Bootsingenieur', 'schlauer.', 46, 790) +
  ctaS(300, 'Jetzt mitmachen', 'skipily.app'))]);
files.push(['story-07-eintragen-de.svg', wrap('0 0 680 1209', 'Skipily Story: Fehlende Betriebe eintragen',
  storyHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotifS +
  t(60, 800, 50, '#ffffff', 800, 'Fehlt hier deine') +
  t(60, 858, 50, '#f97316', 800, 'Lieblingswerft?') +
  t(60, 908, 23, '#cbd5e1', 500, 'Trag sie mit dem +-Button ein.') +
  ctaS(320, 'Mit + eintragen', 'skipily.app'))]);
files.push(['story-07-motorservice-de.svg', wrap('0 0 680 1209', 'Skipily Story: Motorservice eintragen',
  storyHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotifS +
  t(60, 800, 50, '#ffffff', 800, 'Fehlt hier dein') +
  t(60, 858, 50, '#f97316', 800, 'Motorservice?') +
  t(60, 908, 23, '#cbd5e1', 500, 'Trag ihn mit dem +-Button ein.') +
  ctaS(320, 'Mit + eintragen', 'skipily.app'))]);
files.push(['story-07-segelmacher-de.svg', wrap('0 0 680 1209', 'Skipily Story: Segelmacher eintragen',
  storyHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotifS +
  t(60, 800, 50, '#ffffff', 800, 'Fehlt hier dein') +
  t(60, 858, 50, '#f97316', 800, 'Segelmacher?') +
  t(60, 908, 23, '#cbd5e1', 500, 'Trag ihn mit dem +-Button ein.') +
  ctaS(320, 'Mit + eintragen', 'skipily.app'))]);
files.push(['story-07-zubehoer-de.svg', wrap('0 0 680 1209', 'Skipily Story: Zubehörhändler eintragen',
  storyHead('COMMUNITY · KARTE FÜLLEN') + mapAddMotifS +
  t(60, 800, 50, '#ffffff', 800, 'Fehlt hier dein') +
  t(60, 858, 50, '#f97316', 800, 'Zubehörhändler?') +
  t(60, 908, 23, '#cbd5e1', 500, 'Trag ihn mit dem +-Button ein.') +
  ctaS(320, 'Mit + eintragen', 'skipily.app'))]);
files.push(['story-08-bewerten-de.svg', wrap('0 0 680 1209', 'Skipily Story: Betriebe bewerten',
  storyHead('COMMUNITY · ECHTE BEWERTUNGEN') + starMotifS +
  t(60, 800, 50, '#ffffff', 800, 'Gute Werft?') +
  t(60, 858, 50, '#f97316', 800, "Sag's weiter.") +
  t(60, 908, 23, '#cbd5e1', 500, 'Hilf dem nächsten Skipper.') +
  ctaS(300, 'Jetzt bewerten', 'skipily.app'))]);

for (const [name, svg] of files) {
  fs.writeFileSync(path.join(OUT, name), svg);
  console.log('  ✓', name, '(' + Math.round(svg.length / 1024) + ' KB)');
}
console.log('\\n' + files.length + ' SVG-Dateien geschrieben nach marketing/social/graphics/');
