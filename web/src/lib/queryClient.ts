import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // data counts as fresh for 30 s, so moving between pages is instant
        // Don't retry "not allowed" or "not found"; do retry network hiccups and 5xx, twice.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  })
}
