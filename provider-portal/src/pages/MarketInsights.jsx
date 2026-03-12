import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { BarChart3, Sailboat, Anchor, Wrench, Factory, TrendingUp, Lightbulb, RefreshCw } from 'lucide-react'

export default function MarketInsights() {
  const { provider } = useAuth()
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (provider) loadInsights()
  }, [provider])

  async function loadInsights() {
    setLoading(true)
    setError(null)
    try {
      // Versuche zuerst die RPC-Funktion
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_market_insights')

      if (!rpcError && rpcData) {
        setInsights(rpcData)
      } else {
        // Fallback: Einzelne Abfragen auf die Views
        const [boatTypes, boatMfrs, equipCats, equipMfrs] = await Promise.all([
          supabase.from('boat_type_stats').select('*').limit(15),
          supabase.from('boat_manufacturer_stats').select('*').limit(15),
          supabase.from('equipment_category_stats').select('*').limit(15),
          supabase.from('equipment_manufacturer_stats').select('*').limit(15),
        ])

        // Gesamtzahlen berechnen
        const totalBoats = (boatTypes.data || []).reduce((sum, r) => sum + r.count, 0)
        const totalEquip = (equipCats.data || []).reduce((sum, r) => sum + r.count, 0)

        setInsights({
          fleet_overview: {
            total_boats: totalBoats,
            unique_boat_types: (boatTypes.data || []).length,
            unique_boat_manufacturers: (boatMfrs.data || []).length,
            total_equipment: totalEquip,
            unique_equipment_categories: (equipCats.data || []).length,
            unique_equipment_manufacturers: (equipMfrs.data || []).length,
          },
          boat_types: boatTypes.data || [],
          boat_manufacturers: boatMfrs.data || [],
          equipment_categories: equipCats.data || [],
          equipment_manufacturers: equipMfrs.data || [],
        })
      }
    } catch (err) {
      console.error('Marktanalyse-Fehler:', err)
      setError('Daten konnten nicht geladen werden. Bitte stellen Sie sicher, dass die Migration 031 ausgeführt wurde.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">Laden...</div>

  if (error) {
    return (
      <div className="page">
        <h1>Marktanalyse</h1>
        <div className="message message-error">{error}</div>
        <button className="btn-primary" onClick={loadInsights}>
          <RefreshCw size={16} /> Erneut versuchen
        </button>
      </div>
    )
  }

  const overview = insights?.fleet_overview || {}
  const boatTypes = insights?.boat_types || []
  const boatManufacturers = insights?.boat_manufacturers || []
  const equipmentCategories = insights?.equipment_categories || []
  const equipmentManufacturers = insights?.equipment_manufacturers || []

  // Empfehlungen generieren
  const recommendations = generateRecommendations(boatTypes, boatManufacturers, equipmentCategories, overview)

  return (
    <div className="page">
      <div className="page-header">
        <h1>📊 Marktanalyse</h1>
        <button className="btn-secondary" onClick={loadInsights}>
          <RefreshCw size={16} /> Aktualisieren
        </button>
      </div>
      <p className="subtitle">Anonymisierte Einblicke in die BoatCare-Nutzerflotte — nutzen Sie diese Daten für gezielte Angebote.</p>

      {/* Übersicht */}
      <div className="stats-grid">
        <StatCard icon={<Sailboat />} label="Boote gesamt" value={overview.total_boats || 0} color="#3b82f6" />
        <StatCard icon={<Anchor />} label="Bootstypen" value={overview.unique_boat_types || 0} color="#10b981" />
        <StatCard icon={<Wrench />} label="Ausrüstung gesamt" value={overview.total_equipment || 0} color="#f97316" />
        <StatCard icon={<Factory />} label="Equip.-Hersteller" value={overview.unique_equipment_manufacturers || 0} color="#8b5cf6" />
      </div>

      {/* Empfehlungen */}
      {recommendations.length > 0 && (
        <div className="card insights-recommendations">
          <h2><Lightbulb size={20} /> Empfehlungen für Ihr Angebot</h2>
          <div className="recommendation-list">
            {recommendations.map((rec, i) => (
              <div key={i} className="recommendation-item">
                <span className="rec-icon">{rec.icon}</span>
                <div>
                  <strong>{rec.title}</strong>
                  <p>{rec.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="insights-grid">
        {/* Bootstypen */}
        <div className="card">
          <h2><Sailboat size={18} /> Bootstypen-Verteilung</h2>
          {boatTypes.length === 0 ? (
            <p className="empty-text">Keine Daten verfügbar</p>
          ) : (
            <BarList data={boatTypes} labelKey="boat_type" valueKey="count" color="#3b82f6" />
          )}
        </div>

        {/* Boots-Hersteller */}
        <div className="card">
          <h2><Anchor size={18} /> Top Boots-Hersteller</h2>
          {boatManufacturers.length === 0 ? (
            <p className="empty-text">Keine Daten verfügbar</p>
          ) : (
            <BarList data={boatManufacturers} labelKey="manufacturer" valueKey="count" color="#10b981" />
          )}
        </div>

        {/* Equipment-Kategorien */}
        <div className="card">
          <h2><Wrench size={18} /> Ausrüstungs-Kategorien</h2>
          {equipmentCategories.length === 0 ? (
            <p className="empty-text">Keine Daten verfügbar</p>
          ) : (
            <BarList data={equipmentCategories} labelKey="category" valueKey="count" color="#f97316" labelMap={equipmentCategoryLabels} />
          )}
        </div>

        {/* Equipment-Hersteller */}
        <div className="card">
          <h2><Factory size={18} /> Top Ausrüstungs-Hersteller</h2>
          {equipmentManufacturers.length === 0 ? (
            <p className="empty-text">Keine Daten verfügbar</p>
          ) : (
            <BarList data={equipmentManufacturers} labelKey="manufacturer" valueKey="count" color="#8b5cf6" />
          )}
        </div>
      </div>
    </div>
  )
}

// CSS-only Balkendiagramm
function BarList({ data, labelKey, valueKey, color, labelMap }) {
  const maxValue = Math.max(...data.map(d => d[valueKey]), 1)
  const total = data.reduce((sum, d) => sum + d[valueKey], 0)

  return (
    <div className="bar-list">
      {data.map((item, i) => {
        const pct = ((item[valueKey] / maxValue) * 100).toFixed(0)
        const share = ((item[valueKey] / total) * 100).toFixed(1)
        const label = labelMap ? (labelMap[item[labelKey]] || item[labelKey]) : item[labelKey]

        return (
          <div key={i} className="bar-item">
            <div className="bar-header">
              <span className="bar-label">{label}</span>
              <span className="bar-value">{item[valueKey]} <span className="bar-pct">({share}%)</span></span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <div className="stat-info">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  )
}

// Equipment-Kategorien übersetzen
const equipmentCategoryLabels = {
  engine: '⚙️ Motor',
  electronics: '📡 Elektronik',
  safety: '🦺 Sicherheit',
  navigation: '🧭 Navigation',
  sails: '⛵ Segel & Rigg',
  deck: '🔩 Deck & Beschläge',
  comfort: '🛋️ Komfort',
  plumbing: '🚿 Sanitär',
  electrical: '⚡ Elektrik',
  hull: '🛥️ Rumpf',
  other: '📦 Sonstiges',
}

// Empfehlungen generieren basierend auf Daten
function generateRecommendations(boatTypes, boatManufacturers, equipmentCategories, overview) {
  const recs = []
  const totalBoats = overview.total_boats || 0
  if (totalBoats === 0) return recs

  // Top Bootstyp
  if (boatTypes.length > 0) {
    const top = boatTypes[0]
    const pct = ((top.count / totalBoats) * 100).toFixed(0)
    recs.push({
      icon: '⛵',
      title: `${pct}% der Nutzer haben ${top.boat_type === 'Segelboot' ? 'ein Segelboot' : top.boat_type === 'Motorboot' ? 'ein Motorboot' : 'den Typ "' + top.boat_type + '"'}`,
      text: `Bieten Sie gezielt Produkte für ${top.boat_type}e an — das ist die größte Zielgruppe.`,
    })
  }

  // Top Hersteller
  if (boatManufacturers.length > 0) {
    const topMfrs = boatManufacturers.slice(0, 3).map(m => m.manufacturer)
    recs.push({
      icon: '🏭',
      title: `Top Hersteller: ${topMfrs.join(', ')}`,
      text: 'Stellen Sie sicher, dass Sie passende Ersatzteile und Zubehör für diese Marken führen.',
    })
  }

  // Equipment-Lücken
  const totalEquip = overview.total_equipment || 0
  if (totalEquip > 0 && equipmentCategories.length > 0) {
    const topCat = equipmentCategories[0]
    const catLabel = equipmentCategoryLabels[topCat.category] || topCat.category
    recs.push({
      icon: '🔧',
      title: `Meiste Ausrüstung: ${catLabel}`,
      text: `${topCat.count} Geräte in dieser Kategorie — bieten Sie Wartungszubehör und Ersatzteile an.`,
    })
  }

  // Wenn viele Boote aber wenig Equipment
  if (totalBoats > 10 && totalEquip < totalBoats) {
    recs.push({
      icon: '📈',
      title: 'Wachstumspotenzial: Ausstattungs-Zubehör',
      text: `Viele Nutzer haben noch wenig registrierte Ausrüstung. Bieten Sie Starter-Pakete und Basis-Ausstattung an.`,
    })
  }

  return recs
}
