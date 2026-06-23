#!/usr/bin/env node
// Übersetzt alle veröffentlichten provider_faqs (Frage + Antwort) in EN/FR/IT/
// ES/NL via translate-text und schreibt UPDATE-SQL.
//
// WICHTIG: Claude-API-Org-Limit = 5 Requests/Minute. Daher bündeln wir mehrere
// FAQs in EINEN Request (translate-text nimmt bis 50 Texte) und drosseln auf
// ein Request alle ~13 s.
//
// Nutzung:  node scripts/translate-faqs.mjs
// Ergebnis: database/092_faq_translations_backfill.sql
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../database/092_faq_translations_backfill.sql')

const URL = 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ'
const LANGS = ['en', 'fr', 'it', 'es', 'nl']
const FAQS_PER_REQUEST = 8       // 8 FAQs × (q+a) = 16 Texte/Request (< 50, < 8192 tok)
const THROTTLE_MS = 13000        // ≤ 5 Requests/Minute

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, opts = {}) {
  const res = await fetch(`${URL}${path}`, { ...opts, headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return res.json()
}

async function translateBatch(texts, lang, attempt = 1) {
  try {
    const data = await api('/functions/v1/translate-text', { method: 'POST', body: JSON.stringify({ target_lang: lang, texts }) })
    return data.translations || {}
  } catch (e) {
    if (/HTTP 5\d\d|429|rate/i.test(e.message) && attempt <= 4) {
      const wait = THROTTLE_MS * attempt
      console.log(`    ⏳ Limit/Fehler — warte ${wait / 1000}s und versuche erneut (${attempt}/4)`)
      await sleep(wait)
      return translateBatch(texts, lang, attempt + 1)
    }
    throw e
  }
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

function dollar(s) { let tag = 'faq'; while (s.includes('$' + tag + '$')) tag += 'x'; return `$${tag}$${s}$${tag}$` }

async function main() {
  const faqs = await api('/rest/v1/provider_faqs?select=id,question,answer,translations&is_published=eq.true')
  console.log(`${faqs.length} veröffentlichte FAQs`)
  const merged = new Map(faqs.map((f) => [f.id, { ...(f.translations || {}) }]))

  let reqCount = 0
  for (const lang of LANGS) {
    const todo = faqs.filter((f) => { const c = (f.translations || {})[lang] || {}; return !(c.question && c.answer) })
    if (todo.length === 0) { console.log(`✓ ${lang}: vollständig`); continue }
    console.log(`… ${lang}: ${todo.length} FAQs`)
    for (const group of chunk(todo, FAQS_PER_REQUEST)) {
      const texts = []
      for (const f of group) { texts.push({ id: `q::${f.id}`, text: f.question }); texts.push({ id: `a::${f.id}`, text: f.answer }) }
      if (reqCount++ > 0) await sleep(THROTTLE_MS)
      const tr = await translateBatch(texts, lang)
      for (const f of group) {
        const q = tr[`q::${f.id}`], a = tr[`a::${f.id}`]
        if (q && a) merged.get(f.id)[lang] = { question: q, answer: a }
      }
      console.log(`    ✓ ${group.length} FAQs übersetzt (Request ${reqCount})`)
    }
  }

  const stmts = []
  for (const f of faqs) {
    const tr = merged.get(f.id)
    const complete = LANGS.filter((l) => tr[l]?.question && tr[l]?.answer).length
    if (complete > 0) stmts.push(`UPDATE public.provider_faqs SET translations = ${dollar(JSON.stringify(tr))}::jsonb, updated_at = now() WHERE id = '${f.id}';`)
  }

  const header = `-- Migration 091: FAQ-Übersetzungen Backfill (auto-generiert via translate-text)\n-- ${stmts.length} FAQs mit Übersetzungen (EN/FR/IT/ES/NL, Frage + Antwort).\n`
  await writeFile(OUT, header + stmts.join('\n') + '\n', 'utf8')
  console.log(`\n✅ ${stmts.length} UPDATE-Statements → ${OUT}`)
}

main().catch((e) => { console.error('Fehler:', e.message); process.exit(1) })
