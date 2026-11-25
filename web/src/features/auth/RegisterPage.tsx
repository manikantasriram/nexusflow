import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { Button, Card, FormError, TextField } from '../../components/ui'
import { applyServerErrors } from '../../lib/forms'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './authContext'
import { registerSchema, type RegisterValues } from './schemas'

export function RegisterPage() {
  const { signUp } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      organization_name: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signUp(values)
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, ['full_name', 'email', 'password', 'organization_name']),
      )
    }
  })

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-brand-600 dark:text-brand-500 font-medium hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <Card className="p-6">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={formError} />
          <TextField
            label="Your name"
            autoComplete="name"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <TextField
            label="Work email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            error={errors.password?.message}
            {...register('password')}
          />
          <TextField
            label="Organization name"
            autoComplete="organization"
            hint="You'll be its owner. You can invite your team afterwards."
            error={errors.organization_name?.message}
            {...register('organization_name')}
          />
          <Button type="submit" busy={isSubmitting} className="w-full">
            Create account
          </Button>
        </form>
      </Card>
    </AuthLayout>
  )
}
