import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

const ACTIVE_KEY = 'skipily_active_provider_id'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)
  const [providers, setProviders] = useState([]) // alle Konten: eigenes + Mitgliedschaften
  const [loading, setLoading] = useState(true)
  const [mfaEnrolled, setMfaEnrolled] = useState(false)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaFactors, setMfaFactors] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadProvider(session.user.id)
        refreshMfaStatus()
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        loadProvider(session.user.id)
        refreshMfaStatus()
      } else {
        setUser(null)
        setProvider(null)
        setMfaEnrolled(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function refreshMfaStatus() {
    try {
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = (data?.totp ?? []).some(f => f.status === 'verified')
      setMfaEnrolled(verified)
    } catch {
      setMfaEnrolled(false)
    }
  }

  // Aktives Provider-Konto setzen (eigenes ODER Team-Mitgliedschaft) + merken
  function switchProvider(id) {
    setProviders(curr => {
      const target = curr.find(p => p.id === id)
      if (target) {
        setProvider(target)
        try { localStorage.setItem(ACTIVE_KEY, id) } catch (_) {}
      }
      return curr
    })
  }

  async function loadProvider(userId) {
    try {
      const byId = new Map()

      // 1) Eigenes Konto (Owner)
      const { data: owned } = await supabase
        .from('service_providers').select('*').eq('user_id', userId).maybeSingle()
      if (owned) byId.set(owned.id, { ...owned, _membership: 'owner' })

      // 2) Team-Mitgliedschaften (provider_members → service_providers)
      const { data: memberships } = await supabase
        .from('provider_members').select('provider_id, role').eq('user_id', userId)
      const memberIds = (memberships || []).map(m => m.provider_id).filter(pid => !byId.has(pid))
      if (memberIds.length > 0) {
        const { data: memberProviders } = await supabase
          .from('service_providers').select('*').in('id', memberIds)
        for (const mp of (memberProviders || [])) {
          const role = memberships.find(m => m.provider_id === mp.id)?.role || 'member'
          byId.set(mp.id, { ...mp, _membership: role })
        }
      }

      // 3) Fallback: verwaisten Provider per E-Mail verknüpfen (Alt-Logik)
      if (byId.size === 0) {
        const { data: claimed, error: claimErr } = await supabase.rpc('claim_provider_by_email')
        if (!claimErr && claimed) byId.set(claimed.id || claimed, { ...claimed, _membership: 'owner' })
        else if (claimErr) console.warn('claim_provider_by_email Fehler:', claimErr.message)
      }

      const list = [...byId.values()]
      setProviders(list)

      if (list.length === 0) { setProvider(null); return }

      // Aktives Konto: gemerktes (falls noch gültig) → sonst eigenes → sonst erstes
      let activeId = null
      try { activeId = localStorage.getItem(ACTIVE_KEY) } catch (_) {}
      const active = list.find(p => p.id === activeId)
                  || list.find(p => p._membership === 'owner')
                  || list[0]
      setProvider(active)
      try { localStorage.setItem(ACTIVE_KEY, active.id) } catch (_) {}
    } catch (err) {
      console.error('loadProvider Fehler:', err.message)
      setProvider(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      setMfaFactors((factors?.totp ?? []).filter(f => f.status === 'verified'))
      setMfaRequired(true)
    }
    return data
  }

  async function verifyMFA(code) {
    const factor = mfaFactors[0]
    if (!factor) throw new Error('Kein 2FA-Faktor gefunden')
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (cErr) throw cErr
    const { data, error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code })
    if (error) throw error
    setMfaRequired(false)
    return data
  }

  async function enrollMFA() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Skipily Provider' })
    if (error) throw error
    return data
  }

  async function confirmMFAEnrollment(factorId, code) {
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
    if (cErr) throw cErr
    const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (error) throw error
    await refreshMfaStatus()
    return data
  }

  async function unenrollMFA(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw error
    await refreshMfaStatus()
  }

  async function signUp({ email, password, companyName, category, city, agbVersion,
                          taxId, taxNumber, isSmallBusiness, businessDeclared }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          is_provider: true,
          company_name: companyName,
          category: category || 'repair',
          city: city || null,
          country: 'Deutschland',
          // AGB-Version: vom Signup-Formular durchgereicht.
          // Der Provider-Signup-Trigger setzt damit
          // service_providers.agb_accepted_at = NOW() + agb_accepted_version.
          agb_version: agbVersion || null,
          // Gewerblich-Nachweis + USt-IdNr (Migration 106).
          // Der Signup-Trigger schreibt tax_id/is_small_business/business_declared_at
          // in service_providers; der VAT-Trigger prüft die USt-IdNr per VIES.
          tax_id: taxId || null,
          tax_number: taxNumber || null,
          is_small_business: !!isSmallBusiness,
          business_declared: !!businessDeclared,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProvider(null)
  }

  return (
    <AuthContext.Provider value={{
      user, provider, providers, switchProvider, loading,
      mfaEnrolled, mfaRequired, mfaFactors,
      signIn, signUp, signOut, loadProvider, refreshMfaStatus,
      verifyMFA, enrollMFA, confirmMFAEnrollment, unenrollMFA
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
