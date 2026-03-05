// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
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

vi.mock('../../../components/ui/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-modal">{children}</div>,
}))

vi.mock('../../../hooks/useFinancialKPIs', () => ({
  useFinancialKPIs: () => ({ fetchKpiDashboard: vi.fn().mockResolvedValue(null), netAssetsReport: null }),
}))

vi.mock('../../../utils/exporters', () => ({
  exportToPDF: vi.fn(),
}))

vi.mock('../../../utils/print', () => ({
  printCurrentView: vi.fn(),
  printDocument: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock electronAPI – covers all IPC calls for Finance pages
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      academic: {
        getAcademicYears: mockFn(),
        getStreams: mockFn(),
        getCurrentAcademicYear: vi.fn().mockResolvedValue({ id: 1, year_name: '2025' }),
        getCurrentTerm: vi.fn().mockResolvedValue({ id: 1, term_name: 'Term 1' }),
        getTermsByYear: mockFn(),
      },
      finance: {
        getFeeCategories: mockFn(),
        getFeeStructure: mockFn(),
        saveFeeStructure: mockFn(),
        createFeeCategory: mockFn(),
        generateBatchInvoices: mockFn(),
        getStudentBalance: vi.fn().mockResolvedValue(0),
        getPaymentsByStudent: mockFn(),
        getExemptions: mockFn(),
        getExemptionStats: vi.fn().mockResolvedValue({ totalExemptions: 0, activeExemptions: 0, fullExemptions: 0, partialExemptions: 0 }),
        createExemption: mockFn(),
        revokeExemption: mockFn(),
        getInvoices: mockFn(),
        getInvoiceItems: mockFn(),
        getTransactions: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
        getTransactionCategories: mockFn(),
        createTransactionCategory: mockFn(),
        createTransaction: mockFn(),
        getTransactionSummary: vi.fn().mockResolvedValue({ totalIncome: 0, totalExpense: 0, netBalance: 0 }),
        getBankAccounts: mockFn(),
        createBankAccount: mockFn(),
      },
      students: {
        getStudentById: vi.fn().mockResolvedValue({}),
        getStudents: mockFn(),
      },
      reports: {
        getRevenueByCategory: mockFn(),
        getExpenseByCategory: mockFn(),
        getKpiDashboard: vi.fn().mockResolvedValue(null),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: FeeStructure } = await import('../FeeStructure')
const { default: FeePayment } = await import('../FeePayment')
const { default: FeeExemptions } = await import('../FeeExemptions')
const { default: Invoices } = await import('../Invoices')
const { default: Transactions } = await import('../Transactions')
const { default: RecordIncome } = await import('../RecordIncome')
const { default: RecordExpense } = await import('../RecordExpense')
const { default: BankAccounts } = await import('../BankAccounts')
const { default: FinancialReports } = await import('../FinancialReports')

// ===========================================================================
// Tests
// ===========================================================================

describe('FeeStructure', () => {
  it('renders without crashing', () => {
    render(<FeeStructure />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<FeeStructure />)
    expect(await screen.findByText('Academic Year', {}, { timeout: 3000 })).toBeDefined()
  })
})

describe('FeePayment', () => {
  it('renders without crashing', () => {
    render(<FeePayment />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<FeePayment />)
    expect(await screen.findByRole('heading', { name: 'Fee Collection' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('FeeExemptions', () => {
  it('renders without crashing', () => {
    render(<FeeExemptions />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<FeeExemptions />)
    expect(await screen.findByRole('heading', { name: 'Fee Exemptions' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('Invoices', () => {
  it('renders without crashing', () => {
    render(<Invoices />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<Invoices />)
    expect(await screen.findByRole('heading', { name: 'Invoices' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('Transactions', () => {
  it('renders without crashing', () => {
    render(<Transactions />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<Transactions />)
    expect(await screen.findByRole('heading', { name: 'Financial Ledger' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('RecordIncome', () => {
  it('renders without crashing', () => {
    render(<RecordIncome />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<RecordIncome />)
    expect(await screen.findByRole('heading', { name: 'Record Income' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('RecordExpense', () => {
  it('renders without crashing', () => {
    render(<RecordExpense />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<RecordExpense />)
    expect(await screen.findByRole('heading', { name: 'Record Expense' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('BankAccounts', () => {
  it('renders without crashing', () => {
    render(<BankAccounts />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<BankAccounts />)
    expect(await screen.findByRole('heading', { name: 'Bank Accounts' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('FinancialReports', () => {
  it('renders without crashing', () => {
    render(<FinancialReports />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<FinancialReports />)
    expect(await screen.findByRole('heading', { name: 'Financial Intelligence' }, { timeout: 3000 })).toBeDefined()
  })
})
