// @vitest-environment jsdom
/**
 * Tests for useScrollableTabNav hook.
 *
 * Verifies tab change callback and scrollIntoView invocation.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useScrollableTabNav } from '../useScrollableTabNav'

describe('useScrollableTabNav', () => {
  it('returns navRef and handleTabClick', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useScrollableTabNav(cb))
    expect(result.current.navRef).toBeDefined()
    expect(typeof result.current.handleTabClick).toBe('function')
  })

  it('calls onTabChange with the tab id', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useScrollableTabNav<'tab1' | 'tab2'>(cb))

    act(() => result.current.handleTabClick('tab1'))
    expect(cb).toHaveBeenCalledWith('tab1')

    act(() => result.current.handleTabClick('tab2'))
    expect(cb).toHaveBeenCalledWith('tab2')
  })

  it('scrolls matching button into view when nav ref is set', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useScrollableTabNav(cb))

    // Simulate a nav element with a button
    const mockBtn = { scrollIntoView: vi.fn() }
    const mockNav = {
      querySelector: vi.fn(() => mockBtn),
    } as unknown as HTMLElement

    // Manually set the ref
    ;(result.current.navRef as { current: HTMLElement | null }).current = mockNav

    act(() => result.current.handleTabClick('settings'))

    expect(mockNav.querySelector).toHaveBeenCalledWith('[data-tab="settings"]')
    expect(mockBtn.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  })

  it('does not throw if navRef.current is null', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useScrollableTabNav(cb))
    // navRef.current is null by default
    expect(() => act(() => result.current.handleTabClick('x'))).not.toThrow()
  })
})
