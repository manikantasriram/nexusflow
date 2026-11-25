import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api'
import { renderApp } from '../../test/renderApp'
import { ProjectForm } from './ProjectForm'
import { suggestKey } from './projectSchema'

describe('suggestKey', () => {
  it('uses initials for several words and the first letters for one', () => {
    expect(suggestKey('Website relaunch')).toBe('WR')
    expect(suggestKey('Platform')).toBe('PLA')
    expect(suggestKey('  ')).toBe('')
  })
})

describe('ProjectForm', () => {
  it('shows validation errors and does not submit', async () => {
    const onSubmit = vi.fn()
    render(<ProjectForm submitLabel="Create project" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Project name'), 'X')
    await userEvent.clear(screen.getByLabelText('Key'))
    await userEvent.type(screen.getByLabelText('Key'), '1A')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('At least 2 characters')).toBeInTheDocument()
    expect(screen.getByText('2–10 letters or digits, starting with a letter')).toBeInTheDocument()
    expect(screen.getByLabelText('Key')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('suggests a key from the name and submits it upper-cased', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ProjectForm submitLabel="Create project" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Project name'), 'Mobile app')
    expect(screen.getByLabelText('Key')).toHaveValue('MA')
    await userEvent.clear(screen.getByLabelText('Key'))
    await userEvent.type(screen.getByLabelText('Key'), 'mob')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Mobile app',
      key: 'MOB',
      description: '',
    })
  })

  it('puts a "key already used" error from the server on the key field', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'conflict', 'The key WEB is already used'))
    render(<ProjectForm submitLabel="Create project" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Project name'), 'Web')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('The key WEB is already used')).toBeInTheDocument()
    expect(screen.getByLabelText('Key')).toHaveFocus()
  })
})

describe('New project page', () => {
  it('creates the project and opens its board', async () => {
    renderApp('/o/1/projects/new', { signedInAs: 1 })
    await userEvent.type(await screen.findByLabelText('Project name'), 'Mobile app')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('heading', { name: 'Mobile app' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument()
  })
})
