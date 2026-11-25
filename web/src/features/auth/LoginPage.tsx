import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { Button, Card, FormError, TextField } from '../../components/ui'
import { applyServerErrors } from '../../lib/forms'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './authContext'
import { loginSchema, type LoginValues } from './schemas'

const DEMO_ACCOUNTS = [
  { email: 'owner@demo.nexusflow.dev', label: 'Owner' },
  { email: 'admin@demo.nexusflow.dev', label: 'Admin' },
  { email: 'member@demo.nexusflow.dev', label: 'Member' },
]
// Public demo password: the same one printed in the README and in app/seed.py.
const DEMO_PASSWORD = 'demo-pass-123'

export function LoginPage() {
  const { signIn } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null)
    try {
      await signIn(email, password)
      // RedirectIfSignedIn takes it from here.
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email', 'password']))
    }
  })

  const signInAsDemo = (email: string) => {
    setValue('email', email, { shouldValidate: true })
    setValue('password', DEMO_PASSWORD, { shouldValidate: true })
    void onSubmit()
  }

  return (
    <AuthLayout
      title="Sign in to NexusFlow"
      subtitle={
        <>
          New here?{' '}
          <Link
            to="/register"
            className="text-brand-600 dark:text-brand-500 font-medium hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Card className="p-6">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={formError} />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" busy={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="text-sm font-medium">Try the demo</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Sign in as one of the Acme Robotics team to see what each role can do.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <Button
              key={a.email}
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => signInAsDemo(a.email)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </Card>
    </AuthLayout>
  )
}
