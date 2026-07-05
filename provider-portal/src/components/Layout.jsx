import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUnreadMessages } from '../hooks/useUnreadMessages'
import { useT } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'
import {
  LayoutDashboard, Package, FileText, Tag,
  MessageSquare, BarChart3, User, LogOut, Menu, X, HelpCircle
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/products', icon: Package, key: 'nav.products' },
  { to: '/orders', icon: FileText, key: 'nav.orders' },
  { to: '/promotions', icon: Tag, key: 'nav.promotions' },
  { to: '/messages', icon: MessageSquare, key: 'nav.messages' },
  { to: '/insights', icon: BarChart3, key: 'nav.insights' },
  { to: '/help', icon: HelpCircle, key: 'nav.help' },
  { to: '/profile', icon: User, key: 'nav.profile' },
]

export default function Layout() {
  const { provider, providers, switchProvider, signOut } = useAuth()
  const { t } = useT()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const unreadMessages = useUnreadMessages()

  const membershipLabel = (m) =>
    m === 'owner' ? t('layout.roleOwner') : m === 'admin' ? t('layout.roleAdmin') : t('layout.roleMember')

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
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <item.icon size={18} />
                {item.to === '/messages' && unreadMessages > 0 && (
                  <span style={{ position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadMessages}</span>
                )}
              </span>
              <span>{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {/* Konto-Wechsler: nur wenn der User mehreren Betrieben angehört */}
          {providers && providers.length > 1 ? (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block', marginBottom: 4 }}>{t('layout.activeBusiness')}</label>
              <select
                value={provider?.id || ''}
                onChange={e => switchProvider(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: 13, background: '#fff', cursor: 'pointer' }}
              >
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({membershipLabel(p._membership)})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="provider-name">{provider?.name}</div>
          )}
          <div style={{ marginBottom: 10 }}>
            <LanguageSwitcher style={{ fontSize: 12 }} />
          </div>
          <button className="btn-logout" onClick={signOut}>
            <LogOut size={16} />
            <span>{t('layout.logout')}</span>
          </button>
          {/* Legal-Links — Pflicht laut DSGVO / TMG */}
          <div className="sidebar-legal">
            <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer">{t('layout.privacyShort')}</a>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <span className="topbar-title">{t('app.providerPortal')}</span>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
