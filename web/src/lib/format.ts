import type { Priority, Role, TaskStatus } from './types'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

/** Today's date as YYYY-MM-DD in the user's own time zone. */
export function todayIso(now = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const dayMs = 24 * 60 * 60 * 1000

/** Whole days from today to an ISO date (negative = in the past). */
export function daysUntil(isoDate: string, today = todayIso()): number {
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / dayMs)
}

export function dueLabel(isoDate: string, today = todayIso()): string {
  const days = daysUntil(isoDate, today)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days === -1) return 'Due yesterday'
  if (days < 0) return `${-days} days overdue`
  if (days < 7) return `Due in ${days} days`
  return `Due ${formatDate(isoDate)}`
}

export function formatDate(iso: string): string {
  // Date-only strings are parsed as UTC; format them in UTC so "2026-12-01" never shows as Nov 30.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}
