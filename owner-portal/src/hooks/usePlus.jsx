// Plus-Entitlement-Kontext: stellt app-weit `isPlus` bereit und initialisiert
// RevenueCat nach dem Login. Auf Web ist isPlus vorerst immer false (Kauf läuft
// über den nativen Store); die serverseitige Entitlement-Vereinheitlichung
// (RevenueCat-Webhook -> user_subscriptions) folgt als Backend-Schritt.

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import {
  configurePurchases, identifyUser, hasPlusEntitlement, isNative,
} from '../lib/purchases'

const PlusContext = createContext({ isPlus: false, loading: true, native: false, refresh: async () => {} })

export function PlusProvider({ children }) {
  const { user } = useAuth()
  const [isPlus, setIsPlus] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const active = await hasPlusEntitlement()
    setIsPlus(active)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!isNative()) { setLoading(false); return }
      await configurePurchases(user?.id)
      if (user?.id) await identifyUser(user.id)
      if (!cancelled) await refresh()
    }
    init()
    return () => { cancelled = true }
  }, [user?.id, refresh])

  return (
    <PlusContext.Provider value={{ isPlus, loading, native: isNative(), refresh }}>
      {children}
    </PlusContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlus() {
  return useContext(PlusContext)
}
