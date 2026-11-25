import type { DragEvent, KeyboardEvent } from 'react'
import { CalendarIcon, GripIcon } from '../../components/icons'
import { Avatar, Badge } from '../../components/ui'
import { daysUntil, dueLabel, PRIORITY_LABEL } from '../../lib/format'
import type { Member, Task } from '../../lib/types'
import { PRIORITY_BADGE } from './meta'

export function TaskCard({
  task,
  assignee,
  carrying,
  dragging,
  onOpen,
  onHandleKeyDown,
  onDragStart,
  onDragEnd,
}: {
  task: Task
  assignee: Member | undefined
  /** Being carried with the keyboard. */
  carrying: boolean
  /** Being dragged with the mouse. */
  dragging: boolean
  onOpen: () => void
  onHandleKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onDragStart: (e: DragEvent<HTMLLIElement>) => void
  onDragEnd: () => void
}) {
  const saving = task.id < 0
  const overdue = task.due_date !== null && task.status !== 'done' && daysUntil(task.due_date) < 0

  return (
    <li
      data-card={task.id}
      draggable={!saving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-lg border bg-white shadow-xs transition dark:bg-zinc-900 ${
        carrying
          ? 'border-brand-500 ring-brand-500/40 shadow-lg ring-2'
          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
      } ${dragging ? 'opacity-40' : ''} ${saving ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-1 p-3 pl-1.5">
        <button
          type="button"
          data-handle={task.id}
          disabled={saving}
          onKeyDown={onHandleKeyDown}
          aria-label={`Move ${task.key}: ${task.title}`}
          aria-describedby="board-help"
          aria-pressed={carrying}
          className="mt-0.5 cursor-grab rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-default dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <GripIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          disabled={saving}
          className="min-w-0 flex-1 rounded text-left"
        >
          <span className="block font-mono text-[0.7rem] text-zinc-500">
            {saving ? 'Saving…' : task.key}
          </span>
          <span className="mt-0.5 block text-sm leading-snug font-medium break-words">
            {task.title}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2 px-3 pb-3">
        <Badge className={PRIORITY_BADGE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
        {task.due_date && task.status !== 'done' && (
          <span
            className={`inline-flex items-center gap-1 text-xs ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-zinc-500'}`}
          >
            <CalendarIcon className="size-3.5" />
            {dueLabel(task.due_date)}
          </span>
        )}
        <span className="ml-auto">
          {assignee ? (
            <>
              <Avatar name={assignee.user.full_name} id={assignee.user.id} size="size-6" />
              <span className="sr-only">Assigned to {assignee.user.full_name}</span>
            </>
          ) : (
            <span className="sr-only">Unassigned</span>
          )}
        </span>
      </div>
    </li>
  )
}
