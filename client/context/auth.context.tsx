'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { setToken, removeToken, getToken } from '@/lib/auth'

interface User {
  id: number
  name: string
  email: string
  role: string
  emailVerified: boolean
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = async () => {
    try {
      const token = getToken()
      if (!token) {
        setLoading(false)
        return
      }

      const response = await api.get('/auth/me')
      if (response.data.success && response.data.user) {
        setUser(response.data.user)
      } else {
        removeToken()
        setUser(null)
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      removeToken()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [])

  const login = async (email: string, password: string) => {
    const response = await api.post('/auth/signin', { email, password })
    
    if (response.data.success && response.data.token) {
      setToken(response.data.token)
      setUser(response.data.user)
      router.push('/dashboard')
    } else {
      throw new Error(response.data.error || 'Login failed')
    }
  }

  const logout = () => {
    removeToken()
    setUser(null)
    router.push('/')
  }

  const refreshUser = async () => {
    await fetchUser()
  }

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext