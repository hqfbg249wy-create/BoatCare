import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Wrench, CheckCircle, AlertTriangle, Clock, Filter, Check, ShoppingCart, MapPin, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { buildShopQuery, buildServiceQuery, buildMaintenanceAIQuestion } from '../lib/equipmentSearch'
import { buildSparePartsParams } from '../lib/sparePartsSearch'
import { useT } from '../i18n'

export default function Maintenance() {
  const { user } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [boats, setBoats] = useState([])
  const [selectedBoat, setSelectedBoat] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) loadData() }, [user])

  async function loadData() {
    setLoading(true)
    // Load boats (owner_id)
    const { data: b } = await supabase.from('boats').select('id, name').eq('owner_id', user.id)
    setBoats(b || [])

    // Load equipment with maintenance data for all boats
    const boatIds = (b || []).map(boat => boat.id)
    let eq = []
    if (boatIds.length > 0) {
      const { data } = await supabase
        .from('equipment')
        .select('*')
        .in('boat_id', boatIds)
        .not('maintenance_cycle_years', 'is', null)
        .order('next_maintenance_date')
      eq = data || []
    }
    setItems(eq)
    setLoading(false)
  }

  function getStatus(item) {
    if (!item.next_maintenance_date) return { label: t('maint.noDate'), cls: 'unknown', days: 9999 }
    const days = Math.ceil((new Date(item.next_maintenance_date) - new Date()) / 86400000)
    if (days < 0) return { label: t('dash.daysOverdue', { days: Math.abs(days) }), cls: 'overdue', days }
    if (days <= 30) return { label: t('dash.inDays', { days }), cls: 'due_soon', days }
    return { label: t('dash.inDays', { days }), cls: 'ok', days }
  }

  const enriched = items.map(i => ({ ...i, _status: getStatus(i) }))
  const filtered = enriched.filter(i => {
    if (selectedBoat && i.boat_id !== selectedBoat) return false
    if (filterStatus !== 'all' && i._status.cls !== filterStatus) return false
    return true
  }).sort((a, b) => a._status.days - b._status.days)

  const counts = { overdue: 0, due_soon: 0, ok: 0 }
  enriched.forEach(i => { if (counts[i._status.cls] !== undefined) counts[i._status.cls]++ })

  async function markDone(item) {
    const today = new Date().toISOString().slice(0, 10)
    const nextDate = new Date()
    nextDate.setFullYear(nextDate.getFullYear() + (item.maintenance_cycle_years || 1))
    await supabase.from('equipment').update({
      last_maintenance_date: today,
      next_maintenance_date: nextDate.toISOString().slice(0, 10)
    }).eq('id', item.id)
    await loadData()
  }

  const boatName = (id) => boats.find(b => b.id === id)?.name || ''

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <h1>{t('maint.title')}</h1>
      <p className="subtitle">{t('maint.subtitle')}</p>

      <div className="stats-grid stats-grid-3">
        <div className={`stat-card clickable ${filterStatus === 'overdue' ? 'active-filter' : ''}`} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
          <div className="stat-icon" style={{ background: '#fef2f2' }}><AlertTriangle size={22} color="#ef4444" /></div>
          <div><span className="stat-value">{counts.overdue}</span><span className="stat-label">{t('maint.overdue')}</span></div>
        </div>
        <div className={`stat-card clickable ${filterStatus === 'due_soon' ? 'active-filter' : ''}`} onClick={() => setFilterStatus(filterStatus === 'due_soon' ? 'all' : 'due_soon')}>
          <div className="stat-icon" style={{ background: '#fffbeb' }}><Clock size={22} color="#f59e0b" /></div>
          <div><span className="stat-value">{counts.due_soon}</span><span className="stat-label">{t('maint.dueSoon')}</span></div>
        </div>
        <div className={`stat-card clickable ${filterStatus === 'ok' ? 'active-filter' : ''}`} onClick={() => setFilterStatus(filterStatus === 'ok' ? 'all' : 'ok')}>
          <div className="stat-icon" style={{ background: '#f0fdf4' }}><CheckCircle size={22} color="#10b981" /></div>
          <div><span className="stat-value">{counts.ok}</span><span className="stat-label">{t('maint.ok')}</span></div>
        </div>
      </div>

      <div className="filter-bar">
        <Filter size={16} />
        <select value={selectedBoat} onChange={e => setSelectedBoat(e.target.value)}>
          <option value="">{t('maint.allBoats')}</option>
          {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={64} color="#10b981" />
          <h2>{filterStatus === 'all' ? t('maint.emptyAll') : t('maint.emptyCat')}</h2>
          <p>{t('maint.emptyHint')}</p>
        </div>
      ) : (
        <div className="equipment-grid">
          {filtered.map(item => (
            <div key={item.id} className={`equipment-card ${item._status.cls}`}>
              <div className="eq-header">
                <span className={`maint-badge ${item._status.cls}`}>
                  {item._status.cls === 'overdue' || item._status.cls === 'due_soon' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                  {item._status.label}
                </span>
                <button className="btn-small btn-deliver" title={t('maint.markDone')} onClick={() => markDone(item)}>
                  <Check size={14} /> {t('maint.done')}
                </button>
              </div>
              <h3 className="eq-name">{item.name}</h3>
              <p className="eq-detail">{item.manufacturer} {item.model}</p>
              <p className="eq-boat-label">{boatName(item.boat_id)}</p>
              <div className="maint-dates">
                <span><Clock size={12} /> {t('maint.last')} {item.last_maintenance_date ? new Date(item.last_maintenance_date).toLocaleDateString('de-DE') : '—'}</span>
                <span><Wrench size={12} /> {t('maint.next')} {item.next_maintenance_date ? new Date(item.next_maintenance_date).toLocaleDateString('de-DE') : '—'}</span>
              </div>
              <div className="eq-quick-actions">
                <button className="eq-action-btn eq-action-shop" title={t('maint.findArticles')}
                  onClick={() => navigate(`/shop?${buildSparePartsParams(item)}`)}>
                  <ShoppingCart size={13} /> {t('nav.shop')}
                </button>
                <button className="eq-action-btn eq-action-service" title={t('maint.findService')}
                  onClick={() => navigate(`/services?search=${encodeURIComponent(buildServiceQuery(item))}`)}>
                  <MapPin size={13} /> {t('maint.service')}
                </button>
                <button className="eq-action-btn eq-action-ai" title={t('maint.askAiTitle')}
                  onClick={() => navigate(`/chat?question=${encodeURIComponent(buildMaintenanceAIQuestion(item, boatName(item.boat_id)))}`)}>
                  <Bot size={13} /> {t('maint.askAi')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
