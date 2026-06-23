import { createContext, useContext, useState, useCallback } from 'react'
import { resources } from './resources'

// Unterstützte Sprachen (= Marketing-Sprachen). DE ist Quelle + Fallback.
export const LANGS = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
  { code: 'nl', label: 'Nederlands' },
]
const SUPPORTED = LANGS.map((l) => l.code)
const STORAGE = 'skipily_lang'

export function countryToLang(country) {
  const c = (country || '').toString().trim().toLowerCase()
  const map = {
    de: 'de', deutschland: 'de', germany: 'de', at: 'de', 'österreich': 'de', oesterreich: 'de', austria: 'de', ch: 'de', schweiz: 'de', switzerland: 'de', li: 'de',
    fr: 'fr', france: 'fr', frankreich: 'fr', be: 'fr', belgium: 'fr', belgien: 'fr', lu: 'fr', mc: 'fr',
    it: 'it', italy: 'it', italien: 'it', italia: 'it', sm: 'it', va: 'it',
    es: 'es', spain: 'es', spanien: 'es', 'españa': 'es', espana: 'es', pt: 'es', portugal: 'es', ad: 'es', gi: 'es',
    nl: 'nl', netherlands: 'nl', niederlande: 'nl', nederland: 'nl',
  }
  return map[c] || map[c.slice(0, 2)] || null
}

function browserLang() {
  const n = ((typeof navigator !== 'undefined' ? navigator.language : '') || '').slice(0, 2).toLowerCase()
  return SUPPORTED.includes(n) ? n : null
}

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE)
    if (saved && SUPPORTED.includes(saved)) return saved
  } catch { /* localStorage evtl. blockiert */ }
  return browserLang() || 'de'
}

const Ctx = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)

  const setLang = useCallback((l, { persist = true } = {}) => {
    if (!SUPPORTED.includes(l)) return
    if (persist) { try { localStorage.setItem(STORAGE, l) } catch { /* ignore */ } }
    setLangState(l)
  }, [])

  const setLangFromCountry = useCallback((country) => {
    try { if (localStorage.getItem(STORAGE)) return } catch { /* ignore */ }
    const l = countryToLang(country)
    if (l && SUPPORTED.includes(l)) setLangState(l)
  }, [])

  const t = useCallback((key, vars) => {
    let s = resources[lang]?.[key]
    if (s == null) s = resources.de?.[key]
    if (s == null) s = key
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]))
    return s
  }, [lang])

  return <Ctx.Provider value={{ lang, setLang, setLangFromCountry, t }}>{children}</Ctx.Provider>
}

export function useT() {
  const c = useContext(Ctx)
  if (c) return c
  return {
    lang: 'de',
    setLang() {},
    setLangFromCountry() {},
    t: (key, vars) => {
      let s = resources.de?.[key] ?? key
      if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]))
      return s
    },
  }
}
