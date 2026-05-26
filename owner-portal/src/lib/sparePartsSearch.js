// Spare-Parts-Scoring & Bucketing — 1:1 Port der iOS-Logik aus
// EquipmentScreen.swift (EquipmentPartsSearchView → searchProducts)
//
// 3 Buckets:
//   - originals (Score >= 100): Artikelnummer-Match    → grün
//   - derivates (60-99):        Hersteller + Modell    → blau
//   - related   (1-59):         loser Match            → orange

const lower = (s) => (s || '').toString().toLowerCase()
const trim  = (s) => (s || '').toString().trim()

/**
 * Berechnet Score + Reason für ein Produkt anhand der Equipment-Daten.
 * Gibt { score, reason } zurück oder null wenn keine Treffer.
 */
export function scoreProduct(product, eq) {
  const pName = lower(product.name)
  const pMfg  = lower(product.manufacturer)
  const pPart = lower(product.part_number)
  const pDesc = lower(product.description)
  const pCat  = lower(product.product_categories?.name_de || '')
  const pTags = Array.isArray(product.tags) ? product.tags.map(lower) : []

  const normPart  = lower(trim(eq.partNumber))
  const normMfg   = lower(trim(eq.manufacturer))
  const normModel = lower(trim(eq.model))
  const nameWords = lower(eq.name).split(/\s+/).filter(w => w.length >= 3)
  const dims      = lower(trim(eq.dimensions))

  let score = 0
  let reason = ''

  // ORIGINAL (100): Exakter Artikelnummer-Match
  if (normPart && pPart && (pPart === normPart || pPart.includes(normPart) || normPart.includes(pPart))) {
    score = 100
    reason = 'Artikelnummer übereinstimmt'
  }

  const mfgMatch   = !!normMfg && pMfg.includes(normMfg)
  const modelMatch = !!normModel && (pName.includes(normModel) || pDesc.includes(normModel))
  const nameMatch  = nameWords.some(w => pName.includes(w))

  // DERIVATE (80): Hersteller + Modell + Name
  if (mfgMatch && modelMatch && nameMatch && score < 80) {
    score = 80
    reason = 'Hersteller, Modell und Bezeichnung passen'
  }
  // DERIVATE (60): Hersteller + Modell
  if (mfgMatch && modelMatch && score < 60) {
    score = 60
    reason = 'Hersteller und Modell passen'
  }

  // RELATED (40): Hersteller + Kategorie
  if (mfgMatch && nameWords.some(w => pCat.includes(w)) && score < 40) {
    score = 40
    reason = 'Weitere Ausrüstung dieser Produktfamilie'
  }
  // RELATED (30): Nur Hersteller
  if (mfgMatch && score === 0) {
    score = 30
    reason = 'Vom selben Hersteller'
  }

  // RELATED (20): Wort-Match
  const wordMatch = nameWords.some(w =>
    pName.includes(w) || pDesc.includes(w) || pCat.includes(w) || pTags.some(t => t.includes(w))
  )
  if (wordMatch && score === 0) {
    score = 20
    reason = 'Mögliche Ergänzung'
  }

  // Maße-Bonus
  if (dims && pDesc && pDesc.includes(dims)) {
    score += 10
    reason = reason ? `${reason} · Maße passen` : 'Maße passen'
  }

  if (score === 0) return null
  return { score, reason }
}

/**
 * Klassifiziert einen Score in den passenden Bucket.
 */
export function bucketFor(score) {
  if (score >= 100) return 'original'
  if (score >= 60)  return 'derivate'
  return 'related'
}

/**
 * Visuelle Eigenschaften pro Bucket (Farben matchen iOS AppColors).
 */
export const BUCKET_META = {
  original: {
    label: 'Originalteile',
    sublabel: 'Eindeutige 1:1-Treffer über die Artikelnummer.',
    color: '#10b981',        // green – iOS AppColors.success
    bgColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    icon: '✓',
  },
  derivate: {
    label: '1:1 passende Derivate',
    sublabel: 'Gleicher Hersteller und passendes Modell — sollte direkt passen.',
    color: '#3b82f6',        // blue – iOS AppColors.info
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    icon: '◉',
  },
  related: {
    label: 'Weitere passende Ausrüstung',
    sublabel: 'Mögliche Ergänzungen — z. B. Module derselben Produktfamilie oder ähnliche Artikel.',
    color: '#f97316',        // orange – iOS AppColors.primary
    bgColor: '#fff7ed',
    borderColor: '#fed7aa',
    icon: '+',
  },
}

/**
 * Hauptfunktion: nimmt Produkt-Liste + Equipment-Daten und liefert die
 * 3 Buckets sortiert nach Score (höchster zuerst).
 */
export function classifyProducts(products, eq) {
  const scored = products
    .map(p => {
      const s = scoreProduct(p, eq)
      return s ? { product: p, ...s, bucket: bucketFor(s.score) } : null
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      const aStock = a.product.in_stock ?? a.product.stock_quantity > 0
      const bStock = b.product.in_stock ?? b.product.stock_quantity > 0
      if (aStock !== bStock) return aStock ? -1 : 1
      const aP = a.product.price ?? Number.POSITIVE_INFINITY
      const bP = b.product.price ?? Number.POSITIVE_INFINITY
      return aP - bP
    })

  return {
    originals: scored.filter(s => s.bucket === 'original'),
    derivates: scored.filter(s => s.bucket === 'derivate'),
    related:   scored.filter(s => s.bucket === 'related'),
  }
}

/**
 * Baut URL-Search-Params für /shop aus einem Equipment-Item.
 * Wenn diese Params präsent sind, schaltet Shop in den "Ersatzteil-Modus".
 */
export function buildSparePartsParams(item) {
  const params = new URLSearchParams()
  if (item.name)         params.set('eq_name', item.name)
  if (item.manufacturer) params.set('eq_mfg', item.manufacturer)
  if (item.model)        params.set('eq_model', item.model)
  if (item.part_number)  params.set('eq_part', item.part_number)
  if (item.dimensions)   params.set('eq_dim', item.dimensions)
  return params.toString()
}

/**
 * Liest Equipment-Daten aus URLSearchParams zurück.
 */
export function parseSparePartsParams(searchParams) {
  return {
    name:         searchParams.get('eq_name')  || '',
    manufacturer: searchParams.get('eq_mfg')   || '',
    model:        searchParams.get('eq_model') || '',
    partNumber:   searchParams.get('eq_part')  || '',
    dimensions:   searchParams.get('eq_dim')   || '',
  }
}

/**
 * True wenn mindestens ein Equipment-Param gesetzt ist.
 */
export function hasSparePartsContext(eq) {
  return !!(eq.name || eq.manufacturer || eq.model || eq.partNumber)
}
