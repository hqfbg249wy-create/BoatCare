// Web Push (Browser/PWA) für Plattform-Ankündigungen.
// VAPID-Public-Key muss zum Supabase-Secret VAPID_PUBLIC_KEY passen.
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY =
  'BK0YOivzkzVJcP1L4sQDbjJvZzeegoUCH99ViwLIKFjRXUpC6wA6ITG6WggGaO_w9QCkftfkTaB661MGBjDT1yo'

export function webPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window &&
    !window.Capacitor
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Fragt (falls nötig) die Erlaubnis ab und registriert das Push-Abo in Supabase.
// Gibt true zurück, wenn ein aktives Abo besteht.
export async function enableWebPush(locale) {
  if (!webPushSupported()) return false
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return false
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
    const json = sub.toJSON()
    await supabase.rpc('register_web_push', {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh,
      p_auth: json.keys?.auth,
      p_locale: locale || null,
    })
    return true
  } catch (e) {
    console.warn('enableWebPush failed', e)
    return false
  }
}

export async function disableWebPush() {
  if (!webPushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.rpc('unregister_web_push', { p_endpoint: sub.endpoint })
      await sub.unsubscribe().catch(() => {})
    }
  } catch (e) {
    console.warn('disableWebPush failed', e)
  }
}

// Aktueller Erlaubnisstatus: 'granted' | 'denied' | 'default' | 'unsupported'
export function webPushPermission() {
  if (!webPushSupported()) return 'unsupported'
  return Notification.permission
}
