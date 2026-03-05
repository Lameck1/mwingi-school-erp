import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const creditServiceMock = {
  allocateCreditsToInvoices: vi.fn().mockResolvedValue({ success: true, allocated: 5000 }),
  getStudentCreditBalance: vi.fn().mockResolvedValue(3000),
  getCreditTransactions: vi.fn().mockResolvedValue([]),
  addCreditToStudent: vi.fn().mockResolvedValue({ success: true }),
}

const prorationServiceMock = {
  calculateProRatedFee: vi.fn(() => ({ prorated_amount: 7500 })),
  validateEnrollmentDate: vi.fn(() => ({ valid: true })),
  generateProRatedInvoice: vi.fn().mockResolvedValue({ success: true, invoice_id: 42 }),
  getStudentProRationHistory: vi.fn().mockResolvedValue([]),
}

const scholarshipServiceMock = {
  createScholarship: vi.fn().mockResolvedValue({ success: true, id: 1 }),
  allocateScholarshipToStudent: vi.fn().mockResolvedValue({ success: true }),
  validateScholarshipEligibility: vi.fn().mockResolvedValue({ eligible: true }),
  getActiveScholarships: vi.fn().mockResolvedValue([]),
  getStudentScholarships: vi.fn().mockResolvedValue([]),
  getScholarshipAllocations: vi.fn().mockResolvedValue([]),
  applyScholarshipToInvoice: vi.fn().mockResolvedValue({ success: true }),
}

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: { id: 9, username: 'clerk', role: 'ACCOUNTS_CLERK', full_name: 'Clerk', email: null, is_active: 1, last_login: null, created_at: new Date().toISOString() },
    lastActivity: Date.now()
  }))
}))

vi.mock('../../../database', () => ({
  getDatabase: vi.fn()
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'ScholarshipService') { return scholarshipServiceMock }
      if (name === 'CreditAutoApplicationService') { return creditServiceMock }
      if (name === 'FeeProrationService') { return prorationServiceMock }
      return {}
    })
  }
}))

import { registerScholarshipHandlers, registerCreditHandlers, registerProrationHandlers } from '../scholarship-handlers'

