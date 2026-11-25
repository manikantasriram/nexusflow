import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** The mock API intercepting fetch() in Node, for Vitest. */
export const server = setupServer(...handlers)
