// One typed wrapper around fetch(). Every request goes through `request`, so the API address,
// the access token, silent token refresh and error handling live in one place.
//
// Tokens: the short-lived access token is kept only in this module's memory (never in
// localStorage, where an XSS bug could read it). The refresh token is an httpOnly cookie the
// browser sends to /api/auth/* by itself. When a request gets 401, we refresh once and retry.

import type {
  ApiErrorBody,
  DocumentDetail,
  DocumentSummary,
  Me,
  Member,
  Membership,
  Organization,
  Project,
  ProjectInput,
  RegisterInput,
  Role,
  Stats,
  Task,
  TaskInput,
  TaskPatch,
  TaskStatus,
  TokenResponse,
} from './types'

/** Empty means "same origin" (the Vite dev proxy, nginx in Docker, or a Vercel rewrite). */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

const CSRF_HEADER = { 'X-Requested-With': 'nexusflow' }

/** An error the API sent back (or a network failure, with status 0). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Validation errors by field name, e.g. { key: "String should match pattern ..." } */
  readonly fields: Record<string, string>

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ApiErrorBody).error?.message === 'string'
  )
}

function toApiError(status: number, body: unknown): ApiError {
  if (isErrorBody(body)) {
    const { code, message, fields } = body.error
    return new ApiError(status, code, message, fields)
  }
  return new ApiError(status, 'error', `The server answered ${status}. Please try again.`)
}

// --- session ----------------------------------------------------------------------------------

let accessToken: string | null = null
let onSessionExpired: () => void = () => {}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

/** Called when a refresh fails mid-session (set by the auth provider). */
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

let refreshInFlight: Promise<boolean> | null = null

/**
 * Swaps the refresh cookie for a new access token. Concurrent callers share one request
 * ("single flight"), so ten parallel 401s cause one refresh, not ten.
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: CSRF_HEADER,
      })
      if (!res.ok) {
        accessToken = null
        return false
      }
      accessToken = ((await res.json()) as TokenResponse).access_token
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

// --- requests ---------------------------------------------------------------------------------

type RequestOptions = Omit<RequestInit, 'body'> & {
  json?: unknown
  body?: BodyInit
}

const NO_REFRESH = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
])

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  retry = true,
): Promise<T> {
  const { json, headers: extraHeaders, ...init } = options
  const headers = new Headers(extraHeaders)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  let body = init.body
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(json)
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      body,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError(
      0,
      'network_error',
      "Can't reach the server. Check your connection and try again.",
    )
  }

  if (res.status === 401 && retry && !NO_REFRESH.has(path)) {
    if (await refreshAccessToken()) return request<T>(path, options, false)
    onSessionExpired()
  }
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw toApiError(res.status, data)
  return data as T
}

const org = (orgId: number) => `/api/orgs/${orgId}`

export const api = {
  // auth
  login: (email: string, password: string) =>
    request<TokenResponse>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
    }),
  register: (input: RegisterInput) =>
    request<TokenResponse>('/api/auth/register', {
      method: 'POST',
      json: input,
    }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST', headers: CSRF_HEADER }),
  me: () => request<Me>('/api/auth/me'),

  // organizations and members
  createOrganization: (name: string) =>
    request<Membership>('/api/orgs', { method: 'POST', json: { name } }),
  renameOrganization: (orgId: number, name: string) =>
    request<Organization>(org(orgId), { method: 'PATCH', json: { name } }),
  members: (orgId: number) => request<Member[]>(`${org(orgId)}/members`),
  addMember: (orgId: number, email: string, role: Role) =>
    request<Member>(`${org(orgId)}/members`, {
      method: 'POST',
      json: { email, role },
    }),
  changeRole: (orgId: number, userId: number, role: Role) =>
    request<Member>(`${org(orgId)}/members/${userId}`, {
      method: 'PATCH',
      json: { role },
    }),
  removeMember: (orgId: number, userId: number) =>
    request<void>(`${org(orgId)}/members/${userId}`, { method: 'DELETE' }),
  stats: (orgId: number) => request<Stats>(`${org(orgId)}/stats`),

  // projects
  projects: (orgId: number) => request<Project[]>(`${org(orgId)}/projects`),
  project: (orgId: number, projectId: number) =>
    request<Project>(`${org(orgId)}/projects/${projectId}`),
  createProject: (orgId: number, input: ProjectInput) =>
    request<Project>(`${org(orgId)}/projects`, { method: 'POST', json: input }),
  updateProject: (orgId: number, projectId: number, input: Partial<ProjectInput>) =>
    request<Project>(`${org(orgId)}/projects/${projectId}`, {
      method: 'PATCH',
      json: input,
    }),
  deleteProject: (orgId: number, projectId: number) =>
    request<void>(`${org(orgId)}/projects/${projectId}`, { method: 'DELETE' }),

  // tasks
  tasks: (orgId: number, projectId: number) =>
    request<Task[]>(`${org(orgId)}/projects/${projectId}/tasks`),
  myTasks: (orgId: number) => request<Task[]>(`${org(orgId)}/tasks/mine`),
  createTask: (orgId: number, projectId: number, input: TaskInput) =>
    request<Task>(`${org(orgId)}/projects/${projectId}/tasks`, {
      method: 'POST',
      json: input,
    }),
  updateTask: (orgId: number, taskId: number, patch: TaskPatch) =>
    request<Task>(`${org(orgId)}/tasks/${taskId}`, {
      method: 'PATCH',
      json: patch,
    }),
  moveTask: (orgId: number, taskId: number, status: TaskStatus, index: number) =>
    request<Task>(`${org(orgId)}/tasks/${taskId}/move`, {
      method: 'POST',
      json: { status, index },
    }),
  deleteTask: (orgId: number, taskId: number) =>
    request<void>(`${org(orgId)}/tasks/${taskId}`, { method: 'DELETE' }),

  // documents
  documents: (orgId: number, projectId: number) =>
    request<DocumentSummary[]>(`${org(orgId)}/projects/${projectId}/documents`),
  document: (orgId: number, docId: number) =>
    request<DocumentDetail>(`${org(orgId)}/documents/${docId}`),
  uploadDocument: (orgId: number, projectId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<DocumentDetail>(`${org(orgId)}/projects/${projectId}/documents`, {
      method: 'POST',
      body: form,
    })
  },
  deleteDocument: (orgId: number, docId: number) =>
    request<void>(`${org(orgId)}/documents/${docId}`, { method: 'DELETE' }),
  tasksFromDocument: (orgId: number, docId: number, items: string[]) =>
    request<Task[]>(`${org(orgId)}/documents/${docId}/tasks`, {
      method: 'POST',
      json: { items },
    }),
}
