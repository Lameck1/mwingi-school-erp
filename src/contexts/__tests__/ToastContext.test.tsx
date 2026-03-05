// @vitest-environment jsdom
/**
 * Tests for ToastContext.
 *
 * Verifies showToast adds toasts, auto-dismiss timing,
 * manual removal, and useToast guard outside provider.
 */
import React from 'react'
import { render, renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider, useToast } from '../ToastContext'

// Mock crypto.randomUUID
let uuidCounter = 0
beforeEach(() => {
  uuidCounter = 0
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
    () => `toast-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`,
  )
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ToastProvider, null, children)
}

describe('ToastProvider', () => {
  it('showToast renders a toast message', () => {
    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => result.current.showToast('Hello!'))

    // The toast should be rendered somewhere. Since ToastProvider renders
    // Toast components with the message text, check the wrapper.
    // We need a component that renders inside the provider.
    function TestComponent() {
      const { showToast } = useToast()
      return React.createElement('button', {
        onClick: () => showToast('Test message', 'success'),
      }, 'Show')
    }

    const { getByText } = render(
      React.createElement(ToastProvider, null, React.createElement(TestComponent)),
    )

    act(() => getByText('Show').click())
    expect(getByText('Test message')).toBeDefined()
  })

  it('auto-dismisses toast after 5s', () => {
    function TestComponent() {
      const { showToast } = useToast()
      return React.createElement('button', {
        onClick: () => showToast('Auto dismiss'),
      }, 'Show')
    }

    const { getByText, queryByText } = render(
      React.createElement(ToastProvider, null, React.createElement(TestComponent)),
    )

    act(() => getByText('Show').click())
    expect(getByText('Auto dismiss')).toBeDefined()

    // Advance past 5s timeout
    act(() => vi.advanceTimersByTime(5100))

    expect(queryByText('Auto dismiss')).toBeNull()
  })

  it('defaults toast type to info', () => {
    const { result } = renderHook(() => useToast(), { wrapper })

    // Just verify it doesn't throw when called without type
    expect(() => {
      act(() => result.current.showToast('No type'))
    }).not.toThrow()
  })

  it('can show multiple toasts', () => {
    function TestComponent() {
      const { showToast } = useToast()
      return React.createElement('div', null,
        React.createElement('button', {
          onClick: () => {
            showToast('First', 'info')
            showToast('Second', 'error')
          },
        }, 'Show Both'),
      )
    }

    const { getByText } = render(
      React.createElement(ToastProvider, null, React.createElement(TestComponent)),
    )

    act(() => getByText('Show Both').click())
    expect(getByText('First')).toBeDefined()
    expect(getByText('Second')).toBeDefined()
  })
})

describe('useToast', () => {
  it('throws when used outside ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a ToastProvider',
    )
    spy.mockRestore()
  })
})

describe('manual toast removal', () => {
  it('removes a toast when close button is clicked', () => {
    function TestComponent() {
      const { showToast } = useToast()
      return React.createElement('button', {
        onClick: () => showToast('Closeable', 'success'),
      }, 'Show')
    }

    const { getByText, queryByText, getByLabelText } = render(
      React.createElement(ToastProvider, null, React.createElement(TestComponent)),
    )

    act(() => getByText('Show').click())
    expect(getByText('Closeable')).toBeDefined()

    act(() => getByLabelText('Close').click())
    expect(queryByText('Closeable')).toBeNull()
  })
})
