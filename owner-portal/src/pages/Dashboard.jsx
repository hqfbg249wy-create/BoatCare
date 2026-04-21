import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Ship, Wrench, ShoppingBag, AlertTriangle, CheckCircle, Clock, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState({ boats: 0, equipment: 0, overdue: 0, dueSoon: 0, orders: 0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [upcomingMaint, setUpcomingMaint] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadDashboard()
  }, [user])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Boats
      const { data: boatsData } = await supabase
        .from('boats').select('id').eq('owner_id', user.id)
      const boatCount = boatsData?.length || 0
      const boatIds = (boatsData || []).map(b => b.id)

      // Equipment count via boat_ids
      let eqCount = 0
      let eqItems = []
      if (boatIds.length > 0) {
        const { data: eqData } = await supabase
          .from('equipment').select('*').in('boat_id', boatIds)
        eqItems = eqData || []
        eqCount = eqItems.length
      }

      const now = new Date()
      let overdue = 0, dueSoon = 0
      const upcoming = []
      ;(eqItems || []).forEach(eq => {
        if (eq.next_maintenance_date) {
          const d = new Date(eq.next_maintenance_date)
          const daysLeft = Math.ceil((d - now) / (1000 * 60 * 60 * 24))
          if (daysLeft < 0) { overdue++; upcoming.push({ ...eq, daysLeft, status: 'overdue' }) }
          else if (daysLeft <= 30) { dueSoon++; upcoming.push({ ...eq, daysLeft, status: 'due_soon' }) }
        }
      })
      upcoming.sort((a, b) => a.daysLeft - b.daysLeft)

      // Recent orders
      const { data: orders } = await supabase
        .from('orders').select('*, order_items(*)').eq('buyer_id', user.id)
        .order('created_at', { ascending: false }).limit(5)

      // Open orders count
      const { count: orderCount } = await supabase
        .from('orders').select('*', { count: 'exact', head: true }).eq('buyer_id', user.id)
        .in('status', ['pending', 'confirmed', 'shipped'])

      setStats({
        boats: boatCount || 0,
        equipment: eqCount || 0,
        overdue,
        dueSoon,
        orders: orderCount || 0
      })
      setRecentOrders(orders || [])
      setUpcomingMaint(upcoming.slice(0, 5))
    } catch (err) {
      console.error('Dashboard laden:', err)
    }
    setLoading(false)
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Guten Morgen'
    if (h < 18) return 'Guten Tag'
    return 'Guten Abend'
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="subtitle">{greeting()}, {profile?.full_name || 'Kapitaen'}!</p>

      <div className="stats-grid">
        <Link to="/boats" className="stat-card stat-card-link">
          <div className="stat-icon" style={{ background: '#eff6ff' }}><Ship size={22} color="#3b82f6" /></div>
          <div><span className="stat-value">{stats.boats}</span><span className="stat-label">Boote</span></div>
        </Link>
        <Link to="/equipment" className="stat-card stat-card-link">
          <div className="stat-icon" style={{ background: '#f0fdf4' }}><Wrench size={22} color="#10b981" /></div>
          <div><span className="stat-value">{stats.equipment}</span><span className="stat-label">Geraete</span></div>
        </Link>
        <Link to="/maintenance" className="stat-card stat-card-link warning">
          <div className="stat-icon" style={{ background: stats.overdue ? '#fef2f2' : '#fffbeb' }}>
            <AlertTriangle size={22} color={stats.overdue ? '#ef4444' : '#f59e0b'} />
          </div>
          <div>
            <span className="stat-value">{stats.overdue + stats.dueSoon}</span>
            <span className="stat-label">Wartung faellig</span>
          </div>
        </Link>
        <Link to="/orders" className="stat-card stat-card-link">
          <div className="stat-icon" style={{ background: '#fdf4ff' }}><ShoppingBag size={22} color="#8b5cf6" /></div>
          <div><span className="stat-value">{stats.orders}</span><span className="stat-label">Offene Bestellungen</span></div>
        </Link>
      </div>

      <div className="dashboard-grid">
        {/* Upcoming Maintenance */}
        <div className="card">
          <div className="card-header">
            <h2>Wartung faellig</h2>
            <Link to="/maintenance" className="card-link">Alle anzeigen <ChevronRight size={14} /></Link>
          </div>
          {upcomingMaint.length === 0 ? (
            <div className="empty-hint">
              <CheckCircle size={32} color="#10b981" />
              <p>Alles in Ordnung! Keine anstehende Wartung.</p>
            </div>
          ) : (
            <div className="maint-list">
              {upcomingMaint.map(item => (
                <div key={item.id} className={`maint-item ${item.status}`}>
                  <div className="maint-info">
                    <span className="maint-name">{item.name}</span>
                    <span className="maint-detail">{item.manufacturer} {item.model}</span>
                  </div>
                  <div className={`maint-badge ${item.status}`}>
                    {item.status === 'overdue'
                      ? `${Math.abs(item.daysLeft)} Tage ueberfaellig`
                      : `In ${item.daysLeft} Tagen`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <h2>Letzte Bestellungen</h2>
            <Link to="/orders" className="card-link">Alle anzeigen <ChevronRight size={14} /></Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="empty-hint">
              <ShoppingBag size={32} color="#94a3b8" />
              <p>Noch keine Bestellungen.</p>
            </div>
          ) : (
            <div className="order-list">
              {recentOrders.map(order => (
                <div key={order.id} className="order-item">
                  <div className="order-info">
                    <span className="order-nr">#{order.order_number}</span>
                    <span className="order-date">{new Date(order.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                  <div className="order-right">
                    <span className="order-total">{Number(order.total).toFixed(2).replace('.', ',')} EUR</span>
                    <span className={`badge badge-${order.status}`}>{statusLabel(order.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function statusLabel(s) {
  const map = { pending: 'Ausstehend', confirmed: 'Bestaetigt', shipped: 'Versendet', delivered: 'Geliefert', cancelled: 'Storniert', refunded: 'Erstattet' }
  return map[s] || s
}
