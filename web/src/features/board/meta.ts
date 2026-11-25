import type { Priority, TaskStatus } from '../../lib/types'

/** Colour for each column. Always shown next to the column's text label, never on its own. */
export const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-zinc-400',
  in_progress: 'bg-sky-500',
  in_review: 'bg-amber-500',
  done: 'bg-emerald-500',
}

export const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'bg-zinc-50 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20',
  medium:
    'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  high: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/30',
  urgent:
    'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30',
}

export const PRIORITY_BAR: Record<Priority, string> = {
  low: 'bg-zinc-400',
  medium: 'bg-sky-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
}
