import { Link } from 'react-router'
import { buttonClass } from '../components/classes'

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-brand-600 font-mono text-sm">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        This page doesn't exist, or it belongs to an organization you're not a member of.
      </p>
      <Link to="/" className={`${buttonClass('primary')} mt-6`}>
        Go to your workspace
      </Link>
    </main>
  )
}
