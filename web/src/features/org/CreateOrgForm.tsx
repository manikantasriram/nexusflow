import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { Button, FormError, TextField } from '../../components/ui'
import { applyServerErrors } from '../../lib/forms'
import { useCreateOrganization } from '../../lib/queries'

const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100, 'Keep it under 100 characters'),
})
type Values = z.infer<typeof schema>

/** Creates an organization (you become its owner) and opens it. */
export function CreateOrgForm() {
  const create = useCreateOrganization()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  })

  const onSubmit = handleSubmit(async ({ name }) => {
    setFormError(null)
    try {
      const membership = await create.mutateAsync(name)
      navigate(`/o/${membership.organization.id}`)
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['name']))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError message={formError} />
      <TextField label="Organization name" error={errors.name?.message} {...register('name')} />
      <Button type="submit" busy={isSubmitting}>
        Create organization
      </Button>
    </form>
  )
}
