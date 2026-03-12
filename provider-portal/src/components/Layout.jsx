import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Package, FileText, Tag,
  MessageSquare, BarChart3, User, LogOut, Anchor, Menu, X
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products', icon: Package, label: 'Produkte' },
  { to: '/orders', icon: FileText, label: 'Bestellungen' },
  { to: '/promotions', icon: Tag, label: 'Angebote' },
  { to: '/messages', icon: MessageSquare, label: 'Nachrichten' },
  { to: '/insights', icon: BarChart3, label: 'Marktanalyse' },
  { to: '/profile', icon: User, label: 'Stammdaten' },
]

export default function Layout() {
  const { provider, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Anchor size={28} />
          <span>BoatCare</span>
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
          <div className="provider-name">{provider?.name}</div>
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
          <span className="topbar-title">Provider-Portal</span>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
