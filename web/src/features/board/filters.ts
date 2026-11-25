import type { Task } from '../../lib/types'
import type { BoardFilters } from '../../stores/ui'

/** Whether a card should be visible with the current filters. */
export function matchesFilters(
  task: Task,
  filters: BoardFilters,
  userId: number | undefined,
): boolean {
  const q = filters.search.trim().toLowerCase()
  if (q && !task.title.toLowerCase().includes(q) && !task.key.toLowerCase().includes(q))
    return false
  if (filters.priority !== 'all' && task.priority !== filters.priority) return false
  if (filters.assignee === 'me' && task.assignee_id !== userId) return false
  if (filters.assignee === 'unassigned' && task.assignee_id !== null) return false
  return true
}
