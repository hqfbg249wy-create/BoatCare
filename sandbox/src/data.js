// ============================================================================
// Skipily Provider-Sandbox — Mock-Datenschicht
// ============================================================================
// ACHTUNG: Reine Simulations-/Beispieldaten. KEINE Verbindung zur Produktiv-
// Datenbank. Nichts hier verlässt den Browser.
// ============================================================================

export const CURRENT_YEAR = 2026

// ── Produktkategorien (identisch zur echten App) ────────────────────────────
export const CATEGORIES = [
  { key: 'repair',          icon: '🔧', label: 'Reparatur' },
  { key: 'motor_service',   icon: '⚙️', label: 'Motor-Service' },
  { key: 'segelmacher',     icon: '⛵', label: 'Segelmacher' },
  { key: 'marine_supplies', icon: '🛒', label: 'Bootszubehör' },
  { key: 'elektronik',      icon: '📡', label: 'Elektronik' },
  { key: 'werft',           icon: '🚢', label: 'Werft' },
  { key: 'winterlager',     icon: '❄️', label: 'Winterlager' },
  { key: 'lackiererei',     icon: '🎨', label: 'Lackiererei' },
  { key: 'gutachter',       icon: '📋', label: 'Gutachter' },
  { key: 'tankstelle',      icon: '⛽', label: 'Tankstelle' },
  { key: 'marina',          icon: '🌊', label: 'Marina' },
]
export const catLabel = (key) => CATEGORIES.find(c => c.key === key)?.label || key
export const catIcon  = (key) => CATEGORIES.find(c => c.key === key)?.icon || '📦'

// ── Demo-Provider ───────────────────────────────────────────────────────────
export const DEMO_PROVIDER = {
  id: 'demo-provider',
  name: 'Nordwind Marine Service (Demo)',
  city: 'Kiel',
  country: 'DE',
}

// ── Seed-Produkte: mindestens eines pro Kategorie ───────────────────────────
// source: 'manual' | 'shopify' | 'woocommerce'
let _pid = 0
const P = (o) => ({
  id: 'p' + (++_pid),
  source: 'manual',
  weightKg: 1.0,
  shippingCost: 5.9,
  stock: 12,
  emoji: catIcon(o.category),
  manufacturer: '',
  model: '',
  partNumber: '',
  tags: [],
  ...o,
})

export const SEED_PRODUCTS = [
  // repair
  P({ name: 'Impeller-Set Wasserpumpe', category: 'repair', manufacturer: 'Volvo Penta', model: 'MD2020', partNumber: '3586494', price: 39.9, weightKg: 0.3, tags: ['impeller', 'kühlung'] }),
  P({ name: 'Dichtungssatz Getriebe', category: 'repair', manufacturer: 'Yanmar', model: 'SD20', partNumber: 'YAN-SD20-DS', price: 84.0, weightKg: 0.6, tags: ['dichtung'] }),
  // motor_service
  P({ name: 'Ölfilter Dieselmotor', category: 'motor_service', manufacturer: 'Volvo Penta', model: 'D2-40', partNumber: '3840525', price: 24.5, weightKg: 0.4, tags: ['öl', 'filter', 'service'] }),
  P({ name: 'Motoröl 5L 15W-40 marine', category: 'motor_service', manufacturer: 'Liqui Moly', model: 'Marine 15W-40', partNumber: 'LM-25016', price: 42.9, weightKg: 5.2, tags: ['öl', 'service'] }),
  // segelmacher
  P({ name: 'Großsegel Reparaturband', category: 'segelmacher', manufacturer: 'Dacron', model: 'Repair', partNumber: '', price: 18.5, weightKg: 0.2, tags: ['segel', 'reparatur'] }),
  P({ name: 'Genua 34ft Dacron', category: 'segelmacher', manufacturer: 'North Sails', model: 'NS-Cruise-34', partNumber: 'NS34-GEN', price: 1290.0, weightKg: 9.0, shippingCost: 24.9, tags: ['segel'] }),
  // marine_supplies
  P({ name: 'Festmacher-Leine 12mm 10m', category: 'marine_supplies', manufacturer: 'Robline', model: 'Dockline', partNumber: 'RB-12-10', price: 29.9, weightKg: 1.1, tags: ['leine', 'tauwerk'] }),
  P({ name: 'Fender Ø22×60cm', category: 'marine_supplies', manufacturer: 'Polyform', model: 'F3', partNumber: 'PF-F3', price: 46.0, weightKg: 1.4, tags: ['fender'] }),
  // elektronik
  P({ name: 'Kartenplotter 7"', category: 'elektronik', manufacturer: 'Raymarine', model: 'Axiom 7', partNumber: 'E70363', price: 749.0, weightKg: 1.2, shippingCost: 9.9, tags: ['plotter', 'navigation'] }),
  P({ name: 'AIS-Transponder Klasse B', category: 'elektronik', manufacturer: 'em-trak', model: 'B954', partNumber: 'EMT-B954', price: 589.0, weightKg: 0.9, tags: ['ais', 'sicherheit'] }),
  // werft
  P({ name: 'Osmose-Sanierung (Pauschale)', category: 'werft', manufacturer: '', model: '', partNumber: '', price: 1900.0, weightKg: 0, shippingCost: 0, tags: ['service', 'rumpf'] }),
  // winterlager
  P({ name: 'Winterlager Kranung + Halle', category: 'winterlager', manufacturer: '', model: '', partNumber: '', price: 890.0, weightKg: 0, shippingCost: 0, tags: ['service', 'lager'] }),
  // lackiererei
  P({ name: 'Antifouling 2,5L blau', category: 'lackiererei', manufacturer: 'International', model: 'Micron', partNumber: 'INT-MIC-25', price: 129.0, weightKg: 3.1, tags: ['antifouling', 'farbe'] }),
  // gutachter
  P({ name: 'Wertgutachten Yacht', category: 'gutachter', manufacturer: '', model: '', partNumber: '', price: 450.0, weightKg: 0, shippingCost: 0, tags: ['service', 'gutachten'] }),
  // tankstelle
  P({ name: 'Diesel (pro Liter)', category: 'tankstelle', manufacturer: '', model: '', partNumber: '', price: 1.79, weightKg: 0, shippingCost: 0, tags: ['kraftstoff'] }),
  // marina
  P({ name: 'Gastliegeplatz (pro Nacht)', category: 'marina', manufacturer: '', model: '', partNumber: '', price: 32.0, weightKg: 0, shippingCost: 0, tags: ['liegeplatz', 'service'] }),
]

