import { describe, expect, it } from 'vitest'
import { dragReducer, idle, type DragState } from './keyboardDrag'

type Carrying = Extract<DragState, { mode: 'carrying' }>

const sizes = { todo: 3, in_progress: 1, in_review: 0, done: 2 }
const carrying = dragReducer(idle, {
  type: 'pickUp',
  taskId: 7,
  status: 'todo',
  index: 1,
}) as Carrying

describe('dragReducer', () => {
  it('picks up a card and remembers where it came from', () => {
    expect(carrying).toEqual({
      mode: 'carrying',
      taskId: 7,
      status: 'todo',
      index: 1,
      from: { status: 'todo', index: 1 },
    })
  })

  it('moves up and down, staying inside the column', () => {
    const shift = (s: DragState, direction: 'up' | 'down') =>
      dragReducer(s, { type: 'shift', direction, sizes })
    const top = shift(shift(carrying, 'up'), 'up')
    expect(top).toMatchObject({ index: 0 })
    const bottom = shift(shift(shift(shift(carrying, 'down'), 'down'), 'down'), 'down')
    expect(bottom).toMatchObject({ index: 3 }) // 3 other cards, so slots 0..3
  })

  it('moves between columns and clamps to the shorter column', () => {
    const right = dragReducer(
      { ...carrying, index: 3 },
      { type: 'shift', direction: 'right', sizes },
    )
    expect(right).toMatchObject({ status: 'in_progress', index: 1 })
    const left = dragReducer(carrying, {
      type: 'shift',
      direction: 'left',
      sizes,
    })
    expect(left).toBe(carrying) // already in the first column
  })

  it('drop and cancel both end the carry', () => {
    expect(dragReducer(carrying, { type: 'drop' })).toEqual(idle)
    expect(dragReducer(carrying, { type: 'cancel' })).toEqual(idle)
  })

  it('ignores arrow keys when nothing is carried', () => {
    expect(dragReducer(idle, { type: 'shift', direction: 'down', sizes })).toBe(idle)
  })
})
