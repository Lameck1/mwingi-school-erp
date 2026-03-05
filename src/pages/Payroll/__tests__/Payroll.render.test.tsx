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

const stableAppState = {
  currentTerm: { id: 1, term_name: 'Term 1' },
  currentAcademicYear: { id: 1, year_name: '2025' },
  schoolSettings: { school_name: 'Test School' },
}
const stableAuthState = { user: { id: 1, role: 'ADMIN', username: 'admin', full_name: 'Admin User' } }
vi.mock('../../../stores', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAppState),
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAuthState),
}))

vi.mock('../../../components/ui/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-modal">{children}</div>,
}))

vi.mock('../../../components/ui/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../../hooks/usePayrollExports', () => ({
  usePayrollExports: () => ({
    exportP10Csv: vi.fn(),
    isExportingP10: false,
    generatePayslip: vi.fn(),
  }),
}))

vi.mock('../../../utils/runtimeError', () => ({
  reportRuntimeError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}))

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      staff: {
        getStaff: mockFn(),
        createStaff: mockFn(),
        updateStaff: mockFn(),
        setStaffActive: mockFn(),
        getPayrollHistory: mockFn(),
        getPayrollDetails: vi.fn().mockResolvedValue([]),
        runPayroll: mockFn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: Staff } = await import('../Staff')
const { default: PayrollRun } = await import('../PayrollRun')

// ===========================================================================
// Tests
// ===========================================================================

describe('Staff', () => {
  it('renders without crashing', () => {
    render(<Staff />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<Staff />)
    expect(await screen.findByRole('heading', { name: 'Staff Management' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('PayrollRun', () => {
  it('renders without crashing', () => {
    render(<PayrollRun />)
    expect(true).toBe(true)
  })

  it('displays payroll management heading', async () => {
    render(<PayrollRun />)
    expect(await screen.findByRole('heading', { name: 'Payroll Management' }, { timeout: 3000 })).toBeDefined()
  })

  it('shows payroll engine section', async () => {
    render(<PayrollRun />)
    expect(await screen.findByRole('heading', { name: 'Payroll Engine' }, { timeout: 3000 })).toBeDefined()
  })
})
