// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const stableShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: stableShowToast }),
}))

vi.mock('../../../components/ui/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-modal">{children}</div>,
}))

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      system: {
        getUsers: mockFn(),
        createUser: mockFn(),
        updateUser: mockFn(),
        resetUserPassword: mockFn(),
        toggleUserStatus: mockFn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: UserManagement } = await import('../index')

// ===========================================================================
// Tests
// ===========================================================================

describe('UserManagement (index)', () => {
  it('renders without crashing', () => {
    render(<UserManagement />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<UserManagement />)
    expect(await screen.findByText('User Management', {}, { timeout: 3000 })).toBeDefined()
  })
})
