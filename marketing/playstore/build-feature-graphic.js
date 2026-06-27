// Baut ein sauberes Feature-Graphic (1024x500) mit Original-Logo, ohne kaputte Glyphen.
// Aufruf: node marketing/playstore/build-feature-graphic.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'owner-portal', 'public', 'icon-192.png')).toString('base64');
const F = 'Arial,Helvetica,sans-serif';

const chips = [['Dienstleister', 210], ['Wartung', 150], ['Shop', 110], ['KI-Assistent', 200]];
let cx = 322;
const chipSvg = chips.map(([label, w]) => {
  const r = `<rect x="${cx}" y="350" width="${w}" height="54" rx="27" fill="#0B1D3A" stroke="#f97316" stroke-width="2"/>` +
    `<text x="${cx + w / 2}" y="385" text-anchor="middle" fill="#f97316" font-family="${F}" font-size="26" font-weight="700">${label}</text>`;
  cx += w + 16;
  return r;
}).join('');

const svg = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1D3A"/><stop offset="1" stop-color="#13294d"/></linearGradient></defs>
<rect width="1024" height="500" fill="url(#bg)"/>
<rect x="0" y="0" width="1024" height="6" fill="#f97316"/>
<image href="${logo}" xlink:href="${logo}" x="70" y="150" width="200" height="200"/>
<text x="320" y="215" fill="#ffffff" font-family="${F}" font-size="92" font-weight="800">Skipily</text>
<text x="324" y="268" fill="#cbd5e1" font-family="${F}" font-size="30" font-weight="500">Für Eigner, die ihr Boot lieben.</text>
<text x="324" y="312" fill="#f97316" font-family="${F}" font-size="26" font-weight="700" letter-spacing="2">ALWAYS · SAFE · READY TO SAIL</text>
${chipSvg}
</svg>`;

fs.writeFileSync(path.join(__dirname, 'feature-graphic.svg'), svg);
console.log('feature-graphic.svg geschrieben (' + Math.round(svg.length / 1024) + ' KB)');
