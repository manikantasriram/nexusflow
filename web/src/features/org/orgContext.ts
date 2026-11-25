import { createContext, useContext } from 'react'
import type { Organization, Role } from '../../lib/types'

export interface OrgValue {
  orgId: number
  organization: Organization
  role: Role
  /** Admins and owners can manage people and delete projects. */
  isAdmin: boolean
}

export const OrgContext = createContext<OrgValue | null>(null)

/** The organization the current page belongs to (from the /o/:orgId part of the URL). */
export function useOrg(): OrgValue {
  const value = useContext(OrgContext)
  if (!value) throw new Error('useOrg must be used inside an /o/:orgId route')
  return value
}
