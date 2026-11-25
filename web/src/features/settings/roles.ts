import type { Role } from '../../lib/types'

// The same rules as the API (api/app/services/orgs.py), so the UI only offers what will work.
// The API still enforces them: this only decides which buttons to show.

/** Roles you may give to someone: owners give any role, admins only "member". */
export function grantableRoles(myRole: Role): Role[] {
  if (myRole === 'owner') return ['owner', 'admin', 'member']
  if (myRole === 'admin') return ['member']
  return []
}

/** Whether you may change or remove someone with the `target` role. */
export function canManage(myRole: Role, target: Role): boolean {
  return myRole === 'owner' || (myRole === 'admin' && target === 'member')
}
