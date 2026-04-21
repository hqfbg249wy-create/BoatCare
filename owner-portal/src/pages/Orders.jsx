import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { ShoppingBag, Package, Truck, CheckCircle, XCircle, ChevronDown, ChevronUp, ExternalLink, Trash2, RotateCcw, CheckSquare, Square, AlertTriangle } from 'lucide-react'

const statusConfig = {
  pending: { label: 'Ausstehend', color: '#f59e0b', icon: ShoppingBag },
  confirmed: { label: 'Bestätigt', color: '#3b82f6', icon: Package },
  shipped: { label: 'Versendet', color: '#8b5cf6', icon: Truck },
  delivered: { label: 'Geliefert', color: '#10b981', icon: CheckCircle },
  cancelled: { label: 'Storniert', color: '#ef4444', icon: XCircle },
  refunded: { label: 'Erstattet', color: '#64748b', icon: XCircle },
}

export default function Orders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { if (user) loadOrders() }, [user])

  async function loadOrders() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error('Orders load error:', error)
    setOrders(data || [])
    setSelected(new Set())
    setLoading(false)
  }

  // Check if order can be cancelled (pending, regardless of payment status)
  const canCancel = (order) => order.status === 'pending'
  // Check if order can be deleted (cancelled, or any pending order)
  const canDelete = (order) =>
    order.status === 'cancelled' || order.status === 'pending'

  async function cancelOrder(orderId) {
    if (!confirm('Bestellung wirklich stornieren?')) return
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    if (error) { console.error('Cancel error:', error); alert('Stornierung fehlgeschlagen: ' + error.message); return }
    await loadOrders()
  }

  async function deleteOrder(orderId) {
    // Delete order items first (CASCADE should handle it, but explicit is safer with RLS)
    const { error: itemErr } = await supabase.from('order_items').delete().eq('order_id', orderId)
    if (itemErr) console.error('Delete items error:', itemErr)
    const { error } = await supabase.from('orders').delete().eq('id', orderId)
    if (error) {
      console.error('Delete order error:', error)
      alert('Löschen fehlgeschlagen: ' + error.message)
      return false
    }
    return true
  }

  async function deleteSingle(orderId) {
    if (!confirm('Bestellung endgültig löschen?')) return
    if (await deleteOrder(orderId)) await loadOrders()
  }

  async function deleteSelected() {
    const deletable = [...selected].filter(id => {
      const order = orders.find(o => o.id === id)
      return order && canDelete(order)
    })
    if (deletable.length === 0) return
    if (!confirm(`${deletable.length} Bestellung${deletable.length > 1 ? 'en' : ''} endgültig löschen?`)) return

    setDeleting(true)
    let success = 0
    for (const id of deletable) {
      if (await deleteOrder(id)) success++
    }
    setDeleting(false)
    if (success > 0) await loadOrders()
    if (success < deletable.length) {
      alert(`${success} von ${deletable.length} Bestellungen gelöscht. Einige konnten nicht gelöscht werden.`)
    }
  }

  // Toggle selection
  function toggleSelect(orderId) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(orderId) ? n.delete(orderId) : n.add(orderId)
      return n
    })
  }

  // Select all deletable
  function selectAllDeletable() {
    const deletableIds = filtered.filter(o => canDelete(o)).map(o => o.id)
    const allSelected = deletableIds.every(id => selected.has(id))
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(deletableIds))
    }
  }

  const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus)
  const deletableInView = filtered.filter(o => canDelete(o))
  const selectedDeletable = [...selected].filter(id => {
    const order = orders.find(o => o.id === id)
    return order && canDelete(order)
  })

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Meine Bestellungen</h1>
          <p className="subtitle">{orders.length} Bestellung{orders.length !== 1 ? 'en' : ''}</p>
        </div>
      </div>

      <div className="filter-bar">
        <button className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>Alle</button>
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const count = orders.filter(o => o.status === key).length
          if (!count) return null
          return <button key={key} className={`filter-btn ${filterStatus === key ? 'active' : ''}`} onClick={() => setFilterStatus(key)}>
            {cfg.label} ({count})
          </button>
        })}
      </div>

      {/* Multi-select toolbar */}
      {deletableInView.length > 0 && (
        <div className="multi-select-bar">
          <button className="btn-select-all" onClick={selectAllDeletable}>
            {deletableInView.every(o => selected.has(o.id)) && deletableInView.length > 0
              ? <CheckSquare size={16} />
              : <Square size={16} />
            }
            <span>Alle löschbaren auswählen ({deletableInView.length})</span>
          </button>

          {selectedDeletable.length > 0 && (
            <button className="btn-delete-selected" onClick={deleteSelected} disabled={deleting}>
              <Trash2 size={16} />
              {deleting ? 'Wird gelöscht...' : `${selectedDeletable.length} löschen`}
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag size={64} color="#cbd5e1" />
          <h2>Keine Bestellungen</h2>
          <p>Ihre Bestellungen aus dem BoatCare-Shop erscheinen hier.</p>
        </div>
      ) : (
        <div className="orders-list">
          {filtered.map(order => {
            const cfg = statusConfig[order.status] || statusConfig.pending
            const Icon = cfg.icon
            const isOpen = expanded === order.id
            const isDeletable = canDelete(order)
            const isSelected = selected.has(order.id)

            return (
              <div key={order.id} className={`order-card ${isSelected ? 'order-selected' : ''}`}>
                <div className="order-card-header">
                  {/* Checkbox for deletable orders */}
                  {isDeletable && (
                    <button className="order-checkbox" onClick={(e) => { e.stopPropagation(); toggleSelect(order.id) }}>
                      {isSelected ? <CheckSquare size={20} color="#f97316" /> : <Square size={20} color="#94a3b8" />}
                    </button>
                  )}

                  <div className="order-header-content" onClick={() => setExpanded(isOpen ? null : order.id)}>
                    <div className="order-left">
                      <span className="order-number">#{order.order_number}</span>
                      <span className="order-date">{new Date(order.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                    </div>
                    <div className="order-right">
                      <span className="order-total">{Number(order.total).toFixed(2).replace('.', ',')} €</span>
                      <span className="badge" style={{ background: cfg.color + '20', color: cfg.color }}>
                        <Icon size={14} /> {cfg.label}
                      </span>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="order-detail">
                    {order.payment_status === 'failed' && (
                      <div className="alert alert-error">
                        <AlertTriangle size={16} />
                        Zahlung fehlgeschlagen. Sie können diese Bestellung löschen oder erneut versuchen.
                      </div>
                    )}
                    {order.status === 'pending' && order.payment_status === 'pending' && (
                      <div className="alert alert-warning">
                        <AlertTriangle size={16} />
                        Zahlung nicht abgeschlossen. Sie können diese Bestellung stornieren oder löschen.
                      </div>
                    )}

                    <table className="order-items-table">
                      <thead>
                        <tr><th>Produkt</th><th>Menge</th><th>Preis</th><th>Gesamt</th></tr>
                      </thead>
                      <tbody>
                        {(order.order_items || []).map(item => (
                          <tr key={item.id}>
                            <td>
                              <div className="item-name">{item.product_name}</div>
                              {item.product_manufacturer && <div className="item-sub">{item.product_manufacturer}</div>}
                            </td>
                            <td>{item.quantity}x</td>
                            <td>{Number(item.unit_price).toFixed(2).replace('.', ',')} €</td>
                            <td>{Number(item.total).toFixed(2).replace('.', ',')} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="order-summary">
                      <div className="summary-row"><span>Zwischensumme</span><span>{Number(order.subtotal).toFixed(2).replace('.', ',')} €</span></div>
                      <div className="summary-row"><span>Versand</span><span>{Number(order.shipping_cost || 0) === 0 ? 'Kostenlos' : Number(order.shipping_cost).toFixed(2).replace('.', ',') + ' €'}</span></div>
                      <div className="summary-row total"><span>Gesamt</span><span>{Number(order.total).toFixed(2).replace('.', ',')} €</span></div>
                    </div>

                    {order.tracking_number && (
                      <div className="order-tracking">
                        <Truck size={16} />
                        <span>Sendungsverfolgung: </span>
                        {order.tracking_url ? (
                          <a href={order.tracking_url} target="_blank" rel="noopener">{order.tracking_number} <ExternalLink size={12} /></a>
                        ) : (
                          <span>{order.tracking_number}</span>
                        )}
                      </div>
                    )}

                    {order.shipping_name && (
                      <div className="order-address">
                        <strong>Lieferadresse:</strong><br />
                        {order.shipping_name}<br />
                        {order.shipping_street}<br />
                        {order.shipping_postal_code} {order.shipping_city}
                      </div>
                    )}

                    <div className="order-actions">
                      {canCancel(order) && (
                        <button className="btn-secondary btn-cancel" onClick={() => cancelOrder(order.id)}>
                          <XCircle size={16} /> Stornieren
                        </button>
                      )}
                      {isDeletable && (
                        <button className="btn-secondary btn-delete" onClick={() => deleteSingle(order.id)}>
                          <Trash2 size={16} /> Löschen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
