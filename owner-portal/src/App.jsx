import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Boats from './pages/Boats'
import Equipment from './pages/Equipment'
import Maintenance from './pages/Maintenance'
import Orders from './pages/Orders'
import Favorites from './pages/Favorites'
import MapView from './pages/MapView'
import Profile from './pages/Profile'
import ProviderDetail from './pages/ProviderDetail'
import Shop from './pages/Shop'
import ProductDetail from './pages/ProductDetail'
import ServiceSearch from './pages/ServiceSearch'
import AIChat from './pages/AIChat'
import Checkout from './pages/Checkout'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Laden...</p>
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="boats" element={<Boats />} />
        <Route path="equipment" element={<Equipment />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="orders" element={<Orders />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="map" element={<MapView />} />
        <Route path="shop" element={<Shop />} />
        <Route path="shop/product/:id" element={<ProductDetail />} />
        <Route path="provider/:id" element={<ProviderDetail />} />
        <Route path="services" element={<ServiceSearch />} />
        <Route path="chat" element={<AIChat />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="checkout/success" element={<Checkout />} />
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
