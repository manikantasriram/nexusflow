import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { App } from '../App'
import { Toaster } from '../components/Toaster'
import { AuthProvider } from '../features/auth/AuthProvider'
import { ThemeProvider } from '../features/theme/ThemeProvider'
import { db } from '../mocks/db'

/** Renders the whole app at `path` against the MSW mock API. */
export function renderApp(path: string, { signedInAs }: { signedInAs?: number } = {}) {
  if (signedInAs !== undefined) db.sessionUserId = signedInAs // as if the refresh cookie were set
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <App />
            <Toaster />
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}
