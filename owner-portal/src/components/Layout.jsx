/**
 * Layout-Switch:
 *   - Capacitor (Android-App) → LayoutMobile (iOS-Style, 5 Tabs, kein Sidebar)
 *   - Web/Desktop             → klassisches Sidebar-Layout
 */
import { Capacitor } from '@capacitor/core'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Ship, Wrench, ShoppingBag, ShoppingCart,
  Heart, User, LogOut, Menu, X, Package, Map, Search, MessageSquare, Mail
} from 'lucide-react'
import { useState } from 'react'
import LayoutMobile from './LayoutMobile'

const navItems = [
  { to: '/map', icon: Map, label: 'Karte' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/boats', icon: Ship, label: 'Meine Boote' },
  { to: '/equipment', icon: Package, label: 'Ausrüstung' },
  { to: '/maintenance', icon: Wrench, label: 'Wartung' },
  { to: '/shop', icon: ShoppingCart, label: 'Shop' },
  { to: '/services', icon: Search, label: 'Service-Suche' },
  { to: '/orders', icon: ShoppingBag, label: 'Bestellungen' },
  { to: '/favorites', icon: Heart, label: 'Favoriten' },
  { to: '/inquiries', icon: Mail, label: 'Anfragen' },
  { to: '/chat', icon: MessageSquare, label: 'KI-Assistent' },
  { to: '/profile', icon: User, label: 'Mein Profil' },
]

const bottomTabs = [
  { to: '/map', icon: Map, label: 'Karte' },
  { to: '/boats', icon: Ship, label: 'Boote' },
  { to: '/maintenance', icon: Wrench, label: 'Wartung' },
  { to: '/inquiries', icon: Mail, label: 'Anfragen' },
  { to: '/favorites', icon: Heart, label: 'Favoriten' },
]

function LayoutDesktop() {
  const { profile, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src="/favicon-32.png" alt="" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span>Skipily</span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-name">{profile?.full_name || 'Bootseigner'}</div>
          <button className="btn-logout" onClick={signOut}>
            <LogOut size={16} />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <span className="topbar-title">Mein Skipily</span>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>

      {/* Bottom tab bar – mobile only (für Browser auf Smartphone) */}
      <nav className="bottom-nav">
        {bottomTabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <tab.icon size={22} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}

export default function Layout() {
  // Native Plattform (Capacitor Android) → iOS-Style-Layout
  // Web/Browser → klassisches Sidebar-Layout
  if (Capacitor.isNativePlatform()) {
    return <LayoutMobile />
  }
  return <LayoutDesktop />
}
