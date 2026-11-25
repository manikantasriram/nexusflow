import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import { Dialog } from '../../components/Dialog'
import { Button, Card } from '../../components/ui'
import { useDeleteProject, useUpdateProject } from '../../lib/queries'
import { errorMessage, toast } from '../../stores/toast'
import { useOrg } from '../org/orgContext'
import { ProjectForm } from './ProjectForm'
import type { ProjectOutletContext } from './ProjectLayout'

export function ProjectSettingsView() {
  const { project } = useOutletContext<ProjectOutletContext>()
  const { orgId, isAdmin } = useOrg()
  const update = useUpdateProject(orgId, project.id)
  const remove = useDeleteProject(orgId)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Details</h2>
        <ProjectForm
          key={project.id}
          lockKey
          submitLabel="Save changes"
          initial={{
            name: project.name,
            key: project.key,
            description: project.description,
          }}
          onSubmit={async ({ name, description }) => {
            await update.mutateAsync({ name, description })
            toast.success('Project saved')
          }}
        />
      </Card>

      <Card className="border-red-200 p-6 dark:border-red-900">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Delete project</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Deletes the project with all {project.task_count} tasks and its documents. This can't be
          undone.
        </p>
        {isAdmin ? (
          <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
            Delete project
          </Button>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Only admins and owners can delete projects.</p>
        )}
      </Card>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${project.name}?`}
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {project.task_count} tasks and every document in this project will be deleted for
          everyone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            busy={remove.isPending}
            onClick={() =>
              remove.mutate(project.id, {
                onSuccess: () => {
                  toast.success(`Deleted ${project.name}`)
                  navigate(`/o/${orgId}/projects`)
                },
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            Delete for everyone
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
