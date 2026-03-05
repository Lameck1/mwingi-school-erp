// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

// Mock recharts — render children only, avoid canvas/SVG issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
}))

// Mock ToastContext
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

// Mock useFinancialKPIs hook
vi.mock('../../hooks/useFinancialKPIs', () => ({
  useFinancialKPIs: () => ({ fetchKpiDashboard: vi.fn().mockResolvedValue(null) }),
}))

// Mock stores
vi.mock('../../stores', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      currentTerm: { term_name: 'Term 1' },
      currentAcademicYear: { year_name: '2025' },
      dashboardCache: null,
      isDashboardCacheValid: () => false,
      setDashboardCache: vi.fn(),
    }),
}))

// Mock Tooltip UI component
vi.mock('../../components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock electronAPI
beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      reports: {
        getDashboardData: vi.fn().mockResolvedValue({
          success: true,
          totalStudents: 300,
          totalStaff: 20,
          feeCollected: 5_000_000,
          outstandingBalance: 1_200_000,
        }),
        getFeeCollectionReport: vi.fn().mockResolvedValue([]),
        getFeeCategoryBreakdown: vi.fn().mockResolvedValue([]),
        getAuditLog: vi.fn().mockResolvedValue({ success: true, rows: [] }),
        getKpiDashboard: vi.fn().mockResolvedValue({ success: true, data: null }),
      },
    },
    writable: true,
    configurable: true,
  })
})

const { default: Dashboard } = await import('../Dashboard')

describe('Dashboard', () => {
  it('renders without crashing', () => {
    render(<Dashboard />)
    // During loading it may show a spinner; that's fine — no crash
    expect(true).toBe(true)
  })

  it('shows the Financial Overview heading', async () => {
    render(<Dashboard />)
    // The heading appears after loading completes
    const heading = await screen.findByText('Financial Overview', {}, { timeout: 3000 })
    expect(heading).toBeDefined()
  })

  it('displays stat card labels', async () => {
    render(<Dashboard />)
    const label = await screen.findByText('Active Students', {}, { timeout: 3000 })
    expect(label).toBeDefined()
  })

  it('shows quick action links', async () => {
    render(<Dashboard />)
    const paymentLink = await screen.findByText('Payment', {}, { timeout: 3000 })
    expect(paymentLink).toBeDefined()
  })
})
