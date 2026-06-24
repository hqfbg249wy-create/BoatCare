// On-Demand-Übersetzung von DB-Freitext (Produkte + Service-Provider) via
// Edge-Functions translate-product / translate-provider (DeepL + DB-Cache).
//
// Ablauf im Frontend:
//   1. Bereits gecachte Übersetzungen aus row.translations[lang] direkt nutzen.
//   2. Nur für fehlende IDs die Edge-Function aufrufen (die cacht serverseitig).
//   3. Session-Memo verhindert Doppelaufrufe innerhalb einer Sitzung.
//
// Quell-/Default-Sprache ist Deutsch → bei lang === 'de' nichts tun.
import { supabase } from './supabase'

const SUPPORTED = ['en', 'es', 'fr', 'it', 'nl']
const memo = { product: {}, provider: {} } // memo[type][lang][id] = translation

function pickMissing(type, lang, ids) {
  const have = memo[type][lang] || {}
  return ids.filter(id => !have[id])
}

async function invokeChunked(fnName, key, ids, lang, chunk) {
  const out = {}
  for (let i = 0; i < ids.length; i += chunk) {
    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { [key]: ids.slice(i, i + chunk), target_lang: lang },
      })
      if (error) { console.warn(fnName, error.message); continue }
      Object.assign(out, data?.translations || {})
    } catch (e) {
      console.warn(fnName, e?.message || e)
    }
  }
  return out
}

// Liefert Map id -> { name, description } für Produkte.
export async function translateProducts(ids, lang) {
  if (!SUPPORTED.includes(lang) || !ids?.length) return {}
  const missing = pickMissing('product', lang, ids)
  if (missing.length) {
    const res = await invokeChunked('translate-product', 'product_ids', missing, lang, 50)
    memo.product[lang] = { ...(memo.product[lang] || {}), ...res }
  }
  return memo.product[lang] || {}
}

// Liefert Map id -> { services[], description, slogan } für Service-Provider.
export async function translateProviders(ids, lang) {
  if (!SUPPORTED.includes(lang) || !ids?.length) return {}
  const missing = pickMissing('provider', lang, ids)
  if (missing.length) {
    const res = await invokeChunked('translate-provider', 'provider_ids', missing, lang, 30)
    memo.provider[lang] = { ...(memo.provider[lang] || {}), ...res }
  }
  return memo.provider[lang] || {}
}

export function isTranslatableLang(lang) {
  return SUPPORTED.includes(lang)
}
