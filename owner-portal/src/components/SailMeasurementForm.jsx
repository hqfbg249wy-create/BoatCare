/**
 * SailMeasurementForm
 * Vollständiges Segel-Maßblatt für alle 4 Segeltypen.
 * Entspricht 1:1 dem iOS-SwiftUI-Messblatt.
 */

export const SAIL_TYPES = [
  { value: 'grosssegel', label: 'Großsegel' },
  { value: 'vorsegel',   label: 'Vorsegel / Genua' },
  { value: 'gennaker',   label: 'Gennaker' },
  { value: 'code0',      label: 'Code 0' },
]

export const emptySailForm = {
  sail_type: 'grosssegel',
  sail_number: '',
  notes: '',
  // Großsegel – Rigg
  gs_p: '', gs_e: '', gs_e1: '', gs_a: '', gs_g: '', gs_al: '',
  // Großsegel – Segel
  gs_rb: '', gs_ru: '', gs_cb: '', gs_cu: '', gs_r1: '', gs_r2: '',
  // Großsegel – Details
  gs_unterliekstau: '', gs_vorliekstau: '', gs_schothornrutscher: '', gs_mastrutscher: '',
  // Großsegel – Optionen
  gs_einleinenreff: false, gs_weicher_fussteil: false, gs_loses_unterliek: false,
  gs_segelzeichen: false, gs_segelnummer: false, gs_farbe: '',
  // Vorsegel – Rigg
  vs_i: '', vs_i2: '', vs_vst: '', vs_j: '', vs_j2: '',
  // Vorsegel – Segel
  vs_vl: '', vs_al1: '', vs_al2: '', vs_t1: '', vs_t2: '', vs_w: '', vs_q: '', vs_k: '', vs_h: '',
  // Vorsegel – Details
  vs_reffanlage: '', vs_vorliekstau: '',
  // Vorsegel – Optionen
  vs_rollreff: false, vs_fenster: false, vs_uv_schutz: false, vs_position: '', vs_farbe: '',
  // Gennaker / Code 0
  gk_luff_length: '', gk_leech_length: '', gk_foot_length: '', gk_mid_width: '', gk_tack_height: '',
  gk_material: '', gk_farbe: '',
}

// Konvertiert leere Strings → null, Zahlen parsen
export function sailFormToPayload(sf, equipmentId) {
  const num = v => (v === '' || v === undefined || v === null) ? null : parseFloat(v) || null
  const str = v => (v === '' || v === undefined) ? '' : String(v)
  return {
    equipment_id: equipmentId,
    sail_type:    sf.sail_type,
    sail_number:  str(sf.sail_number),
    notes:        str(sf.notes),
    // Großsegel
    gs_p:  num(sf.gs_p),  gs_e:  num(sf.gs_e),  gs_e1: num(sf.gs_e1),
    gs_a:  num(sf.gs_a),  gs_g:  num(sf.gs_g),  gs_al: num(sf.gs_al),
    gs_rb: num(sf.gs_rb), gs_ru: num(sf.gs_ru), gs_cb: num(sf.gs_cb),
    gs_cu: num(sf.gs_cu), gs_r1: num(sf.gs_r1), gs_r2: num(sf.gs_r2),
    gs_unterliekstau:     str(sf.gs_unterliekstau),
    gs_vorliekstau:       str(sf.gs_vorliekstau),
    gs_schothornrutscher: str(sf.gs_schothornrutscher),
    gs_mastrutscher:      str(sf.gs_mastrutscher),
    gs_einleinenreff:     !!sf.gs_einleinenreff,
    gs_weicher_fussteil:  !!sf.gs_weicher_fussteil,
    gs_loses_unterliek:   !!sf.gs_loses_unterliek,
    gs_segelzeichen:      !!sf.gs_segelzeichen,
    gs_segelnummer:       !!sf.gs_segelnummer,
    gs_farbe:             str(sf.gs_farbe),
    // Vorsegel
    vs_i:   num(sf.vs_i),  vs_i2:  num(sf.vs_i2), vs_vst: num(sf.vs_vst),
    vs_j:   num(sf.vs_j),  vs_j2:  num(sf.vs_j2),
    vs_vl:  num(sf.vs_vl), vs_al1: num(sf.vs_al1), vs_al2: num(sf.vs_al2),
    vs_t1:  num(sf.vs_t1), vs_t2:  num(sf.vs_t2),  vs_w:   num(sf.vs_w),
    vs_q:   num(sf.vs_q),  vs_k:   num(sf.vs_k),   vs_h:   num(sf.vs_h),
    vs_reffanlage:  str(sf.vs_reffanlage),
    vs_vorliekstau: str(sf.vs_vorliekstau),
    vs_rollreff:    !!sf.vs_rollreff,
    vs_fenster:     !!sf.vs_fenster,
    vs_uv_schutz:   !!sf.vs_uv_schutz,
    vs_position:    str(sf.vs_position),
    vs_farbe:       str(sf.vs_farbe),
    // Gennaker / Code 0
    gk_luff_length:  num(sf.gk_luff_length),
    gk_leech_length: num(sf.gk_leech_length),
    gk_foot_length:  num(sf.gk_foot_length),
    gk_mid_width:    num(sf.gk_mid_width),
    gk_tack_height:  num(sf.gk_tack_height),
    gk_material:     str(sf.gk_material),
    gk_farbe:        str(sf.gk_farbe),
  }
}

