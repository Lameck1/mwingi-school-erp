// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: '1' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const stableShowToast = vi.fn()
vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: stableShowToast }),
}))

const stableAppState = {
  currentTerm: { id: 1, term_name: 'Term 1' },
  currentAcademicYear: { id: 1, year_name: '2025' },
  schoolSettings: {},
}
const stableAuthState = { user: { id: 1, role: 'ADMIN', username: 'admin' } }
vi.mock('../../../../stores', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAppState),
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAuthState),
}))

vi.mock('../../../../components/ui/Table/DataTable', () => ({
  DataTable: () => <div data-testid="data-table" />,
}))

vi.mock('../../../../components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      finance: {
        getBudgets: mockFn(),
        getBudgetById: vi.fn().mockResolvedValue({
            id: 1,
            budget_name: 'Test Budget',
            status: 'DRAFT',
            total_amount: 100000,
            total_budgeted: 100000,
            total_actual: 50000,
            total_variance: 50000,
            created_by_name: 'Admin',
            line_items: [],
          }),
        createBudget: mockFn(),
        submitBudgetForApproval: mockFn(),
        approveBudget: mockFn(),
        getTransactionCategories: mockFn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: BudgetList } = await import('../index')
const { default: CreateBudget } = await import('../CreateBudget')
const { default: BudgetDetails } = await import('../BudgetDetails')

// ===========================================================================
// Tests
// ===========================================================================

describe('BudgetList (index)', () => {
  it('renders without crashing', () => {
    render(<BudgetList />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<BudgetList />)
    expect(await screen.findByText('Budget Management', {}, { timeout: 3000 })).toBeDefined()
  })
})

describe('CreateBudget', () => {
  it('renders without crashing', () => {
    render(<CreateBudget />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<CreateBudget />)
    expect(await screen.findByRole('heading', { name: 'Create New Budget' }, { timeout: 3000 })).toBeDefined()
  })

  it('shows budget line items section', async () => {
    render(<CreateBudget />)
    expect(await screen.findByRole('heading', { name: 'Budget Line Items' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('BudgetDetails', () => {
  it('renders without crashing', () => {
    render(<BudgetDetails />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<BudgetDetails />)
    expect(await screen.findByRole('heading', { name: 'Test Budget' }, { timeout: 3000 })).toBeDefined()
  })
})
