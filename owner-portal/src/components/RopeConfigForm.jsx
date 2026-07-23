/**
 * RopeConfigForm – Tauwerk-Konfigurator (Spleiß-/Takelarbeiten), analog zum
 * Segel-Maßblatt an ein Equipment gebunden. Pendant zu iOS RopeConfigFormView.
 *
 * Ablauf: Produkt (Artikelnummer) + Länge/Material/Stärke + Ende 1/2 aus dem
 * standardisierten Options-Katalog. Beim Speichern wird die Artikelnummer
 * gegen den Shop (metashop_products) gematcht → der Deal läuft über den
 * Vendorshop, nie per Direkt-Mail.
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { X, Save, Link2, CheckCircle2 } from 'lucide-react'
import { ROPE_END_OPTIONS, ROPE_MATERIALS, ROPE_EYE_ENDS } from '../lib/ropeOptions'

const empty = {
  article_number: '', length_m: '', material: '', diameter_mm: '',
  end1: '', end1_eye_length_cm: '', end2: '', end2_eye_length_cm: '',
  accessory_article_number: '', notes: '',
}

const num = v => {
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function RopeConfigForm({ open, equipmentId, boatName, onClose }) {
  const { t } = useT()
  const [form, setForm] = useState(empty)
  const [existingId, setExistingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [matchedName, setMatchedName] = useState(null)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!open || !equipmentId) return
    setForm(empty); setExistingId(null); setMatchedName(null); setStatus(null)
    ;(async () => {
      const { data } = await supabase
        .from('rope_configurations')
        .select('*')
        .eq('equipment_id', equipmentId)
        .order('created_at', { ascending: false })
        .limit(1)
      const r = (data || [])[0]
      if (r) {
        setExistingId(r.id)
        setForm({
          article_number: r.article_number || '',
          length_m: r.length_m ?? '',
          material: r.material || '',
          diameter_mm: r.diameter_mm ?? '',
          end1: r.end1 || '',
          end1_eye_length_cm: r.end1_eye_length_cm ?? '',
          end2: r.end2 || '',
          end2_eye_length_cm: r.end2_eye_length_cm ?? '',
          accessory_article_number: r.accessory_article_number || '',
          notes: r.notes || '',
        })
      }
    })()
  }, [open, equipmentId])

  if (!open) return null

  const end1Eye = ROPE_EYE_ENDS.has(form.end1)
  const end2Eye = ROPE_EYE_ENDS.has(form.end2)
  const canSave = form.article_number.trim() && form.length_m !== '' && form.end1 && form.end2 && !saving

  async function matchProduct() {
    const art = form.article_number.trim()
    if (!art) return null
    const { data } = await supabase
      .from('metashop_products')
      .select('id, name')
      .or(`part_number.eq.${art},sku.eq.${art}`)
      .limit(1)
    const p = (data || [])[0]
    setMatchedName(p?.name || null)
    return p?.id || null
  }

  async function submit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true); setStatus(null)
    try {
      const matchedId = await matchProduct()
      const payload = {
        equipment_id: equipmentId,
        article_number: form.article_number.trim(),
        matched_product_id: matchedId,
        length_m: num(form.length_m),
        material: form.material || '',
        diameter_mm: num(form.diameter_mm),
        end1: form.end1 || null,
        end1_eye_length_cm: end1Eye ? num(form.end1_eye_length_cm) : null,
        end2: form.end2 || null,
        end2_eye_length_cm: end2Eye ? num(form.end2_eye_length_cm) : null,
        accessory_article_number: form.accessory_article_number.trim(),
        notes: form.notes || '',
        status: matchedId ? 'in_cart' : 'offer_requested',
      }
      const q = existingId
        ? supabase.from('rope_configurations').update(payload).eq('id', existingId)
        : supabase.from('rope_configurations').insert(payload)
      const { error } = await q
      if (error) throw error

      // Tauwerk-Art als feste Kategorie am Equipment verankern.
      if (form.material) {
        await supabase.from('equipment').update({ rope_type: form.material }).eq('id', equipmentId)
      }

      setStatus(matchedId ? t('rope.savedMatched') : t('rope.savedOffer'))
      setTimeout(onClose, 1400)
    } catch (err) {
      console.error('rope save:', err)
      setStatus(t('rope.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2><Link2 size={20} /> {t('rope.title')}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="modal-body">
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
            {boatName ? `${boatName} · ` : ''}{t('rope.intro')}
          </p>

          <div className="form-group">
            <label>{t('rope.fArticle')}</label>
            <input value={form.article_number}
              onChange={e => setForm({ ...form, article_number: e.target.value })}
              placeholder="z.B. 6075-006" />
            {matchedName && (
              <p style={{ fontSize: 12, color: '#15803d', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={13} /> {matchedName}
              </p>
            )}
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>{t('rope.fMaterial')}</label>
              <select value={form.material} onChange={e => setForm({ ...form, material: e.target.value })}>
                <option value="">{t('rope.materialNone')}</option>
                {ROPE_MATERIALS.map(m => <option key={m} value={m}>{t(`rope.material.${m}`)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 100px' }}>
              <label>{t('rope.fLength')} (m)</label>
              <input inputMode="decimal" value={form.length_m}
                onChange={e => setForm({ ...form, length_m: e.target.value })} placeholder="20" />
            </div>
            <div className="form-group" style={{ flex: '1 1 100px' }}>
              <label>{t('rope.fDiameter')} (mm)</label>
              <input inputMode="decimal" value={form.diameter_mm}
                onChange={e => setForm({ ...form, diameter_mm: e.target.value })} placeholder="10" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: '1 1 240px' }}>
              <label>{t('rope.sectionEnd1')}</label>
              <select value={form.end1} onChange={e => setForm({ ...form, end1: e.target.value })}>
                <option value="">{t('rope.endNone')}</option>
                {ROPE_END_OPTIONS.map(o => <option key={o} value={o}>{t(`rope.end.${o}`)}</option>)}
              </select>
              {end1Eye && (
                <input style={{ marginTop: 6 }} inputMode="decimal" value={form.end1_eye_length_cm}
                  onChange={e => setForm({ ...form, end1_eye_length_cm: e.target.value })}
                  placeholder={`${t('rope.fEyeLength')} (cm)`} />
              )}
            </div>
            <div className="form-group" style={{ flex: '1 1 240px' }}>
              <label>{t('rope.sectionEnd2')}</label>
              <select value={form.end2} onChange={e => setForm({ ...form, end2: e.target.value })}>
                <option value="">{t('rope.endNone')}</option>
                {ROPE_END_OPTIONS.map(o => <option key={o} value={o}>{t(`rope.end.${o}`)}</option>)}
              </select>
              {end2Eye && (
                <input style={{ marginTop: 6 }} inputMode="decimal" value={form.end2_eye_length_cm}
                  onChange={e => setForm({ ...form, end2_eye_length_cm: e.target.value })}
                  placeholder={`${t('rope.fEyeLength')} (cm)`} />
              )}
            </div>
          </div>

          <div className="form-group">
            <label>{t('rope.fAccessoryArticle')}</label>
            <input value={form.accessory_article_number}
              onChange={e => setForm({ ...form, accessory_article_number: e.target.value })} />
          </div>
          <div className="form-group">
            <label>{t('rope.fNotes')}</label>
            <textarea rows={3} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          {status && <p style={{ fontSize: 13, color: '#475569' }}>{status}</p>}

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('rope.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={!canSave}>
              <Save size={16} /> {saving ? t('rope.saving') : t('rope.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
