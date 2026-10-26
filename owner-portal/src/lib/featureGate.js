// Paywall-Gates (Free / Basic / Plus) aus der DB (Migration 215, feature_gates).
//
// check_feature_access() liefert { allowed, tier, required_tier, message } —
// bei "nicht erlaubt" eine kurze Meldung in der Nutzersprache, was mit
// Skipily Basic bzw. Plus möglich wird. Edge Functions antworten mit 402 und
// derselben Meldung (error / upgrade_hint), falls der Client-Check umgangen wird.

import { supabase } from './supabase'

export async function checkFeatureAccess(feature, lang = 'de', boatId = null) {
  const { data, error } = await supabase.rpc('check_feature_access', {
    p_feature: feature, p_lang: lang, p_boat_id: boatId,
  })
  // Fail-open: der Server prüft ohnehin noch einmal.
  if (error || !data) return { allowed: true, feature }
  return data
}

// Holt die Upgrade-Meldung aus einer 402-Antwort von supabase.functions.invoke
// (FunctionsHttpError → error.context ist die Response). Sonst null.
export async function upgradeMessageFromInvoke(error, data) {
  if (data?.requires_plus || data?.quota_exhausted) return data.upgrade_hint || data.error || null
  const res = error?.context
  if (!res || res.status !== 402 || typeof res.json !== 'function') return null
  try {
    const body = await res.clone().json()
    return body?.upgrade_hint || body?.error || null
  } catch {
    return null
  }
}
