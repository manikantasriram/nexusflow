import { Navigate } from 'react-router'
import { Card } from '../../components/ui'
import { AuthLayout } from '../auth/AuthLayout'
import { useAuth } from '../auth/authContext'
import { CreateOrgForm } from './CreateOrgForm'

/** "/" opens your first organization, or asks you to create one if you have none. */
export function HomePage() {
  const { memberships, signOut } = useAuth()
  const first = memberships[0]
  if (first) return <Navigate to={`/o/${first.organization.id}`} replace />
  return (
    <AuthLayout
      title="Create an organization"
      subtitle="You're not a member of any organization yet."
    >
      <Card className="p-6">
        <CreateOrgForm />
      </Card>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-4 w-full text-center text-sm text-zinc-500 hover:underline"
      >
        Sign out
      </button>
    </AuthLayout>
  )
}
