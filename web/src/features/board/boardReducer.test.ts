import { describe, expect, it } from 'vitest'
import type { Task, TaskStatus } from '../../lib/types'
import {
  boardReducer,
  GAP,
  groupByStatus,
  positionAt,
  toFullIndex,
  type BoardState,
} from './boardReducer'

function task(id: number, status: TaskStatus, position: number): Task {
  return {
    id,
    key: `T-${id}`,
    number: id,
    project_id: 1,
    title: `Task ${id}`,
    description: '',
    status,
    priority: 'medium',
    assignee_id: null,
    due_date: null,
    position,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_at: status === 'done' ? '2026-01-01T00:00:00Z' : null,
  }
}

const ids = (state: BoardState, status: TaskStatus) => groupByStatus(state)[status].map((t) => t.id)

const board: BoardState = [
  task(1, 'todo', 1024),
  task(2, 'todo', 2048),
  task(3, 'todo', 3072),
  task(4, 'done', 1024),
]

describe('boardReducer', () => {
  it('adds a task', () => {
    const next = boardReducer(board, {
      type: 'task/added',
      task: task(9, 'todo', 4096),
    })
    expect(ids(next, 'todo')).toEqual([1, 2, 3, 9])
  })

  it('swaps an optimistic task for the saved one', () => {
    const withTemp = boardReducer(board, {
      type: 'task/added',
      task: task(-1, 'todo', 4096),
    })
    const next = boardReducer(withTemp, {
      type: 'task/saved',
      tempId: -1,
      task: task(10, 'todo', 4096),
    })
    expect(ids(next, 'todo')).toEqual([1, 2, 3, 10])
  })

  it('moves a card up within its column', () => {
    const next = boardReducer(board, {
      type: 'task/moved',
      taskId: 3,
      status: 'todo',
      index: 0,
    })
    expect(ids(next, 'todo')).toEqual([3, 1, 2])
  })

  it('moves a card between two others, halfway between their positions', () => {
    const next = boardReducer(board, {
      type: 'task/moved',
      taskId: 4,
      status: 'todo',
      index: 2,
    })
    expect(ids(next, 'todo')).toEqual([1, 2, 4, 3])
    expect(next.find((t) => t.id === 4)?.position).toBe((2048 + 3072) / 2)
  })

  it('records completion when a card enters Done and clears it when it leaves', () => {
    const done = boardReducer(board, {
      type: 'task/moved',
      taskId: 1,
      status: 'done',
      index: 0,
    })
    expect(done.find((t) => t.id === 1)?.completed_at).not.toBeNull()
    const back = boardReducer(done, {
      type: 'task/moved',
      taskId: 1,
      status: 'todo',
      index: 0,
    })
    expect(back.find((t) => t.id === 1)?.completed_at).toBeNull()
  })

  it('renumbers a column when two neighbours are too close to split', () => {
    const crowded = [task(1, 'todo', 1), task(2, 'todo', 1 + 1e-9), task(3, 'todo', 5)]
    const next = boardReducer(crowded, {
      type: 'task/moved',
      taskId: 3,
      status: 'todo',
      index: 1,
    })
    expect(ids(next, 'todo')).toEqual([1, 3, 2])
    const positions = groupByStatus(next).todo.map((t) => t.position)
    expect(positions[1]! - positions[0]!).toBeGreaterThan(1)
  })

  it('clamps an index past the end to the last slot', () => {
    const next = boardReducer(board, {
      type: 'task/moved',
      taskId: 1,
      status: 'todo',
      index: 99,
    })
    expect(ids(next, 'todo')).toEqual([2, 3, 1])
  })

  it('updates and removes', () => {
    const renamed = boardReducer(board, {
      type: 'task/updated',
      taskId: 2,
      changes: { title: 'Renamed' },
    })
    expect(renamed.find((t) => t.id === 2)?.title).toBe('Renamed')
    expect(ids(boardReducer(board, { type: 'task/removed', taskId: 2 }), 'todo')).toEqual([1, 3])
  })

  it('never mutates the state it was given', () => {
    const frozen = Object.freeze(board.map((t) => Object.freeze({ ...t })))
    expect(() =>
      boardReducer(frozen, {
        type: 'task/moved',
        taskId: 3,
        status: 'done',
        index: 0,
      }),
    ).not.toThrow()
    expect(frozen.map((t) => t.status)).toEqual(['todo', 'todo', 'todo', 'done'])
  })

  it('ignores a move of a card that no longer exists', () => {
    expect(
      boardReducer(board, {
        type: 'task/moved',
        taskId: 404,
        status: 'todo',
        index: 0,
      }),
    ).toBe(board)
  })
})

describe('positionAt', () => {
  const col = [task(1, 'todo', 100), task(2, 'todo', 200)]
  it('handles empty columns and both ends', () => {
    expect(positionAt([], 0)).toBe(GAP)
    expect(positionAt(col, 0)).toBe(100 - GAP)
    expect(positionAt(col, 2)).toBe(200 + GAP)
    expect(positionAt(col, 1)).toBe(150)
  })
})

describe('toFullIndex', () => {
  const full = [task(1, 'todo', 1), task(2, 'todo', 2), task(3, 'todo', 3), task(4, 'todo', 4)]
  const visible = [full[1]!, full[3]!] // filters hide tasks 1 and 3

  it('maps a slot among visible cards to the same spot in the whole column', () => {
    expect(toFullIndex(full, visible, 0)).toBe(1) // before task 2
    expect(toFullIndex(full, visible, 1)).toBe(3) // before task 4
    expect(toFullIndex(full, visible, 2)).toBe(4) // after task 4
    expect(toFullIndex(full, [], 0)).toBe(4)
  })
})
