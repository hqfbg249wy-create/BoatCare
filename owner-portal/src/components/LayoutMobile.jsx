/**
 * LayoutMobile – iOS-Style Layout für Capacitor (Android-App).
 * Nur 5 Tabs unten + Topbar mit Mail-Icon + Profil-Dropdown.
 * Wird NICHT im Browser verwendet.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  Ship, Wrench, ShoppingCart, Heart, User, LogOut, Map, Mail,
  LayoutDashboard, ShoppingBag, MessageSquare, ChevronDown,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

const bottomTabs = [
  { to: '/map',         icon: Map,          label: 'Karte' },
  { to: '/boats',       icon: Ship,         label: 'Boote' },
  { to: '/maintenance', icon: Wrench,       label: 'Wartung' },
  { to: '/shop',        icon: ShoppingCart, label: 'Shop' },
  { to: '/favorites',   icon: Heart,        label: 'Favoriten' },
]

const profileMenu = [
  { to: '/profile',   icon: User,            label: 'Mein Profil' },
  { to: '/orders',    icon: ShoppingBag,     label: 'Bestellungen' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/chat',      icon: MessageSquare,   label: 'KI-Assistent' },
]

export default function LayoutMobile() {
  const { profile, signOut } = useAuth()
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
          <NavLink to="/inquiries" className="topbar-icon-btn" aria-label="Anfragen">
            <Mail size={20} />
          </NavLink>
          <div className="profile-wrap" ref={profileRef}>
            <button
              className="profile-trigger"
              onClick={() => setProfileOpen(o => !o)}
              aria-label="Profilmenü"
            >
              <span className="profile-avatar">{initials}</span>
              <ChevronDown size={14} />
            </button>
            {profileOpen && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-header">
                  <div className="profile-avatar-lg">{initials}</div>
                  <div>
                    <div className="profile-name">{profile?.full_name || 'Bootseigner'}</div>
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
                    <span>{item.label}</span>
                  </button>
                ))}
                <div className="profile-dropdown-divider" />
                <button
                  className="profile-dropdown-item danger"
                  onClick={() => { setProfileOpen(false); signOut() }}
                >
                  <LogOut size={18} />
                  <span>Abmelden</span>
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
                  Datenschutz
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
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
