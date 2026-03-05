/**
 * Additional coverage tests for budget-handlers.ts
 * Targets: normalization branches (status filter, optional notes/term_id, line_items notes),
 *          renderer mismatch checks on create/update/submit/approve/setAllocation
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 9
let sessionRole = 'ACCOUNTS_CLERK'

const budgetServiceMock = {
  findAll: vi.fn(() => []),
  getBudgetWithLineItems: vi.fn(() => null),
  create: vi.fn(() => ({ success: true, id: 1 })),
  update: vi.fn(() => ({ success: true })),
  submitForApproval: vi.fn(() => ({ success: true })),
  approve: vi.fn(() => ({ success: true })),
}

const budgetEnforcementMock = {
  validateTransaction: vi.fn(() => ({ is_allowed: true })),
  getBudgetAllocations: vi.fn(() => []),
  setBudgetAllocation: vi.fn(() => ({ success: true })),
  generateBudgetVarianceReport: vi.fn(() => ({ items: [] })),
  getBudgetAlerts: vi.fn(() => []),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: { id: sessionUserId, username: 'test', role: sessionRole, full_name: 'Test', email: null, is_active: 1, last_login: null, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({ getDatabase: () => ({}) }))
vi.mock('../../../database/utils/audit', () => ({ logAudit: vi.fn() }))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'BudgetService') { return budgetServiceMock }
      return {}
    })
  }
}))

vi.mock('../../../services/accounting/BudgetEnforcementService', () => ({
  BudgetEnforcementService: class {
    validateTransaction = budgetEnforcementMock.validateTransaction
    getBudgetAllocations = budgetEnforcementMock.getBudgetAllocations
    setBudgetAllocation = budgetEnforcementMock.setBudgetAllocation
    generateBudgetVarianceReport = budgetEnforcementMock.generateBudgetVarianceReport
    getBudgetAlerts = budgetEnforcementMock.getBudgetAlerts
  }
}))

import { registerBudgetHandlers } from '../budget-handlers'

describe('budget-handlers coverage expansion', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'ACCOUNTS_CLERK'
    clearSessionCache()
    vi.clearAllMocks()
    registerBudgetHandlers()
  })

  // ─── normalizeBudgetFilters: status branch ──────────────
  it('getAll normalizes status filter', async () => {
    const handler = handlerMap.get('budget:getAll')!
    await handler({}, { status: 'DRAFT' })
    expect(budgetServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DRAFT' })
    )
  })

  it('getAll normalizes both fiscal_year and status', async () => {
    const handler = handlerMap.get('budget:getAll')!
    await handler({}, { fiscal_year: 2026, status: 'APPROVED' })
    expect(budgetServiceMock.findAll).toHaveBeenCalledWith({
      academic_year_id: 2026,
      status: 'APPROVED'
    })
  })

  // ─── normalizeCreateBudgetData: optional fields ─────────
  it('create normalizes optional term_id and notes', async () => {
    const handler = handlerMap.get('budget:create')!
    await handler({}, {
      budget_name: 'Q1 Budget',
      academic_year_id: 1,
      term_id: 3,
      notes: 'Important budget',
      line_items: [{ category_id: 1, description: 'Supplies', budgeted_amount: 50000 }]
    }, 9)
    expect(budgetServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ term_id: 3, notes: 'Important budget' }),
      9
    )
  })

  it('create normalizes line_items with notes', async () => {
    const handler = handlerMap.get('budget:create')!
    await handler({}, {
      budget_name: 'Q2 Budget',
      academic_year_id: 1,
      line_items: [{ category_id: 1, description: 'Books', budgeted_amount: 30000, notes: 'Library books' }]
    }, 9)
    expect(budgetServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({ notes: 'Library books' })]
      }),
      9
    )
  })

  // ─── create: renderer mismatch ──────────────────────────
  it('create rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('budget:create')!
    const result = await handler({}, {
      budget_name: 'Q1',
      academic_year_id: 1,
      line_items: [{ category_id: 1, description: 'X', budgeted_amount: 100 }]
    }, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ─── update: renderer mismatch + normalizeUpdateBudgetData ────
  it('update rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('budget:update')!
    const result = await handler({}, 1, { budget_name: 'Updated' }, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('update normalizes all optional fields including line_items with notes', async () => {
    const handler = handlerMap.get('budget:update')!
    await handler({}, 1, {
      budget_name: 'Updated',
      academic_year_id: 2,
      term_id: 1,
      notes: 'Updated notes',
      line_items: [
        { category_id: 2, description: 'Furniture', budgeted_amount: 75000, notes: 'Desks' }
      ]
    }, 9)
    expect(budgetServiceMock.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        budget_name: 'Updated',
        academic_year_id: 2,
        term_id: 1,
        notes: 'Updated notes',
        line_items: [expect.objectContaining({ notes: 'Desks' })]
      }),
      9
    )
  })

  // ─── submit: renderer mismatch ──────────────────────────
  it('submit rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('budget:submit')!
    const result = await handler({}, 1, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ─── approve: success with MANAGEMENT role ──────────────
  it('approve succeeds for ADMIN role', async () => {
    sessionRole = 'ADMIN'
    clearSessionCache()
    handlerMap.clear()
    registerBudgetHandlers()
    const handler = handlerMap.get('budget:approve')!
    const result = await handler({}, 1, 9) as { success: boolean }
    expect(result.success).toBe(true)
    expect(budgetServiceMock.approve).toHaveBeenCalledWith(1, 9)
  })

  it('approve rejects renderer user mismatch', async () => {
    sessionRole = 'ADMIN'
    clearSessionCache()
    handlerMap.clear()
    registerBudgetHandlers()
    const handler = handlerMap.get('budget:approve')!
    const result = await handler({}, 1, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ─── setAllocation: renderer mismatch ───────────────────
  it('setAllocation rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('budget:setAllocation')!
    const result = await handler({}, '5100', 2026, 100000, null, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ─── validateTransaction with department ────────────────
  it('validateTransaction passes department as null when absent', async () => {
    const handler = handlerMap.get('budget:validateTransaction')!
    await handler({}, '5100', 10000, 2026)
    expect(budgetEnforcementMock.validateTransaction).toHaveBeenCalledWith('5100', 10000, 2026, null)
  })

  it('validateTransaction passes department string', async () => {
    const handler = handlerMap.get('budget:validateTransaction')!
    await handler({}, '5100', 10000, 2026, 'Admin')
    expect(budgetEnforcementMock.validateTransaction).toHaveBeenCalledWith('5100', 10000, 2026, 'Admin')
  })
})
