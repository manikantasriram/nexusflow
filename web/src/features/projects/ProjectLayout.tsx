import { NavLink, Outlet, useParams } from 'react-router'
import { ErrorState, PageSpinner } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useProject } from '../../lib/queries'
import type { Project } from '../../lib/types'
import { useOrg } from '../org/orgContext'
import { NotFoundPage } from '../../pages/NotFoundPage'

export interface ProjectOutletContext {
  project: Project
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
    isActive
      ? 'border-brand-600 text-brand-700 dark:border-brand-500 dark:text-brand-100'
      : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200'
  }`

/** /o/:orgId/projects/:projectId — header and tabs; the tab's content renders in <Outlet />. */
export function ProjectLayout() {
  const { orgId } = useOrg()
  const projectId = Number(useParams().projectId)
  const project = useProject(orgId, projectId)
  const base = `/o/${orgId}/projects/${projectId}`

  if (project.isPending) return <PageSpinner label="Loading project" />
  if (project.isError) {
    if (project.error instanceof ApiError && project.error.status === 404) return <NotFoundPage />
    return <ErrorState error={project.error} onRetry={() => void project.refetch()} />
  }

  return (
    <div className="mx-auto max-w-[96rem]">
      <div className="mb-5">
        <p className="font-mono text-xs text-zinc-500">{project.data.key}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{project.data.name}</h1>
        {project.data.description && (
          <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
            {project.data.description}
          </p>
        )}
      </div>
      <nav
        aria-label="Project"
        className="mb-6 flex gap-6 border-b border-zinc-200 dark:border-zinc-800"
      >
        <NavLink to={base} end className={tabClass}>
          Board
        </NavLink>
        <NavLink to={`${base}/documents`} className={tabClass}>
          Documents
        </NavLink>
        <NavLink to={`${base}/settings`} className={tabClass}>
          Settings
        </NavLink>
      </nav>
      <Outlet context={{ project: project.data } satisfies ProjectOutletContext} />
    </div>
  )
}
