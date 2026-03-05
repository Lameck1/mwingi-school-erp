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

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
const _mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      reports: {
        getAuditLog: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: AuditLog } = await import('../index')

// ===========================================================================
// Tests
// ===========================================================================

describe('AuditLog (index)', () => {
  it('renders without crashing', () => {
    render(<AuditLog />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<AuditLog />)
    expect(await screen.findByText('Audit Log', {}, { timeout: 3000 })).toBeDefined()
  })
})
