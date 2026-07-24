/**
 * RopeConfigFields – Inline-Felder der Tauwerk-Konfiguration, eingebettet in
 * das Equipment-Formular (Kategorie Tauwerk). Pendant zu SailMeasurementForm.
 * Material ist ein freies Feld mit Vorschlägen (datalist) → Tauwerk-Arten
 * lassen sich manuell ergänzen.
 */
import { useT } from '../i18n'
import { ROPE_END_OPTIONS, ROPE_MATERIALS, ROPE_EYE_ENDS } from '../lib/ropeOptions'

export const emptyRope = {
  article_number: '', length_m: '', material: '', diameter_mm: '',
  end1: '', end1_eye_length_cm: '', end2: '', end2_eye_length_cm: '',
  accessory_article_number: '', notes: '',
}

export default function RopeConfigFields({ rope, setRope }) {
  const { t } = useT()
  const set = (k, v) => setRope(r => ({ ...r, [k]: v }))
  const end1Eye = ROPE_EYE_ENDS.has(rope.end1)
  const end2Eye = ROPE_EYE_ENDS.has(rope.end2)

  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: '#64748b', marginTop: 12, marginBottom: 8 }}>
        {t('rope.title')}
      </div>

      <div className="form-group">
        <label>{t('rope.fArticle')}</label>
        <input value={rope.article_number} onChange={e => set('article_number', e.target.value)}
          placeholder="z.B. 6075-006" />
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: '1 1 220px' }}>
          <label>{t('rope.fMaterial')}</label>
          {/* Freitext + Vorschläge → Tauwerk-Arten manuell ergänzbar */}
          <input list="rope-materials" value={rope.material}
            onChange={e => set('material', e.target.value)}
            placeholder={t('rope.materialNone')} />
          <datalist id="rope-materials">
            {ROPE_MATERIALS.map(m => <option key={m} value={t(`rope.material.${m}`)} />)}
          </datalist>
        </div>
        <div className="form-group" style={{ flex: '1 1 90px' }}>
          <label>{t('rope.fLength')} (m)</label>
          <input inputMode="decimal" value={rope.length_m} onChange={e => set('length_m', e.target.value)} placeholder="20" />
        </div>
        <div className="form-group" style={{ flex: '1 1 90px' }}>
          <label>{t('rope.fDiameter')} (mm)</label>
          <input inputMode="decimal" value={rope.diameter_mm} onChange={e => set('diameter_mm', e.target.value)} placeholder="10" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: '1 1 240px' }}>
          <label>{t('rope.sectionEnd1')}</label>
          <select value={rope.end1} onChange={e => set('end1', e.target.value)}>
            <option value="">{t('rope.endNone')}</option>
            {ROPE_END_OPTIONS.map(o => <option key={o} value={o}>{t(`rope.end.${o}`)}</option>)}
          </select>
          {end1Eye && (
            <input style={{ marginTop: 6 }} inputMode="decimal" value={rope.end1_eye_length_cm}
              onChange={e => set('end1_eye_length_cm', e.target.value)} placeholder={`${t('rope.fEyeLength')} (cm)`} />
          )}
        </div>
        <div className="form-group" style={{ flex: '1 1 240px' }}>
          <label>{t('rope.sectionEnd2')}</label>
          <select value={rope.end2} onChange={e => set('end2', e.target.value)}>
            <option value="">{t('rope.endNone')}</option>
            {ROPE_END_OPTIONS.map(o => <option key={o} value={o}>{t(`rope.end.${o}`)}</option>)}
          </select>
          {end2Eye && (
            <input style={{ marginTop: 6 }} inputMode="decimal" value={rope.end2_eye_length_cm}
              onChange={e => set('end2_eye_length_cm', e.target.value)} placeholder={`${t('rope.fEyeLength')} (cm)`} />
          )}
        </div>
      </div>

      <div className="form-group">
        <label>{t('rope.fAccessoryArticle')}</label>
        <input value={rope.accessory_article_number} onChange={e => set('accessory_article_number', e.target.value)} />
      </div>
    </>
  )
}
