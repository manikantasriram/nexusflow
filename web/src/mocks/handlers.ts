// MSW request handlers: a fake NexusFlow API that answers in the same shapes (and error format)
// as the real one. Single organization only; enough for the UI's tests and offline demos.

import { http, HttpResponse, type PathParams } from 'msw'
import { boardReducer, columnOf, endOfColumn } from '../features/board/boardReducer'
import {
  PRIORITIES,
  TASK_STATUSES,
  type Stats,
  type Task,
  type TaskInput,
  type TaskPatch,
  type TaskStatus,
} from '../lib/types'
import { db, membersOf, projectWithCounts, userOf } from './db'

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

const tokenFor = (userId: number) => `mock-access-${userId}`

function currentUser(request: Request) {
  const match = /^Bearer mock-access-(\d+)$/.exec(request.headers.get('Authorization') ?? '')
  return match ? userOf(Number(match[1])) : undefined
}

/** Wraps a handler so it only runs for a signed-in member of :orgId. */
function member<P extends PathParams>(
  handler: (args: { request: Request; params: P; userId: number }) => Response | Promise<Response>,
) {
  return ({ request, params }: { request: Request; params: P }) => {
    const user = currentUser(request)
    if (!user) return fail(401, 'unauthorized', 'Not signed in, or your session has expired')
    const orgId = Number(params.orgId)
    if (!db.memberships.some((m) => m.organization_id === orgId && m.user_id === user.id)) {
      return fail(404, 'not_found', 'Organization not found')
    }
    return handler({ request, params, userId: user.id })
  }
}

function me(userId: number) {
  const { password: _password, ...user } = userOf(userId)!
  return {
    user,
    memberships: db.memberships
      .filter((m) => m.user_id === userId)
      .map((m) => ({
        organization: db.organizations.find((o) => o.id === m.organization_id)!,
        role: m.role,
      })),
  }
}

function signIn(userId: number) {
  db.sessionUserId = userId
  return HttpResponse.json({
    access_token: tokenFor(userId),
    token_type: 'bearer',
    expires_in: 900,
  })
}

function withKey(task: Task): Task {
  const project = db.projects.find((p) => p.id === task.project_id)!
  return { ...task, key: `${project.key}-${task.number}` }
}

function stats(orgId: number): Stats {
  const projects = db.projects.filter(() => orgId === 1)
  const tasks = db.tasks.filter((t) => projects.some((p) => p.id === t.project_id))
  const today = new Date().toISOString().slice(0, 10)
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const open = tasks.filter((t) => t.status !== 'done')
  return {
    total_tasks: tasks.length,
    by_status: Object.fromEntries(
      TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]),
    ) as Stats['by_status'],
    by_priority: Object.fromEntries(
      PRIORITIES.map((p) => [p, open.filter((t) => t.priority === p).length]),
    ) as Stats['by_priority'],
    overdue: open.filter((t) => t.due_date && t.due_date < today).length,
    due_this_week: open.filter((t) => t.due_date && t.due_date >= today && t.due_date <= week)
      .length,
    completed_last_7_days: tasks.filter((t) => t.status === 'done').length,
    projects: projects.map((p) => {
      const c = projectWithCounts(p)
      return {
        id: p.id,
        name: p.name,
        key: p.key,
        total: c.task_count,
        done: c.done_count,
      }
    }),
    generated_at: new Date().toISOString(),
    cached: false,
  }
}

const base = '*/api'

