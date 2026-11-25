// Small, accessible building blocks shared by every page.

import { useId, type ComponentProps, type ReactNode } from 'react'
import { initials } from '../lib/format'
import { buttonClass, cx, type Variant } from './classes'

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<'button'> & {
  variant?: Variant
  size?: 'sm' | 'md'
  busy?: boolean
}) {
  return (
    <button
      type="button"
      className={cx(buttonClass(variant, size), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

// --- form fields ------------------------------------------------------------------------------

const inputClass =
  'block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

interface FieldProps {
  label: string
  error?: string
  hint?: string
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean
}

function useFieldIds(id: string | undefined, error?: string, hint?: string) {
  const auto = useId()
  const fieldId = id ?? auto
  const describedBy = [error && `${fieldId}-error`, hint && `${fieldId}-hint`]
    .filter(Boolean)
    .join(' ')
  return { fieldId, describedBy: describedBy || undefined }
}

function FieldShell({
  fieldId,
  label,
  error,
  hint,
  hideLabel,
  children,
}: FieldProps & { fieldId: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={fieldId}
        className={cx(
          'block text-sm font-medium text-zinc-700 dark:text-zinc-300',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextField({
  label,
  error,
  hint,
  hideLabel,
  id,
  className,
  ...props
}: ComponentProps<'input'> & FieldProps) {
  const { fieldId, describedBy } = useFieldIds(id, error, hint)
  return (
    <FieldShell fieldId={fieldId} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(inputClass, className)}
        {...props}
      />
    </FieldShell>
  )
}

export function TextAreaField({
  label,
  error,
  hint,
  hideLabel,
  id,
  className,
  ...props
}: ComponentProps<'textarea'> & FieldProps) {
  const { fieldId, describedBy } = useFieldIds(id, error, hint)
  return (
    <FieldShell fieldId={fieldId} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(inputClass, 'min-h-24', className)}
        {...props}
      />
    </FieldShell>
  )
}

export function SelectField({
  label,
  error,
  hint,
  hideLabel,
  id,
  className,
  children,
  ...props
}: ComponentProps<'select'> & FieldProps) {
  const { fieldId, describedBy } = useFieldIds(id, error, hint)
  return (
    <FieldShell fieldId={fieldId} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(inputClass, 'pr-8', className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}

/** A form-level error (for example "Incorrect email or password"). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {message}
    </p>
  )
}

// --- feedback ---------------------------------------------------------------------------------

export function Spinner({ className = 'size-5', label }: { className?: string; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center gap-2">
      <svg
        className={cx('animate-spin text-current', className)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center text-zinc-400">
      <Spinner className="size-8" label={label} />
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <h3 className="text-base font-semibold">{title}</h3>
      {children && (
        <div className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          {children}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center dark:border-red-900 dark:bg-red-950/50"
    >
      <h3 className="font-semibold text-red-800 dark:text-red-200">Couldn't load this</h3>
      <p className="mt-1 text-sm text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

// --- display ----------------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cx(
        'rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
      {...props}
    />
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        className,
      )}
      {...props}
    />
  )
}

const AVATAR_COLORS = [
  'bg-sky-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-violet-600',
  'bg-teal-600',
]

export function Avatar({ name, id, size = 'size-7' }: { name: string; id: number; size?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white',
        size,
        AVATAR_COLORS[id % AVATAR_COLORS.length],
      )}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
    >
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} />
    </div>
  )
}
