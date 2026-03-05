// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorBoundary } from '../ErrorBoundary'

// Mock window.electronAPI used by ErrorBoundary's componentDidCatch
beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      system: { logError: vi.fn().mockResolvedValue(void 0) },
    },
    writable: true,
    configurable: true,
  })
})

function ProblemChild(): React.JSX.Element {
  throw new Error('Boom!')
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeDefined()
  })

  it('shows default fallback UI when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeDefined()
    expect(screen.getByText('Boom!')).toBeDefined()
    spy.mockRestore()
  })

  it('renders custom fallback when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary fallback={<div>Custom error page</div>}>
        <ProblemChild />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Custom error page')).toBeDefined()
    spy.mockRestore()
  })

  it('allows recovery via Try Again button', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let shouldThrow = true
    function MaybeThrow() {
      if (shouldThrow) {
        throw new Error('Recoverable error')
      }
      return <p>Recovered!</p>
    }

    render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeDefined()

    // Fix the child before clicking retry
    shouldThrow = false
    fireEvent.click(screen.getByText(/Try Again/))
    expect(screen.getByText('Recovered!')).toBeDefined()
    spy.mockRestore()
  })
})
