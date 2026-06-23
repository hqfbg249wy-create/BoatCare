#!/usr/bin/env node
// Füllt fehlende Provider-Portal-Übersetzungen via Supabase translate-text.
// Quelle: provider-portal/src/i18n/de.js  →  Ziel: .../generated.js
//
// Nur FEHLENDE Keys werden übersetzt (vorhandene bleiben unangetastet — so
// kannst du einzelne Strings von Hand feinschleifen, ohne sie zu verlieren).
//
// Nutzung:  node scripts/i18n-autotranslate.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Portal als Argument: node scripts/i18n-autotranslate.mjs [provider-portal|owner-portal]
const PORTAL = process.argv[2] || 'provider-portal'
const I18N = resolve(__dirname, `../${PORTAL}/src/i18n`)
console.log(`→ Portal: ${PORTAL}`)

const SUPABASE_URL = 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ'
const LANGS = ['en', 'fr', 'it', 'es', 'nl']
const BATCH = 40

async function importDefault(file) {
  const mod = await import(pathToFileURL(resolve(I18N, file)).href + '?t=' + Date.now())
  return mod.default
}

async function translateBatch(items, lang) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate-text`, {
    method: 'POST',
    headers: { 'apikey': ANON, 'Authorization': `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_lang: lang, texts: items }),
  })
  if (!res.ok) throw new Error(`translate-text HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data.translations || {}
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

async function main() {
  const de = await importDefault('de.js')
  const generated = await importDefault('generated.js')
  const out = {}

  for (const lang of LANGS) {
    const existing = { ...(generated[lang] || {}) }
    const missing = Object.keys(de).filter((k) => existing[k] == null || existing[k] === '')
    if (missing.length === 0) { out[lang] = existing; console.log(`✓ ${lang}: vollständig`); continue }
    console.log(`… ${lang}: ${missing.length} fehlende Keys`)
    for (const part of chunk(missing, BATCH)) {
      const texts = part.map((k) => ({ id: k, text: de[k] }))
      const tr = await translateBatch(texts, lang)
      for (const k of part) if (tr[k]) existing[k] = tr[k]
    }
    out[lang] = existing
    console.log(`✓ ${lang}: ${Object.keys(existing).length} Keys gesamt`)
  }

  const header = '// AUTO-GENERIERT von scripts/i18n-autotranslate.mjs — nicht von Hand pflegen.\n' +
    '// Übersetzungen der deutschen Quell-Strings (de.js). Fehlende Keys fallen\n' +
    '// zur Laufzeit automatisch auf Deutsch zurück.\n'
  await writeFile(resolve(I18N, 'generated.js'), header + 'export default ' + JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log('✅ generated.js geschrieben')
}

main().catch((e) => { console.error('Fehler:', e.message); process.exit(1) })
