import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setAccessToken } from '../lib/api'
import { resetMockDb } from '../mocks/db'
import { server } from '../mocks/server'
import { useToasts } from '../stores/toast'
import { useUi } from '../stores/ui'

// jsdom has <dialog> but not its modal methods; give it just enough to open and close.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

beforeAll(() => server.listen())
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetMockDb()
  setAccessToken(null)
  useUi.setState({
    filters: { search: '', priority: 'all', assignee: 'all' },
    taskDialog: null,
  })
  useToasts.setState({ toasts: [] })
  localStorage.clear()
})
afterAll(() => server.close())
