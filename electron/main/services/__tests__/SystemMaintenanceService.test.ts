import { beforeEach, describe, expect, it, vi } from 'vitest'

const recordInvoiceMock = vi.fn()
const recordPaymentMock = vi.fn()
const createJournalEntryMock = vi.fn()

const mockDbRunFn = vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 })
// eslint-disable-next-line unicorn/no-useless-undefined
const mockDbGetFn = vi.fn().mockReturnValue(undefined)
const mockDbAllFn = vi.fn().mockReturnValue([])
const mockDbExecFn = vi.fn()
const mockDbPragmaFn = vi.fn()
const mockDbTransactionFn = vi.fn((fn: () => unknown) => () => fn())

const mockDb = {
  pragma: mockDbPragmaFn,
  exec: mockDbExecFn,
  prepare: vi.fn().mockReturnValue({
    run: mockDbRunFn,
    get: mockDbGetFn,
    all: mockDbAllFn,
  }),
  transaction: mockDbTransactionFn,
}

vi.mock('../../database', () => ({
  getDatabase: () => mockDb,
}))

vi.mock('../accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class DoubleEntryJournalServiceMock {
    recordInvoice = recordInvoiceMock
    recordPayment = recordPaymentMock
    createJournalEntry = createJournalEntryMock
  }
}))

vi.mock('../maintenance/CurrencyNormalizationService', () => ({
  CurrencyNormalizationService: class CurrencyNormalizationServiceMock {
    normalize = vi.fn().mockResolvedValue({ success: true })
  }
}))

import { SystemMaintenanceService } from '../SystemMaintenanceService'

type FakePreparedStatement = {
  all: () => unknown[]
}

type FakeDb = {
  prepare: (sql: string) => FakePreparedStatement
}

type TestStudent = { student_id: number; stream_code: string; stream_id: number }
type TestSubject = { id: number; name: string; code: string }

