import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Ship, Plus, Pencil, Trash2, X, Save, Ruler, Gauge, MapPin, Hash, Package, Wrench, Bot, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react'
import { useT } from '../i18n'
import { useFeatureGate } from '../hooks/useFeatureGate'
import { upgradeMessageFromInvoke } from '../lib/featureGate'

const emptyBoat = { name: '', boat_type: '', manufacturer: '', model: '', year: '', length_meters: '', width: '', draft: '', engine: '', home_port: '', registration_number: '', hin: '', image_url: '' }

// value = gespeicherter Wert (bleibt Deutsch, damit Bestandsdaten passen),
// key   = Übersetzungs-Key für die Anzeige
const boatTypes = [
  { value: 'Segelboot',    key: 'boats.type.sail' },
  { value: 'Motorboot',    key: 'boats.type.motor' },
  { value: 'Katamaran',    key: 'boats.type.catamaran' },
  { value: 'Schlauchboot', key: 'boats.type.inflatable' },
  { value: 'Yacht',        key: 'boats.type.yacht' },
  { value: 'Jolle',        key: 'boats.type.dinghy' },
  { value: 'Trimaran',     key: 'boats.type.trimaran' },
  { value: 'Hausboot',     key: 'boats.type.houseboat' },
]

export default function Boats() {
  const { user } = useAuth()
  const { t } = useT()
  const { gate, showUpgrade, gateModal } = useFeatureGate()
  const navigate = useNavigate()
  const [boats, setBoats] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyBoat)
  const [saving, setSaving] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)

  // Boot-Uebergabe (Verkauf) + Uebernahme per Key
  const [transferBoat, setTransferBoat] = useState(null)
  const [transferKey, setTransferKey] = useState('')
  const [transferExpires, setTransferExpires] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [copied, setCopied] = useState(false)
  const [transferEquip, setTransferEquip] = useState([])
  const [transferEquipLoading, setTransferEquipLoading] = useState(false)
  const [keptIds, setKeptIds] = useState(() => new Set())
  const [transferAck, setTransferAck] = useState(false)
  const [keptTarget, setKeptTarget] = useState('new') // 'new' | 'existing'
  const [keptNewName, setKeptNewName] = useState('')
  const [keptExistingId, setKeptExistingId] = useState('')
  const [showRedeem, setShowRedeem] = useState(false)
  const [redeemKey, setRedeemKey] = useState('')
  const [redeemBusy, setRedeemBusy] = useState(false)
  const [redeemError, setRedeemError] = useState('')

  async function uploadBoatImage(file) {
    if (!file) return
    setUploadingImg(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('boat-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('boat-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: pub.publicUrl }))
    } catch (err) {
      alert(t('common.errorPrefix') + ' ' + err.message)
    }
    setUploadingImg(false)
  }

  // Gespeicherten (deutschen) Bootstyp für die Anzeige übersetzen.
  const boatTypeLabel = (value) => {
    const m = boatTypes.find(b => b.value === value)
    return m ? t(m.key) : (value || t('boats.fallbackType'))
  }

  useEffect(() => { if (user) loadBoats() }, [user])

  async function loadBoats() {
    setLoading(true)
    const { data } = await supabase.from('boats').select('*').eq('owner_id', user.id).order('created_at')
    setBoats(data || [])
    setLoading(false)
  }

  function startEdit(boat) {
    setForm({
      name: boat.name || '', boat_type: boat.boat_type || '', manufacturer: boat.manufacturer || '',
      model: boat.model || '', year: boat.year || '', length_meters: boat.length_meters || '',
      width: boat.width || '', draft: boat.draft || '', engine: boat.engine || '',
      home_port: boat.home_port || '', registration_number: boat.registration_number || '', hin: boat.hin || '',
      image_url: boat.image_url || ''
    })
    setEditing(boat.id)
  }

  function startNew() {
    setForm(emptyBoat)
    setEditing('new')
  }

  async function saveBoat(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, owner_id: user.id }
    if (payload.year) payload.year = parseInt(payload.year) || null
    if (payload.length_meters) payload.length_meters = parseFloat(payload.length_meters) || null
    if (payload.width) payload.width = parseFloat(payload.width) || null
    if (payload.draft) payload.draft = parseFloat(payload.draft) || null

    try {
      if (editing === 'new') {
        await supabase.from('boats').insert(payload)
      } else {
        await supabase.from('boats').update(payload).eq('id', editing)
      }
      setEditing(null)
      await loadBoats()
    } catch (err) {
      alert(t('common.errorPrefix') + ' ' + err.message)
    }
    setSaving(false)
  }

  async function deleteBoat(id) {
    if (!confirm(t('boats.deleteConfirm'))) return
    await supabase.from('boats').delete().eq('id', id)
    await loadBoats()
  }

  async function startTransfer(boat) {
    // Paywall: Boot per Schlüssel übergeben ist Skipily Plus (Meldung aus der DB)
    if (!(await gate('boat_transfer', boat.id))) return
    setTransferBoat(boat); setTransferKey(''); setTransferExpires('')
    setTransferError(''); setCopied(false); setKeptIds(new Set()); setTransferAck(false)
    setKeptTarget('new'); setKeptNewName(t('boats.keepDefaultName', { name: boat.name })); setKeptExistingId('')
    setTransferEquip([]); setTransferEquipLoading(true)
    try {
      const { data } = await supabase.from('equipment')
        .select('id, name, category, manufacturer, model')
        .eq('boat_id', boat.id).order('category, name')
      setTransferEquip(data || [])
    } catch { /* ignore */ }
    setTransferEquipLoading(false)
  }

  function toggleKept(id) {
    setKeptIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function generateKey() {
    if (!transferBoat || !transferAck) return
    // Zweite Sicherheitsabfrage (unumkehrbar nach dem Einlösen).
    if (!window.confirm(t('boats.transferConfirm', { name: transferBoat.name }))) return
    setTransferBusy(true); setTransferError('')
    try {
      const hasKept = keptIds.size > 0
      const { data, error } = await supabase.functions.invoke('create-boat-transfer', {
        body: {
          boat_id: transferBoat.id,
          kept_equipment_ids: [...keptIds],
          kept_target_boat_id: (hasKept && keptTarget === 'existing') ? (keptExistingId || null) : null,
          kept_new_boat_name: (hasKept && keptTarget === 'new') ? (keptNewName.trim() || null) : null,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setTransferKey(data.key)
      setTransferExpires(data.expires_at ? new Date(data.expires_at).toLocaleDateString() : '')
    } catch (err) {
      console.error('create-boat-transfer:', err)
      const upgrade = await upgradeMessageFromInvoke(err)
      if (upgrade) { setTransferBoat(null); showUpgrade(upgrade, 'plus') }
      else setTransferError(t('boats.transferError'))
    } finally {
      setTransferBusy(false)
    }
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(transferKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { /* ignore */ }
  }

  async function redeem() {
    const key = redeemKey.trim()
    if (!key) return
    setRedeemBusy(true); setRedeemError('')
    try {
      const { data, error } = await supabase.functions.invoke('redeem-boat-transfer', { body: { key } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setShowRedeem(false); setRedeemKey('')
      await loadBoats()
      alert(t('boats.redeemSuccess', { name: data.boat_name || '' }))
      if (data.boat_id) navigate(`/equipment?boat=${data.boat_id}`)
    } catch (err) {
      console.error('redeem-boat-transfer:', err)
      setRedeemError(err?.message && /abgelaufen|eingelöst|ungültig|Key/i.test(err.message) ? err.message : t('boats.redeemError'))
    } finally {
      setRedeemBusy(false)
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      {gateModal}
      <div className="page-header">
        <div>
          <h1>{t('nav.boats')}</h1>
          <p className="subtitle">{t(boats.length === 1 ? 'boats.countSingular' : 'boats.countPlural', { n: boats.length })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => { setShowRedeem(true); setRedeemKey(''); setRedeemError('') }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={16} /> {t('boats.redeem')}
          </button>
          <button className="btn-primary" onClick={startNew}><Plus size={16} /> {t('boats.add')}</button>
        </div>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing === 'new' ? t('boats.new') : t('boats.edit')}</h2>
              <button className="btn-icon" onClick={() => setEditing(null)}><X size={20} /></button>
            </div>
            <form onSubmit={saveBoat} className="modal-body">
              <div className="form-group">
                <label>{t('boats.photo')}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 80, height: 80, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {form.image_url ? <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Ship size={28} color="#cbd5e1" />}
                  </div>
                  <label className="btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadBoatImage(e.target.files?.[0])} />
                    {uploadingImg ? t('common.saving') : t('boats.uploadPhoto')}
                  </label>
                  {form.image_url && (
                    <button type="button" className="btn-ghost" onClick={() => setForm(f => ({ ...f, image_url: '' }))}>{t('boats.removePhoto')}</button>
                  )}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>{t('boats.name')} *</label>
                  <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={t('boats.namePlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.type')}</label>
                  <select value={form.boat_type} onChange={e => setForm({...form, boat_type: e.target.value})}>
                    <option value="">{t('boats.pleaseSelect')}</option>
                    {boatTypes.map(bt => <option key={bt.value} value={bt.value}>{t(bt.key)}</option>)}
                  </select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>{t('boats.manufacturer')}</label>
                  <input value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} placeholder={t('boats.manufacturerPlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.model')}</label>
                  <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder={t('boats.modelPlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.year')}</label>
                  <input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})} placeholder="2020" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>{t('boats.length')}</label>
                  <input type="number" step="0.01" value={form.length_meters} onChange={e => setForm({...form, length_meters: e.target.value})} /></div>
                <div className="form-group"><label>{t('boats.width')}</label>
                  <input type="number" step="0.01" value={form.width} onChange={e => setForm({...form, width: e.target.value})} /></div>
                <div className="form-group"><label>{t('boats.draft')}</label>
                  <input type="number" step="0.01" value={form.draft} onChange={e => setForm({...form, draft: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>{t('boats.engine')}</label>
                <input value={form.engine} onChange={e => setForm({...form, engine: e.target.value})} placeholder={t('boats.enginePlaceholder')} /></div>
              <h3 className="form-section">{t('boats.registration')}</h3>
              <div className="form-row">
                <div className="form-group"><label>{t('boats.homePort')}</label>
                  <input value={form.home_port} onChange={e => setForm({...form, home_port: e.target.value})} placeholder={t('boats.homePortPlaceholder')} /></div>
                <div className="form-group"><label>{t('boats.regNumber')}</label>
                  <input value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value})} /></div>
                <div className="form-group"><label>HIN</label>
                  <input value={form.hin} onChange={e => setForm({...form, hin: e.target.value})} placeholder={t('boats.hinPlaceholder')} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? t('common.saving') : t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {boats.length === 0 ? (
        <div className="empty-state">
          <Ship size={64} color="#cbd5e1" />
          <h2>{t('boats.emptyTitle')}</h2>
          <p>{t('boats.emptyHint')}</p>
          <button className="btn-primary" onClick={startNew}><Plus size={16} /> {t('boats.add')}</button>
        </div>
      ) : (
        <div className="boat-grid">
          {boats.map(boat => (
            <div key={boat.id} className="boat-card">
              {/* Boot-Foto, falls vorhanden */}
              {boat.image_url && (
                <img
                  src={boat.image_url}
                  alt={boat.name}
                  className="boat-card-photo"
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div className="boat-card-header">
                <div className="boat-icon-circle"><Ship size={24} /></div>
                <div>
                  <h3>{boat.name}</h3>
                  <span className="boat-type">{boatTypeLabel(boat.boat_type)}</span>
                  {boat.read_only && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 999 }}>
                      <KeyRound size={11} /> {t('boats.soldBadge')}
                    </span>
                  )}
                </div>
                <div className="boat-actions">
                  {!boat.read_only && (
                    <button className="btn-icon" onClick={() => startEdit(boat)}><Pencil size={16} /></button>
                  )}
                  <button className="btn-icon btn-danger" onClick={() => deleteBoat(boat.id)}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="boat-details">
                {boat.manufacturer && <div className="boat-detail"><span className="detail-label">{t('boats.manufacturer')}</span><span>{boat.manufacturer} {boat.model}</span></div>}
                {boat.year && <div className="boat-detail"><span className="detail-label">{t('boats.year')}</span><span>{boat.year}</span></div>}
                {boat.length_meters && <div className="boat-detail"><Ruler size={14} /><span>{boat.length_meters}m x {boat.width || '?'}m</span></div>}
                {boat.engine && <div className="boat-detail"><Gauge size={14} /><span>{boat.engine}</span></div>}
                {boat.home_port && <div className="boat-detail"><MapPin size={14} /><span>{boat.home_port}</span></div>}
                {boat.registration_number && <div className="boat-detail"><Hash size={14} /><span>{boat.registration_number}</span></div>}
              </div>
              {/* iOS-Style Quick Actions */}
              <div className="boat-quick-actions">
                <button className="boat-action-btn" onClick={() => navigate(`/equipment?boat=${boat.id}`)}>
                  <Package size={16} /><span>{t('nav.equipment')}</span>
                </button>
                <button className="boat-action-btn" onClick={() => navigate(`/maintenance?boat=${boat.id}`)}>
                  <Wrench size={16} /><span>{t('nav.maintenance')}</span>
                </button>
                <button className="boat-action-btn" onClick={() => navigate(`/chat?boat=${boat.id}`)}>
                  <Bot size={16} /><span>{t('maint.askAi')}</span>
                </button>
                {!boat.read_only && (
                  <button className="boat-action-btn" onClick={() => startTransfer(boat)} title={t('boats.transferTitle')}>
                    <KeyRound size={16} /><span>{t('boats.transfer')}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Boot uebergeben (Verkauf) → Key anzeigen */}
      {transferBoat && (
        <div className="modal-overlay" onClick={() => setTransferBoat(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2><KeyRound size={18} /> {t('boats.transferTitle')}</h2>
              <button className="btn-icon" onClick={() => setTransferBoat(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                {t('boats.transferIntro', { name: transferBoat.name })}
              </p>

              {!transferKey ? (
                <>
                  {transferEquipLoading && <p style={{ color: '#64748b' }}>{t('boats.transferLoadingEquip')}</p>}
                  {!transferEquipLoading && transferEquip.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t('boats.keepLabel')}</label>
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 8px' }}>{t('boats.keepHint')}</p>
                      <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                        {transferEquip.map(eq => (
                          <label key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                            <input type="checkbox" checked={keptIds.has(eq.id)} onChange={() => toggleKept(eq.id)} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{eq.name}</span>
                              {(eq.manufacturer || eq.model) && <span style={{ fontSize: 12, color: '#94a3b8' }}> · {[eq.manufacturer, eq.model].filter(Boolean).join(' ')}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                      {keptIds.size > 0 && (
                        <p style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>{t('boats.keepCount', { n: keptIds.size })}</p>
                      )}
                    </div>
                  )}

                  {/* Ziel-Schiff fuer behaltene Ausruestung */}
                  {keptIds.size > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t('boats.keepTarget')}</label>
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 8px' }}>{t('boats.keepTargetHint')}</p>
                      <div style={{ display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                          <input type="radio" name="keptTarget" checked={keptTarget === 'new'} onChange={() => setKeptTarget('new')} />
                          {t('boats.keepTargetNew')}
                        </label>
                        {boats.filter(b => b.id !== transferBoat.id).length > 0 && (
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                            <input type="radio" name="keptTarget" checked={keptTarget === 'existing'} onChange={() => setKeptTarget('existing')} />
                            {t('boats.keepTargetExisting')}
                          </label>
                        )}
                      </div>
                      {keptTarget === 'new' ? (
                        <input type="text" value={keptNewName} onChange={e => setKeptNewName(e.target.value)}
                          placeholder={t('boats.keepNewNamePh')}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                      ) : (
                        <select value={keptExistingId} onChange={e => setKeptExistingId(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}>
                          <option value="">{t('boats.keepChoosePrompt')}</option>
                          {boats.filter(b => b.id !== transferBoat.id).map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  {/* Doppelte Sicherheitsabfrage: Warnhinweis + Pflicht-Haekchen */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '10px 12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10 }}>
                    <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12.5, color: '#b91c1c', lineHeight: 1.45 }}>{t('boats.transferWarning')}</span>
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={transferAck} onChange={e => setTransferAck(e.target.checked)} style={{ marginTop: 3 }} />
                    <span style={{ fontSize: 13, color: '#334155' }}>{t('boats.transferAck')}</span>
                  </label>
                  {transferError && <p style={{ color: '#dc2626', marginTop: 8 }}>{transferError}</p>}
                </>
              ) : (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{t('boats.transferKeyLabel')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <code style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: 1, padding: '10px 12px', background: '#f1f5f9', borderRadius: 10, textAlign: 'center' }}>{transferKey}</code>
                    <button type="button" className="btn-secondary" onClick={copyKey}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t('boats.transferCopied') : t('boats.transferCopy')}
                    </button>
                  </div>
                  {transferExpires && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{t('boats.transferExpires')}: {transferExpires}</p>}
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{t('boats.transferHint')}</p>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setTransferBoat(null)}>{t('common.cancel')}</button>
              {!transferKey && (() => {
                const keptTargetValid = keptIds.size === 0 ||
                  (keptTarget === 'new' ? keptNewName.trim() !== '' : keptExistingId !== '')
                const blocked = transferBusy || transferEquipLoading || !transferAck || !keptTargetValid
                return (
                  <button
                    onClick={generateKey}
                    disabled={blocked}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: blocked ? '#fca5a5' : '#dc2626',
                      color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
                      fontWeight: 700, cursor: blocked ? 'not-allowed' : 'pointer',
                    }}>
                    <AlertTriangle size={16} /> {transferBusy ? t('boats.transferGenerating') : t('boats.transferGenerate')}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Boot uebernehmen → Key einloesen */}
      {showRedeem && (
        <div className="modal-overlay" onClick={() => setShowRedeem(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2><KeyRound size={18} /> {t('boats.redeemTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowRedeem(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>{t('boats.redeemIntro')}</p>
              <input
                type="text"
                value={redeemKey}
                onChange={e => setRedeemKey(e.target.value.toUpperCase())}
                placeholder="SKP-XXXX-XXXX-XXXX"
                style={{ width: '100%', fontSize: 16, fontWeight: 600, letterSpacing: 1, textAlign: 'center', padding: '10px 12px' }}
                onKeyDown={e => { if (e.key === 'Enter') redeem() }}
              />
              {redeemError && <p style={{ color: '#dc2626', marginTop: 8 }}>{redeemError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowRedeem(false)}>{t('common.cancel')}</button>
              <button className="btn-primary" onClick={redeem} disabled={redeemBusy || !redeemKey.trim()}>
                {redeemBusy ? t('boats.redeemBusy') : t('boats.redeemSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
