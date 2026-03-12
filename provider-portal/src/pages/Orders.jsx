import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { FileText, Truck, CheckCircle, DollarSign, Package, Clock, XCircle, MessageSquare } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Offen', color: '#f59e0b' },
  { value: 'confirmed', label: 'Bestätigt', color: '#3b82f6' },
  { value: 'shipped', label: 'Versendet', color: '#8b5cf6' },
  { value: 'delivered', label: 'Geliefert', color: '#10b981' },
  { value: 'cancelled', label: 'Storniert', color: '#ef4444' },
]

export default function Orders() {
  const { provider } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [trackingForm, setTrackingForm] = useState({ tracking_number: '', tracking_url: '' })
  const [providerNote, setProviderNote] = useState('')
  const [message, setMessage] = useState(null)
  const [stats, setStats] = useState({ total: 0, pending: 0, revenue: 0, commission: 0 })
  const [detailOrder, setDetailOrder] = useState(null)

  const loadOrders = useCallback(async () => {
    if (!provider) return
    setLoading(true)
    try {
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false })

      if (filter !== 'all') query = query.eq('status', filter)

      const { data, error } = await query
      if (error) throw error
      const orderList = data || []
      setOrders(orderList)

      // Calculate stats from all orders (not just filtered)
      const allQuery = await supabase
        .from('orders')
        .select('total, commission_amount, status, payment_status')
        .eq('provider_id', provider.id)
      const allOrders = allQuery.data || []
      const pending = allOrders.filter(o => o.status === 'pending').length
      const revenue = allOrders.filter(o => o.payment_status === 'paid').reduce((sum, o) => sum + parseFloat(o.total || 0), 0)
      const commission = allOrders.filter(o => o.payment_status === 'paid').reduce((sum, o) => sum + parseFloat(o.commission_amount || 0), 0)
      setStats({ total: allOrders.length, pending, revenue, commission })
    } catch (err) {
      console.error('Orders-Fehler:', err)
    } finally {
      setLoading(false)
    }
  }, [provider, filter])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Realtime subscription for new/updated orders
  useEffect(() => {
    if (!provider) return

    const channel = supabase
      .channel('provider-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          console.log('Order update:', payload)
          if (payload.eventType === 'INSERT') {
            setMessage({ type: 'success', text: 'Neue Bestellung eingegangen!' })
          }
          loadOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [provider, loadOrders])

  async function updateStatus(orderId, newStatus) {
    try {
      const update = { status: newStatus }
      if (newStatus === 'shipped') update.shipped_at = new Date().toISOString()
      if (newStatus === 'delivered') update.delivered_at = new Date().toISOString()

      const { error } = await supabase.from('orders').update(update).eq('id', orderId)
      if (error) throw error
      setMessage({ type: 'success', text: 'Status aktualisiert.' })
      loadOrders()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    }
  }

  async function saveTracking(orderId) {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          tracking_number: trackingForm.tracking_number,
          tracking_url: trackingForm.tracking_url,
          status: 'shipped',
          shipped_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (error) throw error
      setMessage({ type: 'success', text: 'Versand bestätigt & Tracking gespeichert.' })
      setSelected(null)
      loadOrders()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    }
  }

  async function saveProviderNote(orderId) {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ provider_note: providerNote })
        .eq('id', orderId)

      if (error) throw error
      setMessage({ type: 'success', text: 'Notiz gespeichert.' })
      setDetailOrder(null)
      loadOrders()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    }
  }

  async function cancelOrder(orderId) {
    if (!confirm('Bestellung wirklich stornieren?')) return
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)

      if (error) throw error
      setMessage({ type: 'success', text: 'Bestellung storniert.' })
      loadOrders()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    }
  }

  async function openContactBuyer(order) {
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('provider_id', provider.id)
        .eq('user_id', order.buyer_id)
        .maybeSingle()

      if (!existing) {
        await supabase.from('conversations').insert({
          provider_id: provider.id,
          user_id: order.buyer_id,
        })
      }
      window.location.href = '/messages'
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Bestellungen</h1>
          <p className="subtitle">Bestellungen verwalten und Versand abwickeln</p>
        </div>
      </div>

      {message && <div className={`message message-${message.type}`}>{message.text}</div>}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#3b82f6' }}><Package /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Gesamt</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#f59e0b' }}><Clock /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.pending}</span>
            <span className="stat-label">Offen</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#10b981' }}><DollarSign /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.revenue.toFixed(2)} €</span>
            <span className="stat-label">Umsatz</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#f97316' }}><DollarSign /></div>
          <div className="stat-info">
            <span className="stat-value">{(stats.revenue - stats.commission).toFixed(2)} €</span>
            <span className="stat-label">Netto (nach Provision)</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Alle</button>
        {STATUS_OPTIONS.map(s => (
          <button key={s.value} className={`filter-btn ${filter === s.value ? 'active' : ''}`} onClick={() => setFilter(s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Laden...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <p>Keine Bestellungen{filter !== 'all' ? ' mit diesem Status' : ''}.</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => (
            <div key={order.id} className="card order-card">
              <div className="order-header">
                <div>
                  <strong>{order.order_number}</strong>
                  <span className="order-date">{new Date(order.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {order.payment_status === 'paid' && (
                    <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}>Bezahlt</span>
                  )}
                  {order.payment_status === 'failed' && (
                    <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Zahlung fehlg.</span>
                  )}
                  <span className={`badge badge-${order.status}`}>
                    {STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status}
                  </span>
                </div>
              </div>

              <div className="order-address">
                {order.shipping_name}, {order.shipping_street}, {order.shipping_postal_code} {order.shipping_city}
              </div>

              {order.order_items?.length > 0 && (
                <table className="table table-compact">
                  <thead>
                    <tr><th>Produkt</th><th>Menge</th><th>Preis</th></tr>
                  </thead>
                  <tbody>
                    {order.order_items.map(item => (
                      <tr key={item.id}>
                        <td>{item.product_name}</td>
                        <td>{item.quantity}x</td>
                        <td>{Number(item.total).toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {order.buyer_note && (
                <div className="order-note">Kundennotiz: {order.buyer_note}</div>
              )}
              {order.provider_note && (
                <div className="order-note" style={{ background: '#dbeafe' }}>Ihre Notiz: {order.provider_note}</div>
              )}
              {order.tracking_number && (
                <div style={{ fontSize: '0.85rem', color: '#8b5cf6', marginTop: 8 }}>
                  Tracking: {order.tracking_number}
                  {order.tracking_url && <> &middot; <a href={order.tracking_url} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6' }}>Verfolgen</a></>}
                </div>
              )}

              <div className="order-footer">
                <div className="order-total">
                  Gesamt: <strong>{Number(order.total).toFixed(2)} €</strong>
                  <span className="commission-info">
                    (Provision: {Number(order.commission_amount).toFixed(2)} € &middot; Netto: {(Number(order.total) - Number(order.commission_amount)).toFixed(2)} €)
                  </span>
                </div>
                <div className="order-actions">
                  <button className="btn-icon" title="Kunde kontaktieren" onClick={() => openContactBuyer(order)}>
                    <MessageSquare size={16} />
                  </button>
                  <button className="btn-icon" title="Details & Notiz" onClick={() => { setDetailOrder(order); setProviderNote(order.provider_note || '') }}>
                    <FileText size={16} />
                  </button>
                  {order.status === 'pending' && (
                    <>
                      <button className="btn-small btn-confirm" onClick={() => updateStatus(order.id, 'confirmed')}>
                        <CheckCircle size={14} /> Bestätigen
                      </button>
                      <button className="btn-small" style={{ background: '#ef4444' }} onClick={() => cancelOrder(order.id)}>
                        <XCircle size={14} /> Stornieren
                      </button>
                    </>
                  )}
                  {order.status === 'confirmed' && (
                    <button className="btn-small btn-ship" onClick={() => { setSelected(order); setTrackingForm({ tracking_number: order.tracking_number || '', tracking_url: order.tracking_url || '' }) }}>
                      <Truck size={14} /> Versenden
                    </button>
                  )}
                  {order.status === 'shipped' && (
                    <button className="btn-small btn-deliver" onClick={() => updateStatus(order.id, 'delivered')}>
                      <CheckCircle size={14} /> Zugestellt
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tracking Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Versand: {selected.order_number}</h2>
            <div className="form-group">
              <label>Sendungsnummer</label>
              <input value={trackingForm.tracking_number} onChange={e => setTrackingForm(prev => ({ ...prev, tracking_number: e.target.value }))} placeholder="z.B. 123456789" />
            </div>
            <div className="form-group">
              <label>Tracking-URL</label>
              <input value={trackingForm.tracking_url} onChange={e => setTrackingForm(prev => ({ ...prev, tracking_url: e.target.value }))} placeholder="https://tracking.dhl.de/..." />
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setSelected(null)}>Abbrechen</button>
              <button className="btn-primary" onClick={() => saveTracking(selected.id)}>
                <Truck size={16} /> Versand bestätigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / Note Modal */}
      {detailOrder && (
        <div className="modal-overlay" onClick={() => setDetailOrder(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Bestellung {detailOrder.order_number}</h2>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 4 }}>Lieferadresse</div>
              <div style={{ fontSize: '0.9rem' }}>
                {detailOrder.shipping_name}<br />
                {detailOrder.shipping_street}<br />
                {detailOrder.shipping_postal_code} {detailOrder.shipping_city}<br />
                {detailOrder.shipping_country}
              </div>
            </div>
            <div className="form-group">
              <label>Ihre Notiz (intern)</label>
              <textarea value={providerNote} onChange={e => setProviderNote(e.target.value)} rows={3} placeholder="Interne Notizen zu dieser Bestellung..." />
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setDetailOrder(null)}>Schließen</button>
              <button className="btn-primary" onClick={() => saveProviderNote(detailOrder.id)}>
                Notiz speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
