import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Sailboat, Anchor, Wrench, Factory, TrendingUp, Lightbulb,
  RefreshCw, Clock, AlertTriangle, CheckCircle, Calendar, Settings,
  ChevronRight, ChevronLeft, ArrowRight, Tag, ShoppingCart, Package,
  Filter, Eye, Zap
} from 'lucide-react'

export default function MarketInsights() {
  const { provider } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState(null)
  const [equipmentData, setEquipmentData] = useState(null)
  const [rawEquipment, setRawEquipment] = useState([])
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [providerProducts, setProviderProducts] = useState([])

  // Drilldown state: array of breadcrumb levels
  // Each level: { type: 'overview'|'category'|'manufacturer'|'boatType'|'boatMfr'|'model'|'recommendation', label, filter }
  const [drillPath, setDrillPath] = useState([{ type: 'overview', label: 'Marktanalyse' }])

  useEffect(() => {
    if (provider) {
      loadInsights()
      loadProviderProducts()
    }
  }, [provider])

  async function loadInsights() {
    setLoading(true)
    setError(null)
    try {
      const [insightsResult, equipResult] = await Promise.all([
        loadMarketData(),
        supabase.from('equipment').select('category, manufacturer, model, name, installation_date, last_maintenance_date, next_maintenance_date, maintenance_cycle_years').limit(500)
      ])
      setInsights(insightsResult)
      if (equipResult.data) {
        setRawEquipment(equipResult.data)
        setEquipmentData(aggregateEquipmentData(equipResult.data))
      }
    } catch (err) {
      console.error('Marktanalyse-Fehler:', err)
      setError('Daten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  async function loadProviderProducts() {
    if (!provider) return
    const { data } = await supabase
      .from('metashop_products')
      .select('id, name, manufacturer, category, category_id, price, image_url, in_stock, is_active')
      .eq('provider_id', provider.id)
      .eq('is_active', true)
    setProviderProducts(data || [])
  }

  async function loadMarketData() {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_market_insights')
    if (!rpcError && rpcData) return rpcData
    const [boatTypes, boatMfrs, equipCats, equipMfrs] = await Promise.all([
      supabase.from('boat_type_stats').select('*').limit(15),
      supabase.from('boat_manufacturer_stats').select('*').limit(15),
      supabase.from('equipment_category_stats').select('*').limit(15),
      supabase.from('equipment_manufacturer_stats').select('*').limit(15),
    ])
    const totalBoats = (boatTypes.data || []).reduce((sum, r) => sum + r.count, 0)
    const totalEquip = (equipCats.data || []).reduce((sum, r) => sum + r.count, 0)
    return {
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
    }
  }

  // Drilldown navigation
  function drillInto(level) {
    setDrillPath(prev => [...prev, level])
  }

  function drillBack() {
    setDrillPath(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
  }

  function drillToLevel(index) {
    setDrillPath(prev => prev.slice(0, index + 1))
  }

  // Get filtered equipment based on drilldown
  function getFilteredEquipment() {
    const currentLevel = drillPath[drillPath.length - 1]
    let filtered = [...rawEquipment]

    // Apply all drill filters in path
    for (const level of drillPath) {
      if (level.filter) {
        if (level.filter.category) filtered = filtered.filter(e => (e.category || '').toLowerCase() === level.filter.category.toLowerCase())
        if (level.filter.manufacturer) filtered = filtered.filter(e => (e.manufacturer || '').toLowerCase().includes(level.filter.manufacturer.toLowerCase()))
        if (level.filter.model) filtered = filtered.filter(e => (e.model || '') === level.filter.model)
        if (level.filter.overdueOnly) {
          const now = new Date()
          filtered = filtered.filter(e => {
            if (!e.next_maintenance_date) return false
            return new Date(e.next_maintenance_date) < now
          })
        }
        if (level.filter.dueSoonOnly) {
          const now = new Date()
          filtered = filtered.filter(e => {
            if (!e.next_maintenance_date) return false
            const d = new Date(e.next_maintenance_date)
            const days = Math.floor((d - now) / (24 * 60 * 60 * 1000))
            return days >= 0 && days <= 90
          })
        }
        if (level.filter.oldOnly) {
          const now = new Date()
          filtered = filtered.filter(e => {
            if (!e.installation_date) return false
            const years = (now - new Date(e.installation_date)) / (365.25 * 24 * 60 * 60 * 1000)
            return years > 5
          })
        }
        if (level.filter.noMaintenanceOnly) {
          filtered = filtered.filter(e => !e.last_maintenance_date && !e.next_maintenance_date)
        }
      }
    }
    return filtered
  }

  // Find matching provider products for a given filter
  function findMatchingProducts(filter) {
    if (!filter) return []
    return providerProducts.filter(p => {
      if (filter.category) {
        const catLabel = equipmentCategoryLabels[filter.category]
        const catName = catLabel ? catLabel.replace(/^[^\s]+\s/, '') : filter.category
        if (p.category && p.category.toLowerCase().includes(catName.toLowerCase())) return true
        if (p.name && p.name.toLowerCase().includes(filter.category.toLowerCase())) return true
      }
      if (filter.manufacturer) {
        if (p.manufacturer && p.manufacturer.toLowerCase().includes(filter.manufacturer.toLowerCase())) return true
        if (p.name && p.name.toLowerCase().includes(filter.manufacturer.toLowerCase())) return true
      }
      return false
    })
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

  const allRecommendations = generateRecommendations(boatTypes, boatManufacturers, equipmentCategories, overview, equipmentData)

  const currentLevel = drillPath[drillPath.length - 1]
  const isOverview = currentLevel.type === 'overview'

  const tabs = [
    { id: 'overview', label: 'Flotten-Überblick', icon: <Sailboat size={16} /> },
    { id: 'models', label: 'Modelle & Geräte', icon: <Settings size={16} /> },
    { id: 'age', label: 'Installationsalter', icon: <Calendar size={16} /> },
    { id: 'maintenance', label: 'Wartungsstatus', icon: <Wrench size={16} /> },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1>📊 Marktanalyse</h1>
        <button className="btn-secondary" onClick={loadInsights}>
          <RefreshCw size={16} /> Aktualisieren
        </button>
      </div>
      <p className="subtitle">Anonymisierte Einblicke in die Skipily-Nutzerflotte — nutzen Sie diese Daten für gezielte Angebote.</p>

      {/* Breadcrumb Navigation */}
      {drillPath.length > 1 && (
        <Breadcrumb path={drillPath} onNavigate={drillToLevel} onBack={drillBack} />
      )}

      {/* Drilldown Content */}
      {!isOverview ? (
        <DrilldownView
          level={currentLevel}
          filteredEquipment={getFilteredEquipment()}
          rawEquipment={rawEquipment}
          providerProducts={providerProducts}
          findMatchingProducts={findMatchingProducts}
          onDrill={drillInto}
          onCreateOffer={(filter) => navigate('/promotions', { state: { prefill: filter } })}
          navigate={navigate}
          provider={provider}
        />
      ) : (
        <>
          {/* Overview Stat Cards - clickable */}
          <div className="stats-grid">
            <StatCard icon={<Sailboat />} label="Boote gesamt" value={overview.total_boats || 0} color="#3b82f6" />
            <StatCard icon={<Wrench />} label="Ausrüstung gesamt" value={overview.total_equipment || 0} color="#f97316" />
            <div className="stat-card stat-card-clickable" onClick={() => drillInto({
              type: 'filtered', label: '🚨 Wartung überfällig',
              filter: { overdueOnly: true }
            })}>
              <div className="stat-icon" style={{ color: '#ef4444' }}><AlertTriangle /></div>
              <div className="stat-info">
                <span className="stat-value">{equipmentData?.maintenanceSummary?.overdue || 0}</span>
                <span className="stat-label">Wartung fällig</span>
              </div>
              <ChevronRight size={16} className="stat-drill-icon" />
            </div>
            <div className="stat-card stat-card-clickable" onClick={() => drillInto({
              type: 'filtered', label: '⏰ Wartung bald fällig',
              filter: { dueSoonOnly: true }
            })}>
              <div className="stat-icon" style={{ color: '#eab308' }}><Clock /></div>
              <div className="stat-info">
                <span className="stat-value">{equipmentData?.maintenanceSummary?.dueSoon || 0}</span>
                <span className="stat-label">Wartung bald fällig</span>
              </div>
              <ChevronRight size={16} className="stat-drill-icon" />
            </div>
          </div>

          {/* Recommendations - clickable */}
          {allRecommendations.length > 0 && (
            <div className="card insights-recommendations">
              <h2><Lightbulb size={20} /> Empfehlungen für Ihr Angebot</h2>
              <div className="recommendation-list">
                {allRecommendations.map((rec, i) => (
                  <div
                    key={i}
                    className={`recommendation-item ${rec.priority || ''} ${rec.drillFilter ? 'rec-clickable' : ''}`}
                    onClick={() => {
                      if (rec.drillFilter) {
                        drillInto({ type: 'recommendation', label: rec.title, filter: rec.drillFilter, recContext: rec })
                      }
                    }}
                  >
                    <span className="rec-icon">{rec.icon}</span>
                    <div style={{ flex: 1 }}>
                      <strong>{rec.title}</strong>
                      <p>{rec.text}</p>
                    </div>
                    {rec.priority === 'high' && <span className="rec-badge">Hohe Priorität</span>}
                    {rec.drillFilter && <ChevronRight size={18} className="rec-drill-arrow" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab-Navigation */}
          <div className="insights-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab-Inhalte - with clickable bars */}
          {activeTab === 'overview' && (
            <div className="insights-grid">
              <div className="card">
                <h2><Sailboat size={18} /> Bootstypen-Verteilung</h2>
                {boatTypes.length === 0 ? <p className="empty-text">Keine Daten verfügbar</p> :
                  <BarList data={boatTypes} labelKey="boat_type" valueKey="count" color="#3b82f6"
                    onClick={(item) => drillInto({ type: 'boatType', label: `Bootstyp: ${item.boat_type}`, filter: { boatType: item.boat_type } })} />}
              </div>
              <div className="card">
                <h2><Anchor size={18} /> Top Boots-Hersteller</h2>
                {boatManufacturers.length === 0 ? <p className="empty-text">Keine Daten verfügbar</p> :
                  <BarList data={boatManufacturers} labelKey="manufacturer" valueKey="count" color="#10b981"
                    onClick={(item) => drillInto({ type: 'boatMfr', label: `Bootshersteller: ${item.manufacturer}`, filter: { boatManufacturer: item.manufacturer } })} />}
              </div>
              <div className="card">
                <h2><Wrench size={18} /> Ausrüstungs-Kategorien</h2>
                {equipmentCategories.length === 0 ? <p className="empty-text">Keine Daten verfügbar</p> :
                  <BarList data={equipmentCategories} labelKey="category" valueKey="count" color="#f97316" labelMap={equipmentCategoryLabels}
                    onClick={(item) => drillInto({ type: 'category', label: equipmentCategoryLabels[item.category] || item.category, filter: { category: item.category } })} />}
              </div>
              <div className="card">
                <h2><Factory size={18} /> Top Ausrüstungs-Hersteller</h2>
                {equipmentManufacturers.length === 0 ? <p className="empty-text">Keine Daten verfügbar</p> :
                  <BarList data={equipmentManufacturers} labelKey="manufacturer" valueKey="count" color="#8b5cf6"
                    onClick={(item) => drillInto({ type: 'manufacturer', label: `Hersteller: ${item.manufacturer}`, filter: { manufacturer: item.manufacturer } })} />}
              </div>
            </div>
          )}

          {activeTab === 'models' && <ModelsTab data={equipmentData} onDrill={drillInto} />}
          {activeTab === 'age' && <AgeTab data={equipmentData} onDrill={drillInto} />}
          {activeTab === 'maintenance' && <MaintenanceTab data={equipmentData} onDrill={drillInto} />}
        </>
      )}
    </div>
  )
}

// ============================================================
// Breadcrumb Navigation
// ============================================================
function Breadcrumb({ path, onNavigate, onBack }) {
  return (
    <div className="drill-breadcrumb">
      <button className="drill-back-btn" onClick={onBack}>
        <ChevronLeft size={18} /> Zurück
      </button>
      <div className="drill-crumbs">
        {path.map((level, i) => (
          <span key={i}>
            {i > 0 && <ChevronRight size={14} className="crumb-sep" />}
            <button
              className={`crumb-btn ${i === path.length - 1 ? 'active' : ''}`}
              onClick={() => onNavigate(i)}
            >
              {level.label}
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Drilldown Detail View
// ============================================================
function DrilldownView({ level, filteredEquipment, rawEquipment, providerProducts, findMatchingProducts, onDrill, onCreateOffer, navigate, provider }) {
  const filter = level.filter || {}
  const aggregated = aggregateEquipmentData(filteredEquipment)

  // Find matching provider products for this drill filter
  const matchingProducts = findMatchingProducts(filter)

  // Sub-aggregations for further drilldown
  const categoryBreakdown = {}
  const manufacturerBreakdown = {}
  const modelBreakdown = {}

  filteredEquipment.forEach(e => {
    const cat = (e.category || 'other').toLowerCase()
    const mfr = (e.manufacturer || 'Unbekannt').trim()
    const model = (e.model || '').trim()

    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = 0
    categoryBreakdown[cat]++

    if (mfr) {
      if (!manufacturerBreakdown[mfr]) manufacturerBreakdown[mfr] = 0
      manufacturerBreakdown[mfr]++
    }

    if (model) {
      const key = `${mfr}|${model}`
      if (!modelBreakdown[key]) modelBreakdown[key] = { manufacturer: mfr, model, name: (e.name || '').trim(), category: cat, count: 0 }
      modelBreakdown[key].count++
    }
  })

  const catList = Object.entries(categoryBreakdown)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const mfrList = Object.entries(manufacturerBreakdown)
    .map(([manufacturer, count]) => ({ manufacturer, count }))
    .sort((a, b) => b.count - a.count)

  const modelList = Object.values(modelBreakdown).sort((a, b) => b.count - a.count)

  // Maintenance stats for this filter
  const now = new Date()
  let overdue = 0, dueSoon = 0
  filteredEquipment.forEach(e => {
    if (e.next_maintenance_date) {
      const d = new Date(e.next_maintenance_date)
      const days = Math.floor((d - now) / (24 * 60 * 60 * 1000))
      if (days < 0) overdue++
      else if (days <= 90) dueSoon++
    }
  })

  return (
    <div className="drilldown-view">
      {/* Summary Stats */}
      <div className="stats-grid">
        <StatCard icon={<Package />} label="Geräte gefiltert" value={filteredEquipment.length} color="#3b82f6" />
        <StatCard icon={<Factory />} label="Hersteller" value={mfrList.length} color="#8b5cf6" />
        <StatCard icon={<AlertTriangle />} label="Überfällig" value={overdue} color="#ef4444" />
        <StatCard icon={<Clock />} label="Bald fällig" value={dueSoon} color="#eab308" />
      </div>

      {/* Matching Provider Products - Portfolio Offer */}
      {matchingProducts.length > 0 && (
        <div className="card portfolio-match-card">
          <div className="portfolio-match-header">
            <h2><ShoppingCart size={18} /> Passende Produkte aus Ihrem Portfolio ({matchingProducts.length})</h2>
            <button className="btn-primary btn-offer" onClick={() => {
              const filterCategories = filter.category ? [equipmentCategoryLabels[filter.category]?.replace(/^[^\s]+\s/, '') || filter.category] : []
              const filterMfrs = filter.manufacturer ? [filter.manufacturer] : []
              navigate('/promotions', { state: { prefill: {
                name: `Aktion: ${level.label}`,
                description: `Basierend auf Marktanalyse — ${filteredEquipment.length} Geräte in der Flotte`,
                filter_categories: filterCategories.join(', '),
                filter_manufacturers: filterMfrs.join(', '),
              }}})
            }}>
              <Tag size={16} /> Angebot erstellen
            </button>
          </div>
          <p className="card-subtitle">Diese aktiven Produkte aus Ihrem Shop passen zum aktuellen Marktfilter. Erstellen Sie ein gezieltes Angebot!</p>
          <div className="portfolio-products-grid">
            {matchingProducts.slice(0, 6).map(p => (
              <div key={p.id} className="portfolio-product-card" onClick={() => navigate('/products')}>
                <div className="pp-image">
                  {p.image_url ? <img src={p.image_url} alt={p.name} /> : <Package size={20} />}
                </div>
                <div className="pp-info">
                  <strong>{p.name}</strong>
                  {p.manufacturer && <span className="pp-mfr">{p.manufacturer}</span>}
                  {p.price && <span className="pp-price">{Number(p.price).toFixed(2)} €</span>}
                </div>
              </div>
            ))}
          </div>
          {matchingProducts.length > 6 && (
            <p className="portfolio-more">+ {matchingProducts.length - 6} weitere Produkte</p>
          )}
        </div>
      )}

      {/* No matching products - suggest creating */}
      {matchingProducts.length === 0 && (
        <div className="card portfolio-empty-card">
          <div className="portfolio-empty-content">
            <Zap size={24} />
            <div>
              <strong>Marktchance!</strong>
              <p>{filteredEquipment.length} Geräte in der Flotte — aber noch keine passenden Produkte in Ihrem Shop. Legen Sie jetzt Produkte an!</p>
            </div>
            <button className="btn-primary" onClick={() => navigate('/products')}>
              <Package size={16} /> Produkt anlegen
            </button>
          </div>
        </div>
      )}

      <div className="insights-grid">
        {/* Category Breakdown (if not already filtered by category) */}
        {!filter.category && catList.length > 1 && (
          <div className="card">
            <h2><Wrench size={18} /> Kategorien</h2>
            <BarList data={catList} labelKey="category" valueKey="count" color="#f97316" labelMap={equipmentCategoryLabels}
              onClick={(item) => onDrill({ type: 'category', label: equipmentCategoryLabels[item.category] || item.category, filter: { ...filter, category: item.category } })} />
          </div>
        )}

        {/* Manufacturer Breakdown (if not already filtered by manufacturer) */}
        {!filter.manufacturer && mfrList.length > 1 && (
          <div className="card">
            <h2><Factory size={18} /> Hersteller</h2>
            <BarList data={mfrList.slice(0, 15)} labelKey="manufacturer" valueKey="count" color="#8b5cf6"
              onClick={(item) => onDrill({ type: 'manufacturer', label: `Hersteller: ${item.manufacturer}`, filter: { ...filter, manufacturer: item.manufacturer } })} />
          </div>
        )}

        {/* Model Table */}
        {modelList.length > 0 && (
          <div className="card card-full">
            <h2><Settings size={18} /> Geräte-Modelle ({modelList.length})</h2>
            <div className="model-table">
              <table>
                <thead>
                  <tr>
                    <th>Gerät</th>
                    <th>Hersteller</th>
                    <th>Modell</th>
                    <th>Kategorie</th>
                    <th className="text-right">Anzahl</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {modelList.slice(0, 20).map((m, i) => (
                    <tr key={i} className="drill-row" onClick={() => onDrill({
                      type: 'model', label: `${m.manufacturer} ${m.model}`,
                      filter: { ...filter, manufacturer: m.manufacturer, model: m.model }
                    })}>
                      <td><strong>{m.name}</strong></td>
                      <td>{m.manufacturer}</td>
                      <td><code>{m.model}</code></td>
                      <td><span className="cat-badge">{equipmentCategoryLabels[m.category] || m.category}</span></td>
                      <td className="text-right"><strong>{m.count}</strong></td>
                      <td className="text-right"><ChevronRight size={14} style={{ color: 'var(--gray-400)' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Equipment Detail List (for deepest level or small result set) */}
        {(filter.model || filteredEquipment.length <= 10) && filteredEquipment.length > 0 && (
          <div className="card card-full">
            <h2><Eye size={18} /> Einzelne Geräte ({filteredEquipment.length})</h2>
            <p className="card-subtitle">Detailansicht der gefilterten Ausrüstung</p>
            <div className="model-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Hersteller</th>
                    <th>Modell</th>
                    <th>Kategorie</th>
                    <th>Installiert</th>
                    <th>Letzte Wartung</th>
                    <th>Nächste Wartung</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.slice(0, 30).map((e, i) => {
                    const status = getMaintenanceStatus(e)
                    return (
                      <tr key={i}>
                        <td><strong>{(e.name || '').trim() || '—'}</strong></td>
                        <td>{(e.manufacturer || '').trim() || '—'}</td>
                        <td>{e.model ? <code>{e.model}</code> : '—'}</td>
                        <td><span className="cat-badge">{equipmentCategoryLabels[(e.category || '').toLowerCase()] || e.category}</span></td>
                        <td>{e.installation_date ? new Date(e.installation_date).toLocaleDateString('de-DE') : '—'}</td>
                        <td>{e.last_maintenance_date ? new Date(e.last_maintenance_date).toLocaleDateString('de-DE') : '—'}</td>
                        <td>{e.next_maintenance_date ? new Date(e.next_maintenance_date).toLocaleDateString('de-DE') : '—'}</td>
                        <td><span className={`badge ${status.badge}`}>{status.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getMaintenanceStatus(equipment) {
  const now = new Date()
  if (equipment.next_maintenance_date) {
    const d = new Date(equipment.next_maintenance_date)
    const days = Math.floor((d - now) / (24 * 60 * 60 * 1000))
    if (days < 0) return { label: `${Math.abs(days)}d überfällig`, badge: 'badge-cancelled' }
    if (days <= 90) return { label: `In ${days}d fällig`, badge: 'badge-pending' }
    return { label: 'Aktuell', badge: 'badge-delivered' }
  }
  if (!equipment.last_maintenance_date) return { label: 'Nie gewartet', badge: 'badge-refunded' }
  return { label: 'OK', badge: 'badge-confirmed' }
}

// ============================================================
// Tab: Modelle & Geräte (with drilldown)
// ============================================================
function ModelsTab({ data, onDrill }) {
  if (!data || data.models.length === 0) {
    return <div className="card"><p className="empty-text">Keine Modell-Daten verfügbar</p></div>
  }

  return (
    <div className="insights-grid">
      <div className="card card-full">
        <h2><Settings size={18} /> Häufigste Geräte-Modelle</h2>
        <p className="card-subtitle">Klicken Sie auf ein Modell für Details und Angebotsmöglichkeiten</p>
        <div className="model-table">
          <table>
            <thead>
              <tr>
                <th>Gerät</th>
                <th>Hersteller</th>
                <th>Modell</th>
                <th>Kategorie</th>
                <th className="text-right">Anzahl</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.models.slice(0, 20).map((m, i) => (
                <tr key={i} className="drill-row" onClick={() => onDrill({
                  type: 'model',
                  label: `${m.manufacturer} ${m.model}`,
                  filter: { manufacturer: m.manufacturer, model: m.model, category: m.category }
                })}>
                  <td><strong>{m.name}</strong></td>
                  <td>{m.manufacturer}</td>
                  <td><code>{m.model}</code></td>
                  <td><span className="cat-badge">{equipmentCategoryLabels[m.category] || m.category}</span></td>
                  <td className="text-right"><strong>{m.count}</strong></td>
                  <td className="text-right"><ChevronRight size={14} style={{ color: 'var(--gray-400)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2><Factory size={18} /> Modelle pro Hersteller</h2>
        <BarList data={data.manufacturerModelCounts.slice(0, 10)} labelKey="manufacturer" valueKey="modelCount" color="#6366f1"
          onClick={(item) => onDrill({ type: 'manufacturer', label: `Hersteller: ${item.manufacturer}`, filter: { manufacturer: item.manufacturer } })} />
      </div>

      <div className="card">
        <h2><Wrench size={18} /> Modelle pro Kategorie</h2>
        <BarList data={data.categoryModelCounts.slice(0, 10)} labelKey="category" valueKey="modelCount" color="#f97316" labelMap={equipmentCategoryLabels}
          onClick={(item) => onDrill({ type: 'category', label: equipmentCategoryLabels[item.category] || item.category, filter: { category: item.category } })} />
      </div>
    </div>
  )
}

// ============================================================
// Tab: Installationsalter (with drilldown)
// ============================================================
function AgeTab({ data, onDrill }) {
  if (!data || data.ageGroups.length === 0) {
    return <div className="card"><p className="empty-text">Keine Installations-Daten verfügbar</p></div>
  }

  const ageColors = {
    '< 1 Jahr': '#22c55e', '1-3 Jahre': '#84cc16', '3-5 Jahre': '#eab308',
    '5-10 Jahre': '#f97316', '10+ Jahre': '#ef4444', 'Unbekannt': '#94a3b8',
  }

  return (
    <div className="insights-grid">
      <div className="card card-full">
        <h2><Calendar size={18} /> Altersverteilung der Ausrüstung</h2>
        <p className="card-subtitle">Klicken Sie auf eine Altersgruppe für Details. Ältere Geräte = höherer Wartungsbedarf.</p>
        <div className="age-chart">
          {data.ageGroups.map((ag, i) => {
            const pct = data.totalWithAge > 0 ? ((ag.count / data.totalWithAge) * 100) : 0
            return (
              <div key={i} className="age-bar-row age-bar-clickable" onClick={() => {
                if (ag.group === '5-10 Jahre' || ag.group === '10+ Jahre') {
                  onDrill({ type: 'filtered', label: `Alter: ${ag.group}`, filter: { oldOnly: true } })
                }
              }}>
                <span className="age-label">{ag.group}</span>
                <div className="age-bar-track">
                  <div className="age-bar-fill" style={{
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: ageColors[ag.group] || '#94a3b8'
                  }} />
                </div>
                <span className="age-value">{ag.count} ({pct.toFixed(0)}%)</span>
                {(ag.group === '5-10 Jahre' || ag.group === '10+ Jahre') && (
                  <ChevronRight size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h2><Clock size={18} /> Durchschnittsalter pro Kategorie</h2>
        <p className="card-subtitle">Klicken Sie auf eine Kategorie um Details zu sehen</p>
        {data.avgAgeByCategory.length === 0 ? <p className="empty-text">Keine Daten</p> : (
          <div className="bar-list">
            {data.avgAgeByCategory.map((item, i) => {
              const maxAge = Math.max(...data.avgAgeByCategory.map(a => a.avgYears), 1)
              const pct = (item.avgYears / maxAge) * 100
              const color = item.avgYears > 8 ? '#ef4444' : item.avgYears > 5 ? '#f97316' : item.avgYears > 3 ? '#eab308' : '#22c55e'
              return (
                <div key={i} className="bar-item bar-item-clickable" onClick={() => onDrill({
                  type: 'category', label: equipmentCategoryLabels[item.category] || item.category,
                  filter: { category: item.category }
                })}>
                  <div className="bar-header">
                    <span className="bar-label">{equipmentCategoryLabels[item.category] || item.category}</span>
                    <span className="bar-value">{item.avgYears.toFixed(1)} Jahre <ChevronRight size={12} style={{ color: 'var(--gray-400)' }} /></span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h2><TrendingUp size={18} /> Installationsjahre</h2>
        {data.installationYears.length === 0 ? <p className="empty-text">Keine Daten</p> :
          <BarList data={data.installationYears} labelKey="year" valueKey="count" color="#3b82f6" />}
      </div>
    </div>
  )
}

// ============================================================
// Tab: Wartungsstatus (with drilldown)
// ============================================================
function MaintenanceTab({ data, onDrill }) {
  if (!data) {
    return <div className="card"><p className="empty-text">Keine Wartungs-Daten verfügbar</p></div>
  }

  const summary = data.maintenanceSummary

  return (
    <div className="insights-grid">
      <div className="card card-full">
        <h2><Wrench size={18} /> Wartungsstatus-Übersicht</h2>
        <p className="card-subtitle">Klicken Sie auf einen Status für die Geräteliste</p>
        <div className="maintenance-overview">
          <div className="maint-stat maint-overdue maint-stat-clickable" onClick={() => onDrill({
            type: 'filtered', label: '🚨 Überfällige Wartungen', filter: { overdueOnly: true }
          })}>
            <AlertTriangle size={24} />
            <div>
              <span className="maint-value">{summary.overdue}</span>
              <span className="maint-label">Überfällig</span>
            </div>
            <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.5 }} />
          </div>
          <div className="maint-stat maint-due-soon maint-stat-clickable" onClick={() => onDrill({
            type: 'filtered', label: '⏰ Bald fällige Wartungen', filter: { dueSoonOnly: true }
          })}>
            <Clock size={24} />
            <div>
              <span className="maint-value">{summary.dueSoon}</span>
              <span className="maint-label">Innerhalb 90 Tagen</span>
            </div>
            <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.5 }} />
          </div>
          <div className="maint-stat maint-ok">
            <CheckCircle size={24} />
            <div>
              <span className="maint-value">{summary.upToDate}</span>
              <span className="maint-label">Aktuell</span>
            </div>
          </div>
          <div className="maint-stat maint-unknown maint-stat-clickable" onClick={() => onDrill({
            type: 'filtered', label: '❓ Nie gewartet', filter: { noMaintenanceOnly: true }
          })}>
            <BarChart3 size={24} />
            <div>
              <span className="maint-value">{summary.noMaintenance}</span>
              <span className="maint-label">Nie gewartet</span>
            </div>
            <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.5 }} />
          </div>
        </div>

        <div className="maint-progress">
          {summary.total > 0 && (
            <div className="maint-progress-bar">
              <div className="maint-segment maint-seg-overdue" style={{ width: `${(summary.overdue / summary.total) * 100}%` }} title="Überfällig" />
              <div className="maint-segment maint-seg-soon" style={{ width: `${(summary.dueSoon / summary.total) * 100}%` }} title="Bald fällig" />
              <div className="maint-segment maint-seg-ok" style={{ width: `${(summary.upToDate / summary.total) * 100}%` }} title="Aktuell" />
              <div className="maint-segment maint-seg-none" style={{ width: `${(summary.noMaintenance / summary.total) * 100}%` }} title="Nie gewartet" />
            </div>
          )}
          <div className="maint-legend">
            <span><i style={{ background: '#ef4444' }} /> Überfällig</span>
            <span><i style={{ background: '#eab308' }} /> Bald fällig</span>
            <span><i style={{ background: '#22c55e' }} /> Aktuell</span>
            <span><i style={{ background: '#94a3b8' }} /> Keine Wartung</span>
          </div>
        </div>
      </div>

      <div className="card card-full">
        <h2><Settings size={18} /> Wartungsstatus pro Kategorie</h2>
        <p className="card-subtitle">Klicken Sie auf eine Kategorie für Details</p>
        {data.maintenanceByCategory.length === 0 ? <p className="empty-text">Keine Daten</p> : (
          <div className="model-table">
            <table>
              <thead>
                <tr>
                  <th>Kategorie</th>
                  <th className="text-right">Gesamt</th>
                  <th className="text-right text-red">Überfällig</th>
                  <th className="text-right text-yellow">Bald fällig</th>
                  <th className="text-right text-green">Aktuell</th>
                  <th className="text-right">Nie gewartet</th>
                  <th className="text-right">Ø Tage seit Wartung</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.maintenanceByCategory.map((cat, i) => (
                  <tr key={i} className="drill-row" onClick={() => onDrill({
                    type: 'category', label: equipmentCategoryLabels[cat.category] || cat.category,
                    filter: { category: cat.category }
                  })}>
                    <td><strong>{equipmentCategoryLabels[cat.category] || cat.category}</strong></td>
                    <td className="text-right">{cat.total}</td>
                    <td className="text-right text-red">{cat.overdue > 0 ? cat.overdue : '—'}</td>
                    <td className="text-right text-yellow">{cat.dueSoon > 0 ? cat.dueSoon : '—'}</td>
                    <td className="text-right text-green">{cat.upToDate > 0 ? cat.upToDate : '—'}</td>
                    <td className="text-right">{cat.noMaintenance > 0 ? cat.noMaintenance : '—'}</td>
                    <td className="text-right">{cat.avgDaysSince !== null ? `${cat.avgDaysSince} Tage` : '—'}</td>
                    <td className="text-right"><ChevronRight size={14} style={{ color: 'var(--gray-400)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.overdueItems.length > 0 && (
        <div className="card card-full">
          <h2><AlertTriangle size={18} /> Überfällige Wartungen — Ihr Marktpotenzial</h2>
          <p className="card-subtitle">Klicken Sie auf ein Gerät um passende Angebote zu erstellen</p>
          <div className="model-table">
            <table>
              <thead>
                <tr>
                  <th>Gerät</th>
                  <th>Hersteller</th>
                  <th>Modell</th>
                  <th>Kategorie</th>
                  <th className="text-right">Überfällig seit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.overdueItems.slice(0, 15).map((item, i) => (
                  <tr key={i} className="row-warning drill-row" onClick={() => onDrill({
                    type: 'model', label: `${item.manufacturer || item.name} ${item.model || ''}`.trim(),
                    filter: { manufacturer: item.manufacturer || undefined, category: item.category, overdueOnly: true }
                  })}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.manufacturer || '—'}</td>
                    <td>{item.model ? <code>{item.model}</code> : '—'}</td>
                    <td><span className="cat-badge">{equipmentCategoryLabels[item.category] || item.category}</span></td>
                    <td className="text-right text-red"><strong>{item.overdueDays} Tage</strong></td>
                    <td className="text-right"><ChevronRight size={14} style={{ color: 'var(--gray-400)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Daten-Aggregation (client-seitig)
// ============================================================
function aggregateEquipmentData(equipment) {
  const now = new Date()

  const modelMap = {}
  equipment.forEach(e => {
    const model = (e.model || '').trim()
    if (!model) return
    const key = `${e.category}|${e.manufacturer}|${model}|${e.name}`
    if (!modelMap[key]) {
      modelMap[key] = { category: e.category, manufacturer: (e.manufacturer || '').trim(), model, name: (e.name || '').trim(), count: 0 }
    }
    modelMap[key].count++
  })
  const models = Object.values(modelMap).sort((a, b) => b.count - a.count)

  const mfrModels = {}
  models.forEach(m => {
    const mfr = m.manufacturer || 'Unbekannt'
    if (!mfrModels[mfr]) mfrModels[mfr] = new Set()
    mfrModels[mfr].add(m.model)
  })
  const manufacturerModelCounts = Object.entries(mfrModels)
    .map(([manufacturer, modelSet]) => ({ manufacturer, modelCount: modelSet.size }))
    .sort((a, b) => b.modelCount - a.modelCount)

  const catModels = {}
  models.forEach(m => {
    const cat = m.category || 'other'
    if (!catModels[cat]) catModels[cat] = new Set()
    catModels[cat].add(`${m.manufacturer}|${m.model}`)
  })
  const categoryModelCounts = Object.entries(catModels)
    .map(([category, modelSet]) => ({ category, modelCount: modelSet.size }))
    .sort((a, b) => b.modelCount - a.modelCount)

  const ageGroupDef = [
    { max: 1, label: '< 1 Jahr' }, { max: 3, label: '1-3 Jahre' },
    { max: 5, label: '3-5 Jahre' }, { max: 10, label: '5-10 Jahre' },
    { max: Infinity, label: '10+ Jahre' },
  ]
  const ageCounts = {}
  let totalWithAge = 0, unknownAge = 0

  equipment.forEach(e => {
    if (!e.installation_date) { unknownAge++; return }
    const ageYears = (now - new Date(e.installation_date)) / (365.25 * 24 * 60 * 60 * 1000)
    totalWithAge++
    const group = ageGroupDef.find(g => ageYears < g.max)
    const label = group ? group.label : '10+ Jahre'
    ageCounts[label] = (ageCounts[label] || 0) + 1
  })
  if (unknownAge > 0) ageCounts['Unbekannt'] = unknownAge

  const ageGroupOrder = ['< 1 Jahr', '1-3 Jahre', '3-5 Jahre', '5-10 Jahre', '10+ Jahre', 'Unbekannt']
  const ageGroups = ageGroupOrder.filter(g => ageCounts[g]).map(g => ({ group: g, count: ageCounts[g] }))

  const catAges = {}
  equipment.forEach(e => {
    if (!e.installation_date) return
    const cat = (e.category || 'other').trim().toLowerCase()
    const ageYears = (now - new Date(e.installation_date)) / (365.25 * 24 * 60 * 60 * 1000)
    if (!catAges[cat]) catAges[cat] = { total: 0, sum: 0 }
    catAges[cat].total++
    catAges[cat].sum += ageYears
  })
  const avgAgeByCategory = Object.entries(catAges)
    .map(([category, data]) => ({ category, avgYears: data.sum / data.total }))
    .sort((a, b) => b.avgYears - a.avgYears)

  const yearCounts = {}
  equipment.forEach(e => {
    if (!e.installation_date) return
    const year = new Date(e.installation_date).getFullYear().toString()
    yearCounts[year] = (yearCounts[year] || 0) + 1
  })
  const installationYears = Object.entries(yearCounts)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year.localeCompare(a.year))

  let overdue = 0, dueSoon = 0, upToDate = 0, noMaintenance = 0
  const overdueItems = []
  const maintenanceByCatMap = {}

  equipment.forEach(e => {
    const cat = (e.category || 'other').trim().toLowerCase()
    if (!maintenanceByCatMap[cat]) {
      maintenanceByCatMap[cat] = { category: cat, total: 0, overdue: 0, dueSoon: 0, upToDate: 0, noMaintenance: 0, daysSinceSum: 0, daysSinceCount: 0 }
    }
    const catData = maintenanceByCatMap[cat]
    catData.total++

    if (e.last_maintenance_date) {
      const daysSince = Math.floor((now - new Date(e.last_maintenance_date)) / (24 * 60 * 60 * 1000))
      catData.daysSinceSum += daysSince
      catData.daysSinceCount++
    }

    if (e.next_maintenance_date) {
      const nextDate = new Date(e.next_maintenance_date)
      const daysUntil = Math.floor((nextDate - now) / (24 * 60 * 60 * 1000))
      if (daysUntil < 0) {
        overdue++; catData.overdue++
        overdueItems.push({
          name: (e.name || '').trim(), manufacturer: (e.manufacturer || '').trim(),
          model: (e.model || '').trim(), category: cat, overdueDays: Math.abs(daysUntil)
        })
      } else if (daysUntil <= 90) { dueSoon++; catData.dueSoon++ }
      else { upToDate++; catData.upToDate++ }
    } else if (!e.last_maintenance_date) { noMaintenance++; catData.noMaintenance++ }
    else { upToDate++; catData.upToDate++ }
  })

  overdueItems.sort((a, b) => b.overdueDays - a.overdueDays)

  const maintenanceByCategory = Object.values(maintenanceByCatMap)
    .map(cat => ({ ...cat, avgDaysSince: cat.daysSinceCount > 0 ? Math.round(cat.daysSinceSum / cat.daysSinceCount) : null }))
    .sort((a, b) => b.overdue - a.overdue || b.total - a.total)

  return {
    models, manufacturerModelCounts, categoryModelCounts,
    ageGroups, totalWithAge: totalWithAge + unknownAge, avgAgeByCategory, installationYears,
    maintenanceSummary: { overdue, dueSoon, upToDate, noMaintenance, total: equipment.length },
    maintenanceByCategory, overdueItems,
  }
}

// ============================================================
// Empfehlungen generieren (with drillFilter for clickability)
// ============================================================
function generateRecommendations(boatTypes, boatManufacturers, equipmentCategories, overview, equipmentData) {
  const recs = []
  const totalBoats = overview.total_boats || 0

  if (boatTypes.length > 0 && totalBoats > 0) {
    const top = boatTypes[0]
    const pct = ((top.count / totalBoats) * 100).toFixed(0)
    recs.push({
      icon: '⛵', title: `${pct}% der Nutzer haben ${top.boat_type === 'Segelboot' ? 'ein Segelboot' : top.boat_type === 'Motorboot' ? 'ein Motorboot' : 'den Typ "' + top.boat_type + '"'}`,
      text: `Bieten Sie gezielt Produkte für ${top.boat_type}e an — das ist die größte Zielgruppe.`,
      drillFilter: { boatType: top.boat_type },
    })
  }

  if (boatManufacturers.length > 0) {
    const topMfrs = boatManufacturers.slice(0, 3).map(m => m.manufacturer)
    recs.push({
      icon: '🏭', title: `Top Hersteller: ${topMfrs.join(', ')}`,
      text: 'Stellen Sie sicher, dass Sie passende Ersatzteile und Zubehör für diese Marken führen.',
      drillFilter: { boatManufacturer: topMfrs[0] },
    })
  }

  if (equipmentData) {
    const { maintenanceSummary, overdueItems, avgAgeByCategory } = equipmentData

    if (maintenanceSummary.overdue > 0) {
      recs.push({
        icon: '🚨', priority: 'high',
        title: `${maintenanceSummary.overdue} Geräte mit überfälliger Wartung`,
        text: 'Es gibt akuten Wartungsbedarf in der Flotte! Bieten Sie Wartungs-Aktionen oder Express-Service an.',
        drillFilter: { overdueOnly: true },
      })
    }

    if (maintenanceSummary.dueSoon > 0) {
      recs.push({
        icon: '⏰', priority: 'high',
        title: `${maintenanceSummary.dueSoon} Wartungen in den nächsten 90 Tagen fällig`,
        text: 'Platzieren Sie jetzt saisonale Wartungsangebote — diese Kunden suchen bald nach einem Servicepartner.',
        drillFilter: { dueSoonOnly: true },
      })
    }

    const oldCategories = avgAgeByCategory.filter(c => c.avgYears > 5)
    if (oldCategories.length > 0) {
      const catNames = oldCategories.slice(0, 3).map(c => equipmentCategoryLabels[c.category] || c.category).join(', ')
      recs.push({
        icon: '📅', title: `Alternde Ausrüstung in: ${catNames}`,
        text: 'Diese Kategorien haben ein Durchschnittsalter von über 5 Jahren. Hier lohnen sich Upgrade-Angebote und Ersatzteile.',
        drillFilter: { oldOnly: true },
      })
    }

    if (maintenanceSummary.noMaintenance > 2) {
      recs.push({
        icon: '🔧', title: `${maintenanceSummary.noMaintenance} Geräte wurden noch nie gewartet`,
        text: 'Bieten Sie Erst-Inspektionen oder Wartungspakete für Neueinsteiger an.',
        drillFilter: { noMaintenanceOnly: true },
      })
    }

    if (overdueItems.length > 0) {
      const topOverdue = overdueItems[0]
      const mfr = topOverdue.manufacturer || topOverdue.name
      recs.push({
        icon: '🎯', title: `Wartungsbedarf: ${mfr} ${topOverdue.model || ''}`.trim(),
        text: `Dieses Gerät ist seit ${topOverdue.overdueDays} Tagen überfällig. Spezialisieren Sie sich auf diese Marke für gezielten Service.`,
        drillFilter: { manufacturer: topOverdue.manufacturer, category: topOverdue.category },
      })
    }
  }

  const totalEquip = overview.total_equipment || 0
  if (totalEquip > 0 && equipmentCategories.length > 0) {
    const topCat = equipmentCategories[0]
    const catLabel = equipmentCategoryLabels[topCat.category] || topCat.category
    recs.push({
      icon: '🔧', title: `Meiste Ausrüstung: ${catLabel}`,
      text: `${topCat.count} Geräte in dieser Kategorie — bieten Sie Wartungszubehör und Ersatzteile an.`,
      drillFilter: { category: topCat.category },
    })
  }

  return recs
}

// ============================================================
// Shared Components
// ============================================================
function BarList({ data, labelKey, valueKey, color, labelMap, onClick }) {
  const maxValue = Math.max(...data.map(d => d[valueKey]), 1)
  const total = data.reduce((sum, d) => sum + d[valueKey], 0)

  return (
    <div className="bar-list">
      {data.map((item, i) => {
        const pct = ((item[valueKey] / maxValue) * 100).toFixed(0)
        const share = ((item[valueKey] / total) * 100).toFixed(1)
        const label = labelMap ? (labelMap[item[labelKey]] || item[labelKey]) : item[labelKey]

        return (
          <div key={i} className={`bar-item ${onClick ? 'bar-item-clickable' : ''}`} onClick={() => onClick?.(item)}>
            <div className="bar-header">
              <span className="bar-label">{label}</span>
              <span className="bar-value">
                {item[valueKey]} <span className="bar-pct">({share}%)</span>
                {onClick && <ChevronRight size={12} style={{ color: 'var(--gray-400)', marginLeft: '4px' }} />}
              </span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
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

const equipmentCategoryLabels = {
  engine: '⚙️ Motor', motor: '⚙️ Motor', electronics: '📡 Elektronik',
  safety: '🦺 Sicherheit', navigation: '🧭 Navigation', sails: '⛵ Segel & Rigg',
  deck: '🔩 Deck & Beschläge', comfort: '🛋️ Komfort', plumbing: '🚿 Sanitär',
  electrical: '⚡ Elektrik', hull: '🛥️ Rumpf', other: '📦 Sonstiges',
  communication: '📻 Kommunikation', rigging: '🧵 Rigg & Takelage',
  anchor: '⚓ Anker & Kette',
}
