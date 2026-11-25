import { useMemo } from 'react'
import { Outlet, useLocation, useParams } from 'react-router'
import { AppShell } from '../../components/AppShell'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { useAuth } from '../auth/authContext'
import { OrgContext, type OrgValue } from './orgContext'

/** Everything under /o/:orgId. Only renders for organizations the user belongs to. */
export function OrgLayout() {
  const { orgId: raw } = useParams()
  const { memberships } = useAuth()
  const location = useLocation()
  const orgId = Number(raw)
  const membership = memberships.find((m) => m.organization.id === orgId)

  const value = useMemo<OrgValue | null>(
    () =>
      membership
        ? {
            orgId,
            organization: membership.organization,
            role: membership.role,
            isAdmin: membership.role !== 'member',
          }
        : null,
    [orgId, membership],
  )

  if (!value) return <NotFoundPage />
  return (
    <OrgContext value={value}>
      <AppShell>
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </AppShell>
    </OrgContext>
  )
}
