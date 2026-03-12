import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Orders from './pages/Orders'
import Promotions from './pages/Promotions'
import Messages from './pages/Messages'
import Profile from './pages/Profile'

function ProtectedRoutes() {
  const { user, provider, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Laden...</p>
      </div>
    )
  }

  if (!user) return <Login />

  if (!provider) {
    return (
      <div className="loading-screen">
        <h2>Kein Provider-Profil</h2>
        <p>Ihr Account ist nicht mit einem ServiceProvider verknüpft.<br />Bitte kontaktieren Sie das BoatCare-Team.</p>
        <button className="btn-secondary" onClick={() => window.location.reload()}>Erneut versuchen</button>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="orders" element={<Orders />} />
        <Route path="promotions" element={<Promotions />} />
        <Route path="messages" element={<Messages />} />
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
