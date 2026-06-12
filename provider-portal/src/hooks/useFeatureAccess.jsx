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
//
// Frühstarter-Bonus:
//   free_until (timestamp) wird beim Claim auf NOW + 6 Monate gesetzt.
//   Solange free_until in der Zukunft liegt, hat der Provider Pro-Niveau —
//   OHNE bezahltes Abo. Nach Ablauf rutscht er automatisch auf Standard
//   zurück (keine ungewollte Verlängerung). Falls in dieser Zeit ein
//   echtes Abo abgeschlossen wird, übernimmt das die Verlängerung.

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

  // Frühstarter-Bonus: 6 Monate Pro gratis ab Claim.
  // free_until > now() → behandelt wie Pro (kein Enterprise-Bonus,
  // damit sich der Provider bewusst entscheiden muss für Enterprise).
  const freeUntil = provider?.free_until ? new Date(provider.free_until) : null
  const isEarlyMoverFree = freeUntil && freeUntil > new Date()

  // Admin-Grants öffnen alle Features (entspricht Enterprise),
  // außer der Admin hat explizit einen Pro-Plan-Code gesetzt.
  const isEnterprise =
       (isPaidActive && (plan === 'ent_monthly' || plan === 'ent_yearly'))
    || (isAdminGrant && plan !== 'pro_monthly' && plan !== 'pro_yearly')

  // Pro-Niveau gilt für: bezahlte Pro-Abos, Enterprise-Abos (haben Pro inklusive),
  // Admin-Grants UND Frühstarter-Bonus
  const isPro = isPaidActive || isAdminGrant || isEarlyMoverFree

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

    // Frühstarter-Status (für UI: "Du nutzt aktuell die 6-Monate-Gratisphase")
    isEarlyMoverFree,
    earlyMoverEndsAt: isEarlyMoverFree ? freeUntil : null,

    // Display-Helper
    tierLabel:
      isEnterprise        ? 'Enterprise' :
      isEarlyMoverFree    ? 'Pro (Frühstarter)' :
      isPro               ? 'Pro' : 'Standard',
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
