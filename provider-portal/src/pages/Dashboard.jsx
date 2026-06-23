import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useFeatureAccess } from '../hooks/useFeatureAccess'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Package, ShoppingCart, Tag, MessageSquare, Sparkles, ArrowUpRight } from 'lucide-react'
import { useT } from '../i18n'

export default function Dashboard() {
  const { provider } = useAuth()
  const { t } = useT()
  const access = useFeatureAccess()
  const [stats, setStats] = useState({ products: 0, orders: 0, promotions: 0, messages: 0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [aiUsage, setAiUsage] = useState({ used: 0, limit: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (provider) loadStats()
  }, [provider])

  async function loadStats() {
    try {
      const ym = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

      const [productsRes, ordersRes, promotionsRes, messagesRes, aiRes, quotaRes] = await Promise.all([
        supabase.from('metashop_products').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id),
        supabase.from('provider_promotions').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id).eq('is_active', true),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('provider_id', provider.id),
        supabase
          .from('ai_monthly_usage')
          .select('call_count')
          .eq('provider_id', provider.id)
          .eq('year_month', ym)
          .is('user_id', null)
          .maybeSingle(),
        supabase.rpc('provider_ai_quota', { p_provider_id: provider.id }),
      ])

      setStats({
        products: productsRes.count || 0,
        orders: ordersRes.count || 0,
        promotions: promotionsRes.count || 0,
        messages: messagesRes.count || 0,
      })
      setAiUsage({
        used:  aiRes.data?.call_count ?? 0,
        limit: typeof quotaRes.data === 'number' ? quotaRes.data : 0,
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

  if (loading) return <div className="loading">{t('common.loading')}</div>

  return (
    <div className="page">
      <h1>{t('nav.dashboard')}</h1>
      <p className="subtitle">{t('dash.welcome', { name: provider?.name || '' })}</p>

      <div className="stats-grid">
        <StatCard icon={<Package />} label={t('dash.statProducts')} value={stats.products} color="#3b82f6" />
        <StatCard icon={<ShoppingCart />} label={t('dash.statOrders')} value={stats.orders} color="#10b981" />
        <StatCard icon={<Tag />} label={t('dash.statActivePromos')} value={stats.promotions} color="#f97316" />
        <StatCard icon={<MessageSquare />} label={t('dash.statConversations')} value={stats.messages} color="#8b5cf6" />
      </div>

      {!provider.is_shop_active && (
        <div className="info-banner">
          {t('dash.shopNotActive')}
        </div>
      )}

      {/* KI-Nutzungs-Karte: zeigt verbrauchte/zugewiesene Calls pro Monat */}
      {(() => {
        const used  = aiUsage.used
        const limit = aiUsage.limit
        const pct   = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
        const warn  = limit > 0 && used >= limit * 0.8
        const full  = limit > 0 && used >= limit
        const accent = full ? '#dc2626' : warn ? '#f59e0b' : '#15803d'
        const bg     = full ? '#fef2f2' : warn ? '#fffbeb' : '#f0fdf4'

        // Standard-Provider haben Limit 0 → andere Darstellung
        if (limit === 0) {
          return (
            <div className="card" style={{
              borderLeft: '4px solid #94a3b8',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 240 }}>
                <Sparkles size={22} style={{ color: '#94a3b8' }} />
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{t('dash.aiTitle0')}</div>
                  <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                    {t('dash.aiPromo')}
                  </div>
                </div>
              </div>
              <Link to="/profile" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#15803d', color: '#fff',
                padding: '8px 14px', borderRadius: 8,
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>
                {t('dash.upgradeNow')} <ArrowUpRight size={14} />
              </Link>
            </div>
          )
        }

        return (
          <div className="card" style={{ borderLeft: `4px solid ${accent}`, background: bg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Sparkles size={20} style={{ color: accent }} />
              <h2 style={{ margin: 0, fontSize: 17 }}>{t('dash.aiUsageTitle')}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#0f172a' }}>{used.toLocaleString('de-DE')}</span>
              <span style={{ fontSize: 14, color: 'var(--gray-500)' }}>{t('dash.aiOf', { limit: limit.toLocaleString('de-DE') })}</span>
            </div>
            <div style={{
              height: 8, borderRadius: 4, background: '#e2e8f0',
              overflow: 'hidden', marginBottom: 8,
            }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: accent,
                transition: 'width .3s',
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>
                {full
                  ? t('dash.aiLimitReached')
                  : warn
                  ? t('dash.aiWarn', { n: limit - used })
                  : t('dash.aiFree', { n: limit - used })}
              </span>
              {(full || warn) && (
                <Link to="/profile" style={{ color: accent, fontWeight: 600 }}>{t('dash.upgrade')} →</Link>
              )}
            </div>
          </div>
        )
      })()}

      <div className="card">
        <h2>{t('dash.recentOrders')}</h2>
        {recentOrders.length === 0 ? (
          <p className="empty-text">{t('dash.noOrders')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('dash.colOrderNr')}</th>
                <th>{t('dash.colDate')}</th>
                <th>{t('dash.colStatus')}</th>
                <th>{t('dash.colAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.id}>
                  <td>{order.order_number}</td>
                  <td>{new Date(order.created_at).toLocaleDateString('de-DE')}</td>
                  <td><span className={`badge badge-${order.status}`}>{t('order.status.' + order.status)}</span></td>
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
