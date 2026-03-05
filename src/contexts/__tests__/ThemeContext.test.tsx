// @vitest-environment jsdom
/**
 * Tests for ThemeContext.
 *
 * Verifies theme persistence to localStorage, DOM class toggling,
 * toggle behavior, and useTheme guard outside provider.
 */
import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ThemeProvider, useTheme } from '../ThemeContext'

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, null, children)
}

beforeEach(() => {
  globalThis.localStorage.clear()
  globalThis.document.documentElement.classList.remove('light', 'dark')
})

describe('ThemeProvider', () => {
  it('defaults to dark when no saved theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
  })

  it('reads saved theme from localStorage', () => {
    globalThis.localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
  })

  it('ignores invalid localStorage values and defaults to dark', () => {
    globalThis.localStorage.setItem('theme', 'invalid')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
  })

  it('adds theme class to documentElement', () => {
    renderHook(() => useTheme(), { wrapper })
    expect(globalThis.document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('persists theme to localStorage', () => {
    renderHook(() => useTheme(), { wrapper })
    expect(globalThis.localStorage.getItem('theme')).toBe('dark')
  })

  it('toggles from dark to light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')

    act(() => result.current.toggleTheme())

    expect(result.current.theme).toBe('light')
    expect(globalThis.localStorage.getItem('theme')).toBe('light')
    expect(globalThis.document.documentElement.classList.contains('light')).toBe(true)
    expect(globalThis.document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggles from light to dark', () => {
    globalThis.localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => result.current.toggleTheme())

    expect(result.current.theme).toBe('dark')
  })
})

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    // Suppress console.error for expected error boundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider',
    )
    spy.mockRestore()
  })
})
