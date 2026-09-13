// Provider-kuratierte Produkt-Verknüpfungen (verifizierte Empfehlungen).
// Wird im Produkt-Edit-Formular für bestehende Produkte gerendert.
// Der Provider verknüpft von SEINEM Produkt aus Alternativen, erforderliches/
// optionales Zubehör oder Bundles; der Bootseigner sieht diese Hinweise später
// beim Produkt. Nutzt Tabelle product_relations (Migration 120).

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TYPES = [
  { value: 'zubehoer_erforderlich', de: 'Zubehör (erforderlich)',      en: 'Accessory (required)' },
  { value: 'zubehoer_optional',     de: 'Zubehör (optional)',          en: 'Accessory (optional)' },
  { value: 'alternative',           de: 'Alternative',                 en: 'Alternative' },
  { value: 'bundle',                de: 'Bundle (zusammen bestellen)', en: 'Bundle (buy together)' },
]

export default function ProductRelations({ productId, providerId, lang = 'de' }) {
  const L = (o) => (lang === 'de' ? o.de : o.en)
  const [relations, setRelations] = useState([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('zubehoer_erforderlich')
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_relations')
      .select('id, relation_type, note, target:metashop_products!product_relations_target_product_id_fkey(id,name,manufacturer)')
      .eq('source_product_id', productId)
      .order('sort_order').order('created_at')
    if (!error) setRelations(data || [])
    setLoading(false)
  }, [productId])

  useEffect(() => { load() }, [load])

  // Live-Suche über Shop-Produkte (Ziel darf beliebig sein), entprellt.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const s = ++seq.current
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('metashop_products')
        .select('id,name,manufacturer')
        .or(`name.ilike.%${q}%,manufacturer.ilike.%${q}%,part_number.ilike.%${q}%`)
        .neq('id', productId)
        .limit(12)
      if (s === seq.current) { setResults(data || []); setSearching(false) }
    }, 250)
    return () => clearTimeout(timer)
  }, [query, productId])

  async function addRelation(target) {
    setError(null)
    const { error } = await supabase.from('product_relations').insert({
      provider_id: providerId,
      source_product_id: productId,
      target_product_id: target.id,
      relation_type: type,
      note: note.trim() || null,
    })
    if (error) {
      setError(error.code === '23505'
        ? (lang === 'de' ? 'Bereits mit diesem Typ verknüpft.' : 'Already linked with this type.')
        : error.message)
      return
    }
    setQuery(''); setResults([]); setNote('')
    load()
  }

  async function removeRelation(id) {
    await supabase.from('product_relations').delete().eq('id', id)
    setRelations(rs => rs.filter(r => r.id !== id))
  }

  const grouped = TYPES.map(tp => ({ tp, items: relations.filter(r => r.relation_type === tp.value) }))

  return (
    <div style={S.wrap}>
      <h3 style={S.h}>{lang === 'de' ? 'Verknüpfte Produkte' : 'Linked products'}</h3>
      <p style={S.hint}>{lang === 'de'
        ? 'Verknüpfe Alternativen, erforderliches/optionales Zubehör oder Bundles. Diese Hinweise sieht der Bootseigner beim Produkt (z. B. DC-DC-Charger zur LiFePO₄-Batterie).'
        : 'Link alternatives, required/optional accessories or bundles. Boat owners see these hints on the product.'}</p>

      <div style={S.addRow}>
        <select value={type} onChange={e => setType(e.target.value)} style={S.select}>
          {TYPES.map(tp => <option key={tp.value} value={tp.value}>{L(tp)}</option>)}
        </select>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder={lang === 'de' ? 'Produkt suchen (Name, Hersteller, Teilenr.)…' : 'Search product (name, brand, part no.)…'}
          style={S.input} />
      </div>
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder={lang === 'de' ? 'Hinweis (optional), z. B. „begrenzt die Lichtmaschinen-Last"' : 'Note (optional)'}
        style={{ ...S.input, width: '100%', marginTop: 6 }} />

      {searching && <div style={S.muted}>…</div>}
      {results.length > 0 && (
        <div style={S.results}>
          {results.map(r => (
            <button key={r.id} type="button" onClick={() => addRelation(r)} style={S.resultBtn}>
              + {r.name}{r.manufacturer ? ` · ${r.manufacturer}` : ''}
            </button>
          ))}
        </div>
      )}
      {error && <div style={S.err}>{error}</div>}

      {loading ? <div style={S.muted}>…</div> : grouped.map(({ tp, items }) => items.length === 0 ? null : (
        <div key={tp.value} style={{ marginTop: 12 }}>
          <div style={S.group}>{L(tp)}</div>
          {items.map(r => (
            <div key={r.id} style={S.item}>
              <span>{r.target?.name || '—'}{r.target?.manufacturer ? ` · ${r.target.manufacturer}` : ''}
                {r.note ? <em style={S.note}> — {r.note}</em> : null}</span>
              <button type="button" onClick={() => removeRelation(r.id)} style={S.del} aria-label="entfernen">×</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const S = {
  wrap: { marginTop: 22, padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' },
  h: { margin: '0 0 4px', fontSize: 16, color: '#0B1D3A' },
  hint: { margin: '0 0 12px', fontSize: 13, color: '#64748b', lineHeight: 1.5 },
  addRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  select: { padding: '9px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', minWidth: 190 },
  input: { flex: 1, minWidth: 200, padding: '9px 10px', borderRadius: 8, border: '1px solid #cbd5e1' },
  results: { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' },
  resultBtn: { textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#0B1D3A' },
  muted: { color: '#94a3b8', fontSize: 13, marginTop: 6 },
  err: { color: '#dc2626', fontSize: 13, marginTop: 6 },
  group: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#f97316', marginBottom: 4 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 4, fontSize: 14, color: '#0B1D3A' },
  note: { color: '#64748b', fontStyle: 'italic' },
  del: { border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '0 4px' },
}
