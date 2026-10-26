// Ausruestungs-Kategorien — serverseitige Quelle (Tabelle equipment_categories,
// Migration 192) mit OFFLINE-sicherem Fallback:
//   1. Sofort: fest eingebauter Seed (unten) bzw. letzter localStorage-Cache.
//   2. Im Hintergrund: Aktualisierung aus der DB (wenn online).
// So funktioniert die Auswahl auch ohne Empfang; neue Kategorien/Farben/Labels
// lassen sich per DB-Update ohne Web-/App-Build ausrollen.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// --- Fest eingebauter Fallback (identisch zum DB-Seed) -------------------
export const EQUIPMENT_CATEGORIES = [
  'engine', 'electrical', 'electrical_12v', 'electrical_230v', 'navigation', 'communication',
  'safety', 'rigging', 'sails', 'rope', 'deck', 'hull', 'anchor',
  'hvac', 'plumbing', 'galley', 'paint', 'other',
]

export const EQUIPMENT_CATEGORY_LABELS = {
  engine: 'eqcat.engine', electrical: 'eqcat.electrical',
  electrical_12v: 'eqcat.electrical_12v', electrical_230v: 'eqcat.electrical_230v',
  navigation: 'eqcat.navigation',
  safety: 'eqcat.safety', communication: 'eqcat.communication', rigging: 'eqcat.rigging',
  sails: 'eqcat.sails', rope: 'eqcat.rope',
  hull: 'eqcat.hull', deck: 'eqcat.deck', anchor: 'eqcat.anchor',
  hvac: 'eqcat.hvac', plumbing: 'eqcat.plumbing', galley: 'eqcat.galley',
  paint: 'eqcat.paint', other: 'eqcat.other',
}

const COLORS = {
  navigation: '#3b82f6', electrical: '#eab308', electrical_12v: '#eab308', electrical_230v: '#f59e0b',
  engine: '#f97316', safety: '#ef4444', communication: '#14b8a6', rigging: '#a855f7',
  sails: '#06b6d4', rope: '#10b981', hull: '#64748b', deck: '#0ea5e9', anchor: '#92400e',
  hvac: '#ec4899', plumbing: '#0891b2', galley: '#d97706', paint: '#8b5cf6', other: '#94a3b8',
}

export function categoryColor(cat) {
  return COLORS[(cat || '').toLowerCase()] || COLORS.other
}
export function categoryLabelKey(cat) {
  return EQUIPMENT_CATEGORY_LABELS[(cat || '').toLowerCase()] || 'eqcat.other'
}

// --- DB-Katalog mit Cache ------------------------------------------------
const LS_KEY = 'skipily_equipment_categories_v1'

function readCache() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
// Modul-Cache: beim ersten Import aus localStorage vorbelegen (offline sofort da).
let memCache = readCache()

/**
 * Laedt die Kategorien aus der DB und aktualisiert Modul-/localStorage-Cache.
 * Bei Fehler (offline) wird der vorhandene Cache (oder null) zurueckgegeben,
 * der Aufrufer faellt dann auf den eingebauten Seed zurueck.
 */
export async function fetchEquipmentCategories() {
  try {
    const { data, error } = await supabase
      .from('equipment_categories')
      .select('key, sort_order, color, icon_web, labels, active')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error || !Array.isArray(data) || data.length === 0) return memCache
    memCache = data
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch { /* Speicher evtl. voll/blockiert */ }
    return data
  } catch { return memCache }
}

/**
 * React-Hook: liefert die Kategorienliste (DB -> Cache -> Seed) plus Resolver.
 * Initial sofort aus Cache/Seed (kein Flackern, offline-tauglich), danach im
 * Hintergrund aus der DB nachgeladen.
 *   keys      : string[] der Kategorie-Keys in Sortierreihenfolge
 *   colorOf(k): Hex-Farbe (DB oder Seed)
 *   labelOf(k, t): uebersetztes Label (DB-labels[lang] -> de -> i18n-Key -> key)
 */
export function useEquipmentCatalog(lang) {
  const [rows, setRows] = useState(memCache)
  useEffect(() => {
    let on = true
    fetchEquipmentCategories().then(r => { if (on && r) setRows(r) })
    return () => { on = false }
  }, [])

  const list = Array.isArray(rows) && rows.length ? rows : null
  const keys = list ? list.map(r => r.key) : EQUIPMENT_CATEGORIES
  const colorOf = (key) => {
    const r = list && list.find(x => x.key === key)
    return (r && r.color) || categoryColor(key)
  }
  const labelOf = (key, t) => {
    const r = list && list.find(x => x.key === key)
    const lbls = r && r.labels
    if (lbls && (lbls[lang] || lbls.de)) return lbls[lang] || lbls.de
    return t ? t(categoryLabelKey(key)) : key
  }
  return { keys, colorOf, labelOf, rows: list }
}
