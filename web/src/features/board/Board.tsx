import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { PlusIcon } from '../../components/icons'
import { STATUS_LABEL } from '../../lib/format'
import {
  TASK_STATUSES,
  type Member,
  type Project,
  type Task,
  type TaskStatus,
} from '../../lib/types'
import { useUi } from '../../stores/ui'
import { useAuth } from '../auth/authContext'
import { useOrg } from '../org/orgContext'
import { boardReducer, byPosition, columnOf, groupByStatus, toFullIndex } from './boardReducer'
import { matchesFilters } from './filters'
import { dragReducer, idle, KEY_TO_DIRECTION } from './keyboardDrag'
import { STATUS_DOT } from './meta'
import { TaskCard } from './TaskCard'
import { useBoardMutations } from './useBoardMutations'

interface DropTarget {
  status: TaskStatus
  index: number
}

export function Board({
  tasks,
  project,
  members,
}: {
  tasks: Task[]
  project: Project
  members: Member[]
}) {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const filters = useUi((s) => s.filters)
  const openEditTask = useUi((s) => s.openEditTask)
  const openCreateTask = useUi((s) => s.openCreateTask)
  const { move } = useBoardMutations(orgId, project.id, project.key)

  const [drag, dispatch] = useReducer(dragReducer, idle)
  const [announcement, setAnnouncement] = useState('')
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const focusAfterRender = useRef<number | null>(null)

  const matches = (t: Task) => matchesFilters(t, filters, user?.id)
  const memberById = useMemo(() => new Map(members.map((m) => [m.user.id, m])), [members])

  // While a card is carried with the keyboard, show it where it would land.
  const shown = useMemo(() => {
    if (drag.mode !== 'carrying') return tasks
    const full = columnOf(tasks, drag.status, drag.taskId)
    const index = toFullIndex(full, full.filter(matches), drag.index)
    return boardReducer(tasks, {
      type: 'task/moved',
      taskId: drag.taskId,
      status: drag.status,
      index,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` only depends on filters and user
  }, [tasks, drag, filters, user?.id])

  const columns = groupByStatus(shown)
  for (const status of TASK_STATUSES) {
    columns[status] = columns[status].filter(
      (t) => matches(t) || (drag.mode === 'carrying' && t.id === drag.taskId),
    )
  }

  /** Visible cards per column, not counting the card being carried. */
  const sizes = Object.fromEntries(
    TASK_STATUSES.map((s) => [
      s,
      columns[s].filter((t) => drag.mode !== 'carrying' || t.id !== drag.taskId).length,
    ]),
  ) as Record<TaskStatus, number>

  // The card moves to another column (a different parent), which remounts its button; put
  // keyboard focus back on it so the user can keep going. After a drop the card moves once more
  // when the optimistic update lands, so keep following it briefly, but only while focus has
  // fallen back to <body>: never steal focus from something the user moved to.
  useEffect(() => {
    const id = drag.mode === 'carrying' ? drag.taskId : focusAfterRender.current
    if (id === null) return
    const handle = document.querySelector<HTMLElement>(`[data-handle="${id}"]`)
    const active = document.activeElement
    if (
      handle &&
      active !== handle &&
      (drag.mode === 'carrying' || !active || active === document.body)
    ) {
      handle.focus()
    }
  })

  function followFocus(taskId: number) {
    focusAfterRender.current = taskId
    setTimeout(() => {
      if (focusAfterRender.current === taskId) focusAfterRender.current = null
    }, 2000)
  }

  // Clicking anywhere else while carrying a card puts it back.
  useEffect(() => {
    if (drag.mode !== 'carrying') return
    const cancel = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(`[data-handle="${drag.taskId}"]`))
        dispatch({ type: 'cancel' })
    }
    document.addEventListener('pointerdown', cancel)
    return () => document.removeEventListener('pointerdown', cancel)
  }, [drag])

  /** Sends a move to the server, unless the card would end up where it already is. */
  function commitMove(taskId: number, status: TaskStatus, visibleIndex: number) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const full = columnOf(tasks, status, taskId)
    const index = toFullIndex(full, full.filter(matches), visibleIndex)
    const currentIndex = full.filter((t) => byPosition(t, task) < 0).length
    if (task.status === status && index === currentIndex) return
    move.mutate({ taskId, status, index })
  }

  function onHandleKeyDown(task: Task, e: KeyboardEvent<HTMLButtonElement>) {
    const isToggle = e.key === ' ' || e.key === 'Enter'
    if (drag.mode !== 'carrying') {
      if (!isToggle) return
      e.preventDefault()
      const index = columns[task.status].findIndex((t) => t.id === task.id)
      dispatch({ type: 'pickUp', taskId: task.id, status: task.status, index })
      setAnnouncement(
        `Picked up ${task.key}, in ${STATUS_LABEL[task.status]} at position ${index + 1}. ` +
          'Use the arrow keys to move it, Space to drop it, Escape to cancel.',
      )
      return
    }
    if (drag.taskId !== task.id) return
    const direction = KEY_TO_DIRECTION[e.key]
    if (direction) {
      e.preventDefault()
      const action = { type: 'shift', direction, sizes } as const
      const next = dragReducer(drag, action)
      dispatch(action)
      if (next.mode === 'carrying') {
        setAnnouncement(
          `${STATUS_LABEL[next.status]}, position ${next.index + 1} of ${sizes[next.status] + 1}.`,
        )
      }
    } else if (isToggle) {
      e.preventDefault()
      commitMove(task.id, drag.status, drag.index)
      followFocus(task.id)
      dispatch({ type: 'drop' })
      setAnnouncement(
        `Dropped ${task.key} in ${STATUS_LABEL[drag.status]} at position ${drag.index + 1}.`,
      )
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      followFocus(task.id)
      dispatch({ type: 'cancel' })
      setAnnouncement(`Move cancelled. ${task.key} is back in ${STATUS_LABEL[drag.from.status]}.`)
    }
  }

  // --- mouse drag and drop ---------------------------------------------------------------------

  function slotFromPointer(list: HTMLElement, clientY: number): number {
    const cards = [...list.querySelectorAll<HTMLElement>('[data-card]')].filter(
      (el) => Number(el.dataset.card) !== draggingId,
    )
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return clientY < r.top + r.height / 2
    })
    return i === -1 ? cards.length : i
  }

  function onDragOver(status: TaskStatus, e: DragEvent<HTMLUListElement>) {
    if (draggingId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const index = slotFromPointer(e.currentTarget, e.clientY)
    if (dropTarget?.status !== status || dropTarget.index !== index)
      setDropTarget({ status, index })
  }

  function onDrop(status: TaskStatus, e: DragEvent<HTMLUListElement>) {
    e.preventDefault()
    if (draggingId !== null)
      commitMove(draggingId, status, slotFromPointer(e.currentTarget, e.clientY))
    setDraggingId(null)
    setDropTarget(null)
  }

  return (
    <>
      <p id="board-help" className="sr-only">
        Press Space to pick up the card, the arrow keys to move it, Space again to drop it, or
        Escape to cancel.
      </p>
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>

      <div className="-mx-4 grid snap-x auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {TASK_STATUSES.map((status) => {
          const cards = columns[status]
          const visibleWithoutDragged = cards.filter((t) => t.id !== draggingId)
          return (
            <section
              key={status}
              aria-labelledby={`col-${status}`}
              className="flex min-h-80 snap-start flex-col rounded-xl bg-zinc-100/80 p-2 dark:bg-zinc-900/60"
            >
              <header className="flex items-center gap-2 px-2 py-1.5">
                <span
                  className={`size-2.5 rounded-full ${STATUS_DOT[status]}`}
                  aria-hidden="true"
                />
                <h2 id={`col-${status}`} className="text-sm font-semibold">
                  {STATUS_LABEL[status]}
                </h2>
                <span className="text-xs text-zinc-500 tabular-nums">{cards.length}</span>
                <button
                  type="button"
                  onClick={() => openCreateTask(status)}
                  className="ml-auto rounded-md p-1 text-zinc-500 hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label={`Add a task to ${STATUS_LABEL[status]}`}
                >
                  <PlusIcon className="size-4" />
                </button>
              </header>
              <ul
                aria-labelledby={`col-${status}`}
                onDragOver={(e) => onDragOver(status, e)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
                }}
                onDrop={(e) => onDrop(status, e)}
                className="flex flex-1 flex-col gap-2 p-1"
              >
                {visibleWithoutDragged.length === 0 &&
                  draggingId === null &&
                  drag.mode === 'idle' && (
                    <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
                      No tasks
                    </li>
                  )}
                {cards.map((task) => {
                  const slot = visibleWithoutDragged.findIndex((t) => t.id === task.id)
                  return (
                    <DropLineBefore
                      key={task.id}
                      show={dropTarget?.status === status && dropTarget.index === slot}
                    >
                      <TaskCard
                        task={task}
                        assignee={
                          task.assignee_id === null ? undefined : memberById.get(task.assignee_id)
                        }
                        carrying={drag.mode === 'carrying' && drag.taskId === task.id}
                        dragging={draggingId === task.id}
                        onOpen={() => openEditTask(task.id)}
                        onHandleKeyDown={(e) => onHandleKeyDown(task, e)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', task.key)
                          setDraggingId(task.id)
                        }}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setDropTarget(null)
                        }}
                      />
                    </DropLineBefore>
                  )
                })}
                {dropTarget?.status === status &&
                  dropTarget.index === visibleWithoutDragged.length && <DropLine />}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

function DropLine() {
  return <li aria-hidden="true" className="bg-brand-500 h-0.5 rounded-full" />
}

function DropLineBefore({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <>
      {show && <DropLine />}
      {children}
    </>
  )
}
