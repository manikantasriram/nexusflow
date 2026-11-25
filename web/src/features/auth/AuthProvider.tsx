// Who is signed in, shared with every component through React context.
//
// On load we try a silent refresh: if the browser still has a valid refresh cookie we get a new
// access token and stay signed in across reloads, without ever storing a token in localStorage.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, refreshAccessToken, setAccessToken, setSessionExpiredHandler } from '../../lib/api'
import { keys } from '../../lib/queries'
import type { RegisterInput } from '../../lib/types'
import { AuthContext, type AuthStatus, type AuthValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<'checking' | 'active' | 'none'>('checking')

  useEffect(() => {
    let cancelled = false
    void refreshAccessToken().then((ok) => {
      if (!cancelled) setSession(ok ? 'active' : 'none')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const forget = useCallback(() => {
    setAccessToken(null)
    qc.clear() // drop every cached response that belonged to this user
    setSession('none')
  }, [qc])

  useEffect(() => setSessionExpiredHandler(forget), [forget])

  const me = useQuery({
    queryKey: keys.me,
    queryFn: api.me,
    enabled: session === 'active',
    staleTime: Infinity,
    retry: false,
  })

  const start = useCallback(
    (token: string) => {
      qc.clear()
      setAccessToken(token)
      setSession('active')
    },
    [qc],
  )

  const signIn = useCallback(
    async (email: string, password: string) =>
      start((await api.login(email, password)).access_token),
    [start],
  )
  const signUp = useCallback(
    async (input: RegisterInput) => start((await api.register(input)).access_token),
    [start],
  )
  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined) // signing out locally must work even offline
    forget()
  }, [forget])

  const value = useMemo<AuthValue>(() => {
    let status: AuthStatus = 'signed-out'
    if (session === 'checking' || (session === 'active' && me.isPending)) status = 'loading'
    else if (session === 'active' && me.data) status = 'signed-in'
    return {
      status,
      user: status === 'signed-in' ? (me.data?.user ?? null) : null,
      memberships: status === 'signed-in' ? (me.data?.memberships ?? []) : [],
      signIn,
      signUp,
      signOut,
    }
  }, [session, me.isPending, me.data, signIn, signUp, signOut])

  return <AuthContext value={value}>{children}</AuthContext>
}
