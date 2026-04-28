import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import SetPassword from './pages/SetPassword'
import MfaSetup from './pages/MfaSetup'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Orders from './pages/Orders'
import Promotions from './pages/Promotions'
import Messages from './pages/Messages'
import MarketInsights from './pages/MarketInsights'
import Profile from './pages/Profile'

/**
 * Liest beim allerersten Mount den URL-Hash aus. Supabase leitet Reset-,
 * Invite- und Signup-Bestätigungs-Mails mit `#access_token=…&type=…` zurück
 * an die App; wir merken uns nur den Typ, denn die Session legt Supabase JS
 * automatisch an. Danach hat der Hash seine Aufgabe erfüllt.
 */
function useAuthFlowFromHash() {
  const [flowType, setFlowType] = useState(null)
  useEffect(() => {
    const hash = window.location.hash || ''
    const m = hash.match(/[#&]type=([^&]+)/)
    if (m) setFlowType(m[1])
  }, [])
  return flowType
}

function ProtectedRoutes() {
  const { user, provider, loading, mfaEnrolled, refreshMfaStatus } = useAuth()
  const flowType = useAuthFlowFromHash()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Laden...</p>
      </div>
    )
  }

  // Recovery / Invite: Passwort setzen, bevor das Portal geöffnet wird.
  // (type=signup brauchen wir nicht — der User hat sein Passwort bei der
  //  Registrierung schon vergeben.)
  if (user && (flowType === 'recovery' || flowType === 'invite')) {
    return <SetPassword flowType={flowType} email={user.email} />
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  if (!provider) {
    return (
      <div className="loading-screen">
        <h2>Kein Provider-Profil</h2>
        <p>Ihr Account ist nicht mit einem ServiceProvider verknüpft.<br />Bitte kontaktieren Sie das Skipily-Team.</p>
        <button className="btn-secondary" onClick={() => window.location.reload()}>Erneut versuchen</button>
      </div>
    )
  }

  // 2FA-Pflicht: wenn aktiviert und noch kein TOTP-Faktor verifiziert,
  // muss der Provider zuerst die Authenticator-App einrichten.
  if (provider.mfa_required && !mfaEnrolled) {
    return <MfaSetup onDone={() => { refreshMfaStatus().then(() => window.location.reload()) }} />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="orders" element={<Orders />} />
        <Route path="promotions" element={<Promotions />} />
        <Route path="messages" element={<Messages />} />
        <Route path="insights" element={<MarketInsights />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
