import { Globe } from 'lucide-react'
import { LANGS, useT } from '../i18n'

export default function LanguageSwitcher({ style }) {
  const { lang, setLang } = useT()
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', ...style }}>
      <Globe size={16} />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label="Sprache / Language"
        style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer' }}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  )
}
