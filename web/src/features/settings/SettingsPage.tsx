import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  FormError,
  PageHeader,
  PageSpinner,
  SelectField,
  TextField,
} from '../../components/ui'
import { ROLE_LABEL } from '../../lib/format'
import { applyServerErrors } from '../../lib/forms'
import { keys, useMemberActions, useMembers, useRenameOrganization } from '../../lib/queries'
import type { Member, Role } from '../../lib/types'
import { errorMessage, toast } from '../../stores/toast'
import { useAuth } from '../auth/authContext'
import { CreateOrgForm } from '../org/CreateOrgForm'
import { useOrg } from '../org/orgContext'
import { canManage, grantableRoles } from './roles'

export function SettingsPage() {
  const { organization, isAdmin } = useOrg()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Settings"
        description={`Manage ${organization.name} and who can work in it.`}
      />
      {isAdmin && <OrganizationCard />}
      <MembersCard />
      <Card className="p-6">
        <h2 className="font-semibold">Create another organization</h2>
        <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Organizations are fully separate: projects, tasks and documents never cross between them.
        </p>
        <CreateOrgForm />
      </Card>
    </div>
  )
}

const orgSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100, 'Keep it under 100 characters'),
})

function OrganizationCard() {
  const { orgId, organization } = useOrg()
  const rename = useRenameOrganization(orgId)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: organization.name },
  })

  const onSubmit = handleSubmit(async ({ name }) => {
    setFormError(null)
    try {
      await rename.mutateAsync(name)
      toast.success('Organization renamed')
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['name']))
    }
  })

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold">Organization</h2>
      <FormError message={formError} />
      <form onSubmit={onSubmit} noValidate className="mt-2 flex flex-wrap items-start gap-3">
        <div className="min-w-60 flex-1">
          <TextField
            label="Name"
            hint={`Slug: ${organization.slug}`}
            error={errors.name?.message}
            {...register('name')}
          />
        </div>
        <Button type="submit" busy={isSubmitting} disabled={!isDirty} className="sm:mt-6">
          Save
        </Button>
      </form>
    </Card>
  )
}

function MembersCard() {
  const { orgId, role: myRole, isAdmin } = useOrg()
  const { user } = useAuth()
  const members = useMembers(orgId)
  const actions = useMemberActions(orgId)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const leave = () => {
    if (!user) return
    actions.remove.mutate(user.id, {
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: keys.me })
        toast.success('You left the organization')
        navigate('/')
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Members</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Owners manage everything. Admins add and remove members and delete projects. Members work on
        projects.
      </p>

      {members.isPending ? (
        <PageSpinner label="Loading members" />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.data.map((m) => (
            <MemberRow
              key={m.user.id}
              member={m}
              isMe={m.user.id === user?.id}
              editable={m.user.id !== user?.id && canManage(myRole, m.role)}
              roles={grantableRoles(myRole)}
              onLeave={leave}
            />
          ))}
        </ul>
      )}

      {isAdmin && <AddMemberForm />}
    </Card>
  )
}

function MemberRow({
  member,
  isMe,
  editable,
  roles,
  onLeave,
}: {
  member: Member
  isMe: boolean
  editable: boolean
  roles: Role[]
  onLeave: () => void
}) {
  const { orgId } = useOrg()
  const { changeRole, remove } = useMemberActions(orgId)
  const options = roles.includes(member.role) ? roles : [member.role, ...roles]

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.user.full_name} id={member.user.id} size="size-9" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.user.full_name} {isMe && <span className="text-zinc-500">(you)</span>}
          </p>
          <p className="truncate text-xs text-zinc-500">{member.user.email}</p>
        </div>
      </div>
      {/* On phones the controls get their own line, lined up under the name. */}
      <div className="flex items-center gap-3 pl-12 sm:pl-0">
        {editable && options.length > 1 ? (
          <div className="w-32">
            <SelectField
              label={`Role of ${member.user.full_name}`}
              hideLabel
              value={member.role}
              disabled={changeRole.isPending}
              onChange={(e) => {
                const role = e.target.value as Role
                changeRole.mutate(
                  { userId: member.user.id, role },
                  {
                    onSuccess: () =>
                      toast.success(
                        `${member.user.full_name} is now ${ROLE_LABEL[role].toLowerCase()}`,
                      ),
                    onError: (err) => toast.error(errorMessage(err)),
                  },
                )
              }}
            >
              {options.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </SelectField>
          </div>
        ) : (
          <span className="w-32 text-sm text-zinc-500">{ROLE_LABEL[member.role]}</span>
        )}
        {isMe ? (
          <Button variant="secondary" size="sm" onClick={onLeave}>
            Leave
          </Button>
        ) : editable ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 dark:text-red-400"
            busy={remove.isPending}
            onClick={() =>
              remove.mutate(member.user.id, {
                onSuccess: () => toast.success(`Removed ${member.user.full_name}`),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            Remove
          </Button>
        ) : (
          <span className="w-[4.6rem]" aria-hidden="true" />
        )}
      </div>
    </li>
  )
}

const addSchema = z.object({
  email: z.email('Enter a valid email address'),
  role: z.enum(['owner', 'admin', 'member']),
})

function AddMemberForm() {
  const { orgId, role: myRole } = useOrg()
  const { add } = useMemberActions(orgId)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(addSchema),
    defaultValues: { email: '', role: 'member' as Role },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const member = await add.mutateAsync(values)
      toast.success(`Added ${member.user.full_name}`)
      reset()
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email', 'role']))
    }
  })

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-6 border-t border-zinc-100 pt-6 dark:border-zinc-800"
    >
      <h3 className="text-sm font-semibold">Add someone</h3>
      <p className="mt-1 mb-3 text-xs text-zinc-500">They need a NexusFlow account already.</p>
      <FormError message={formError} />
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div className="min-w-60 flex-1">
          <TextField
            label="Email"
            hideLabel
            placeholder="colleague@company.com"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
        <div className="w-32">
          <SelectField label="Role" hideLabel {...register('role')}>
            {grantableRoles(myRole).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </SelectField>
        </div>
        <Button type="submit" busy={isSubmitting}>
          Add member
        </Button>
      </div>
    </form>
  )
}
