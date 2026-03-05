import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const budgetServiceMock = {
  findAll: vi.fn().mockResolvedValue([]),
  getBudgetWithLineItems: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({ success: true, id: 1 }),
  update: vi.fn().mockResolvedValue({ success: true }),
  submitForApproval: vi.fn().mockResolvedValue({ success: true }),
  approve: vi.fn().mockResolvedValue({ success: true }),
}

const budgetEnforcementMock = {
  validateTransaction: vi.fn().mockResolvedValue({ is_allowed: true, message: 'Within budget' }),
  getBudgetAllocations: vi.fn().mockResolvedValue([]),
  setBudgetAllocation: vi.fn().mockResolvedValue({ success: true }),
  generateBudgetVarianceReport: vi.fn().mockResolvedValue({ items: [], summary: {} }),
  getBudgetAlerts: vi.fn().mockResolvedValue([]),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 9, username: 'test', role: 'ACCOUNTS_CLERK', full_name: 'Test', email: 'test@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => ({})
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

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

type SuccessResult = { success: boolean; error?: string; [key: string]: unknown }

describe('budget-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    budgetServiceMock.findAll.mockReset().mockResolvedValue([])
    budgetServiceMock.getBudgetWithLineItems.mockReset().mockResolvedValue(null)
    budgetServiceMock.create.mockReset().mockResolvedValue({ success: true, id: 1 })
    budgetServiceMock.update.mockReset().mockResolvedValue({ success: true })
    budgetServiceMock.submitForApproval.mockReset().mockResolvedValue({ success: true })
    budgetServiceMock.approve.mockReset().mockResolvedValue({ success: true })
    budgetEnforcementMock.validateTransaction.mockReset().mockResolvedValue({ is_allowed: true, message: 'Within budget' })
    budgetEnforcementMock.getBudgetAllocations.mockReset().mockResolvedValue([])
    budgetEnforcementMock.setBudgetAllocation.mockReset().mockResolvedValue({ success: true })
    budgetEnforcementMock.generateBudgetVarianceReport.mockReset().mockResolvedValue({ items: [], summary: {} })
    budgetEnforcementMock.getBudgetAlerts.mockReset().mockResolvedValue([])

    registerBudgetHandlers()
  })

  afterEach(() => {
    handlerMap.clear()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected budget channels', () => {
    expect(handlerMap.has('budget:getAll')).toBe(true)
    expect(handlerMap.has('budget:getById')).toBe(true)
    expect(handlerMap.has('budget:create')).toBe(true)
    expect(handlerMap.has('budget:update')).toBe(true)
    expect(handlerMap.has('budget:submit')).toBe(true)
    expect(handlerMap.has('budget:approve')).toBe(true)
    expect(handlerMap.has('budget:validateTransaction')).toBe(true)
    expect(handlerMap.has('budget:getAllocations')).toBe(true)
    expect(handlerMap.has('budget:setAllocation')).toBe(true)
    expect(handlerMap.has('budget:varianceReport')).toBe(true)
    expect(handlerMap.has('budget:alerts')).toBe(true)
  })

  // ─── budget:getAll ──────────────────────────────────────────────────

  it('budget:getAll returns budgets list', async () => {
    budgetServiceMock.findAll.mockResolvedValueOnce([{ id: 1, budget_name: 'Q1 Budget' }])
    const handler = handlerMap.get('budget:getAll')!
    const result = await handler({}, {})

    expect(Array.isArray(result)).toBe(true)
    expect(budgetServiceMock.findAll).toHaveBeenCalledTimes(1)
  })

  it('budget:getAll accepts optional fiscal_year filter', async () => {
    const handler = handlerMap.get('budget:getAll')!
    await handler({}, { fiscal_year: 2026 })

    expect(budgetServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ academic_year_id: 2026 })
    )
  })

  // ─── budget:getById ─────────────────────────────────────────────────

  it('budget:getById delegates to service', async () => {
    budgetServiceMock.getBudgetWithLineItems.mockResolvedValueOnce({ id: 1, budget_name: 'Q1' })
    const handler = handlerMap.get('budget:getById')!
    const result = await handler({}, 1) as { id: number }

    expect(result.id).toBe(1)
    expect(budgetServiceMock.getBudgetWithLineItems).toHaveBeenCalledWith(1)
  })

  // ─── budget:create ──────────────────────────────────────────────────

  it('budget:create calls service with normalized data', async () => {
    const handler = handlerMap.get('budget:create')!
    const result = await handler(
      {},
      {
        budget_name: 'Term 1 Budget',
        academic_year_id: 1,
        line_items: [
          { category_id: 1, description: 'Supplies', budgeted_amount: 50000 }
        ]
      },
      9
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(budgetServiceMock.create).toHaveBeenCalledTimes(1)
    expect(budgetServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ budget_name: 'Term 1 Budget' }),
      9
    )
  })

  it('budget:create rejects empty budget name', async () => {
    const handler = handlerMap.get('budget:create')!
    const result = await handler(
      {},
      {
        budget_name: '',
        academic_year_id: 1,
        line_items: [
          { category_id: 1, description: 'Supplies', budgeted_amount: 50000 }
        ]
      },
      9
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(budgetServiceMock.create).not.toHaveBeenCalled()
  })

  // ─── budget:update ──────────────────────────────────────────────────

  it('budget:update calls service with partial data', async () => {
    const handler = handlerMap.get('budget:update')!
    const result = await handler(
      {},
      1,
      { budget_name: 'Updated Budget' },
      9
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(budgetServiceMock.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ budget_name: 'Updated Budget' }),
      9
    )
  })

  // ─── budget:submit ──────────────────────────────────────────────────

  it('budget:submit delegates to submitForApproval', async () => {
    const handler = handlerMap.get('budget:submit')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(true)
    expect(budgetServiceMock.submitForApproval).toHaveBeenCalledWith(1, 9)
  })

  // ─── budget:approve ─────────────────────────────────────────────────

  it('budget:approve requires MANAGEMENT role', async () => {
    // The mock keytar session has role ACCOUNTS_CLERK, which is NOT in ROLES.MANAGEMENT.
    // ROLES.MANAGEMENT = ['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL']
    const handler = handlerMap.get('budget:approve')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(budgetServiceMock.approve).not.toHaveBeenCalled()
  })

  // ─── budget:validateTransaction ─────────────────────────────────────

  it('budget:validateTransaction returns validation result', async () => {
    const handler = handlerMap.get('budget:validateTransaction')!
    const result = await handler({}, '5100', 10000, 2026, null) as { is_allowed: boolean }

    expect(result.is_allowed).toBe(true)
    expect(budgetEnforcementMock.validateTransaction).toHaveBeenCalledWith('5100', 10000, 2026, null)
  })

  // ─── budget:getAllocations ──────────────────────────────────────────

  it('budget:getAllocations returns allocations for fiscal year', async () => {
    const handler = handlerMap.get('budget:getAllocations')!
    const result = await handler({}, 2026)

    expect(Array.isArray(result)).toBe(true)
    expect(budgetEnforcementMock.getBudgetAllocations).toHaveBeenCalledWith(2026)
  })

  // ─── budget:setAllocation ───────────────────────────────────────────

  it('budget:setAllocation delegates to enforcement service', async () => {
    const handler = handlerMap.get('budget:setAllocation')!
    const result = await handler({}, '5100', 2026, 100000, null, 9) as SuccessResult

    expect(result.success).toBe(true)
    expect(budgetEnforcementMock.setBudgetAllocation).toHaveBeenCalledWith('5100', 2026, 100000, null, 9)
  })

  // ─── budget:varianceReport ──────────────────────────────────────────

  it('budget:varianceReport returns report for fiscal year', async () => {
    const handler = handlerMap.get('budget:varianceReport')!
    const result = await handler({}, 2026) as { items: unknown[] }

    expect(result.items).toBeDefined()
    expect(budgetEnforcementMock.generateBudgetVarianceReport).toHaveBeenCalledWith(2026)
  })

  // ─── budget:alerts ──────────────────────────────────────────────────

  it('budget:alerts returns alerts for fiscal year', async () => {
    const handler = handlerMap.get('budget:alerts')!
    const result = await handler({}, 2026, 80)

    expect(Array.isArray(result)).toBe(true)
    expect(budgetEnforcementMock.getBudgetAlerts).toHaveBeenCalledWith(2026, 80)
  })

  it('budget:create normalizes optional term_id, notes, and line item notes', async () => {
    const handler = handlerMap.get('budget:create')!
    const result = await handler(
      {},
      {
        budget_name: 'Full Budget',
        academic_year_id: 2026,
        term_id: 3,
        notes: 'Budget notes',
        line_items: [
          { category_id: 1, description: 'Books', budgeted_amount: 20000, notes: 'stationery' }
        ]
      },
      9
    ) as SuccessResult
    expect(result.success).toBe(true)
    expect(budgetServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ term_id: 3, notes: 'Budget notes', line_items: expect.arrayContaining([expect.objectContaining({ notes: 'stationery' })]) }),
      9
    )
  })

  it('budget:getAll filters by status', async () => {
    const handler = handlerMap.get('budget:getAll')!
    await handler({}, { status: 'DRAFT' })
    expect(budgetServiceMock.findAll).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }))
  })
})
