import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Ship, Wrench, ShoppingBag, ShoppingCart,
  Heart, User, LogOut, Anchor, Menu, X, Package, Map, Search, MessageSquare
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/boats', icon: Ship, label: 'Meine Boote' },
  { to: '/equipment', icon: Package, label: 'Ausrüstung' },
  { to: '/maintenance', icon: Wrench, label: 'Wartung' },
  { to: '/shop', icon: ShoppingCart, label: 'Shop' },
  { to: '/services', icon: Search, label: 'Service-Suche' },
  { to: '/orders', icon: ShoppingBag, label: 'Bestellungen' },
  { to: '/map', icon: Map, label: 'Karte' },
  { to: '/favorites', icon: Heart, label: 'Favoriten' },
  { to: '/chat', icon: MessageSquare, label: 'KI-Assistent' },
  { to: '/profile', icon: User, label: 'Mein Profil' },
]

export default function Layout() {
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
              end={item.to === '/'}
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

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
