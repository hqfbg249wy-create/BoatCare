import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaFactors, setMfaFactors] = useState([])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user.id)
        refreshMFAStatus()
      } else {
        setUser(null)
        setProfile(null)
        setMfaRequired(false)
        setMfaFactors([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function refreshMFAStatus() {
    try {
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = (data?.totp ?? []).filter(f => f.status === 'verified')
      setMfaFactors(verified)
      return verified
    } catch {
      return []
    }
  }

  async function loadProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error('Profil laden fehlgeschlagen:', err.message)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Check if MFA is required
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
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Skipily' })
    if (error) throw error
    return data
  }

  async function confirmMFAEnrollment(factorId, code) {
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
    if (cErr) throw cErr
    const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (error) throw error
    await refreshMFAStatus()
    return data
  }

  async function unenrollMFA(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw error
    await refreshMFAStatus()
  }

  async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) throw error
    return data
  }

  // ─── Empfehlungs-Programm ──────────────────────────────────────────────

  /** Loest einen Empfehlungs-Code ein (typisch direkt nach signUp). */
  async function applyReferralCode(code) {
    const { error } = await supabase.rpc('apply_referral_code', {
      p_code: code,
    })
    if (error) throw error
  }

  /** Liest die eigenen Empfehlungs-Stats aus der View my_referral_stats. */
  async function loadReferralStats() {
    const { data, error } = await supabase
      .from('my_referral_stats')
      .select('*')
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function updateProfile(updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    setProfile(data)
    return data
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      mfaRequired, mfaFactors,
      signIn, signUp, signOut, loadProfile, updateProfile,
      verifyMFA, enrollMFA, confirmMFAEnrollment, unenrollMFA, refreshMFAStatus,
      applyReferralCode, loadReferralStats
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