export const handlers = [
  // --- auth ---
  http.post(`${base}/auth/login`, async ({ request }) => {
    const { email, password } = (await request.json()) as {
      email: string
      password: string
    }
    const user = db.users.find((u) => u.email === email.toLowerCase())
    if (!user || user.password !== password)
      return fail(401, 'unauthorized', 'Incorrect email or password')
    return signIn(user.id)
  }),
  http.post(`${base}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string
      password: string
      full_name: string
      organization_name: string
    }
    if (db.users.some((u) => u.email === body.email.toLowerCase())) {
      return fail(409, 'conflict', 'An account with that email already exists')
    }
    const id = db.nextId++
    db.users.push({
      id,
      email: body.email.toLowerCase(),
      full_name: body.full_name,
      password: body.password,
    })
    const orgId = db.nextId++
    db.organizations.push({
      id: orgId,
      name: body.organization_name,
      slug: `org-${orgId}`,
    })
    db.memberships.push({
      organization_id: orgId,
      user_id: id,
      role: 'owner',
      joined_at: new Date().toISOString(),
    })
    return signIn(id)
  }),
  http.post(`${base}/auth/refresh`, () =>
    db.sessionUserId === null
      ? fail(401, 'unauthorized', 'Your session has ended. Please sign in again.')
      : signIn(db.sessionUserId),
  ),
  http.post(`${base}/auth/logout`, () => {
    db.sessionUserId = null
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(`${base}/auth/me`, ({ request }) => {
    const user = currentUser(request)
    return user ? HttpResponse.json(me(user.id)) : fail(401, 'unauthorized', 'Not signed in')
  }),

  // --- organizations ---
  http.get(
    `${base}/orgs/:orgId/members`,
    member(({ params }) => HttpResponse.json(membersOf(Number(params.orgId)))),
  ),
  http.get(
    `${base}/orgs/:orgId/stats`,
    member(({ params }) => HttpResponse.json(stats(Number(params.orgId)))),
  ),

  // --- projects ---
  http.get(
    `${base}/orgs/:orgId/projects`,
    member(() => HttpResponse.json(db.projects.map(projectWithCounts))),
  ),
  http.post(
    `${base}/orgs/:orgId/projects`,
    member(async ({ request }) => {
      const body = (await request.json()) as {
        name: string
        key: string
        description: string
      }
      if (db.projects.some((p) => p.key === body.key)) {
        return fail(409, 'conflict', `The key ${body.key} is already used by another project`)
      }
      const project = {
        id: db.nextId++,
        ...body,
        created_at: new Date().toISOString(),
        task_count: 0,
        done_count: 0,
      }
      db.projects.push(project)
      return HttpResponse.json(project, { status: 201 })
    }),
  ),
  http.get(
    `${base}/orgs/:orgId/projects/:projectId`,
    member(({ params }) => {
      const project = db.projects.find((p) => p.id === Number(params.projectId))
      return project
        ? HttpResponse.json(projectWithCounts(project))
        : fail(404, 'not_found', 'Project not found')
    }),
  ),

  // --- tasks ---
  http.get(
    `${base}/orgs/:orgId/projects/:projectId/tasks`,
    member(({ params }) =>
      HttpResponse.json(
        db.tasks.filter((t) => t.project_id === Number(params.projectId)).map(withKey),
      ),
    ),
  ),
  http.post(
    `${base}/orgs/:orgId/projects/:projectId/tasks`,
    member(async ({ request, params }) => {
      const input = (await request.json()) as TaskInput
      const projectId = Number(params.projectId)
      const status: TaskStatus = input.status ?? 'todo'
      const number =
        Math.max(0, ...db.tasks.filter((t) => t.project_id === projectId).map((t) => t.number)) + 1
      const stamp = new Date().toISOString()
      const task: Task = withKey({
        id: db.nextId++,
        key: '',
        number,
        project_id: projectId,
        title: input.title,
        description: input.description ?? '',
        status,
        priority: input.priority ?? 'medium',
        assignee_id: input.assignee_id ?? null,
        due_date: input.due_date ?? null,
        position: endOfColumn(
          db.tasks.filter((t) => t.project_id === projectId),
          status,
        ),
        created_at: stamp,
        updated_at: stamp,
        completed_at: status === 'done' ? stamp : null,
      })
      db.tasks.push(task)
      return HttpResponse.json(task, { status: 201 })
    }),
  ),
  http.get(
    `${base}/orgs/:orgId/tasks/mine`,
    member(({ userId }) =>
      HttpResponse.json(
        db.tasks.filter((t) => t.assignee_id === userId && t.status !== 'done').map(withKey),
      ),
    ),
  ),
  http.post(
    `${base}/orgs/:orgId/tasks/:taskId/move`,
    member(async ({ request, params }) => {
      const { status, index } = (await request.json()) as {
        status: TaskStatus
        index: number
      }
      const taskId = Number(params.taskId)
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task) return fail(404, 'not_found', 'Task not found')
      const others = db.tasks.filter((t) => t.project_id !== task.project_id)
      const mine = boardReducer(
        db.tasks.filter((t) => t.project_id === task.project_id),
        { type: 'task/moved', taskId, status, index },
      )
      db.tasks = [...others, ...mine]
      return HttpResponse.json(withKey(db.tasks.find((t) => t.id === taskId)!))
    }),
  ),
  http.patch(
    `${base}/orgs/:orgId/tasks/:taskId`,
    member(async ({ request, params }) => {
      const patch = (await request.json()) as TaskPatch
      const task = db.tasks.find((t) => t.id === Number(params.taskId))
      if (!task) return fail(404, 'not_found', 'Task not found')
      if (patch.status && patch.status !== task.status) {
        task.position = endOfColumn(columnOf(db.tasks, patch.status), patch.status)
        task.completed_at = patch.status === 'done' ? new Date().toISOString() : null
      }
      Object.assign(task, patch, { updated_at: new Date().toISOString() })
      return HttpResponse.json(withKey(task))
    }),
  ),
  http.delete(
    `${base}/orgs/:orgId/tasks/:taskId`,
    member(({ params }) => {
      db.tasks = db.tasks.filter((t) => t.id !== Number(params.taskId))
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // --- documents (none in the mock) ---
  http.get(
    `${base}/orgs/:orgId/projects/:projectId/documents`,
    member(() => HttpResponse.json([])),
  ),
]
