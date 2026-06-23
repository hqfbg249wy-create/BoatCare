import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useFeatureAccess } from '../hooks/useFeatureAccess'
import FeatureLock from '../components/FeatureLock'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'
import { Plus, Pencil, Trash2, Tag, X, Save, Loader, BarChart3, TrendingUp, Users, ShoppingCart } from 'lucide-react'
import { useT } from '../i18n'

export default function Promotions() {
  const { provider } = useAuth()
  const access = useFeatureAccess()
  const { t } = useT()
  const location = useLocation()
  const [promotions, setPromotions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [analytics, setAnalytics] = useState(null)

  // Prefill from MarketInsights navigation
  useEffect(() => {
    if (location.state?.prefill) {
      const p = location.state.prefill
      setForm({
        ...emptyForm(),
        name: p.name || '',
        description: p.description || '',
        filter_categories: p.filter_categories || '',
        filter_manufacturers: p.filter_manufacturers || '',
        filter_boat_types: p.filter_boat_types || '',
        discount_type: 'percent',
        discount_value: '10',
        is_active: true,
      })
      setEditing('new')
      // Clear the navigation state
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  function emptyForm() {
    return {
      name: '', description: '', discount_type: 'percent', discount_value: '',
      filter_categories: '', filter_boat_types: '', filter_manufacturers: '',
      filter_min_order: '', valid_from: '', valid_until: '', is_active: true, max_uses: '',
    }
  }

  const loadPromotions = useCallback(async () => {
    if (!provider) return
    setLoading(true)
    const { data } = await supabase
      .from('provider_promotions')
      .select('*')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false })
    setPromotions(data || [])
    setLoading(false)
  }, [provider])

  const loadAnalytics = useCallback(async () => {
    if (!provider) return

    // Load order stats for this provider to calculate promotion impact
    const { data: orders } = await supabase
      .from('orders')
      .select('id, total_amount, discount_amount, promotion_id, created_at')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false })

    if (!orders) return

    const totalOrders = orders.length
    const ordersWithDiscount = orders.filter(o => o.discount_amount > 0 || o.promotion_id)
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const totalDiscounts = orders.reduce((sum, o) => sum + (o.discount_amount || 0), 0)

    // Per-promotion stats
    const promoStats = {}
    orders.forEach(o => {
      if (o.promotion_id) {
        if (!promoStats[o.promotion_id]) {
          promoStats[o.promotion_id] = { orders: 0, revenue: 0, discounts: 0 }
        }
        promoStats[o.promotion_id].orders++
        promoStats[o.promotion_id].revenue += o.total_amount || 0
        promoStats[o.promotion_id].discounts += o.discount_amount || 0
      }
    })

    setAnalytics({
      totalOrders,
      ordersWithPromo: ordersWithDiscount.length,
      conversionRate: totalOrders > 0 ? ((ordersWithDiscount.length / totalOrders) * 100).toFixed(1) : '0',
      totalRevenue,
      totalDiscounts,
      promoStats,
    })
  }, [provider])

  useEffect(() => {
    if (provider) {
      loadPromotions()
      loadCategories()
      loadAnalytics()
    }
  }, [provider, loadPromotions, loadAnalytics])

  async function loadCategories() {
    const { data } = await supabase.from('product_categories').select('*').order('sort_order')
    setCategories(data || [])
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const payload = {
      provider_id: provider.id,
      name: form.name,
      description: form.description,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      filter_categories: form.filter_categories ? form.filter_categories.split(',').map(s => s.trim()) : null,
      filter_boat_types: form.filter_boat_types ? form.filter_boat_types.split(',').map(s => s.trim()) : null,
      filter_manufacturers: form.filter_manufacturers ? form.filter_manufacturers.split(',').map(s => s.trim()) : null,
      filter_min_order: form.filter_min_order ? parseFloat(form.filter_min_order) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      is_active: form.is_active,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
    }

    try {
      if (editing === 'new') {
        const { error } = await supabase.from('provider_promotions').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('provider_promotions').update(payload).eq('id', editing.id)
        if (error) throw error
      }
      setMessage({ type: 'success', text: t('promo.savedMsg') })
      setEditing(null)
      setForm(emptyForm())
      loadPromotions()
      loadAnalytics()
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(promo) {
    if (!confirm(t('promo.deleteConfirm', { name: promo.name }))) return
    await supabase.from('provider_promotions').delete().eq('id', promo.id)
    loadPromotions()
    loadAnalytics()
  }

  async function toggleActive(promo) {
    await supabase
      .from('provider_promotions')
      .update({ is_active: !promo.is_active })
      .eq('id', promo.id)
    loadPromotions()
  }

  function startEdit(promo) {
    setForm({
      name: promo.name || '',
      description: promo.description || '',
      discount_type: promo.discount_type || 'percent',
      discount_value: promo.discount_value?.toString() || '',
      filter_categories: (promo.filter_categories || []).join(', '),
      filter_boat_types: (promo.filter_boat_types || []).join(', '),
      filter_manufacturers: (promo.filter_manufacturers || []).join(', '),
      filter_min_order: promo.filter_min_order?.toString() || '',
      valid_from: promo.valid_from || '',
      valid_until: promo.valid_until || '',
      is_active: promo.is_active ?? true,
      max_uses: promo.max_uses?.toString() || '',
    })
    setEditing(promo)
    setMessage(null)
  }

  function getPromoStatus(promo) {
    if (!promo.is_active) return { label: t('promo.statusInactive'), className: 'badge-pending' }
    const now = new Date().toISOString().split('T')[0]
    if (promo.valid_from && now < promo.valid_from) return { label: t('promo.statusPlanned'), className: 'badge-pending' }
    if (promo.valid_until && now > promo.valid_until) return { label: t('promo.statusExpired'), className: 'badge-cancelled' }
    if (promo.max_uses && (promo.current_uses || 0) >= promo.max_uses) return { label: t('promo.statusUsedUp'), className: 'badge-cancelled' }
    return { label: t('promo.statusActive'), className: 'badge-confirmed' }
  }

  if (editing !== null) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{editing === 'new' ? t('promo.new') : t('promo.edit')}</h1>
          <button className="btn-secondary" onClick={() => { setEditing(null); setForm(emptyForm()) }}>
            <X size={16} /> {t('common.cancel')}
          </button>
        </div>

        {message && <div className={`message message-${message.type}`}>{message.text}</div>}

        <form onSubmit={handleSubmit}>
          <div className="card">
            <h2>{t('promo.sectionOffer')}</h2>
            <div className="form-group">
              <label>{t('promo.nameLabel')} *</label>
              <input name="name" value={form.name} onChange={handleChange} required placeholder={t('promo.namePlaceholder')} />
            </div>
            <div className="form-group">
              <label>{t('promo.description')}</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={2} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('promo.discountType')}</label>
                <select name="discount_type" value={form.discount_type} onChange={handleChange}>
                  <option value="percent">{t('promo.percent')}</option>
                  <option value="fixed">{t('promo.fixed')}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('promo.discountValue')} *</label>
                <input name="discount_value" type="number" step="0.01" min="0" value={form.discount_value} onChange={handleChange} required
                  placeholder={form.discount_type === 'percent' ? t('promo.phPercent') : t('promo.phFixed')} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2>{t('promo.filterSection')}</h2>
            <p className="hint">{t('promo.filterHint')}</p>
            <div className="form-group">
              <label>{t('promo.categories')}</label>
              <input name="filter_categories" value={form.filter_categories} onChange={handleChange} placeholder={t('promo.categoriesPh')} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('promo.boatTypes')}</label>
                <input name="filter_boat_types" value={form.filter_boat_types} onChange={handleChange} placeholder={t('promo.boatTypesPh')} />
              </div>
              <div className="form-group">
                <label>{t('promo.manufacturers')}</label>
                <input name="filter_manufacturers" value={form.filter_manufacturers} onChange={handleChange} placeholder={t('promo.manufacturersPh')} />
              </div>
            </div>
            <div className="form-group">
              <label>{t('promo.minOrder')}</label>
              <input name="filter_min_order" type="number" step="0.01" min="0" value={form.filter_min_order} onChange={handleChange} />
            </div>
          </div>

          <div className="card">
            <h2>{t('promo.validity')}</h2>
            <div className="form-row">
              <div className="form-group">
                <label>{t('promo.validFrom')}</label>
                <input name="valid_from" type="date" value={form.valid_from} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>{t('promo.validUntil')}</label>
                <input name="valid_until" type="date" value={form.valid_until} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>{t('promo.maxUses')}</label>
                <input name="max_uses" type="number" min="0" value={form.max_uses} onChange={handleChange} placeholder={t('promo.unlimitedPh')} />
              </div>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
              {t('promo.active')}
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><Loader size={16} className="spin" /> {t('common.saving')}</> : <><Save size={16} /> {t('common.save')}</>}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // Feature-Gate: Promotions sind Enterprise-only
  if (!access.canPromotions) {
    return (
      <div className="page">
        <h1>🏷️ {t('promo.title')}</h1>
        <FeatureLock requiredTier="Enterprise" feature={t('promo.featureName')} icon="🏷️">
          {t('promo.lockText')}
        </FeatureLock>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('promo.title')}</h1>
        <button className="btn-primary" onClick={() => { setEditing('new'); setForm(emptyForm()) }}>
          <Plus size={16} /> {t('promo.new')}
        </button>
      </div>

      {/* Analytics Overview */}
      {analytics && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>
              <Tag size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <div className="stat-value">{promotions.filter(p => p.is_active).length}</div>
              <div className="stat-label">{t('dash.statActivePromos')}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#dbeafe' }}>
              <ShoppingCart size={20} style={{ color: '#2563eb' }} />
            </div>
            <div>
              <div className="stat-value">{analytics.ordersWithPromo}</div>
              <div className="stat-label">{t('promo.ordersWithDiscount')}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#dcfce7' }}>
              <TrendingUp size={20} style={{ color: '#16a34a' }} />
            </div>
            <div>
              <div className="stat-value">{analytics.conversionRate}%</div>
              <div className="stat-label">{t('promo.conversion')}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fef3c7' }}>
              <BarChart3 size={20} style={{ color: '#d97706' }} />
            </div>
            <div>
              <div className="stat-value">{analytics.totalDiscounts.toFixed(2)} €</div>
              <div className="stat-label">{t('promo.discountsGranted')}</div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : promotions.length === 0 ? (
        <div className="empty-state">
          <Tag size={48} />
          <p>{t('promo.empty')}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            {t('promo.emptyHint')}
          </p>
        </div>
      ) : (
        <div className="promo-list">
          {promotions.map(promo => {
            const status = getPromoStatus(promo)
            const stats = analytics?.promoStats?.[promo.id]
            return (
              <div key={promo.id} className={`card promo-card ${!promo.is_active ? 'inactive' : ''}`}>
                <div className="promo-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3>{promo.name}</h3>
                    <span className={`badge ${status.className}`}>{status.label}</span>
                  </div>
                  <span className="promo-discount">
                    {promo.discount_type === 'percent' ? `${promo.discount_value}%` : `${Number(promo.discount_value).toFixed(2)} €`}
                  </span>
                </div>
                {promo.description && <p>{promo.description}</p>}
                <div className="promo-meta">
                  {promo.valid_from && <span>{t('promo.from')} {promo.valid_from}</span>}
                  {promo.valid_until && <span>{t('promo.until')} {promo.valid_until}</span>}
                  <span>{t('promo.uses')} {promo.current_uses || 0}{promo.max_uses ? `/${promo.max_uses}` : ' ' + t('promo.unlimited')}</span>
                </div>
                {(promo.filter_categories?.length > 0 || promo.filter_boat_types?.length > 0 || promo.filter_manufacturers?.length > 0) && (
                  <div className="promo-filters">
                    {promo.filter_categories?.map(c => <span key={c} className="filter-tag">📦 {c}</span>)}
                    {promo.filter_boat_types?.map(t => <span key={t} className="filter-tag">⛵ {t}</span>)}
                    {promo.filter_manufacturers?.map(m => <span key={m} className="filter-tag">🔧 {m}</span>)}
                  </div>
                )}

                {/* Per-promotion analytics */}
                {stats && (
                  <div className="promo-analytics" style={{
                    display: 'flex', gap: '16px', marginTop: '10px', padding: '10px 14px',
                    background: 'var(--gray-50)', borderRadius: '8px', fontSize: '0.85rem'
                  }}>
                    <div>
                      <span style={{ color: 'var(--gray-500)' }}>{t('promo.aOrders')}</span>{' '}
                      <strong>{stats.orders}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--gray-500)' }}>{t('promo.aRevenue')}</span>{' '}
                      <strong>{stats.revenue.toFixed(2)} €</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--gray-500)' }}>{t('promo.aDiscounts')}</span>{' '}
                      <strong style={{ color: 'var(--primary)' }}>{stats.discounts.toFixed(2)} €</strong>
                    </div>
                  </div>
                )}

                <div className="promo-actions">
                  <button
                    className={`btn-icon ${promo.is_active ? '' : 'btn-success'}`}
                    onClick={() => toggleActive(promo)}
                    title={promo.is_active ? t('promo.deactivate') : t('promo.activateT')}
                    style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px' }}
                  >
                    {promo.is_active ? t('promo.pause') : t('promo.activateBtn')}
                  </button>
                  <button className="btn-icon" onClick={() => startEdit(promo)}><Pencil size={16} /></button>
                  <button className="btn-icon btn-danger" onClick={() => handleDelete(promo)}><Trash2 size={16} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
