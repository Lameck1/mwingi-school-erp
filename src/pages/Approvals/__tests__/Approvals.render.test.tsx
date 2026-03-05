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

const stableAuthState = { user: { id: 1, role: 'ADMIN', username: 'admin' } }
vi.mock('../../../stores', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAuthState),
}))

vi.mock('../../../components/ui/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-modal">{children}</div>,
}))

vi.mock('../../../components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      system: {
        getPendingApprovals: vi.fn().mockResolvedValue([]),
        getAllApprovals: vi.fn().mockResolvedValue([]),
        getApprovalCounts: vi.fn().mockResolvedValue({ pending: 0, approved: 0, rejected: 0 }),
        approveRequest: vi.fn().mockResolvedValue({ success: true }),
        rejectRequest: vi.fn().mockResolvedValue({ success: true }),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: ApprovalManagement } = await import('../index')

// ===========================================================================
// Tests
// ===========================================================================

describe('ApprovalManagement (index)', () => {
  it('renders without crashing', () => {
    render(<ApprovalManagement />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<ApprovalManagement />)
    expect(await screen.findByText('Approval Requests', {}, { timeout: 3000 })).toBeDefined()
  })
})