// ── Externe Kataloge (Import-Simulation Shopify / WooCommerce) ───────────────
// Diese Produkte "liegen" im jeweiligen Shop und werden beim simulierten
// Import in den Skipily-Katalog übernommen.
export const EXTERNAL_CATALOGS = {
  shopify: [
    P({ name: 'Rettungsweste 150N Automatik', category: 'marine_supplies', manufacturer: 'Secumar', model: 'Ultra 170', partNumber: 'SEC-170', price: 149.0, weightKg: 1.0, source: 'shopify', tags: ['sicherheit'] }),
    P({ name: 'Ankerkette 8mm verzinkt (m)', category: 'marine_supplies', manufacturer: 'Talamex', model: 'DIN766', partNumber: 'TLX-8-DIN', price: 6.9, weightKg: 1.4, source: 'shopify', tags: ['anker', 'kette'] }),
    P({ name: 'LED-Positionslaterne', category: 'elektronik', manufacturer: 'Hella', model: 'NaviLED', partNumber: 'HL-2LT', price: 59.0, weightKg: 0.3, source: 'shopify', tags: ['licht', 'navigation'] }),
    P({ name: 'Zinkanode Welle 25mm', category: 'motor_service', manufacturer: 'Volvo Penta', model: 'D2-40', partNumber: '875812', price: 14.9, weightKg: 0.2, source: 'shopify', tags: ['anode', 'korrosion', 'service'] }),
  ],
  woocommerce: [
    P({ name: 'Bilgepumpe 12V 2000GPH', category: 'elektronik', manufacturer: 'Rule', model: '2000', partNumber: 'RL-2000', price: 79.0, weightKg: 0.8, source: 'woocommerce', tags: ['pumpe', 'bilge'] }),
    P({ name: 'Teak-Öl 1L', category: 'lackiererei', manufacturer: 'Owatrol', model: 'Textrol', partNumber: 'OWT-1', price: 27.5, weightKg: 1.0, source: 'woocommerce', tags: ['pflege', 'teak'] }),
    P({ name: 'Impeller-Set Wasserpumpe', category: 'repair', manufacturer: 'Volvo Penta', model: 'MD2020', partNumber: '3586494', price: 37.5, weightKg: 0.3, source: 'woocommerce', tags: ['impeller', 'kühlung'] }),
    P({ name: 'Winsch-Kurbel 250mm', category: 'segelmacher', manufacturer: 'Harken', model: 'B10A', partNumber: 'HK-B10A', price: 89.0, weightKg: 0.7, source: 'woocommerce', tags: ['winsch'] }),
  ],
}

// ── Ausrüstung (Equipment) des Demo-Boots — alle Wartungsstufen abgedeckt ────
// lastServiceYear + maintenanceCycleYears ⇒ Wartungsstufe (ok / fällig / überfällig)
let _eid = 0
const E = (o) => ({ id: 'e' + (++_eid), manufacturer: '', model: '', partNumber: '', ...o })

