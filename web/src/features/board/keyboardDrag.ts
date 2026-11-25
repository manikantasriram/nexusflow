// Keyboard moves for cards (WCAG 2.1.1: everything a mouse can do, a keyboard can do too).
//
// Focus a card's move handle and press Space to pick it up. Arrow keys carry it: up/down
// within a column, left/right to the neighbouring column. Space drops it, Escape puts it back.
// This reducer only tracks where the card is being carried; dropping is done by the board.

import { TASK_STATUSES, type TaskStatus } from '../../lib/types'

export type DragState =
  | { mode: 'idle' }
  | {
      mode: 'carrying'
      taskId: number
      status: TaskStatus
      /** Slot among the visible cards of `status`, counted without the carried card. */
      index: number
      from: { status: TaskStatus; index: number }
    }

export type Direction = 'up' | 'down' | 'left' | 'right'

export type DragAction =
  | { type: 'pickUp'; taskId: number; status: TaskStatus; index: number }
  /** `sizes`: how many visible cards each column holds, not counting the carried card. */
  | { type: 'shift'; direction: Direction; sizes: Record<TaskStatus, number> }
  | { type: 'drop' }
  | { type: 'cancel' }

export const idle: DragState = { mode: 'idle' }

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

export function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'pickUp':
      return {
        mode: 'carrying',
        taskId: action.taskId,
        status: action.status,
        index: action.index,
        from: { status: action.status, index: action.index },
      }
    case 'shift': {
      if (state.mode !== 'carrying') return state
      const size = action.sizes[state.status]
      if (action.direction === 'up') return { ...state, index: clamp(state.index - 1, 0, size) }
      if (action.direction === 'down') return { ...state, index: clamp(state.index + 1, 0, size) }
      const at = TASK_STATUSES.indexOf(state.status)
      const next = TASK_STATUSES[at + (action.direction === 'left' ? -1 : 1)]
      if (!next) return state
      return {
        ...state,
        status: next,
        index: clamp(state.index, 0, action.sizes[next]),
      }
    }
    case 'drop':
    case 'cancel':
      return idle
    default: {
      const unhandled: never = action
      return unhandled
    }
  }
}

export const KEY_TO_DIRECTION: Partial<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}
