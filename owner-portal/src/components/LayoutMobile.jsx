/**
 * LayoutMobile – iOS-Style Layout für Capacitor (Android-App).
 * Nur 5 Tabs unten + Topbar mit Mail-Icon + Profil-Dropdown.
 * Wird NICHT im Browser verwendet.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUnreadInquiries } from '../hooks/useUnreadInquiries'
import { useUnreadMessages } from '../hooks/useUnreadMessages'
import { useT } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'
import {
  Ship, Wrench, ShoppingCart, Heart, User, LogOut, Map, Mail,
  LayoutDashboard, ShoppingBag, MessageSquare, MessageCircle, ChevronDown,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

const bottomTabs = [
  { to: '/map',         icon: Map,          key: 'nav.map' },
  { to: '/boats',       icon: Ship,         key: 'nav.boatsShort' },
  { to: '/maintenance', icon: Wrench,       key: 'nav.maintenance' },
  { to: '/shop',        icon: ShoppingCart, key: 'nav.shop' },
  { to: '/favorites',   icon: Heart,        key: 'nav.contacts' },
]

const profileMenu = [
  { to: '/profile',   icon: User,            key: 'nav.profile' },
  { to: '/orders',    icon: ShoppingBag,     key: 'nav.orders' },
  { to: '/dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/chat',      icon: MessageSquare,   key: 'nav.chat' },
]

export default function LayoutMobile() {
  const { profile, signOut } = useAuth()
  const { t } = useT()
  const unreadInquiries = useUnreadInquiries()
  const unreadMessages = useUnreadMessages()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    if (profileOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [profileOpen])

  const initials = (profile?.full_name || 'Bo')
    .split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  function goTo(path) {
    setProfileOpen(false)
    navigate(path)
  }

  return (
    <div className="layout-ios">
      <header className="topbar-ios">
        <div className="topbar-brand">
          <img src="/favicon-32.png" alt="" style={{ width: 26, height: 26, borderRadius: 6 }} />
          <span>Skipily</span>
        </div>
        <div className="topbar-actions">
          <NavLink to="/messages" className="topbar-icon-btn" aria-label={t('nav.messages')} style={{ position: 'relative' }}>
            <MessageCircle size={20} />
            {unreadMessages > 0 && (
              <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadMessages}</span>
            )}
          </NavLink>
          <NavLink to="/inquiries" className="topbar-icon-btn" aria-label={t('nav.inquiries')} style={{ position: 'relative' }}>
            <Mail size={20} />
            {unreadInquiries > 0 && (
              <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadInquiries}</span>
            )}
          </NavLink>
          <div className="profile-wrap" ref={profileRef}>
            <button
              className="profile-trigger"
              onClick={() => setProfileOpen(o => !o)}
              aria-label={t('nav.profile')}
            >
              <span className="profile-avatar">{initials}</span>
              <ChevronDown size={14} />
            </button>
            {profileOpen && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-header">
                  <div className="profile-avatar-lg">{initials}</div>
                  <div>
                    <div className="profile-name">{profile?.full_name || t('layout.ownerFallback')}</div>
                    <div className="profile-email">{profile?.email || ''}</div>
                  </div>
                </div>
                <div className="profile-dropdown-divider" />
                {profileMenu.map(item => (
                  <button
                    key={item.to}
                    className="profile-dropdown-item"
                    onClick={() => goTo(item.to)}
                  >
                    <item.icon size={18} />
                    <span>{t(item.key)}</span>
                  </button>
                ))}
                <div className="profile-dropdown-divider" />
                <div className="profile-dropdown-item" style={{ cursor: 'default' }}>
                  <LanguageSwitcher style={{ fontSize: 13 }} />
                </div>
                <div className="profile-dropdown-divider" />
                <button
                  className="profile-dropdown-item danger"
                  onClick={() => { setProfileOpen(false); signOut() }}
                >
                  <LogOut size={18} />
                  <span>{t('common.logout')}</span>
                </button>
                <div className="profile-dropdown-divider" />
                <a
                  href="/datenschutz.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-dropdown-item"
                  style={{ fontSize: '0.78rem', color: '#94a3b8' }}
                  onClick={() => setProfileOpen(false)}
                >
                  {t('common.privacyShort')}
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="content-ios">
        <Outlet />
      </main>

      <nav className="bottom-nav-ios">
        {bottomTabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `bottom-nav-item-ios ${isActive ? 'active' : ''}`}
          >
            <tab.icon size={22} strokeWidth={2} />
            <span>{t(tab.key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
