import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Button, FormError, TextAreaField, TextField } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import type { ProjectInput } from '../../lib/types'
import { projectSchema, suggestKey, type ProjectValues } from './projectSchema'

export function ProjectForm({
  initial,
  submitLabel,
  lockKey = false,
  onSubmit,
  onCancel,
}: {
  initial?: ProjectValues
  submitLabel: string
  /** Keys can't change after creation (task keys like WEB-12 depend on them). */
  lockKey?: boolean
  onSubmit: (values: ProjectInput) => Promise<unknown>
  onCancel?: () => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: initial ?? { name: '', key: '', description: '' },
  })

  // Until the user types their own key, keep suggesting one from the name.
  const name = useWatch({ control, name: 'name' })
  useEffect(() => {
    if (!lockKey && !dirtyFields.key) setValue('key', suggestKey(name))
  }, [name, lockKey, dirtyFields.key, setValue])

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await onSubmit(values)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'conflict') {
        setError('key', { type: 'server', message: error.message }, { shouldFocus: true })
        return
      }
      setFormError(applyServerErrors(error, setError, ['name', 'key', 'description']))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormError message={formError} />
      <TextField
        label="Project name"
        placeholder="Website relaunch"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Key"
        hint={lockKey ? "A project's key can't be changed." : 'Used in task ids, e.g. WEB-12.'}
        error={errors.key?.message}
        readOnly={lockKey}
        className="font-mono uppercase read-only:bg-zinc-50 read-only:text-zinc-500 dark:read-only:bg-zinc-800"
        maxLength={10}
        autoCapitalize="characters"
        {...register('key')}
      />
      <TextAreaField
        label="Description"
        hint="Optional. What is this project for?"
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex gap-3">
        <Button type="submit" busy={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
