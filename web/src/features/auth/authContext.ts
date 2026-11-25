import { createContext, useContext } from 'react'
import type { Membership, RegisterInput, User } from '../../lib/types'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

export interface AuthValue {
  status: AuthStatus
  user: User | null
  memberships: Membership[]
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: RegisterInput) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
