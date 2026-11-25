// The API's data shapes, written to match api/app/schemas.py.

export type Role = 'owner' | 'admin' | 'member'
export const ROLES: readonly Role[] = ['owner', 'admin', 'member']

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

export interface User {
  id: number
  email: string
  full_name: string
}

export interface Organization {
  id: number
  name: string
  slug: string
}

export interface Membership {
  organization: Organization
  role: Role
}

export interface Me {
  user: User
  memberships: Membership[]
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface RegisterInput {
  email: string
  password: string
  full_name: string
  organization_name: string
}

export interface Member {
  user: User
  role: Role
  joined_at: string
}

export interface Project {
  id: number
  name: string
  key: string
  description: string
  created_at: string
  task_count: number
  done_count: number
}

export interface ProjectInput {
  name: string
  key: string
  description: string
}

export interface Task {
  id: number
  key: string
  number: number
  project_id: number
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  assignee_id: number | null
  /** ISO date, e.g. "2026-12-01" */
  due_date: string | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskInput {
  title: string
  description?: string
  status?: TaskStatus
  priority?: Priority
  assignee_id?: number | null
  due_date?: string | null
}

export type TaskPatch = Partial<TaskInput>

export interface ProjectProgress {
  id: number
  name: string
  key: string
  total: number
  done: number
}

export interface Stats {
  total_tasks: number
  by_status: Record<TaskStatus, number>
  by_priority: Record<Priority, number>
  overdue: number
  due_this_week: number
  completed_last_7_days: number
  projects: ProjectProgress[]
  generated_at: string
  cached: boolean
}

export interface DocumentSummary {
  id: number
  project_id: number
  filename: string
  content_type: string
  size_bytes: number
  word_count: number
  keywords: string[]
  created_at: string
}

export interface DocumentDetail extends DocumentSummary {
  summary: string
  action_items: string[]
  text_preview: string
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> }
}
