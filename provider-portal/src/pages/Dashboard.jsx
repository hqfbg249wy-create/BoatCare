import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Package, ShoppingCart, Tag, MessageSquare } from 'lucide-react'

export default function Dashboard() {
  const { provider } = useAuth()
  const [stats, setStats] = useState({ products: 0, orders: 0, promotions: 0, messages: 0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (provider) loadStats()
  }, [provider])

  async function loadStats() {
    try {
      const [productsRes, ordersRes, promotionsRes, messagesRes] = await Promise.all([
        supabase.from('metashop_products').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id),
        supabase.from('provider_promotions').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id).eq('is_active', true),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id),
      ])

      setStats({
        products: productsRes.count || 0,
        orders: ordersRes.count || 0,
        promotions: promotionsRes.count || 0,
        messages: messagesRes.count || 0,
      })

      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false })
        .limit(5)

      setRecentOrders(orders || [])
    } catch (err) {
      console.error('Dashboard-Fehler:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">Laden...</div>

  const statusLabels = {
    pending: 'Offen',
    confirmed: 'Bestätigt',
    shipped: 'Versendet',
    delivered: 'Geliefert',
    cancelled: 'Storniert',
    refunded: 'Erstattet',
  }

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="subtitle">Willkommen, {provider?.name}</p>

      <div className="stats-grid">
        <StatCard icon={<Package />} label="Produkte" value={stats.products} color="#3b82f6" />
        <StatCard icon={<ShoppingCart />} label="Bestellungen" value={stats.orders} color="#10b981" />
        <StatCard icon={<Tag />} label="Aktive Angebote" value={stats.promotions} color="#f97316" />
        <StatCard icon={<MessageSquare />} label="Konversationen" value={stats.messages} color="#8b5cf6" />
      </div>

      {!provider.is_shop_active && (
        <div className="info-banner">
          Ihr Shop ist noch nicht freigeschaltet. Bitte kontaktieren Sie das Skipily-Team.
        </div>
      )}

      <div className="card">
        <h2>Letzte Bestellungen</h2>
        {recentOrders.length === 0 ? (
          <p className="empty-text">Noch keine Bestellungen</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Bestellnr.</th>
                <th>Datum</th>
                <th>Status</th>
                <th>Betrag</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.id}>
                  <td>{order.order_number}</td>
                  <td>{new Date(order.created_at).toLocaleDateString('de-DE')}</td>
                  <td><span className={`badge badge-${order.status}`}>{statusLabels[order.status] || order.status}</span></td>
                  <td>{Number(order.total).toFixed(2)} {order.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
