// Hook für Paywall-Gates: `gate(feature)` prüft per DB, ob der Nutzer die
// Funktion nutzen darf, und zeigt sonst die kurze Upgrade-Meldung aus der DB
// mit Link zur Preisseite. `showUpgrade(message)` zeigt eine Meldung direkt
// (z. B. aus einer 402-Antwort einer Edge Function).

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useT } from '../i18n'
import { checkFeatureAccess } from '../lib/featureGate'

export function useFeatureGate() {
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [notice, setNotice] = useState(null) // { message, tier }

  const showUpgrade = useCallback((message, tier) => {
    if (message) setNotice({ message, tier })
  }, [])

  const gate = useCallback(async (feature, boatId = null) => {
    const a = await checkFeatureAccess(feature, lang, boatId)
    if (a.allowed) return true
    setNotice({ message: a.message || t('gate.fallback'), tier: a.required_tier })
    return false
  }, [lang, t])

  const gateModal = notice ? (
    <div className="modal-overlay" onClick={() => setNotice(null)}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color={notice.tier === 'plus' ? '#16a34a' : '#2563eb'} />
            {notice.tier === 'plus' ? 'Skipily Plus' : notice.tier === 'basic' ? 'Skipily Basic' : 'Skipily'}
          </h2>
          <button className="btn-icon" onClick={() => setNotice(null)}><X size={20} /></button>
        </div>
        <p style={{ lineHeight: 1.5, margin: '8px 0 20px' }}>{notice.message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={() => setNotice(null)}>{t('gate.close')}</button>
          <button className="btn-primary" onClick={() => { setNotice(null); navigate('/plus') }}>{t('gate.seePrices')}</button>
        </div>
      </div>
    </div>
  ) : null

  return { gate, showUpgrade, gateModal }
}
