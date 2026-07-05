/**
 * Layout-Switch:
 *   - Capacitor (Android-App) → LayoutMobile (iOS-Style, 5 Tabs, kein Sidebar)
 *   - Web/Desktop             → klassisches Sidebar-Layout
 */
import { Capacitor } from '@capacitor/core'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUnreadInquiries } from '../hooks/useUnreadInquiries'
import { useT } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'
import {
  LayoutDashboard, Ship, Wrench, ShoppingBag, ShoppingCart,
  Heart, User, LogOut, Menu, X, Package, Map, Search, MessageSquare, Mail
} from 'lucide-react'
import { useState } from 'react'
import LayoutMobile from './LayoutMobile'

const navItems = [
  { to: '/map', icon: Map, key: 'nav.map' },
  { to: '/dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/boats', icon: Ship, key: 'nav.boats' },
  { to: '/equipment', icon: Package, key: 'nav.equipment' },
  { to: '/maintenance', icon: Wrench, key: 'nav.maintenance' },
  { to: '/shop', icon: ShoppingCart, key: 'nav.shop' },
  { to: '/services', icon: Search, key: 'nav.services' },
  { to: '/orders', icon: ShoppingBag, key: 'nav.orders' },
  { to: '/favorites', icon: Heart, key: 'nav.favorites' },
  { to: '/inquiries', icon: Mail, key: 'nav.inquiries' },
  { to: '/chat', icon: MessageSquare, key: 'nav.chat' },
  { to: '/profile', icon: User, key: 'nav.profile' },
]

const bottomTabs = [
  { to: '/map', icon: Map, key: 'nav.map' },
  { to: '/boats', icon: Ship, key: 'nav.boatsShort' },
  { to: '/maintenance', icon: Wrench, key: 'nav.maintenance' },
  { to: '/inquiries', icon: Mail, key: 'nav.inquiries' },
  { to: '/favorites', icon: Heart, key: 'nav.favorites' },
]

function LayoutDesktop() {
  const { profile, signOut } = useAuth()
  const { t } = useT()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const unreadInquiries = useUnreadInquiries()

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
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <item.icon size={18} />
                {item.to === '/inquiries' && unreadInquiries > 0 && (
                  <span style={{ position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadInquiries}</span>
                )}
              </span>
              <span>{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-name">{profile?.full_name || t('layout.ownerFallback')}</div>
          <div style={{ margin: '8px 0' }}>
            <LanguageSwitcher style={{ fontSize: 12 }} />
          </div>
          <button className="btn-logout" onClick={signOut}>
            <LogOut size={16} />
            <span>{t('common.logout')}</span>
          </button>
          <div className="sidebar-legal">
            <a href="/datenschutz.html" target="_blank" rel="noopener noreferrer">{t('common.privacyShort')}</a>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <span className="topbar-title">{t('layout.topbarTitle')}</span>
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
            <span>{t(tab.key)}</span>
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
