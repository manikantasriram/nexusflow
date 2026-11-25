// An in-memory stand-in for the API's database, used by the MSW handlers in tests and in
// `npm run dev:mock`. It follows the same rules as the real API, reusing the board's position
// logic so moves land exactly where the real server would put them.

import type { Member, Organization, Project, Role, Task, User } from '../lib/types'

export interface MockState {
  users: (User & { password: string })[]
  organizations: Organization[]
  memberships: {
    organization_id: number
    user_id: number
    role: Role
    joined_at: string
  }[]
  projects: Project[]
  tasks: Task[]
  /** Who the refresh "cookie" belongs to; null = signed out. */
  sessionUserId: number | null
  nextId: number
}

/** The public demo password, as in the README and api/app/seed.py. */
export const MOCK_PASSWORD = 'demo-pass-123'

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

function initialState(): MockState {
  const created = new Date().toISOString()
  const task = (
    id: number,
    title: string,
    status: Task['status'],
    position: number,
    extra: Partial<Task> = {},
  ): Task => ({
    id,
    key: `WEB-${id}`,
    number: id,
    project_id: 1,
    title,
    description: '',
    status,
    priority: 'medium',
    assignee_id: null,
    due_date: null,
    position,
    created_at: created,
    updated_at: created,
    completed_at: status === 'done' ? created : null,
    ...extra,
  })
  return {
    users: [
      {
        id: 1,
        email: 'owner@demo.nexusflow.dev',
        full_name: 'Asha Rao',
        password: MOCK_PASSWORD,
      },
      {
        id: 2,
        email: 'admin@demo.nexusflow.dev',
        full_name: 'Ben Carter',
        password: MOCK_PASSWORD,
      },
      {
        id: 3,
        email: 'member@demo.nexusflow.dev',
        full_name: 'Chen Wei',
        password: MOCK_PASSWORD,
      },
    ],
    organizations: [{ id: 1, name: 'Acme Robotics', slug: 'acme-robotics' }],
    memberships: [
      { organization_id: 1, user_id: 1, role: 'owner', joined_at: created },
      { organization_id: 1, user_id: 2, role: 'admin', joined_at: created },
      { organization_id: 1, user_id: 3, role: 'member', joined_at: created },
    ],
    projects: [
      {
        id: 1,
        name: 'Website relaunch',
        key: 'WEB',
        description: 'New marketing site with a faster checkout.',
        created_at: created,
        task_count: 0,
        done_count: 0,
      },
    ],
    tasks: [
      task(1, 'Audit current page speed', 'todo', 1024, {
        priority: 'high',
        assignee_id: 1,
        due_date: day(-2),
      }),
      task(2, 'Design new pricing page', 'todo', 2048, {
        assignee_id: 2,
        due_date: day(3),
      }),
      task(3, 'Migrate blog posts', 'in_progress', 1024, {
        priority: 'low',
        assignee_id: 1,
      }),
      task(4, 'Accessibility pass on forms', 'in_review', 1024, {
        priority: 'urgent',
      }),
      task(5, 'Set up redirects for old URLs', 'done', 1024, {
        assignee_id: 3,
      }),
    ],
    sessionUserId: null,
    nextId: 100,
  }
}

export let db: MockState = initialState()

export function resetMockDb(): void {
  db = initialState()
}

export const userOf = (id: number) => db.users.find((u) => u.id === id)

export function membersOf(orgId: number): Member[] {
  return db.memberships
    .filter((m) => m.organization_id === orgId)
    .flatMap((m) => {
      const found = userOf(m.user_id)
      if (!found) return []
      const { password: _password, ...user } = found
      return [{ user, role: m.role, joined_at: m.joined_at }]
    })
}

export function projectWithCounts(p: Project): Project {
  const tasks = db.tasks.filter((t) => t.project_id === p.id)
  return {
    ...p,
    task_count: tasks.length,
    done_count: tasks.filter((t) => t.status === 'done').length,
  }
}