// ─── Hilfskomponenten ────────────────────────────────────────────────────────

function SailSection({ title, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: '#64748b', marginBottom: 8,
        borderBottom: '1px solid #e2e8f0', paddingBottom: 4,
      }}>
        {title}
      </div>
      <div className="form-row">{children}</div>
    </div>
  )
}

function NumField({ label, fieldKey, sf, onChange, placeholder = 'mm' }) {
  return (
    <div className="form-group">
      <label style={{ fontSize: 13 }}>{label}</label>
      <input
        type="number" step="1" min="0"
        value={sf[fieldKey] ?? ''}
        onChange={e => onChange(fieldKey, e.target.value)}
        placeholder={placeholder}
        style={{ fontSize: 14 }}
      />
    </div>
  )
}

function TextField({ label, fieldKey, sf, onChange, placeholder = '' }) {
  return (
    <div className="form-group">
      <label style={{ fontSize: 13 }}>{label}</label>
      <input
        type="text"
        value={sf[fieldKey] ?? ''}
        onChange={e => onChange(fieldKey, e.target.value)}
        placeholder={placeholder}
        style={{ fontSize: 14 }}
      />
    </div>
  )
}

function CheckField({ label, fieldKey, sf, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 13, cursor: 'pointer', padding: '4px 0',
    }}>
      <input
        type="checkbox"
        checked={!!sf[fieldKey]}
        onChange={e => onChange(fieldKey, e.target.checked)}
        style={{ width: 16, height: 16, accentColor: '#f97316' }}
      />
      {label}
    </label>
  )
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function SailMeasurementForm({ sailForm, setSailForm }) {
  const set = (key, val) => setSailForm(prev => ({ ...prev, [key]: val }))
  const sf = sailForm
  const type = sf.sail_type

  return (
    <div style={{
      marginTop: 16, padding: 20,
      background: '#f0fdf4', border: '1px solid #bbf7d0',
      borderRadius: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 22 }}>⛵</span>
        <strong style={{ color: '#15803d', fontSize: 16 }}>Segel-Maßblatt</strong>
      </div>
      <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
        Alle Maße in mm. Pflegen Sie hier alle relevanten Daten für Ihren Segelmacher.
      </p>

      {/* Segeltyp + Segelnummer */}
      <div className="form-row">
        <div className="form-group">
          <label>Segeltyp</label>
          <select value={type} onChange={e => set('sail_type', e.target.value)}>
            {SAIL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Segelnummer</label>
          <input
            type="text" value={sf.sail_number}
            onChange={e => set('sail_number', e.target.value)}
            placeholder="z.B. GER-12345"
          />
        </div>
      </div>

      {/* ── GROSSSEGEL ── */}
      {type === 'grosssegel' && (
        <>
          <SailSection title="Rigg-Maße">
            <NumField label="Mastlänge P" fieldKey="gs_p" sf={sf} onChange={set} />
            <NumField label="Baumlänge E" fieldKey="gs_e" sf={sf} onChange={set} />
            <NumField label="Mast-Achterstag E1" fieldKey="gs_e1" sf={sf} onChange={set} />
            <NumField label="Baumoberkante bis Keep A" fieldKey="gs_a" sf={sf} onChange={set} />
            <NumField label="Galgen Mast-Bolzen G" fieldKey="gs_g" sf={sf} onChange={set} />
            <NumField label="Großfall-Auslass bis Baum AL" fieldKey="gs_al" sf={sf} onChange={set} />
          </SailSection>
          <SailSection title="Reff-Maße">
            <NumField label="Masthinterkante bis Reffhaken RB" fieldKey="gs_rb" sf={sf} onChange={set} />
            <NumField label="Baumoberkante bis Reffhaken RU" fieldKey="gs_ru" sf={sf} onChange={set} />
            <NumField label="Masthinterkante bis Anschlagpunkt CB" fieldKey="gs_cb" sf={sf} onChange={set} />
            <NumField label="Baumoberkante bis Anschlagpunkt CU" fieldKey="gs_cu" sf={sf} onChange={set} />
            <NumField label="Baumoberkante bis Reff 1 R1" fieldKey="gs_r1" sf={sf} onChange={set} />
            <NumField label="Baumoberkante bis Reff 2 R2" fieldKey="gs_r2" sf={sf} onChange={set} />
          </SailSection>
          <SailSection title="Details / Verbindungen">
            <TextField label="Unterliekstau Ø" fieldKey="gs_unterliekstau" sf={sf} onChange={set} placeholder="z.B. 8mm" />
            <TextField label="Vorliekstau Ø" fieldKey="gs_vorliekstau" sf={sf} onChange={set} placeholder="z.B. 6mm" />
            <TextField label="Schothorn-Rutscher Ø" fieldKey="gs_schothornrutscher" sf={sf} onChange={set} />
            <TextField label="Mastrutscher (Typ)" fieldKey="gs_mastrutscher" sf={sf} onChange={set} />
            <TextField label="Farbe / Design" fieldKey="gs_farbe" sf={sf} onChange={set} placeholder="z.B. Weiß mit blauem Logo" />
          </SailSection>
          <SailSection title="Optionen">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px' }}>
              <CheckField label="Einleinenreff" fieldKey="gs_einleinenreff" sf={sf} onChange={set} />
              <CheckField label="Weicher Fußteil" fieldKey="gs_weicher_fussteil" sf={sf} onChange={set} />
              <CheckField label="Loses Unterliek" fieldKey="gs_loses_unterliek" sf={sf} onChange={set} />
              <CheckField label="Segelzeichen" fieldKey="gs_segelzeichen" sf={sf} onChange={set} />
              <CheckField label="Segelnummer aufgedruckt" fieldKey="gs_segelnummer" sf={sf} onChange={set} />
            </div>
          </SailSection>
        </>
      )}

      {/* ── VORSEGEL ── */}
      {type === 'vorsegel' && (
        <>
          <SailSection title="Rigg-Maße">
            <NumField label="Vorstaganschlagpunkt I" fieldKey="vs_i" sf={sf} onChange={set} />
            <NumField label="Top-Fallauslass I2" fieldKey="vs_i2" sf={sf} onChange={set} />
            <NumField label="Länge Vorstag VST" fieldKey="vs_vst" sf={sf} onChange={set} />
            <NumField label="Vorstaganschlag bis Mast J" fieldKey="vs_j" sf={sf} onChange={set} />
            <NumField label="Bugspriet bis Mastvorderkante J2" fieldKey="vs_j2" sf={sf} onChange={set} />
          </SailSection>
          <SailSection title="Segel-Maße">
            <NumField label="Vorliekslänge VL" fieldKey="vs_vl" sf={sf} onChange={set} />
            <NumField label="Fallschlitten Anfang AL1" fieldKey="vs_al1" sf={sf} onChange={set} />
            <NumField label="Fallschlitten Ende AL2" fieldKey="vs_al2" sf={sf} onChange={set} />
            <NumField label="Vorstag Anfang Schiene T1" fieldKey="vs_t1" sf={sf} onChange={set} />
            <NumField label="Vorstag Ende Schiene T2" fieldKey="vs_t2" sf={sf} onChange={set} />
            <NumField label="Vorstag bis Want W" fieldKey="vs_w" sf={sf} onChange={set} />
            <NumField label="Höhe Anschlagpunkt über Deck Q" fieldKey="vs_q" sf={sf} onChange={set} />
            <NumField label="Höhe Schothorn über Deck K" fieldKey="vs_k" sf={sf} onChange={set} />
            <NumField label="Höhe Einfädler H" fieldKey="vs_h" sf={sf} onChange={set} />
          </SailSection>
          <SailSection title="Details / Verbindungen">
            <TextField label="Reffanlage (Typ/Modell)" fieldKey="vs_reffanlage" sf={sf} onChange={set} />
            <TextField label="Vorliekstau Ø" fieldKey="vs_vorliekstau" sf={sf} onChange={set} placeholder="z.B. 6mm" />
            <TextField label="Farbe / Design" fieldKey="vs_farbe" sf={sf} onChange={set} />
            <div className="form-group">
              <label style={{ fontSize: 13 }}>Position</label>
              <select value={sf.vs_position} onChange={e => set('vs_position', e.target.value)}>
                <option value="">— keine Angabe —</option>
                <option value="BB">Backbord (BB)</option>
                <option value="STB">Steuerbord (STB)</option>
              </select>
            </div>
          </SailSection>
          <SailSection title="Optionen">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px' }}>
              <CheckField label="Rollreff" fieldKey="vs_rollreff" sf={sf} onChange={set} />
              <CheckField label="Fenster" fieldKey="vs_fenster" sf={sf} onChange={set} />
              <CheckField label="UV-Schutz" fieldKey="vs_uv_schutz" sf={sf} onChange={set} />
            </div>
          </SailSection>
        </>
      )}

      {/* ── GENNAKER / CODE 0 ── */}
      {(type === 'gennaker' || type === 'code0') && (
        <>
          <SailSection title="Segel-Maße">
            <NumField label="Vorliek (Luff)" fieldKey="gk_luff_length" sf={sf} onChange={set} />
            <NumField label="Achterliek (Leech)" fieldKey="gk_leech_length" sf={sf} onChange={set} />
            <NumField label="Unterliek (Foot)" fieldKey="gk_foot_length" sf={sf} onChange={set} />
            <NumField label="Mittelbreite" fieldKey="gk_mid_width" sf={sf} onChange={set} />
            <NumField label="Halshöhe über Deck" fieldKey="gk_tack_height" sf={sf} onChange={set} />
          </SailSection>
          <SailSection title="Details">
            <TextField label="Material" fieldKey="gk_material" sf={sf} onChange={set} placeholder="z.B. Nylon, Polyester" />
            <TextField label="Farbe / Design" fieldKey="gk_farbe" sf={sf} onChange={set} />
          </SailSection>
        </>
      )}

      {/* Notizen – immer sichtbar */}
      <div style={{ marginTop: 16 }}>
        <div className="form-group">
          <label>Notizen / Besonderes</label>
          <textarea
            rows={2}
            value={sf.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Besonderheiten, Reparaturhistorie, Segelmacher-Kontakt..."
            style={{ fontSize: 14 }}
          />
        </div>
      </div>
    </div>
  )
}
