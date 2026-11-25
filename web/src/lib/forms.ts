import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from './api'

/**
 * Shows the API's validation errors next to the matching inputs. Returns the message to show
 * at the top of the form when the error isn't about one specific field (or null if it was).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  let matched = false
  for (const [field, message] of Object.entries(error.fields)) {
    if ((fields as readonly string[]).includes(field)) {
      setError(field as Path<T>, { type: 'server', message })
      matched = true
    }
  }
  return matched ? null : error.message
}
