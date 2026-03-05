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
}
const stableAuthState = { user: { id: 1, role: 'ADMIN', username: 'admin' } }

vi.mock('../../../stores', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAppState),
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAuthState),
}))

vi.mock('../../../components/ui/Select', () => ({
  Select: (props: Record<string, unknown>) => <select data-testid="mock-select" {...props} />,
}))

vi.mock('../../../components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      academic: {
        getStreams: vi.fn().mockResolvedValue([]),
        getStudentsForAttendance: vi.fn().mockResolvedValue([]),
        getAttendanceByDate: vi.fn().mockResolvedValue([]),
        markAttendance: vi.fn().mockResolvedValue({ success: true }),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: AttendanceManagement } = await import('../index')

// ===========================================================================
// Tests
// ===========================================================================

describe('AttendanceManagement (index)', () => {
  it('renders without crashing', () => {
    render(<AttendanceManagement />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<AttendanceManagement />)
    expect(await screen.findByRole('heading', { name: 'Attendance' }, { timeout: 3000 })).toBeDefined()
  })
})
