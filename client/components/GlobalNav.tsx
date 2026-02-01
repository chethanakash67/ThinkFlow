'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FaBrain, FaSignOutAlt, FaTachometerAlt, FaCode } from 'react-icons/fa'
import { useAuth } from '@/context/auth.context'
import { logout } from '@/lib/auth'

export default function GlobalNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  // Don't show GlobalNav on auth pages, dashboard, problems, or landing page (they have their own headers)
  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password' || pathname === '/verify-otp'
  const isDashboardPage = pathname === '/dashboard'
  const isProblemsPage = pathname.startsWith('/problems')
  const isLandingPage = pathname === '/'
  
  if (isAuthPage || isDashboardPage || isProblemsPage || isLandingPage) {
    return null
  }

  // Authenticated nav for other pages
  if (!user) {
    return null
  }

  // Authenticated nav
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <FaBrain className="text-2xl text-indigo-600" />
            <Link href="/dashboard" className="text-xl font-bold text-gray-900">
              ThinkFlow
            </Link>
          </div>
          <div className="flex items-center space-x-6">
            <Link 
              href="/dashboard"
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                pathname === '/dashboard' 
                  ? 'bg-indigo-100 text-indigo-600' 
                  : 'text-gray-700 hover:text-indigo-600'
              }`}
            >
              <FaTachometerAlt />
              <span>Dashboard</span>
            </Link>
            <Link 
              href="/problems"
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                pathname.startsWith('/problems')
                  ? 'bg-indigo-100 text-indigo-600' 
                  : 'text-gray-700 hover:text-indigo-600'
              }`}
            >
              <FaCode />
              <span>Problems</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:text-red-600 transition-colors"
            >
              <FaSignOutAlt />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
