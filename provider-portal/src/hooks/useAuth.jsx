import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)
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

  async function loadProvider(userId) {
    try {
      // 1) Direkter Treffer über user_id (Standard-Fall)
      const { data: linked } = await supabase
        .from('service_providers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (linked) { setProvider(linked); return }

      // 2) Fallback via RPC: verknüpft einen verwaisten Provider (im Admin-Panel
      //    ohne user_id angelegt) anhand der Login-E-Mail. SECURITY DEFINER
      //    umgeht RLS sauber — siehe migration 045_claim_provider_by_email.sql
      const { data: claimed, error: claimErr } = await supabase
        .rpc('claim_provider_by_email')
      if (!claimErr && claimed) {
        console.log('✅ Provider via E-Mail-Match verknüpft:', claimed.id || claimed)
        setProvider(claimed)
        return
      }
      if (claimErr) console.warn('claim_provider_by_email Fehler:', claimErr.message)

      console.warn('Kein Provider-Profil für user', userId)
      setProvider(null)
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

  async function signUp({ email, password, companyName, category, city }) {
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
      user, provider, loading,
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
