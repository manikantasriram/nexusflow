import { useEffect } from 'react'
import { useOutletContext, useSearchParams } from 'react-router'
import { PlusIcon, SearchIcon } from '../../components/icons'
import { Button, ErrorState, PageSpinner, SelectField } from '../../components/ui'
import { PRIORITY_LABEL } from '../../lib/format'
import { useMembers, useTasks } from '../../lib/queries'
import { PRIORITIES, type Task } from '../../lib/types'
import { hasActiveFilters, useUi, type BoardFilters } from '../../stores/ui'
import { useAuth } from '../auth/authContext'
import { useOrg } from '../org/orgContext'
import type { ProjectOutletContext } from '../projects/ProjectLayout'
import { Board } from './Board'
import { matchesFilters } from './filters'
import { TaskDialog } from './TaskDialog'

export function BoardView() {
  const { project } = useOutletContext<ProjectOutletContext>()
  const { orgId } = useOrg()
  const tasks = useTasks(orgId, project.id)
  const members = useMembers(orgId)
  const openEditTask = useUi((s) => s.openEditTask)
  const closeTaskDialog = useUi((s) => s.closeTaskDialog)
  const [params, setParams] = useSearchParams()

  // Links like ?task=42 (from the dashboard) open that task.
  const deepLinkedTask = Number(params.get('task'))
  useEffect(() => {
    if (!deepLinkedTask) return
    openEditTask(deepLinkedTask)
    setParams(
      (p) => {
        p.delete('task')
        return p
      },
      { replace: true },
    )
  }, [deepLinkedTask, openEditTask, setParams])

  useEffect(() => closeTaskDialog, [closeTaskDialog]) // leaving the board closes its dialog

  if (tasks.isPending) return <PageSpinner label="Loading board" />
  if (tasks.isError) return <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />

  const people = members.data ?? []
  return (
    <>
      <Toolbar tasks={tasks.data} />
      <Board tasks={tasks.data} project={project} members={people} />
      <TaskDialog tasks={tasks.data} project={project} members={people} />
    </>
  )
}

function Toolbar({ tasks }: { tasks: Task[] }) {
  const { user } = useAuth()
  const { filters, setFilter, resetFilters, openCreateTask } = useUi()
  const shown = tasks.filter((t) => matchesFilters(t, filters, user?.id)).length

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="relative w-full sm:w-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="block w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-9 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="w-36">
        <SelectField
          label="Priority"
          hideLabel
          value={filters.priority}
          onChange={(e) => setFilter('priority', e.target.value as BoardFilters['priority'])}
        >
          <option value="all">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="w-40">
        <SelectField
          label="Assignee"
          hideLabel
          value={filters.assignee}
          onChange={(e) => setFilter('assignee', e.target.value as BoardFilters['assignee'])}
        >
          <option value="all">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </SelectField>
      </div>
      {hasActiveFilters(filters) && (
        <>
          <Button variant="ghost" size="sm" className="mb-1" onClick={resetFilters}>
            Clear filters
          </Button>
          <p className="mb-2 text-xs text-zinc-500" aria-live="polite">
            Showing {shown} of {tasks.length}
          </p>
        </>
      )}
      <Button className="ml-auto" onClick={() => openCreateTask('todo')}>
        <PlusIcon className="size-4" /> New task
      </Button>
    </div>
  )
}
