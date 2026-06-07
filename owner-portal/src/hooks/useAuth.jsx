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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user.id)
        refreshMFAStatus()

        // Auch nach OAuth-Callback (Apple Sign-In) MFA-Status pruefen.
        // Bewusste Designentscheidung: doppelte Sicherheit — selbst wenn
        // Apple bereits biometrisch authentifiziert hat, verlangen wir
        // zusaetzlich TOTP, falls eingerichtet.
        if (event === 'SIGNED_IN') {
          checkMFARequirement()
        }
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

  /** Liest die aktuelle AAL und setzt mfaRequired, falls Upgrade noetig. */
  async function checkMFARequirement() {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        setMfaFactors((factors?.totp ?? []).filter(f => f.status === 'verified'))
        setMfaRequired(true)
      }
    } catch {
      // Stumm — wenn AAL-Check fehlschlaegt, bleibt mfaRequired wie es ist.
    }
  }

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
    await checkMFARequirement()
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

  /**
   * Sign in with Apple via Supabase OAuth.
   * Apple zeigt auf seiner Login-Seite automatisch Face ID / Touch ID
   * (Passkey-aequivalentes UX), wenn der User es eingerichtet hat —
   * d.h. der User authentifiziert sich biometrisch ohne Passwort.
   *
   * Voraussetzungen (einmalig konfiguriert, siehe README):
   * - Apple Developer Console: Services ID + Sign-in-with-Apple-Key
   * - Supabase Dashboard: Auth → Providers → Apple aktiv
   * - Redirect URL: https://app.skipily.app/auth/callback
   */
  async function signInWithApple() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
    return data
  }

  // ─── Passkey-Authentifizierung (Supabase WebAuthn BETA) ────────────────

  /**
   * Listet alle Passkeys (WebAuthn-Faktoren) des aktuellen Users auf.
   */
  async function listPasskeys() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) throw error
    return (data?.all ?? []).filter(f => f.factor_type === 'webauthn')
  }

  /**
   * Registriert einen neuen Passkey fuer den aktuell eingeloggten User.
   * Triggert den Browser-WebAuthn-Dialog (Face ID / Touch ID / etc.).
   */
  async function enrollPasskey(friendlyName = 'Mein Gerät') {
    if (!window.PublicKeyCredential) {
      throw new Error('Dieser Browser unterstützt keine Passkeys.')
    }

    // 1) Supabase liefert die Challenge-Daten fuer den WebAuthn-Browser-Aufruf.
    const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'webauthn',
      friendlyName,
    })
    if (enrollErr) throw enrollErr

    // 2) Browser-Dialog: User authentifiziert sich biometrisch und der Browser
    //    erzeugt das Schluesselpaar. Supabase liefert die Optionen im
    //    `data.webauthn` oder `data.public_key`-Feld zurueck — wir
    //    versuchen beides, da die BETA-API hier noch wackelt.
    const opts = enroll?.webauthn ?? enroll?.public_key ?? enroll
    const credential = await navigator.credentials.create({ publicKey: opts })

    // 3) Verifizieren bei Supabase — schliesst den Enrollment-Flow ab.
    const { data: verify, error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enroll.id,
      challengeId: enroll.challenge_id ?? enroll.challengeId,
      code: credential, // Bei TOTP waere das der String-Code; bei WebAuthn das Credential-Objekt
    })
    if (verifyErr) throw verifyErr

    await refreshMFAStatus()
    return verify
  }

  /**
   * Loescht einen Passkey.
   */
  async function removePasskey(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw error
    await refreshMFAStatus()
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
      signIn, signUp, signInWithApple, signOut, loadProfile, updateProfile,
      verifyMFA, enrollMFA, confirmMFAEnrollment, unenrollMFA, refreshMFAStatus,
      listPasskeys, enrollPasskey, removePasskey,
      applyReferralCode, loadReferralStats
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
