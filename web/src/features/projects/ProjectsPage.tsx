import { Link } from 'react-router'
import { buttonClass } from '../../components/classes'
import { PlusIcon } from '../../components/icons'
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageSpinner,
  ProgressBar,
} from '../../components/ui'
import { percent } from '../../lib/format'
import { useProjects } from '../../lib/queries'
import { useOrg } from '../org/orgContext'

export function ProjectsPage() {
  const { orgId, organization } = useOrg()
  const projects = useProjects(orgId)
  const newLink = (
    <Link to={`/o/${orgId}/projects/new`} className={buttonClass('primary')}>
      <PlusIcon className="size-4" /> New project
    </Link>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Projects"
        description={`Everything ${organization.name} is working on.`}
        actions={newLink}
      />
      {projects.isPending ? (
        <PageSpinner label="Loading projects" />
      ) : projects.isError ? (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyState title="No projects yet" action={newLink}>
          Create a project to start a board of tasks.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((p) => {
            const done = percent(p.done_count, p.task_count)
            return (
              <li key={p.id}>
                <Card className="relative h-full p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">
                      <Link
                        to={`/o/${orgId}/projects/${p.id}`}
                        className="after:absolute after:inset-0 after:rounded-xl"
                      >
                        {p.name}
                      </Link>
                    </h2>
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {p.key}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm text-zinc-500 dark:text-zinc-400">
                    {p.description || 'No description.'}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                    <span>
                      {p.task_count} {p.task_count === 1 ? 'task' : 'tasks'}
                    </span>
                    <span>{done}% done</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={done} label={`${p.name}: ${done}% done`} />
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