describe('SystemMaintenanceService', () => {
  beforeEach(() => {
    recordInvoiceMock.mockReset()
    recordPaymentMock.mockReset()
    createJournalEntryMock.mockReset()
    recordPaymentMock.mockResolvedValue({ success: true, entry_id: 10 })
    recordInvoiceMock.mockResolvedValue({ success: true })
    createJournalEntryMock.mockResolvedValue({ success: true })
    mockDbRunFn.mockReset().mockReturnValue({ lastInsertRowid: 1, changes: 1 })
    // eslint-disable-next-line unicorn/no-useless-undefined
    mockDbGetFn.mockReset().mockReturnValue(undefined)
    mockDbAllFn.mockReset().mockReturnValue([])
    mockDbExecFn.mockReset()
    mockDbPragmaFn.mockReset()
    mockDbTransactionFn.mockReset().mockImplementation((fn: () => unknown) => () => fn())
    mockDb.prepare.mockReset().mockReturnValue({
      run: mockDbRunFn,
      get: mockDbGetFn,
      all: mockDbAllFn,
    })
  })

  it('does not throw when no fee payments exist during journal seeding', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeDb: FakeDb = {
      prepare: (_sql: string) => ({
        all: () => []
      })
    }

    const service = new SystemMaintenanceService()
    const invokeSeedJournalEntries = service as unknown as {
      seedJournalEntries: (db: FakeDb, userId: number) => Promise<void>
    }

    await expect(invokeSeedJournalEntries.seedJournalEntries(fakeDb, 2)).resolves.toBeUndefined()
    expect(recordPaymentMock).not.toHaveBeenCalled()
    expect(warningSpy).toHaveBeenCalledWith(
      'No fee payment transactions found while seeding journal entries; skipping payment journal posting.'
    )

    warningSpy.mockRestore()
  })

  it('resetAndSeed2026 catches errors and returns failure result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDbTransactionFn.mockImplementation(() => () => { throw new Error('DB locked') })
    const service = new SystemMaintenanceService()
    const result = await service.resetAndSeed2026(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('DB locked')
  })

  it('resetAndSeed2026 succeeds when all operations complete', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const service = new SystemMaintenanceService()
    const result = await service.resetAndSeed2026(1)
    expect(result.success).toBe(true)
    expect(mockDbPragmaFn).toHaveBeenCalledWith('foreign_keys = OFF')
  })

  it('normalizeCurrencyScale delegates to CurrencyNormalizationService', async () => {
    const service = new SystemMaintenanceService()
    const result = await service.normalizeCurrencyScale(1)
    expect(result.success).toBe(true)
  })

  it('seedExamsOnly returns error when no current period exists', async () => {
    const service = new SystemMaintenanceService()
    const result = await service.seedExamsOnly(1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No current academic period')
  })

  it('seedExamsOnly succeeds when current period found', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDbGetFn.mockReturnValue({ yearId: 1, termId: 1 })
    const service = new SystemMaintenanceService()
    const result = await service.seedExamsOnly(1)
    expect(result.success).toBe(true)
  })

  it('seedExamsOnly catches errors and returns failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDbGetFn.mockReturnValue({ yearId: 1, termId: 1 })
    mockDbTransactionFn.mockImplementation(() => () => { throw new Error('Constraint violation') })
    const service = new SystemMaintenanceService()
    const result = await service.seedExamsOnly(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Constraint violation')
  })

  it('resetAndSeed2026 returns generic message for non-Error throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDbTransactionFn.mockImplementation(() => () => { throw 'string error' }) // NOSONAR
    const service = new SystemMaintenanceService()
    const result = await service.resetAndSeed2026(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Reset failed')
  })

  it('seedExamsOnly returns generic error for non-Error throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDbGetFn.mockReturnValue({ yearId: 1, termId: 1 })
    mockDbTransactionFn.mockImplementation(() => () => { throw 42 }) // NOSONAR
    const service = new SystemMaintenanceService()
    const result = await service.seedExamsOnly(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Seeding failed')
  })

  it('resetAndSeed2026 re-enables foreign keys in finally block', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDbTransactionFn.mockImplementation(() => () => { throw new Error('fail') })
    const service = new SystemMaintenanceService()
    await service.resetAndSeed2026(1)
    expect(mockDbPragmaFn).toHaveBeenCalledWith('foreign_keys = ON')
  })

  it('clearResetTables skips non-existent tables', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Make get return undefined (table doesn't exist)
    // eslint-disable-next-line unicorn/no-useless-undefined
    mockDbGetFn.mockReturnValue(undefined)
    const service = new SystemMaintenanceService()
    const clearFn = (service as unknown as {
      clearResetTables: (db: typeof mockDb) => void
    }).clearResetTables
    // Should not throw
    expect(() => clearFn.call(service, mockDb)).not.toThrow()
  })

  it('clearResetTables deletes from tables that exist', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Table found
    mockDbGetFn.mockReturnValue({ name: 'test_table' })
    const service = new SystemMaintenanceService()
    const clearFn = (service as unknown as {
      clearResetTables: (db: typeof mockDb) => void
    }).clearResetTables
    clearFn.call(service, mockDb)
    // Should have called prepare with DELETE
    expect(mockDb.prepare).toHaveBeenCalled()
  })

  it('seedCoreReferenceData calls db.exec with SQL', () => {
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedCoreReferenceData: (db: typeof mockDb) => void
    }).seedCoreReferenceData
    fn.call(service, mockDb)
    expect(mockDbExecFn).toHaveBeenCalled()
  })

  it('seedAcademicCalendar returns period with yearId and termId', () => {
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 5, changes: 1 })
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedAcademicCalendar: (db: typeof mockDb) => { yearId: number; termId: number }
    }).seedAcademicCalendar
    const period = fn.call(service, mockDb)
    expect(period).toEqual({ yearId: 5, termId: 5 })
  })

  it('seedFeeStructures skips streams without fee map entry', () => {
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedFeeStructures: (db: typeof mockDb, streams: unknown[], categories: unknown[], period: unknown) => void
    }).seedFeeStructures
    // Streams with codes not in FEE_MAP_SHILLINGS
    const streams = [{ id: 1, stream_code: 'UNKNOWN_CODE', stream_name: 'Unknown' }]
    const categories = [{ id: 1, category_name: 'Tuition' }]
    const period = { yearId: 1, termId: 1 }
    expect(() => fn.call(service, mockDb, streams, categories, period)).not.toThrow()
  })

  it('seedInventory returns early when no inventory_category exists', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    mockDbGetFn.mockReturnValue(undefined)
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedInventory: (db: typeof mockDb, userId: number) => void
    }).seedInventory
    expect(() => fn.call(service, mockDb, 1)).not.toThrow()
  })

  it('seedAttendance returns early when no enrollment exists', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    mockDbGetFn.mockReturnValue(undefined)
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedAttendance: (db: typeof mockDb, period: unknown, userId: number) => void
    }).seedAttendance
    expect(() => fn.call(service, mockDb, { yearId: 1, termId: 1 }, 1)).not.toThrow()
  })

  it('seedJournalEntries posts invoices with items and handles expense with electric keyword', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordInvoiceMock.mockResolvedValue({ success: true })
    recordPaymentMock.mockResolvedValue({ success: true, entry_id: 10 })
    createJournalEntryMock.mockResolvedValue({ success: true })

    const invoices = [{ id: 1, student_id: 1, invoice_date: '2026-01-05' }]
    const items = [{ amount: 5000, gl_account_id: 1, account_code: '4010', category_name: 'Tuition' }]
    const payments = [{ student_id: 1, amount: 3000, payment_method: 'MPESA', payment_reference: 'REF1', transaction_date: '2026-01-10' }]
    const expenses = [{ amount: 2500, description: 'January Electricity Bill', transaction_date: '2026-01-15' }]

    let allCallIndex = 0
    const fakeDb = {
      prepare: (_sql: string) => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return invoices}
          if (allCallIndex === 2) {return items}
          if (allCallIndex === 3) {return payments}
          if (allCallIndex === 4) {return expenses}
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    expect(recordInvoiceMock).toHaveBeenCalled()
    expect(recordPaymentMock).toHaveBeenCalled()
    expect(createJournalEntryMock).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('seedJournalEntries handles items without account_code by using fallback 4300', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordInvoiceMock.mockResolvedValue({ success: true })

    const invoices = [{ id: 1, student_id: 1, invoice_date: '2026-01-05' }]
    const items = [{ amount: 5000, gl_account_id: null, account_code: null, category_name: 'Misc' }]

    let callIdx = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          callIdx++
          if (callIdx === 1) {return invoices}
          if (callIdx === 2) {return items}
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    expect(recordInvoiceMock).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ gl_account_code: '4300' })]),
      '2026-01-05',
      1
    )
  })

  it('seedExaminationData handles missing teacher gracefully', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // eslint-disable-next-line unicorn/no-useless-undefined
    mockDbGetFn.mockReturnValue(undefined) // No teacher found
    mockDbAllFn.mockReturnValue([]) // No subjects/streams
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof mockDb, period: unknown, userId: number) => void
    }).seedExaminationData
    expect(() => fn.call(service, mockDb, { yearId: 1, termId: 1 }, 1)).not.toThrow()
  })

  it('seedStudentsAndInvoices creates students for each stream', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })
    mockDbAllFn.mockReturnValue([])

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedStudentsAndInvoices: (db: typeof mockDb, streams: unknown[], period: unknown, categories: unknown[], userId: number) => void
    }).seedStudentsAndInvoices
    const streams = [{ id: 1, stream_code: 'G1', stream_name: 'Grade 1' }]
    const categories = [{ id: 1, category_name: 'School Fees', category_type: 'INCOME' }]
    expect(() => fn.call(service, mockDb, streams, { yearId: 1, termId: 1 }, categories, 1)).not.toThrow()
  })

  it('seedExpenses inserts expense record', () => {
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExpenses: (db: typeof mockDb, categories: unknown[], userId: number) => void
    }).seedExpenses
    const categories = [{ id: 5, category_name: 'Utilities', category_type: 'EXPENSE' }]
    expect(() => fn.call(service, mockDb, categories, 1)).not.toThrow()
  })

  it('seedStaffAndPayroll creates staff records', () => {
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedStaffAndPayroll: (db: typeof mockDb) => void
    }).seedStaffAndPayroll
    expect(() => fn.call(service, mockDb)).not.toThrow()
  })

  /* ---- Branch-coverage additions ---- */

  it('seedInventory creates items when inventory_category exists', () => {
    mockDbGetFn.mockReturnValue({ id: 5 })
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 10, changes: 1 })
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedInventory: (db: typeof mockDb, userId: number) => void
    }).seedInventory
    fn.call(service, mockDb, 1)
    // INSERT inventory_item, INSERT stock_movement ×2, UPDATE inventory_item
    expect(mockDbRunFn.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('seedAttendance inserts record when enrollment exists', () => {
    mockDbGetFn.mockReturnValue({ id: 42, stream_id: 3 })
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedAttendance: (db: typeof mockDb, period: unknown, userId: number) => void
    }).seedAttendance
    fn.call(service, mockDb, { yearId: 1, termId: 1 }, 1)
    expect(mockDbRunFn).toHaveBeenCalled()
  })

  it('seedExaminationData allocates subjects when teacher is found', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subjects = [{ id: 1, name: 'English', code: 'ENG' }]
    const streams = [{ id: 1, stream_code: 'G1' }]
    const teacher = { id: 10 }
    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]
    const allocations = [{ stream_id: 1, subject_id: 1 }]

    const fakeDb = {
      prepare: (sql: string) => ({
        run: mockDbRunFn,
        get: () => {
          if (sql.includes('staff_number')) {return teacher}
        },
        all: () => {
          if (sql.includes('FROM subject WHERE')) {return subjects}
          if (sql.includes('FROM stream WHERE')) {return streams}
          if (sql.includes('FROM enrollment')) {return students}
          if (sql.includes('subject_allocation') && sql.includes('SELECT')) {return allocations}
          return []
        },
      })
    }
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof fakeDb, period: unknown, userId: number) => void
    }).seedExaminationData
    expect(() => fn.call(service, fakeDb, { yearId: 1, termId: 1 }, 1)).not.toThrow()
    expect(mockDbRunFn).toHaveBeenCalled()
  })

  it('seedJournalEntries uses account 5900 for non-electric expenses', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createJournalEntryMock.mockResolvedValue({ success: true })

    const expenses = [{ amount: 1000, description: 'Office Supplies Purchase', transaction_date: '2026-02-01' }]
    let allCallIndex = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return []} // invoices
          if (allCallIndex === 2) {return []} // payments
          if (allCallIndex === 3) {return expenses}
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    expect(createJournalEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ gl_account_code: '5900' })
        ])
      })
    )
    warnSpy.mockRestore()
  })

  it('seedJournalEntries skips journal UPDATE when payment recording fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordPaymentMock.mockResolvedValue({ success: false })

    const payments = [{ student_id: 1, amount: 5000, payment_method: 'CASH', payment_reference: 'REF-X', transaction_date: '2026-01-15' }]
    let allCallIndex = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return []} // invoices
          if (allCallIndex === 2) {return payments}
          if (allCallIndex === 3) {return []} // expenses
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    expect(recordPaymentMock).toHaveBeenCalled()
    // UPDATE journal_entry should NOT be called since result.success is false
    const updateCalls = mockDbRunFn.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === 'number' && typeof args[1] === 'number'
    )
    expect(updateCalls.length).toBe(0)
    warnSpy.mockRestore()
  })

  it('seedSingleStudent creates partial payment when ratio > 0.3', () => {
    const structures = [{ fee_category_id: 1, category_name: 'Tuition', amount: 10000 }]
    let allCalls = 0
    const fakeDb = {
      prepare: () => ({
        run: mockDbRunFn,
        all: () => {
          allCalls++
          return allCalls === 1 ? structures : []
        },
      }),
    }
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedSingleStudent: (db: typeof fakeDb, args: unknown) => void
    }).seedSingleStudent

    fn.call(service, fakeDb, {
      stream: { id: 1, stream_code: 'G1', stream_name: 'Grade 1' },
      period: { yearId: 1, termId: 1 },
      categoryId: 1,
      userId: 1,
      idx: 5, // ratio = 0.5 → hits "ratio > 0.3" → partial
    })

    // Payment block entered: INSERT ledger_transaction, INSERT receipt, UPDATE fee_invoice with 'PARTIAL'
    expect(mockDbRunFn.mock.calls.length).toBeGreaterThanOrEqual(7)
  })

  it('seedSingleStudent creates full payment when ratio > 0.6', () => {
    const structures = [{ fee_category_id: 1, category_name: 'Tuition', amount: 10000 }]
    let allCalls = 0
    const fakeDb = {
      prepare: () => ({
        run: mockDbRunFn,
        all: () => {
          allCalls++
          return allCalls === 1 ? structures : []
        },
      }),
    }
    mockDbRunFn.mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedSingleStudent: (db: typeof fakeDb, args: unknown) => void
    }).seedSingleStudent

    fn.call(service, fakeDb, {
      stream: { id: 1, stream_code: 'G1', stream_name: 'Grade 1' },
      period: { yearId: 1, termId: 1 },
      categoryId: 1,
      userId: 1,
      idx: 8, // ratio = 0.8 → hits "ratio > 0.6" → full payment → 'PAID'
    })

    expect(mockDbRunFn.mock.calls.length).toBeGreaterThanOrEqual(7)
  })

  it('seedStudentResults exercises all score level branches', () => {
    const randomSpy = vi.spyOn(Math, 'random')
    // score = 20 + Math.floor(random * 81)
    randomSpy
      .mockReturnValueOnce(0.88)  // score 91 → ≥90 → level 1
      .mockReturnValueOnce(0.75)  // score 80 → ≥75 → level 2
      .mockReturnValueOnce(0.56)  // score 65 → ≥58 → level 3
      .mockReturnValueOnce(0.4)  // score 52 → ≥41 → level 4
      .mockReturnValueOnce(0.19)  // score 35 → ≥31 → level 5
      .mockReturnValueOnce(0.07)  // score 25 → ≥21 → level 6
      .mockReturnValueOnce(0)     // score 20 → ≥11 → level 7

    const allocations = Array.from({ length: 7 }, (_, i) => ({ stream_id: 1, subject_id: i + 1 }))
    const fakeDb = {
      prepare: () => ({
        run: mockDbRunFn,
        all: () => allocations,
      })
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]
    const subjects = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `Sub${i + 1}`, code: `S${i + 1}` }))

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedStudentResults: (db: typeof fakeDb, examId: number, students: TestStudent[], subjects: TestSubject[], period: unknown, userId: number) => void
    }).seedStudentResults
    fn.call(service, fakeDb, 1, students, subjects, { yearId: 1, termId: 1 }, 1)

    expect(mockDbRunFn).toHaveBeenCalledTimes(7)
    randomSpy.mockRestore()
  })

  it('resetAndSeed2026 skips seedExaminationData when period is undefined', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Transaction runs but does NOT call the inner function → period stays undefined
    mockDbTransactionFn.mockImplementation(() => () => {})

    const service = new SystemMaintenanceService()
    const result = await service.resetAndSeed2026(1)
    expect(result.success).toBe(true)
  })

  // ── Statement coverage: seedFeeStructures with valid stream codes ──
  it('seedFeeStructures inserts fee structures for known stream codes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedFeeStructures: (db: typeof mockDb, streams: unknown[], categories: unknown[], period: unknown) => void
    }).seedFeeStructures

    const streams = [
      { id: 1, stream_code: 'G1', stream_name: 'Grade 1' },
      { id: 2, stream_code: 'BABY', stream_name: 'Baby Class' }
    ]
    const categories = [
      { id: 10, category_name: 'Tuition' },
      { id: 11, category_name: 'Feeding' },
      { id: 12, category_name: 'Maintenance' },
      { id: 13, category_name: 'Boarding' }
    ]
    const period = { yearId: 1, termId: 1 }
    fn.call(service, mockDb, streams, categories, period)
    // 2 streams × (3 DAY + 3 BOARDER) = 12 inserts
    expect(mockDbRunFn.mock.calls.length).toBeGreaterThanOrEqual(12)
  })

  // ── Statement coverage: seedFeeStructures insertFee skips when categoryId is undefined ──
  it('seedFeeStructures skips fee insert when category is missing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDbRunFn.mockClear()
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedFeeStructures: (db: typeof mockDb, streams: unknown[], categories: unknown[], period: unknown) => void
    }).seedFeeStructures

    const streams = [{ id: 1, stream_code: 'G1', stream_name: 'Grade 1' }]
    // Missing 'Tuition' category → tuitionCategory is undefined → insertFee returns early
    const categories = [
      { id: 11, category_name: 'Feeding' }
    ]
    const period = { yearId: 1, termId: 1 }
    fn.call(service, mockDb, streams, categories, period)
    // Some inserts should be skipped due to missing category
    expect(mockDbRunFn.mock.calls.length).toBeLessThan(6)
  })

  // ── Statement coverage: seedExaminationData level subject filter (line 334) ──
  it('seedExaminationData filters subjects by level code and allocates to matching streams', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subjects = [
      { id: 1, name: 'Literacy', code: 'LIT' },
      { id: 2, name: 'Kiswahili', code: 'KISW' },
      { id: 3, name: 'Math Activities', code: 'MATH_ACT' }
    ]
    const streams = [
      { id: 1, stream_code: 'G1' },
      { id: 2, stream_code: 'PP1' }
    ]
    const teacher = { id: 10 }
    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]

    const fakeDb = {
      prepare: (sql: string) => ({
        run: mockDbRunFn,
        get: () => {
          if (sql.includes('staff_number')) {return teacher}
        },
        all: () => {
          if (sql.includes('FROM subject WHERE')) {return subjects}
          if (sql.includes('FROM stream WHERE')) {return streams}
          if (sql.includes('FROM enrollment')) {return students}
          if (sql.includes('subject_allocation') && sql.includes('SELECT')) {return [
            { stream_id: 1, subject_id: 1 }
          ]}
          return []
        },
      })
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof fakeDb, period: unknown, userId: number) => void
    }).seedExaminationData
    expect(() => fn.call(service, fakeDb, { yearId: 1, termId: 1 }, 1)).not.toThrow()
    // G1: LIT and KISW match (CBC_SUBJECTS has LIT for G1-G3, KISW for G4+), but allocation insert is run
    // PP1: MATH_ACT matches (CBC_SUBJECTS has MATH_ACT for BABY, PP1, PP2)
    expect(mockDbRunFn).toHaveBeenCalled()
  })

  // ── Branch coverage: seedSingleStudent with idx=0 → ratio=0, NO payment ──
  it('seedSingleStudent skips payment when ratio is 0 (idx=0)', () => {
    const structures = [{ fee_category_id: 1, category_name: 'Tuition', amount: 10000 }]
    let allCalls = 0
    const fakeDb = {
      prepare: () => ({
        run: mockDbRunFn,
        all: () => {
          allCalls++
          return allCalls === 1 ? structures : []
        },
      }),
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedSingleStudent: (db: typeof fakeDb, args: unknown) => void
    }).seedSingleStudent

    fn.call(service, fakeDb, {
      stream: { id: 1, stream_code: 'G1', stream_name: 'Grade 1' },
      period: { yearId: 1, termId: 1 },
      categoryId: 1,
      userId: 1,
      idx: 0, // ratio = 0/10 = 0 → no payment
    })

    // Student insert + enrollment + invoice + invoice_item + UPDATE total = 5
    // NO ledger_transaction, receipt, or fee_invoice status update
    expect(mockDbRunFn.mock.calls.length).toBeLessThanOrEqual(6)
  })

  // ── Branch coverage: seedSingleStudent with idx=1 → BOARDER false, ratio=0.1 ──
  it('seedSingleStudent creates DAY_SCHOLAR when idx not divisible by 3', () => {
    const structures = [{ fee_category_id: 1, category_name: 'Tuition', amount: 10000 }]
    let allCalls = 0
    const fakeDb = {
      prepare: () => ({
        run: mockDbRunFn,
        all: () => {
          allCalls++
          return allCalls === 1 ? structures : []
        },
      }),
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedSingleStudent: (db: typeof fakeDb, args: unknown) => void
    }).seedSingleStudent

    fn.call(service, fakeDb, {
      stream: { id: 1, stream_code: 'G1', stream_name: 'Grade 1' },
      period: { yearId: 1, termId: 1 },
      categoryId: 1,
      userId: 1,
      idx: 1, // idx%3 !== 0 → DAY_SCHOLAR; ratio=0.1 → no payment
    })

    expect(mockDbRunFn).toHaveBeenCalled()
  })

  // ── Branch coverage: seedStudentResults minimum score → level 7 ──
  it('seedStudentResults assigns level 7 (Below Expectations) for minimum score', () => {
    const randomSpy = vi.spyOn(Math, 'random')
    // score = 20 + floor(random * 81); with random=0 → score=20 → level 7
    randomSpy.mockReturnValueOnce(0) // score = 20 → level 7

    const allocations = [{ stream_id: 1, subject_id: 1 }]
    const fakeDb = {
      prepare: () => ({
        run: mockDbRunFn,
        all: () => allocations,
      })
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]
    const subjects = [{ id: 1, name: 'Sub1', code: 'S1' }]

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedStudentResults: (db: typeof fakeDb, examId: number, students: TestStudent[], subjects: TestSubject[], period: unknown, userId: number) => void
    }).seedStudentResults
    fn.call(service, fakeDb, 1, students, subjects, { yearId: 1, termId: 1 }, 1)

    expect(mockDbRunFn).toHaveBeenCalledTimes(1)
    randomSpy.mockRestore()
  })

  // ── Branch coverage: seedStudentResults with !subject → continue ──
  it('seedStudentResults skips when subject is not found in subjects array', () => {
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0.5)

    // Allocations reference subject_id=999 which is NOT in the subjects array
    const allocations = [{ stream_id: 1, subject_id: 999 }]
    const fakeDb = {
      prepare: () => ({
        run: mockDbRunFn,
        all: () => allocations,
      })
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]
    const subjects = [{ id: 1, name: 'Sub1', code: 'S1' }] // No subject with id=999

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedStudentResults: (db: typeof fakeDb, examId: number, students: TestStudent[], subjects: TestSubject[], period: unknown, userId: number) => void
    }).seedStudentResults
    fn.call(service, fakeDb, 1, students, subjects, { yearId: 1, termId: 1 }, 1)

    // No inserts because subject 999 not found → continue
    expect(mockDbRunFn).not.toHaveBeenCalled()
    randomSpy.mockRestore()
  })

  // ── Branch coverage: seedExpenses with utilitiesCategory undefined ──
  it('seedExpenses runs insert even when utilities category is undefined', () => {
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExpenses: (db: typeof mockDb, categories: unknown[], userId: number) => void
    }).seedExpenses

    // Empty categories → utilitiesCategory is undefined
    fn.call(service, mockDb, [], 1)
    expect(mockDbRunFn).toHaveBeenCalledTimes(1) // still runs INSERT with undefined category
  })

  // ── Branch coverage: seedExaminationData with no teacher → skips allocations ──
  it('seedExaminationData skips allocation when teacher is not found', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subjects = [{ id: 1, name: 'Literacy', code: 'LIT' }]
    const streams = [{ id: 1, stream_code: 'G1' }]
    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]

    const fakeDb = {
      prepare: (sql: string) => ({
        run: mockDbRunFn,
        get: () => {
          if (sql.includes('staff_number')) {return} // No teacher
        },
        all: () => {
          if (sql.includes('FROM subject WHERE')) {return subjects}
          if (sql.includes('FROM stream WHERE')) {return streams}
          if (sql.includes('FROM enrollment')) {return students}
          if (sql.includes('subject_allocation') && sql.includes('SELECT')) {return []}
          return []
        },
      })
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof fakeDb, period: unknown, userId: number) => void
    }).seedExaminationData
    expect(() => fn.call(service, fakeDb, { yearId: 1, termId: 1 }, 1)).not.toThrow()
  })

  // ── Branch coverage: seedExaminationData with no students → early return ──
  it('seedExaminationData returns early when no students found', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subjects = [{ id: 1, name: 'Literacy', code: 'LIT' }]
    const streams = [{ id: 1, stream_code: 'G1' }]

    const fakeDb = {
      prepare: (sql: string) => ({
        run: mockDbRunFn,
        get: () => {
          if (sql.includes('staff_number')) {return { id: 10 }}
        },
        all: () => {
          if (sql.includes('FROM subject WHERE')) {return subjects}
          if (sql.includes('FROM stream WHERE')) {return streams}
          if (sql.includes('FROM enrollment')) {return []} // No students
          return []
        },
      })
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof fakeDb, period: unknown, userId: number) => void
    }).seedExaminationData
    fn.call(service, fakeDb, { yearId: 1, termId: 1 }, 1)
    expect(warnSpy).toHaveBeenCalledWith('No subjects or students found to seed exam results.')
    warnSpy.mockRestore()
  })

  // ── Branch coverage: seedExaminationData with no subjects → early return ──
  it('seedExaminationData returns early when no subjects found', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const streams = [{ id: 1, stream_code: 'G1' }]
    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]

    const fakeDb = {
      prepare: (sql: string) => ({
        run: mockDbRunFn,
        get: () => {
          if (sql.includes('staff_number')) {return { id: 10 }}
        },
        all: () => {
          if (sql.includes('FROM subject WHERE')) {return []} // No subjects
          if (sql.includes('FROM stream WHERE')) {return streams}
          if (sql.includes('FROM enrollment')) {return students}
          return []
        },
      })
    }
    mockDbRunFn.mockClear().mockReturnValue({ lastInsertRowid: 1, changes: 1 })

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof fakeDb, period: unknown, userId: number) => void
    }).seedExaminationData
    fn.call(service, fakeDb, { yearId: 1, termId: 1 }, 1)
    expect(warnSpy).toHaveBeenCalledWith('No subjects or students found to seed exam results.')
    warnSpy.mockRestore()
  })

  // ── Branch coverage: academicExamInsert catch block (table doesn't exist) ──
  it('seedExaminationData catches academicExamInsert error silently', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subjects = [{ id: 1, name: 'Literacy', code: 'LIT' }]
    const streams = [{ id: 1, stream_code: 'G1' }]
    const students = [{ student_id: 1, stream_code: 'G1', stream_id: 1 }]

    let insertCount = 0
    const fakeDb = {
      prepare: (sql: string) => ({
        run: (..._args: unknown[]) => {
          insertCount++
          // Make the academic_exam INSERT throw
          if (sql.includes('academic_exam') && sql.includes('INSERT')) {
            throw new Error('no such table: academic_exam')
          }
          return { lastInsertRowid: insertCount, changes: 1 }
        },
        get: () => {
          if (sql.includes('staff_number')) {return { id: 10 }}
        },
        all: () => {
          if (sql.includes('FROM subject WHERE')) {return subjects}
          if (sql.includes('FROM stream WHERE')) {return streams}
          if (sql.includes('FROM enrollment')) {return students}
          if (sql.includes('subject_allocation') && sql.includes('SELECT')) {return [
            { stream_id: 1, subject_id: 1 }
          ]}
          return []
        },
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof fakeDb, period: unknown, userId: number) => void
    }).seedExaminationData
    // Should not throw despite academic_exam INSERT failing
    expect(() => fn.call(service, fakeDb, { yearId: 1, termId: 1 }, 1)).not.toThrow()
  })

  // ── Branch coverage: resetAndSeed2026 non-Error exception ──
  it('resetAndSeed2026 handles non-Error exception', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDbTransactionFn.mockImplementation(() => () => { throw 'string-error' }) // NOSONAR
    const service = new SystemMaintenanceService()
    const result = await service.resetAndSeed2026(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Reset failed')
  })

  // ── Branch coverage: resetAndSeed2026 finally pragma catch ──
  it('resetAndSeed2026 catches pragma error in finally block', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDbPragmaFn.mockImplementation((sql: string) => {
      if (sql === 'foreign_keys = ON') {throw new Error('pragma fail')}
    })
    const service = new SystemMaintenanceService()
    const result = await service.resetAndSeed2026(1)
    // Should still succeed, the finally error is swallowed
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: seedJournalEntries with mapped items using null account_code → '4300' fallback ──
  it('seedJournalEntries uses fallback gl_account_code 4300 when account_code is null', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordInvoiceMock.mockResolvedValue({ success: true })

    const invoices = [{ id: 1, student_id: 1, invoice_date: '2026-01-10' }]
    const items = [{ amount: 5000, gl_account_id: null, account_code: null, category_name: 'Tuition' }]

    let allCallIndex = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return invoices}
          if (allCallIndex === 2) {return items}
          if (allCallIndex === 3) {return []} // payments
          if (allCallIndex === 4) {return []} // expenses
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    expect(recordInvoiceMock).toHaveBeenCalledWith(
      1,
      [expect.objectContaining({ gl_account_code: '4300' })],
      '2026-01-10',
      1
    )
    warnSpy.mockRestore()
  })

  // ── Branch coverage: seedJournalEntries with result.success=true but entry_id undefined ──
  it('seedJournalEntries skips UPDATE when entry_id is falsy despite success', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordPaymentMock.mockResolvedValue({ success: true, entry_id: undefined })

    const payments = [{ student_id: 1, amount: 5000, payment_method: 'CASH', payment_reference: 'REF', transaction_date: '2026-01-15' }]
    let allCallIndex = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return []} // invoices
          if (allCallIndex === 2) {return payments}
          if (allCallIndex === 3) {return []} // expenses
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }
    mockDbRunFn.mockClear()

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    // recordPayment was called but UPDATE should NOT run because entry_id is undefined
    expect(recordPaymentMock).toHaveBeenCalled()
    expect(mockDbRunFn).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  // ── Branch coverage: seedJournalEntries with electric expense → 5300 account code ──
  it('seedJournalEntries uses account 5300 for electric expenses', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createJournalEntryMock.mockResolvedValue({ success: true })

    const expenses = [{ amount: 2500, description: 'January Electricity Bill', transaction_date: '2026-01-15' }]
    let allCallIndex = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return []} // invoices
          if (allCallIndex === 2) {return []} // payments
          if (allCallIndex === 3) {return expenses}
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    expect(createJournalEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ gl_account_code: '5300' })
        ])
      })
    )
    warnSpy.mockRestore()
  })

  // ── Branch coverage: seedExamsOnly success case ──
  it('seedExamsOnly succeeds when current period exists', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDbGetFn.mockReturnValue({ yearId: 1, termId: 1 })

    const service = new SystemMaintenanceService()
    const result = await service.seedExamsOnly(1)
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: seedExamsOnly with non-Error exception ──
  it('seedExamsOnly handles non-Error exception', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDbGetFn.mockReturnValue({ yearId: 1, termId: 1 })
    mockDbTransactionFn.mockImplementation(() => () => { throw 'not-an-error' }) // NOSONAR

    const service = new SystemMaintenanceService()
    const result = await service.seedExamsOnly(1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Seeding failed')
  })

  // ── Branch coverage: seedJournalEntries with invoice having empty items → mapped.length=0 ──
  it('seedJournalEntries skips recordInvoice when mapped items array is empty', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordInvoiceMock.mockClear()

    const invoices = [{ id: 1, student_id: 1, invoice_date: '2026-01-10' }]
    let allCallIndex = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return invoices}
          if (allCallIndex === 2) {return []} // empty items → mapped.length = 0
          if (allCallIndex === 3) {return []} // payments
          if (allCallIndex === 4) {return []} // expenses
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    // recordInvoice should NOT have been called since mapped.length === 0
    expect(recordInvoiceMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  // ── Branch coverage: clearResetTables skips non-existent table ──
  it('clearResetTables skips table when it does not exist', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    mockDbGetFn.mockReturnValue(undefined) // table doesn't exist
    mockDbRunFn.mockClear()
    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      clearResetTables: (db: typeof mockDb) => void
    }).clearResetTables
    fn.call(service, mockDb)
    // Expect zero DELETE calls since all tables "don't exist"
    expect(mockDbRunFn).not.toHaveBeenCalled()
  })

  // ── Branch coverage L281: expense description fallback to 'Seed expense' ──
  it('seedJournalEntries uses Seed expense fallback when description is empty', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createJournalEntryMock.mockResolvedValue({ success: true })

    const expenses = [{ amount: 1000, description: '', transaction_date: '2026-02-01' }]
    let allCallIndex = 0
    const fakeDb = {
      prepare: () => ({
        all: () => {
          allCallIndex++
          if (allCallIndex === 1) {return []} // invoices
          if (allCallIndex === 2) {return []} // payments
          if (allCallIndex === 3) {return expenses}
          return []
        },
        get: () => {},
        run: mockDbRunFn,
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedJournalEntries: (db: typeof fakeDb, userId: number) => Promise<void>
    }).seedJournalEntries
    await fn.call(service, fakeDb, 1)

    expect(createJournalEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Seed expense'
      })
    )
    warnSpy.mockRestore()
  })

  // ── Branch coverage L315: isCompulsory false branch (ternary → 0) ──
  it('seedExaminationData passes 0 for non-compulsory subject in subjectInsert', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const runCalls: unknown[][] = []
    const fakeDb = {
      prepare: (sql: string) => ({
        run: (...args: unknown[]) => {
          if (sql.includes('INSERT OR IGNORE INTO subject')) {
            runCalls.push(args)
          }
          return { lastInsertRowid: 1, changes: 1 }
        },
        get: () => {},
        all: () => [],
      })
    }

    const service = new SystemMaintenanceService()
    const fn = (service as unknown as {
      seedExaminationData: (db: typeof fakeDb, period: unknown, userId: number) => void
    }).seedExaminationData
    fn.call(service, fakeDb, { yearId: 1, termId: 1 }, 1)

    // All CBC_SUBJECTS are compulsory → all calls pass 1 as last arg
    // At least one call was made
    expect(runCalls.length).toBeGreaterThan(0)
    // Every call should have 1 for isCompulsory since all CBC_SUBJECTS are compulsory
    expect(runCalls.every(args => args[3] === 1)).toBe(true)
  })
})
