import { useNavigate } from 'react-router'
import { Card, PageHeader } from '../../components/ui'
import { useCreateProject } from '../../lib/queries'
import { toast } from '../../stores/toast'
import { useOrg } from '../org/orgContext'
import { ProjectForm } from './ProjectForm'

export function NewProjectPage() {
  const { orgId } = useOrg()
  const create = useCreateProject(orgId)
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New project"
        description="Projects hold a board of tasks and their documents."
      />
      <Card className="p-6">
        <ProjectForm
          submitLabel="Create project"
          onCancel={() => navigate(-1)}
          onSubmit={async (values) => {
            const project = await create.mutateAsync(values)
            toast.success(`Created ${project.name}`)
            navigate(`/o/${orgId}/projects/${project.id}`)
          }}
        />
      </Card>
    </div>
  )
}
