'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FaChevronDown,
  FaMoon,
  FaPalette,
  FaSignOutAlt,
  FaSun,
  FaUserCircle,
} from 'react-icons/fa'
import { useAuth } from '@/context/auth.context'

type ThemeMode = 'light' | 'dark'

export default function GlobalNav() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>('light')
  const menuRef = useRef<HTMLDivElement | null>(null)

  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password' || pathname === '/verify-otp'
  const isLandingPage = pathname === '/'
  const isProblemsPage = pathname.startsWith('/problems')

  useEffect(() => {
    const savedTheme = (typeof window !== 'undefined' ? window.localStorage.getItem('thinkflow-theme') : null) as ThemeMode | null
    const preferredTheme = savedTheme || 'light'
    setTheme(preferredTheme)
    document.documentElement.dataset.theme = preferredTheme
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const initials = useMemo(() => {
    if (!user?.name) return 'U'
    return user.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }, [user?.name])

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem('thinkflow-theme', nextTheme)
  }

  if (!user || isAuthPage || isLandingPage || isProblemsPage) {
    return null
  }

  return (
    <nav className="app-nav">
      <div className="app-nav-inner">
        <Link href="/dashboard" className="app-brand">
          <span className="app-brand-logo">
            <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={44} height={44} />
          </span>
          <span className="app-brand-text">ThinkFlow</span>
        </Link>

        <div className="app-nav-links">
          <Link href="/problems" className={`app-nav-link ${pathname.startsWith('/problems') ? 'active' : ''}`}>
            Problems
          </Link>
          <Link href="/competitions" className={`app-nav-link ${pathname.startsWith('/competitions') ? 'active' : ''}`}>
            Competitions
          </Link>
        </div>

        <div className="app-nav-right" ref={menuRef}>
          <button className="app-avatar-button" onClick={() => setMenuOpen((open) => !open)} aria-label="Profile menu">
            <span className="app-avatar-circle">{initials}</span>
            <FaChevronDown className={`app-avatar-chevron ${menuOpen ? 'open' : ''}`} />
          </button>

          {menuOpen ? (
            <div className="app-avatar-menu">
              <div className="app-menu-user">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <Link href="/profile" className="app-menu-item" onClick={() => setMenuOpen(false)}>
                <FaUserCircle />
                <span>View Profile</span>
              </Link>
              <Link href="/profile#settings" className="app-menu-item" onClick={() => setMenuOpen(false)}>
                <FaPalette />
                <span>Settings</span>
              </Link>
              <button className="app-menu-item" onClick={toggleTheme}>
                {theme === 'light' ? <FaMoon /> : <FaSun />}
                <span>Appearance</span>
              </button>
              <button className="app-menu-item danger" onClick={logout}>
                <FaSignOutAlt />
                <span>Logout</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