describe('scholarship IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerScholarshipHandlers()
  })

  afterEach(() => {
    handlerMap.clear()
  })

  it('registers all expected scholarship channels', () => {
    const expectedChannels = [
      'finance:createScholarship',
      'finance:allocateScholarship',
      'finance:validateScholarshipEligibility',
      'finance:getActiveScholarships',
      'finance:getStudentScholarships',
      'finance:getScholarshipAllocations',
      'finance:applyScholarshipToInvoice',
    ]
    for (const channel of expectedChannels) {
      expect(handlerMap.has(channel), `missing handler for ${channel}`).toBe(true)
    }
  })

  it('finance:createScholarship calls service with data and actor', async () => {
    scholarshipServiceMock.createScholarship.mockResolvedValueOnce({ success: true, id: 10 })

    const handler = handlerMap.get('finance:createScholarship')!
    const result = await handler({}, {
      name: 'Merit Scholarship',
      amount: 50000,
      fund_id: 1,
    }) as { success: boolean; id?: number }

    expect(result.success).toBe(true)
    expect(result.id).toBe(10)
    expect(scholarshipServiceMock.createScholarship).toHaveBeenCalledTimes(1)
    const callArgs = scholarshipServiceMock.createScholarship.mock.calls[0]
    expect(callArgs[0]).toMatchObject({ name: 'Merit Scholarship', amount: 50000 })
    expect(callArgs[1]).toBe(9) // actor.id
  })

  it('finance:createScholarship returns error on service failure', async () => {
    scholarshipServiceMock.createScholarship.mockRejectedValueOnce(new Error('Fund not found'))

    const handler = handlerMap.get('finance:createScholarship')!
    const result = await handler({}, {
      name: 'Need-Based',
      amount: 30000,
      fund_id: 999,
    }) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:allocateScholarship calls service with allocation data', async () => {
    scholarshipServiceMock.allocateScholarshipToStudent.mockResolvedValueOnce({ success: true })

    const handler = handlerMap.get('finance:allocateScholarship')!
    const result = await handler({}, {
      scholarship_id: 1,
      student_id: 5,
      term_id: 2,
      amount: 25000,
    }) as { success: boolean }

    expect(result.success).toBe(true)
    expect(scholarshipServiceMock.allocateScholarshipToStudent).toHaveBeenCalledTimes(1)
    const callArgs = scholarshipServiceMock.allocateScholarshipToStudent.mock.calls[0]
    expect(callArgs[0]).toMatchObject({ scholarship_id: 1, student_id: 5 })
    expect(callArgs[1]).toBe(9) // actor.id
  })

  it('finance:getActiveScholarships returns list of scholarships', async () => {
    const mockScholarships = [
      { id: 1, name: 'Merit', amount: 50000 },
      { id: 2, name: 'Need-Based', amount: 30000 },
    ]
    scholarshipServiceMock.getActiveScholarships.mockResolvedValueOnce(mockScholarships)

    const handler = handlerMap.get('finance:getActiveScholarships')!
    const result = await handler({})

    expect(result).toEqual(mockScholarships)
    expect(scholarshipServiceMock.getActiveScholarships).toHaveBeenCalledTimes(1)
  })

  it('finance:getStudentScholarships returns scholarships for a student', async () => {
    const mockData = [{ id: 1, scholarship_id: 1, student_id: 5, amount: 25000 }]
    scholarshipServiceMock.getStudentScholarships.mockResolvedValueOnce(mockData)

    const handler = handlerMap.get('finance:getStudentScholarships')!
    const result = await handler({}, 5)

    expect(result).toEqual(mockData)
    expect(scholarshipServiceMock.getStudentScholarships).toHaveBeenCalledWith(5)
  })

  it('finance:validateScholarshipEligibility validates student eligibility', async () => {
    scholarshipServiceMock.validateScholarshipEligibility.mockResolvedValueOnce({ eligible: true, reason: 'Meets criteria' })

    const handler = handlerMap.get('finance:validateScholarshipEligibility')!
    const result = await handler({}, 5, 1) as { eligible: boolean }

    expect(result.eligible).toBe(true)
    expect(scholarshipServiceMock.validateScholarshipEligibility).toHaveBeenCalledWith(5, 1)
  })

  it('finance:applyScholarshipToInvoice applies scholarship amount', async () => {
    scholarshipServiceMock.applyScholarshipToInvoice.mockResolvedValueOnce({ success: true, applied_amount: 15000 })

    const handler = handlerMap.get('finance:applyScholarshipToInvoice')!
    const result = await handler({}, 1, 10, 15000) as { success: boolean; applied_amount?: number }

    expect(result.success).toBe(true)
    expect(result.applied_amount).toBe(15000)
    expect(scholarshipServiceMock.applyScholarshipToInvoice).toHaveBeenCalledWith(1, 10, 15000, 9)
  })

  it('finance:applyScholarshipToInvoice rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('finance:applyScholarshipToInvoice')!
    // Pass legacyUserId (4th positional arg) that doesn't match session actor (id=9)
    const result = await handler({}, 1, 10, 15000, 999) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(scholarshipServiceMock.applyScholarshipToInvoice).not.toHaveBeenCalled()
  })

  it('finance:getScholarshipAllocations returns allocations for a scholarship', async () => {
    scholarshipServiceMock.getScholarshipAllocations.mockResolvedValueOnce([{ id: 1, student_id: 5, amount: 25000 }])
    const handler = handlerMap.get('finance:getScholarshipAllocations')!
    const result = await handler({}, 1) as Array<{ id: number }>
    expect(result).toHaveLength(1)
    expect(scholarshipServiceMock.getScholarshipAllocations).toHaveBeenCalledWith(1)
  })

  // ─── Error catch branches ──────────────────────────────────────────

  it('finance:allocateScholarship returns error on service failure', async () => {
    scholarshipServiceMock.allocateScholarshipToStudent.mockRejectedValueOnce(new Error('Already allocated'))
    const handler = handlerMap.get('finance:allocateScholarship')!
    const result = await handler({}, {
      scholarship_id: 1, student_id: 5, term_id: 2, amount: 25000
    }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:validateScholarshipEligibility throws on service error', async () => {
    scholarshipServiceMock.validateScholarshipEligibility.mockRejectedValueOnce(new Error('Service error'))
    const handler = handlerMap.get('finance:validateScholarshipEligibility')!
    const result = await handler({}, 5, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:getActiveScholarships throws on service error', async () => {
    scholarshipServiceMock.getActiveScholarships.mockRejectedValueOnce(new Error('DB error'))
    const handler = handlerMap.get('finance:getActiveScholarships')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:getStudentScholarships throws on service error', async () => {
    scholarshipServiceMock.getStudentScholarships.mockRejectedValueOnce(new Error('Not found'))
    const handler = handlerMap.get('finance:getStudentScholarships')!
    const result = await handler({}, 5) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:getScholarshipAllocations throws on service error', async () => {
    scholarshipServiceMock.getScholarshipAllocations.mockRejectedValueOnce(new Error('Error'))
    const handler = handlerMap.get('finance:getScholarshipAllocations')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:applyScholarshipToInvoice returns error on service failure', async () => {
    scholarshipServiceMock.applyScholarshipToInvoice.mockRejectedValueOnce(new Error('Insufficient balance'))
    const handler = handlerMap.get('finance:applyScholarshipToInvoice')!
    const result = await handler({}, 1, 10, 15000) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ─── Branch coverage: legacyUserId matches actor.id (lines 280, 287) ──

  it('finance:createScholarship rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('finance:createScholarship')!
    const result = await handler({}, { name: 'Mismatch', amount: 10000, fund_id: 1 }, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(scholarshipServiceMock.createScholarship).not.toHaveBeenCalled()
  })

  it('finance:allocateScholarship rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('finance:allocateScholarship')!
    const result = await handler({}, { scholarship_id: 1, student_id: 5, term_id: 2, amount: 25000 }, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(scholarshipServiceMock.allocateScholarshipToStudent).not.toHaveBeenCalled()
  })

  it('finance:createScholarship succeeds when legacyUserId matches actor', async () => {
    scholarshipServiceMock.createScholarship.mockResolvedValueOnce({ success: true, id: 20 })
    const handler = handlerMap.get('finance:createScholarship')!
    const result = await handler({}, { name: 'Match Test', amount: 10000, fund_id: 1 }, 9) as { success: boolean }
    expect(result.success).toBe(true)
  })

  it('finance:allocateScholarship succeeds when legacyUserId matches actor', async () => {
    scholarshipServiceMock.allocateScholarshipToStudent.mockResolvedValueOnce({ success: true })
    const handler = handlerMap.get('finance:allocateScholarship')!
    const result = await handler({}, { scholarship_id: 1, student_id: 5, term_id: 2, amount: 25000 }, 9) as { success: boolean }
    expect(result.success).toBe(true)
  })

  it('finance:applyScholarshipToInvoice succeeds when legacyUserId matches actor', async () => {
    scholarshipServiceMock.applyScholarshipToInvoice.mockResolvedValueOnce({ success: true, applied_amount: 15000 })
    const handler = handlerMap.get('finance:applyScholarshipToInvoice')!
    const result = await handler({}, 1, 10, 15000, 9) as { success: boolean }
    expect(result.success).toBe(true)
    expect(scholarshipServiceMock.applyScholarshipToInvoice).toHaveBeenCalledWith(1, 10, 15000, 9)
  })
})

describe('credit IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerCreditHandlers()
  })

  it('registers all expected credit channels', () => {
    const expectedChannels = [
      'finance:allocateCredits',
      'finance:getCreditBalance',
      'finance:getCreditTransactions',
      'finance:addCredit',
    ]
    for (const channel of expectedChannels) {
      expect(handlerMap.has(channel), `missing handler for ${channel}`).toBe(true)
    }
  })

  it('finance:allocateCredits allocates credits to invoices', async () => {
    creditServiceMock.allocateCreditsToInvoices.mockResolvedValueOnce({ success: true, allocated: 5000 })
    const handler = handlerMap.get('finance:allocateCredits')!
    const result = await handler({}, 1) as { success: boolean; allocated: number }
    expect(result.success).toBe(true)
    expect(result.allocated).toBe(5000)
    expect(creditServiceMock.allocateCreditsToInvoices).toHaveBeenCalledWith(1, 9)
  })

  it('finance:allocateCredits rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('finance:allocateCredits')!
    const result = await handler({}, 1, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('finance:allocateCredits returns error on service failure', async () => {
    creditServiceMock.allocateCreditsToInvoices.mockRejectedValueOnce(new Error('No credits'))
    const handler = handlerMap.get('finance:allocateCredits')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:getCreditBalance returns student credit balance', async () => {
    creditServiceMock.getStudentCreditBalance.mockResolvedValueOnce(7500)
    const handler = handlerMap.get('finance:getCreditBalance')!
    const result = await handler({}, 1)
    expect(result).toBe(7500)
    expect(creditServiceMock.getStudentCreditBalance).toHaveBeenCalledWith(1)
  })

  it('finance:getCreditTransactions returns transaction list', async () => {
    creditServiceMock.getCreditTransactions.mockResolvedValueOnce([{ id: 1, amount: 5000, type: 'CREDIT' }])
    const handler = handlerMap.get('finance:getCreditTransactions')!
    const result = await handler({}, 1) as Array<{ id: number }>
    expect(result).toHaveLength(1)
    expect(creditServiceMock.getCreditTransactions).toHaveBeenCalledWith(1)
  })

  it('finance:addCredit adds credit to student', async () => {
    creditServiceMock.addCreditToStudent.mockResolvedValueOnce({ success: true })
    const handler = handlerMap.get('finance:addCredit')!
    const result = await handler({}, 1, 5000, 'Overpayment refund') as { success: boolean }
    expect(result.success).toBe(true)
    expect(creditServiceMock.addCreditToStudent).toHaveBeenCalledWith(1, 5000, 'Overpayment refund', 9)
  })

  it('finance:addCredit rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('finance:addCredit')!
    const result = await handler({}, 1, 5000, 'Refund', 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ─── Error catch branches ──────────────────────────────────────────

  it('finance:getCreditBalance throws on service failure', async () => {
    creditServiceMock.getStudentCreditBalance.mockRejectedValueOnce(new Error('DB offline'))
    const handler = handlerMap.get('finance:getCreditBalance')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:getCreditTransactions throws on service failure', async () => {
    creditServiceMock.getCreditTransactions.mockRejectedValueOnce(new Error('DB offline'))
    const handler = handlerMap.get('finance:getCreditTransactions')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:addCredit returns error on service failure', async () => {
    creditServiceMock.addCreditToStudent.mockRejectedValueOnce(new Error('Validation failed'))
    const handler = handlerMap.get('finance:addCredit')!
    const result = await handler({}, 1, 5000, 'Test') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ─── Branch coverage: legacyUserId matches actor.id (line 48) ──────

  it('finance:addCredit succeeds when legacyUserId matches actor', async () => {
    creditServiceMock.addCreditToStudent.mockResolvedValueOnce({ success: true })
    const handler = handlerMap.get('finance:addCredit')!
    // legacyUserId = 9 === actor.id (9) → condition false → proceeds normally
    const result = await handler({}, 1, 5000, 'Credit note', 9) as { success: boolean }
    expect(result.success).toBe(true)
    expect(creditServiceMock.addCreditToStudent).toHaveBeenCalledWith(1, 5000, 'Credit note', 9)
  })

  it('finance:allocateCredits succeeds when legacyUserId matches actor', async () => {
    creditServiceMock.allocateCreditsToInvoices.mockResolvedValueOnce({ success: true, allocated: 3000 })
    const handler = handlerMap.get('finance:allocateCredits')!
    const result = await handler({}, 1, 9) as { success: boolean }
    expect(result.success).toBe(true)
    expect(creditServiceMock.allocateCreditsToInvoices).toHaveBeenCalledWith(1, 9)
  })
})

describe('proration IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerProrationHandlers()
  })

  it('registers all expected proration channels', () => {
    const expectedChannels = [
      'finance:calculateProRatedFee',
      'finance:validateEnrollmentDate',
      'finance:generateProRatedInvoice',
      'finance:getProRationHistory',
    ]
    for (const channel of expectedChannels) {
      expect(handlerMap.has(channel), `missing handler for ${channel}`).toBe(true)
    }
  })

  it('finance:calculateProRatedFee calculates prorated amount', async () => {
    prorationServiceMock.calculateProRatedFee.mockReturnValueOnce({ prorated_amount: 7500 })
    const handler = handlerMap.get('finance:calculateProRatedFee')!
    const result = await handler({}, 10000, '2026-01-06', '2026-04-11', '2026-02-15') as { prorated_amount: number }
    expect(result.prorated_amount).toBe(7500)
    expect(prorationServiceMock.calculateProRatedFee).toHaveBeenCalledWith(10000, '2026-01-06', '2026-04-11', '2026-02-15')
  })

  it('finance:validateEnrollmentDate validates date within term', async () => {
    prorationServiceMock.validateEnrollmentDate.mockReturnValueOnce({ valid: true })
    const handler = handlerMap.get('finance:validateEnrollmentDate')!
    const result = await handler({}, 10000, '2026-01-06', '2026-04-11', '2026-02-01') as { valid: boolean }
    expect(result.valid).toBe(true)
    expect(prorationServiceMock.validateEnrollmentDate).toHaveBeenCalledWith('2026-01-06', '2026-04-11', '2026-02-01')
  })

  it('finance:generateProRatedInvoice generates invoice for student', async () => {
    prorationServiceMock.generateProRatedInvoice.mockResolvedValueOnce({ success: true, invoice_id: 42 })
    const handler = handlerMap.get('finance:generateProRatedInvoice')!
    const result = await handler({}, 1, 5, '2026-02-15') as { success: boolean; invoice_id: number }
    expect(result.success).toBe(true)
    expect(result.invoice_id).toBe(42)
    expect(prorationServiceMock.generateProRatedInvoice).toHaveBeenCalledWith(1, 5, '2026-02-15', 9)
  })

  it('finance:generateProRatedInvoice rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('finance:generateProRatedInvoice')!
    const result = await handler({}, 1, 5, '2026-02-15', 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('finance:generateProRatedInvoice returns error on service failure', async () => {
    prorationServiceMock.generateProRatedInvoice.mockRejectedValueOnce(new Error('Invalid template'))
    const handler = handlerMap.get('finance:generateProRatedInvoice')!
    const result = await handler({}, 1, 5, '2026-02-15') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:getProRationHistory returns proration history', async () => {
    prorationServiceMock.getStudentProRationHistory.mockResolvedValueOnce([{ id: 1, prorated_amount: 7500 }])
    const handler = handlerMap.get('finance:getProRationHistory')!
    const result = await handler({}, 1) as Array<{ id: number }>
    expect(result).toHaveLength(1)
    expect(prorationServiceMock.getStudentProRationHistory).toHaveBeenCalledWith(1)
  })

  // ─── Error catch branches ──────────────────────────────────────────

  it('finance:calculateProRatedFee throws on service error', async () => {
    prorationServiceMock.calculateProRatedFee.mockImplementation(() => { throw new Error('Invalid dates') })
    const handler = handlerMap.get('finance:calculateProRatedFee')!
    const result = await handler({}, 10000, '2026-01-06', '2026-04-11', '2026-02-15') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:validateEnrollmentDate throws on service error', async () => {
    prorationServiceMock.validateEnrollmentDate.mockImplementation(() => { throw new Error('Bad date') })
    const handler = handlerMap.get('finance:validateEnrollmentDate')!
    const result = await handler({}, 10000, '2026-01-06', '2026-04-11', '2026-02-15') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('finance:getProRationHistory throws on service error', async () => {
    prorationServiceMock.getStudentProRationHistory.mockRejectedValueOnce(new Error('Not found'))
    const handler = handlerMap.get('finance:getProRationHistory')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
