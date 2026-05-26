/**
 * Einheitlicher Geo-Helper:
 *   - Capacitor (Android-App): nutzt @capacitor/geolocation mit nativen Permissions
 *   - Browser:                 nutzt navigator.geolocation
 *
 * Liefert { lat, lon } oder wirft Error.
 */
import { Capacitor } from '@capacitor/core'

export async function getCurrentLocation() {
  if (Capacitor.isNativePlatform()) {
    // Dynamic import — Plugin wird nur in Capacitor-Build geladen
    const { Geolocation } = await import('@capacitor/geolocation')

    // Permission abfragen (öffnet System-Dialog falls noch nie erlaubt)
    let perm = await Geolocation.checkPermissions()
    if (perm.location !== 'granted') {
      perm = await Geolocation.requestPermissions()
    }
    if (perm.location !== 'granted') {
      throw new Error('Standortberechtigung verweigert')
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    })
    return { lat: pos.coords.latitude, lon: pos.coords.longitude }
  }

  // Browser-Fallback
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation nicht verfügbar'))
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    )
  })
}

// Distanz in km zwischen 2 Lat/Lon (Haversine)
export function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Formatierung: < 1 km → "850 m", sonst "2.3 km"
export function formatDistance(km) {
  if (km == null) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}
