// Baut gebrandete Play-Store-Screenshots (1080x1920) aus den App-Screenshots.
// iOS-Statusleiste wird per Clip oben abgeschnitten. Logo + Caption im Skipily-Design.
// Aufruf: node marketing/playstore/build-screens.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SDIR = path.join(__dirname, 'src-screens');
const OUT = path.join(__dirname, 'screens');
fs.mkdirSync(OUT, { recursive: true });

const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'owner-portal', 'public', 'icon-192.png')).toString('base64');
const shot = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(SDIR, f)).toString('base64');
const F = 'Arial,Helvetica,sans-serif';
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const items = [
  ['01-map.jpg', '01-map-de.svg', 'Service in', 'deiner Nähe'],
  ['02-ai.jpg', '02-ai-de.svg', 'Frag den', 'KI-Bootsingenieur'],
  ['03-equipment.jpg', '03-equipment-de.svg', 'Boot & Ausrüstung', 'im Griff'],
  ['04-maintenance.jpg', '04-maintenance-de.svg', 'Wartung', 'im Blick'],
  ['05-provider.jpg', '05-provider-de.svg', 'Anbieter direkt', 'kontaktieren'],
];

for (const [src, outName, l1, l2] of items) {
  const s = shot(src);
  const svg = `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs><clipPath id="ph"><rect x="260" y="440" width="560" height="1148" rx="36"/></clipPath></defs>
<rect width="1080" height="1920" fill="#0B1D3A"/>
<path d="M0,1820 C320,1780 700,1880 1080,1800 L1080,1920 L0,1920 Z" fill="#13294d"/>
<image href="${logo}" xlink:href="${logo}" x="490" y="74" width="100" height="100"/>
<text x="540" y="280" text-anchor="middle" fill="#ffffff" font-family="${F}" font-size="62" font-weight="800">${esc(l1)}</text>
<text x="540" y="352" text-anchor="middle" fill="#f97316" font-family="${F}" font-size="62" font-weight="800">${esc(l2)}</text>
<rect x="254" y="434" width="572" height="1160" rx="42" fill="#13294d" stroke="#27457a" stroke-width="2"/>
<image href="${s}" xlink:href="${s}" x="260" y="370" width="560" height="1218" clip-path="url(#ph)"/>
<rect x="260" y="440" width="560" height="1148" rx="36" fill="none" stroke="#0B1D3A" stroke-width="2"/>
<text x="540" y="1700" text-anchor="middle" fill="#f97316" font-family="${F}" font-size="30" font-weight="700" letter-spacing="4">ALWAYS · SAFE · READY TO SAIL</text>
</svg>`;
  fs.writeFileSync(path.join(OUT, outName), svg);
  console.log('  ✓', outName, Math.round(svg.length / 1024) + ' KB');
}
console.log('\\n' + items.length + ' Screenshot-SVGs geschrieben nach marketing/playstore/screens/');
