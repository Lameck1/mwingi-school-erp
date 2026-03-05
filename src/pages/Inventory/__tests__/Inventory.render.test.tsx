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

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      operations: {
        getInventory: mockFn(),
        getLowStockItems: mockFn(),
        getInventoryCategories: mockFn(),
        getSuppliers: mockFn(),
        createInventoryItem: mockFn(),
        recordStockMovement: mockFn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: InventoryManagement } = await import('../index')

// ===========================================================================
// Tests
// ===========================================================================

describe('InventoryManagement (index)', () => {
  it('renders without crashing', () => {
    render(<InventoryManagement />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<InventoryManagement />)
    expect(await screen.findByText('Inventory', {}, { timeout: 3000 })).toBeDefined()
  })
})
