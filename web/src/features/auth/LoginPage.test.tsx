import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'

describe('signing in', () => {
  it("shows the server's message when the password is wrong", async () => {
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'owner@demo.nexusflow.dev')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
  })

  it('validates before calling the server', async () => {
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
  })

  it('signs in with a demo account and lands on the dashboard', async () => {
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Owner' }))
    expect(await screen.findByRole('heading', { name: 'Hi Asha' })).toBeInTheDocument()
  })

  it('sends signed-out visitors to the sign-in page', async () => {
    renderApp('/o/1/projects')
    expect(await screen.findByRole('heading', { name: 'Sign in to NexusFlow' })).toBeInTheDocument()
  })

  it('stays signed in across reloads through the refresh cookie', async () => {
    renderApp('/o/1/projects', { signedInAs: 1 })
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })

  it("doesn't show organizations you don't belong to", async () => {
    renderApp('/o/999', { signedInAs: 1 })
    expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
  })
})
