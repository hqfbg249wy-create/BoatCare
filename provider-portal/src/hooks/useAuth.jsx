import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadProvider(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        loadProvider(session.user.id)
      } else {
        setUser(null)
        setProvider(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

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
    return data
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
    <AuthContext.Provider value={{ user, provider, loading, signIn, signUp, signOut, loadProvider }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
