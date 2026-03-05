// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ search: '', pathname: '/students' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const stableShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: stableShowToast }),
}))

const stableAppState = {
  currentTerm: { id: 1, term_name: 'Term 1' },
  currentAcademicYear: { id: 1, year_name: '2025' },
  schoolSettings: {},
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

vi.mock('../../../components/ui/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../../components/ui/ImportDialog', () => ({
  ImportDialog: () => null,
}))

vi.mock('../../../utils/print', () => ({
  printDocument: vi.fn(),
  printCurrentView: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      students: {
        getStudents: vi.fn().mockResolvedValue({ rows: [], totalCount: 0, page: 1, pageSize: 12 }),
      },
      academic: {
        getStreams: mockFn(),
        getPromotionStreams: mockFn(),
        getAcademicYears: mockFn(),
        getTermsByYear: mockFn(),
        getStudentsForPromotion: mockFn(),
        getNextStream: vi.fn().mockResolvedValue(null),
        batchPromoteStudents: mockFn(),
      },
      finance: {
        getStudentBalance: vi.fn().mockResolvedValue(0),
      },
      reports: {
        getStudentLedgerReport: mockFn(),
      },
      menuEvents: {
        onOpenImportDialog: vi.fn().mockReturnValue(vi.fn()),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: StudentManagement } = await import('../index')
const { default: Promotions } = await import('../Promotions')

// ===========================================================================
// Tests
// ===========================================================================

describe('StudentManagement (index)', () => {
  it('renders without crashing', () => {
    render(<StudentManagement />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<StudentManagement />)
    expect(await screen.findByRole('heading', { name: 'Students' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('Promotions', () => {
  it('renders without crashing', () => {
    render(<Promotions />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<Promotions />)
    expect(await screen.findByRole('heading', { name: 'Student Promotions' }, { timeout: 3000 })).toBeDefined()
  })
})
