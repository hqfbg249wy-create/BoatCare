// RevenueCat-Wrapper für Skipily Plus (Google Play Billing + Apple StoreKit).
//
// Läuft nur NATIV (Capacitor Android/iOS). Im echten Browser (app.skipily.app)
// sind alle Funktionen No-ops — dort wird Plus nicht verkauft (Google-/Apple-
// Store-Käufe müssen über den jeweiligen Store laufen, nicht via Web).
//
// Das Entitlement heißt in RevenueCat "plus" und bündelt die Store-Produkte
// (Google: Abo skipily.plus mit Basis-Angeboten monthly/yearly; Apple:
// skipily.plus.monthly / .yearly).

import { Capacitor } from '@capacitor/core'
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor'

export const ENTITLEMENT_ID = 'plus'

const ANDROID_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_KEY
const IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY

let configured = false

export function isNative() {
  return Capacitor.isNativePlatform()
}

export function platform() {
  return Capacitor.getPlatform() // 'ios' | 'android' | 'web'
}

/** Konfiguriert RevenueCat einmalig (nur nativ). No-op im Web. */
export async function configurePurchases(appUserId) {
  if (!isNative() || configured) return
  const apiKey = platform() === 'ios' ? IOS_KEY : ANDROID_KEY
  if (!apiKey) {
    console.warn('[purchases] Kein RevenueCat-API-Key (VITE_REVENUECAT_*_KEY) — Kauf deaktiviert.')
    return
  }
  try {
    if (import.meta.env.DEV) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG })
    }
    await Purchases.configure({ apiKey, appUserID: appUserId ?? undefined })
    configured = true
  } catch (e) {
    console.warn('[purchases] configure fehlgeschlagen:', e)
  }
}

/** Verknüpft die RevenueCat-Identität mit dem Supabase-User (nach Login). */
export async function identifyUser(appUserId) {
  if (!isNative() || !configured || !appUserId) return
  try { await Purchases.logIn({ appUserID: appUserId }) } catch (e) { console.warn('[purchases] logIn', e) }
}

export async function logoutPurchases() {
  if (!isNative() || !configured) return
  try { await Purchases.logOut() } catch { /* war bereits anonym */ }
}

/** true, wenn das 'plus'-Entitlement aktiv ist. */
export async function hasPlusEntitlement() {
  if (!isNative() || !configured) return false
  try {
    const { customerInfo } = await Purchases.getCustomerInfo()
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID]
  } catch (e) {
    console.warn('[purchases] getCustomerInfo', e)
    return false
  }
}

/** Aktuelle Angebote (Packages) für die Paywall. */
export async function getPlusPackages() {
  if (!isNative() || !configured) return []
  try {
    const offerings = await Purchases.getOfferings()
    return offerings.current?.availablePackages ?? []
  } catch (e) {
    console.warn('[purchases] getOfferings', e)
    return []
  }
}

/** Kauf eines Packages. Gibt true zurück, wenn 'plus' danach aktiv ist. */
export async function purchasePlus(aPackage) {
  const { customerInfo } = await Purchases.purchasePackage({ aPackage })
  return !!customerInfo.entitlements.active[ENTITLEMENT_ID]
}

/** Erkennt den vom Nutzer abgebrochenen Kauf (kein echter Fehler). */
export function isUserCancelled(error) {
  return !!(error && (error.userCancelled || error.code === '1' || error.code === 1))
}

export async function restorePurchases() {
  if (!isNative() || !configured) return false
  const { customerInfo } = await Purchases.restorePurchases()
  return !!customerInfo.entitlements.active[ENTITLEMENT_ID]
}
