import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { PageSpinner } from '../../components/ui'
import { useAuth } from './authContext'

/** Sends signed-out visitors to /login, remembering where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageSpinner label="Checking your session" />
  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children
}

/** The opposite, for /login and /register: signed-in visitors go to the app. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  if (status === 'loading') return <PageSpinner label="Checking your session" />
  if (status === 'signed-in')
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  return children
}
