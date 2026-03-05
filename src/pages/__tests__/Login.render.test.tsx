// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

// Mock stores
vi.mock('../../stores', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ login: vi.fn() }),
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setSchoolSettings: vi.fn(),
      setCurrentAcademicYear: vi.fn(),
      setCurrentTerm: vi.fn(),
    }),
}))

// Mock electronAPI
beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      auth: {
        login: vi.fn().mockResolvedValue({ success: false, error: 'mock' }),
        hasUsers: vi.fn().mockResolvedValue({ success: true, data: true }),
      },
      settings: { getSettings: vi.fn().mockResolvedValue({ success: true, data: {} }) },
      academic: {
        getCurrentAcademicYear: vi.fn().mockResolvedValue({ success: true, data: {} }),
        getCurrentTerm: vi.fn().mockResolvedValue({ success: true, data: {} }),
      },
    },
    writable: true,
    configurable: true,
  })
})

// Dynamic import to ensure mocks are in place
const { default: Login } = await import('../Login')

describe('Login', () => {
  it('renders without crashing', () => {
    render(<Login />)
    expect(screen.getByText('Mwingi Adventist School')).toBeDefined()
  })

  it('shows the school title', () => {
    render(<Login />)
    expect(screen.getByText('Mwingi Adventist School')).toBeDefined()
  })

  it('shows username and password fields', () => {
    render(<Login />)
    expect(screen.getByLabelText('Username')).toBeDefined()
    expect(screen.getByLabelText('Password')).toBeDefined()
  })

  it('has a submit button', () => {
    render(<Login />)
    // The button contains "Sign In" text
    const btn = screen.getByRole('button', { name: 'Sign In' })
    expect(btn).toBeDefined()
  })

  it('has required attribute on inputs', () => {
    render(<Login />)
    const usernameInput = screen.getByLabelText('Username') as HTMLInputElement
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
    expect(usernameInput.required).toBe(true)
    expect(passwordInput.required).toBe(true)
  })
})
