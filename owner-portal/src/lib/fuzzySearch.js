// Leichte, client-seitige unscharfe Suche fuer kleine, bereits geladene
// Datensaetze (z. B. Ausruestung pro Nutzer). Diakritik-unabhaengig,
// Token-basiert mit Tippfehler-Toleranz (Levenshtein). Fuer den grossen
// Produktkatalog gibt es stattdessen die DB-RPC search_products.

export function normalize(s) {
  return (s == null ? '' : String(s))
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // Diakritika entfernen
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Levenshtein-Distanz (iterativ, zwei Zeilen).
function lev(a, b) {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1)
  let cur = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev; prev = cur; cur = tmp
  }
  return prev[n]
}

// Score 0..100. Jedes Query-Token muss irgendwo (Teilstring/Praefix/Tippfehler)
// passen, sonst 0. Je direkter der Treffer, desto hoeher.
export function fuzzyScore(haystack, query) {
  const h = normalize(haystack)
  const q = normalize(query)
  if (!q) return 100
  if (h.includes(q)) return 100

  const qTokens = q.split(' ').filter(Boolean)
  const hTokens = h.split(' ').filter(Boolean)
  if (qTokens.length === 0) return 100

  let total = 0
  for (const qt of qTokens) {
    let best = 0
    for (const ht of hTokens) {
      if (ht === qt) { best = 100; break }
      if (ht.startsWith(qt)) { best = Math.max(best, 90); continue }
      if (ht.includes(qt)) { best = Math.max(best, 80); continue }
      const tol = qt.length <= 4 ? 1 : 2
      const d = lev(qt, ht)
      if (d <= tol) best = Math.max(best, 70 - d * 10)
    }
    if (best === 0) return 0
    total += best
  }
  return total / qTokens.length
}

export function fuzzyMatch(haystack, query) {
  return fuzzyScore(haystack, query) > 0
}
