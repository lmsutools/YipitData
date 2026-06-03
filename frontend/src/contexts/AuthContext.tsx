import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { login as apiLogin } from '../api/auth'

interface User {
  id: number
  email: string
  role: string
}

interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('yipit_token'))
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('yipit_user')
    return stored ? JSON.parse(stored) : null
  })

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password)
    localStorage.setItem('yipit_token', response.token)
    localStorage.setItem('yipit_user', JSON.stringify(response.user))
    setToken(response.token)
    setUser(response.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('yipit_token')
    localStorage.removeItem('yipit_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
