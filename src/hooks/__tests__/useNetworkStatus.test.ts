// @vitest-environment jsdom
/**
 * Tests for useNetworkStatus hook.
 *
 * Verifies online/offline event handling via globalThis event listeners.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useNetworkStatus } from '../useNetworkStatus'

describe('useNetworkStatus', () => {
  let originalOnLine: boolean

  beforeEach(() => {
    originalOnLine = globalThis.navigator.onLine
  })

  afterEach(() => {
    // Restore. navigator.onLine is read-only; we mock via defineProperty.
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true,
    })
  })

  it('returns current online status on mount', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true, writable: true, configurable: true,
    })
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current).toBe(true)
  })

  it('returns false when navigator.onLine is false', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false, writable: true, configurable: true,
    })
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current).toBe(false)
  })

  it('updates to false on offline event', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true, writable: true, configurable: true,
    })
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current).toBe(true)

    act(() => {
      globalThis.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it('updates to true on online event', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false, writable: true, configurable: true,
    })
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current).toBe(false)

    act(() => {
      globalThis.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('cleans up listeners on unmount', () => {
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener')
    const { unmount } = renderHook(() => useNetworkStatus())
    unmount()

    const calls = removeSpy.mock.calls.map(c => c[0])
    expect(calls).toContain('online')
    expect(calls).toContain('offline')
    removeSpy.mockRestore()
  })
})
