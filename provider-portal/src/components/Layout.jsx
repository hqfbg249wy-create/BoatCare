import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Package, FileText, Tag,
  MessageSquare, BarChart3, User, LogOut, Anchor, Menu, X, HelpCircle
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products', icon: Package, label: 'Produkte' },
  { to: '/orders', icon: FileText, label: 'Bestellungen' },
  { to: '/promotions', icon: Tag, label: 'Angebote' },
  { to: '/messages', icon: MessageSquare, label: 'Nachrichten' },
  { to: '/insights', icon: BarChart3, label: 'Marktanalyse' },
  { to: '/help', icon: HelpCircle, label: 'Hilfe & FAQ' },
  { to: '/profile', icon: User, label: 'Stammdaten' },
]

export default function Layout() {
  const { provider, providers, switchProvider, signOut } = useAuth()
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
          {/* Konto-Wechsler: nur wenn der User mehreren Betrieben angehört */}
          {providers && providers.length > 1 ? (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block', marginBottom: 4 }}>Aktiver Betrieb</label>
              <select
                value={provider?.id || ''}
                onChange={e => switchProvider(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: 13, background: '#fff', cursor: 'pointer' }}
              >
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p._membership === 'owner' ? ' (Inhaber)' : p._membership === 'admin' ? ' (Admin)' : ' (Mitglied)'}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="provider-name">{provider?.name}</div>
          )}
          <button className="btn-logout" onClick={signOut}>
            <LogOut size={16} />
            <span>Abmelden</span>
          </button>
          {/* Legal-Links — Pflicht laut DSGVO / TMG */}
          <div className="sidebar-legal">
            <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer">Datenschutz</a>
          </div>
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
