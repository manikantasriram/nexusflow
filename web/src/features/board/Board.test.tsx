import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { db } from '../../mocks/db'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/renderApp'

const column = (name: string) => screen.getByRole('region', { name })
const titlesIn = (name: string) =>
  within(column(name))
    .queryAllByRole('button', { name: /^Move / })
    .map((b) => b.getAttribute('aria-label')!.replace(/^Move WEB-\d+: /, ''))

async function openBoard() {
  renderApp('/o/1/projects/1', { signedInAs: 1 })
  await screen.findByRole('heading', { name: 'In progress' })
  await screen.findByRole('button', { name: /Move WEB-1:/ })
}

describe('Kanban board', () => {
  it('shows each task in its column', async () => {
    await openBoard()
    expect(titlesIn('To do')).toEqual(['Audit current page speed', 'Design new pricing page'])
    expect(titlesIn('Done')).toEqual(['Set up redirects for old URLs'])
  })

  it('moves a card with the keyboard and saves it', async () => {
    await openBoard()
    const handle = screen.getByRole('button', { name: /Move WEB-1:/ })
    handle.focus()
    await userEvent.keyboard(' ')
    expect(handle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard(' ')

    await waitFor(() =>
      expect(titlesIn('In progress')).toEqual(['Audit current page speed', 'Migrate blog posts']),
    )
    await waitFor(() => expect(db.tasks.find((t) => t.id === 1)?.status).toBe('in_progress'))
    expect(screen.getByRole('button', { name: /Move WEB-1:/ })).toHaveFocus()
  })

  it('puts the card back when Escape is pressed', async () => {
    await openBoard()
    screen.getByRole('button', { name: /Move WEB-2:/ }).focus()
    await userEvent.keyboard(' {ArrowUp}{ArrowRight}{Escape}')
    expect(titlesIn('To do')).toEqual(['Audit current page speed', 'Design new pricing page'])
    expect(db.tasks.find((t) => t.id === 2)?.status).toBe('todo')
  })

  it('rolls an optimistic move back when the server refuses it', async () => {
    server.use(
      http.post('*/api/orgs/1/tasks/:taskId/move', () =>
        HttpResponse.json(
          { error: { code: 'error', message: 'Database is down' } },
          { status: 500 },
        ),
      ),
    )
    await openBoard()
    screen.getByRole('button', { name: /Move WEB-1:/ }).focus()
    await userEvent.keyboard(' {ArrowRight}{ArrowRight}{ArrowRight} ')

    expect(await screen.findByText(/Couldn't move the card: Database is down/)).toBeInTheDocument()
    await waitFor(() => expect(titlesIn('To do')).toContain('Audit current page speed'))
    expect(titlesIn('Done')).toEqual(['Set up redirects for old URLs'])
  })

  it('creates a task from the dialog', async () => {
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Add a task to In review' }))
    await userEvent.type(await screen.findByLabelText('Title'), 'Write release notes')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() =>
      expect(titlesIn('In review')).toEqual(['Accessibility pass on forms', 'Write release notes']),
    )
    await waitFor(() => expect(db.tasks.some((t) => t.title === 'Write release notes')).toBe(true))
  })

  it('filters cards', async () => {
    await openBoard()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'pricing')
    expect(titlesIn('To do')).toEqual(['Design new pricing page'])
    expect(titlesIn('In progress')).toEqual([])
    expect(screen.getByText('Showing 1 of 5')).toBeInTheDocument()
  })
})
