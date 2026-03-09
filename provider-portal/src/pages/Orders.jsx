import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { FileText, Truck, CheckCircle } from 'lucide-react'

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
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (provider) loadOrders()
  }, [provider, filter])

  async function loadOrders() {
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
      setOrders(data || [])
    } catch (err) {
      console.error('Orders-Fehler:', err)
    } finally {
      setLoading(false)
    }
  }

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
        })
        .eq('id', orderId)

      if (error) throw error
      setMessage({ type: 'success', text: 'Tracking gespeichert.' })
      setSelected(null)
      loadOrders()
    } catch (err) {
      setMessage({ type: 'error', text: 'Fehler: ' + err.message })
    }
  }

  return (
    <div className="page">
      <h1>Bestellungen</h1>

      {message && <div className={`message message-${message.type}`}>{message.text}</div>}

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
                <span className={`badge badge-${order.status}`}>
                  {STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status}
                </span>
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

              <div className="order-footer">
                <div className="order-total">
                  Gesamt: <strong>{Number(order.total).toFixed(2)} €</strong>
                  <span className="commission-info">
                    (Provision: {Number(order.commission_amount).toFixed(2)} €)
                  </span>
                </div>

                <div className="order-actions">
                  {order.status === 'pending' && (
                    <button className="btn-small btn-confirm" onClick={() => updateStatus(order.id, 'confirmed')}>
                      <CheckCircle size={14} /> Bestätigen
                    </button>
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

              {order.buyer_note && (
                <div className="order-note">Kundennotiz: {order.buyer_note}</div>
              )}
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
              <button className="btn-primary" onClick={() => { saveTracking(selected.id); updateStatus(selected.id, 'shipped') }}>
                <Truck size={16} /> Versand bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
