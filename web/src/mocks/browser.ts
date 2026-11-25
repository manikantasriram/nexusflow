import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** The mock API running in a service worker, for `npm run dev:mock`. */
export const worker = setupWorker(...handlers)
