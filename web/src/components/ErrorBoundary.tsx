import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Changing this value (for example the URL) clears the error, so navigating away recovers. */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

/**
 * Catches render errors below it and shows a recovery screen instead of a blank page.
 * Error boundaries still have to be class components: there is no hook for componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    // Resetting on a new resetKey is the intended way to recover; it renders once more.
    // oxlint-disable-next-line react/no-did-update-set-state
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Something broke on this page</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          The rest of the app still works. Try again, or go back to the dashboard.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-left text-xs dark:bg-zinc-900">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="bg-brand-600 hover:bg-brand-700 mt-6 rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
      </div>
    )
  }
}
