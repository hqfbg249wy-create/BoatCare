// useFeatureAccess
//
// Zentrale Stelle für Feature-Gating im Provider-Portal. Entscheidet auf Basis
// von subscription_tier + subscription_plan, welche Features für den
// eingeloggten Provider freigeschaltet sind.
//
// Tier-Hierarchie:
//   standard      → Basis-Features
//   professional  → kostenpflichtiges Abo (Pro oder Enterprise)
//   admin_grant   → Admin hat einen Tier kostenfrei freigeschaltet
//                   (verhält sich wie das im stripe_price_id hinterlegte Niveau,
//                    fällt zurück auf "professional" wenn kein Plan-Code gesetzt)
//
// Plan-Codes:
//   pro_monthly / pro_yearly  → Pro-Niveau
//   ent_monthly / ent_yearly  → Enterprise-Niveau
//   null + admin_grant        → Pro-Niveau (Default für Admin-Grants ohne Plan)

import { useAuth } from './useAuth'

export const FEATURE_LIMITS = {
  standard: {
    maxProducts:    10,   // Shop-Produkte
    maxPromotions:  0,
  },
  pro: {
    maxProducts:    Infinity,
    maxPromotions:  3,
  },
  enterprise: {
    maxProducts:    Infinity,
    maxPromotions:  Infinity,
  },
}

export function useFeatureAccess() {
  const { provider } = useAuth()

  const tier = provider?.subscription_tier   || 'standard'
  const plan = provider?.subscription_plan   || null
  const status = provider?.subscription_status || 'active'

  // Effektives Niveau ermitteln
  const isPaidActive = tier === 'professional' && status === 'active'
  const isAdminGrant = tier === 'admin_grant'

  const isEnterprise = (isPaidActive || isAdminGrant)
    && (plan === 'ent_monthly' || plan === 'ent_yearly')

  // Pro-Niveau gilt für: bezahlte Pro-Abos, Enterprise-Abos (haben Pro inklusive),
  // UND Admin-Grants (auch ohne expliziten Plan-Code)
  const isPro = isPaidActive || isAdminGrant

  const level = isEnterprise ? 'enterprise' : isPro ? 'pro' : 'standard'
  const limits = FEATURE_LIMITS[level]

  return {
    // Niveau-Flags
    isStandard:   level === 'standard',
    isPro,
    isEnterprise,
    level,                                            // 'standard' | 'pro' | 'enterprise'
    limits,

    // Feature-Flags
    canApiAccess:        isPro,           // Pro+ → API-Key, Webhook
    canWebhook:          isPro,
    canPriorityListing:  isPro,           // Pro-Badge in der App
    canPromotions:       isEnterprise,    // Werbeplätze in der App
    canAnalytics:        isEnterprise,    // Markt-Analytics
    canMultiUser:        isEnterprise,    // Mehrere Mitarbeiter-Logins

    // Display-Helper
    tierLabel:
      isEnterprise ? 'Enterprise' :
      isPro        ? 'Pro' : 'Standard',
    upgradeTarget:
      isStandardOrPro(level) ? (level === 'standard' ? 'Pro' : 'Enterprise') : null,
  }
}

function isStandardOrPro(level) {
  return level !== 'enterprise'
}

// Display-Helper für gesperrte Sektionen — kann von Pages direkt importiert werden
export function lockedBadge(requiredTier = 'Pro') {
  return {
    background: requiredTier === 'Enterprise' ? '#f3e8ff' : '#d1fae5',
    color:      requiredTier === 'Enterprise' ? '#7e22ce' : '#15803d',
    border:     requiredTier === 'Enterprise' ? '1px solid #e9d5ff' : '1px solid #bbf7d0',
  }
}
