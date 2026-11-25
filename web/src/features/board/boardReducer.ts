// Every change to a board is one of these actions, applied by one pure function.
//
// The same reducer runs in two places: on TanStack Query's cached task list for optimistic
// updates (the card moves instantly, before the server answers), and for the live preview while
// a card is carried with the keyboard. Positions are computed exactly like the server does
// (api/app/services/tasks.py), so the optimistic order matches what the server will return.

import { TASK_STATUSES, type Task, type TaskStatus } from '../../lib/types'

export const GAP = 1024
const MIN_GAP = 1e-6

export type BoardAction =
  | { type: 'task/added'; task: Task }
  /** A task created optimistically (with a temporary id) came back from the server. */
  | { type: 'task/saved'; tempId: number; task: Task }
  | { type: 'task/updated'; taskId: number; changes: Partial<Omit<Task, 'id'>> }
  /** `index` is the slot in the target column, counted without the moving card. */
  | { type: 'task/moved'; taskId: number; status: TaskStatus; index: number }
  | { type: 'task/removed'; taskId: number }

export type BoardState = readonly Task[]

/** Makes the compiler prove every action type is handled: a new, unhandled one won't build. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled board action: ${JSON.stringify(value)}`)
}

export function byPosition(a: Task, b: Task): number {
  return a.position - b.position || a.id - b.id
}

export function columnOf(tasks: BoardState, status: TaskStatus, excludeId?: number): Task[] {
  return tasks.filter((t) => t.status === status && t.id !== excludeId).sort(byPosition)
}

/** The position for `index` in a sorted column, or null when the neighbours are too close. */
export function positionAt(column: readonly Task[], index: number): number | null {
  const before = index > 0 ? column[index - 1]?.position : undefined
  const after = column[index]?.position
  if (before === undefined && after === undefined) return GAP
  if (before === undefined) return after! - GAP
  if (after === undefined) return before + GAP
  if (after - before < MIN_GAP) return null
  return (before + after) / 2
}

function moveTask(
  state: BoardState,
  taskId: number,
  status: TaskStatus,
  rawIndex: number,
): BoardState {
  const task = state.find((t) => t.id === taskId)
  if (!task) return state
  let next = state
  let column = columnOf(next, status, taskId)
  const index = Math.min(Math.max(rawIndex, 0), column.length)
  let position = positionAt(column, index)
  if (position === null) {
    // Out of room between two cards: renumber the column, as the server does.
    const renumbered = new Map(column.map((t, i) => [t.id, (i + 1) * GAP]))
    next = next.map((t) => {
      const p = renumbered.get(t.id)
      return p === undefined ? t : { ...t, position: p }
    })
    column = columnOf(next, status, taskId)
    position = positionAt(column, index) ?? GAP
  }
  const completed_at =
    status === 'done'
      ? task.status === 'done'
        ? task.completed_at
        : new Date().toISOString()
      : null
  const moved = { ...task, status, position, completed_at }
  return next.map((t) => (t.id === taskId ? moved : t))
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'task/added':
      return [...state, action.task]
    case 'task/saved':
      return state.map((t) => (t.id === action.tempId ? action.task : t))
    case 'task/updated':
      return state.map((t) => (t.id === action.taskId ? { ...t, ...action.changes } : t))
    case 'task/moved':
      return moveTask(state, action.taskId, action.status, action.index)
    case 'task/removed':
      return state.filter((t) => t.id !== action.taskId)
    default:
      return assertNever(action)
  }
}

export type Columns = Record<TaskStatus, Task[]>

export function groupByStatus(tasks: BoardState): Columns {
  const columns = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Columns
  for (const task of tasks) columns[task.status].push(task)
  for (const status of TASK_STATUSES) columns[status].sort(byPosition)
  return columns
}

/** The first position after every card in that column: where a new card goes. */
export function endOfColumn(tasks: BoardState, status: TaskStatus): number {
  const column = columnOf(tasks, status)
  return (column.at(-1)?.position ?? 0) + GAP
}

/**
 * Filters hide some cards, but the server counts every card. Turns "slot i among the visible
 * cards" into "slot j in the whole column" (both counted without the moving card).
 */
export function toFullIndex(
  full: readonly Task[],
  visible: readonly Task[],
  visibleIndex: number,
): number {
  const anchor = visible[visibleIndex]
  if (anchor) {
    const i = full.findIndex((t) => t.id === anchor.id)
    return i === -1 ? full.length : i
  }
  const last = visible.at(-1)
  if (!last) return full.length
  const i = full.findIndex((t) => t.id === last.id)
  return i === -1 ? full.length : i + 1
}