export const SEED_EQUIPMENT = [
  E({ name: 'Dieselmotor', category: 'motor_service', manufacturer: 'Volvo Penta', model: 'D2-40', partNumber: '3840525',
      installedYear: 2015, maintenanceCycleYears: 1, expectedLifespanYears: 20, lastServiceYear: 2025 }),   // ok
  E({ name: 'Saildrive', category: 'motor_service', manufacturer: 'Volvo Penta', model: 'D2-40', partNumber: '875812',
      installedYear: 2015, maintenanceCycleYears: 2, expectedLifespanYears: 15, lastServiceYear: 2024 }),   // fällig
  E({ name: 'Seewasserpumpe', category: 'repair', manufacturer: 'Volvo Penta', model: 'MD2020', partNumber: '3586494',
      installedYear: 2015, maintenanceCycleYears: 1, expectedLifespanYears: 10, lastServiceYear: 2023 }),   // überfällig
  E({ name: 'Großsegel', category: 'segelmacher', manufacturer: 'North Sails', model: 'NS-Cruise-34', partNumber: 'NS34-MAIN',
      installedYear: 2016, maintenanceCycleYears: 3, expectedLifespanYears: 12, lastServiceYear: 2024 }),   // ok
  E({ name: 'Rettungsinsel', category: 'marine_supplies', manufacturer: 'Secumar', model: 'Liferaft 6', partNumber: 'SEC-LR6',
      installedYear: 2018, maintenanceCycleYears: 3, expectedLifespanYears: 12, lastServiceYear: 2021 }),   // überfällig
  E({ name: 'Kartenplotter', category: 'elektronik', manufacturer: 'Raymarine', model: 'Axiom 7', partNumber: 'E70363',
      installedYear: 2019, maintenanceCycleYears: 5, expectedLifespanYears: 10, lastServiceYear: 2023 }),   // ok
  E({ name: 'Antifouling-Anstrich', category: 'lackiererei', manufacturer: 'International', model: 'Micron', partNumber: 'INT-MIC-25',
      installedYear: 2024, maintenanceCycleYears: 1, expectedLifespanYears: 2, lastServiceYear: 2025 }),    // fällig
  E({ name: 'Ankerkette', category: 'marine_supplies', manufacturer: 'Talamex', model: 'DIN766', partNumber: 'TLX-8-DIN',
      installedYear: 2017, maintenanceCycleYears: 4, expectedLifespanYears: 15, lastServiceYear: 2022 }),   // fällig/überfällig
]

// ── Wartungsstufe berechnen ─────────────────────────────────────────────────
// Rückgabe: { key: 'ok'|'due'|'overdue', label, color, yearsSince, dueIn }
export function maintenanceStatus(item, year = CURRENT_YEAR) {
  const cycle = item.maintenanceCycleYears || 1
  const yearsSince = year - (item.lastServiceYear || item.installedYear || year)
  const dueIn = cycle - yearsSince
  if (yearsSince > cycle) {
    return { key: 'overdue', label: 'Überfällig', color: '#ef4444', yearsSince, dueIn }
  }
  if (yearsSince >= cycle * 0.8) {
    return { key: 'due', label: 'Bald fällig', color: '#f59e0b', yearsSince, dueIn }
  }
  return { key: 'ok', label: 'In Ordnung', color: '#10b981', yearsSince, dueIn }
}

export const MAINTENANCE_LEVELS = [
  { key: 'ok',      label: 'In Ordnung', color: '#10b981' },
  { key: 'due',     label: 'Bald fällig', color: '#f59e0b' },
  { key: 'overdue', label: 'Überfällig',  color: '#ef4444' },
]

// ── Equipment → Produkt-Matching (wie in der App) ───────────────────────────
// Score 100      = Originalteil (Artikelnummer-Match)
// Score 60–99    = Derivat (Hersteller + Modell)
// Score < 60     = passende Ergänzung (Kategorie / Tags)
export function matchProducts(item, products) {
  const norm = (s) => (s || '').toString().trim().toLowerCase()
  const results = []
  for (const p of products) {
    let score = 0
    let reason = ''
    if (item.partNumber && p.partNumber && norm(item.partNumber) === norm(p.partNumber)) {
      score = 100
      reason = 'Artikelnummer ' + p.partNumber
    } else if (item.manufacturer && p.manufacturer && norm(item.manufacturer) === norm(p.manufacturer)) {
      score = norm(item.model) && norm(item.model) === norm(p.model) ? 90 : 65
      reason = norm(item.model) === norm(p.model)
        ? p.manufacturer + ' ' + p.model
        : 'Hersteller ' + p.manufacturer
    } else if (item.category === p.category) {
      score = 45
      reason = 'Passend zu ' + catLabel(p.category)
    } else {
      continue
    }
    let tier = 'related'
    if (score >= 100) tier = 'original'
    else if (score >= 60) tier = 'derivate'
    results.push({ product: p, score, reason, tier })
  }
  return results.sort((a, b) => b.score - a.score)
}

export const MATCH_TIERS = {
  original: { label: 'Originalteil',       badge: '✅', color: '#10b981', hint: 'Exakter Artikelnummer-Treffer' },
  derivate: { label: 'Passendes Derivat',  badge: '≈',  color: '#1870c0', hint: 'Hersteller/Modell stimmt überein' },
  related:  { label: 'Sinnvolle Ergänzung', badge: '＋', color: '#f59e0b', hint: 'Passende Kategorie' },
}
