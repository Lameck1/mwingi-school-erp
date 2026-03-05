/**
 * Tests for electron/main/ipc/finance/finance-handler-utils.ts
 *
 * Covers exported utility functions: getTodayDate, getErrorMessage,
 * createGetOrCreateCategoryId, generateBatchInvoices, generateSingleStudentInvoice.
 * Includes positive paths, negative paths, and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  getTodayDate,
  getErrorMessage,
  createGetOrCreateCategoryId,
  generateBatchInvoices,
  generateSingleStudentInvoice,
  UNKNOWN_ERROR_MESSAGE,
  UNKNOWN_ERROR_OCCURRED_MESSAGE,
  type FinanceContext,
} from '../finance-handler-utils'

// ---------------------------------------------------------------------------
// Mock DoubleEntryJournalService — used internally by the functions
// ---------------------------------------------------------------------------
const mockRecordInvoiceSync = vi.fn().mockReturnValue({ success: true })

vi.mock('../../../services/accounting/DoubleEntryJournalService', () => {
  return {
    DoubleEntryJournalService: class MockDoubleEntryJournalService {
      recordInvoiceSync = mockRecordInvoiceSync
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers for creating mock database
// ---------------------------------------------------------------------------
function createMockDb() {
  const stmts: Record<string, { get: ReturnType<typeof vi.fn>; all: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> }> = {}

  const db = {
    prepare: vi.fn((sql: string) => {
      if (!stmts[sql]) {
        stmts[sql] = { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 100 }) }
      }
      return stmts[sql]
    }),
    transaction: vi.fn((fn: () => void) => fn),
    _stmts: stmts,
  }
  return db
}

function createMockContext(db: ReturnType<typeof createMockDb>): FinanceContext {
  return {
    db: db as unknown as FinanceContext['db'],
    exemptionService: {
      getStudentExemptions: vi.fn().mockReturnValue([]),
    } as unknown as FinanceContext['exemptionService'],
    paymentService: {} as unknown as FinanceContext['paymentService'],
    getOrCreateCategoryId: vi.fn().mockReturnValue(1),
  }
}

// ---------------------------------------------------------------------------
// getTodayDate
// ---------------------------------------------------------------------------
describe('getTodayDate', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = getTodayDate()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns today\'s date', () => {
    const expected = new Date().toISOString().slice(0, 10)
    expect(getTodayDate()).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// getErrorMessage (re-exported)
// ---------------------------------------------------------------------------
describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('bad'), 'fallback')).toBe('bad')
  })

  it('returns the string directly if thrown as string', () => {
    expect(getErrorMessage('raw string error', 'fallback')).toBe('raw string error')
  })

  it('returns fallback for non-Error/non-string values', () => {
    expect(getErrorMessage(42, 'fallback')).toBe('fallback')
    expect(getErrorMessage(null, 'fallback')).toBe('fallback')
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback')
    expect(getErrorMessage({}, 'fallback')).toBe('fallback')
  })
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('exported constants', () => {
  it('UNKNOWN_ERROR_MESSAGE is defined', () => {
    expect(UNKNOWN_ERROR_MESSAGE).toBe('Unknown error')
  })

  it('UNKNOWN_ERROR_OCCURRED_MESSAGE is defined', () => {
    expect(UNKNOWN_ERROR_OCCURRED_MESSAGE).toBe('Unknown error occurred')
  })
})

// ---------------------------------------------------------------------------
// createGetOrCreateCategoryId
// ---------------------------------------------------------------------------
describe('createGetOrCreateCategoryId', () => {
  it('returns existing category id if found', () => {
    const db = createMockDb()
    const fn = createGetOrCreateCategoryId(db as unknown as FinanceContext['db'])

    // Mock the SELECT returning existing row
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM transaction_category')) {
        return { get: vi.fn().mockReturnValue({ id: 42 }), all: vi.fn(), run: vi.fn() }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 99 }) }
    })

    expect(fn('Tuition')).toBe(42)
  })

  it('inserts and returns new id if not found', () => {
    const db = createMockDb()
    const fn = createGetOrCreateCategoryId(db as unknown as FinanceContext['db'])

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM transaction_category')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 77 }) }
    })

    expect(fn('NewCategory')).toBe(77)
  })

  it('uses INCOME as default type', () => {
    const db = createMockDb()
    const fn = createGetOrCreateCategoryId(db as unknown as FinanceContext['db'])

    const insertRun = vi.fn().mockReturnValue({ lastInsertRowid: 10 })
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: insertRun }
    })

    fn('Test')
    expect(insertRun).toHaveBeenCalledWith('Test', 'INCOME')
  })

  it('respects explicit type parameter', () => {
    const db = createMockDb()
    const fn = createGetOrCreateCategoryId(db as unknown as FinanceContext['db'])

    const insertRun = vi.fn().mockReturnValue({ lastInsertRowid: 10 })
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: insertRun }
    })

    fn('Expense Item', 'EXPENSE')
    expect(insertRun).toHaveBeenCalledWith('Expense Item', 'EXPENSE')
  })
})

// ---------------------------------------------------------------------------
// generateBatchInvoices
// ---------------------------------------------------------------------------
describe('generateBatchInvoices', () => {
  let db: ReturnType<typeof createMockDb>
  let context: FinanceContext

  beforeEach(() => {
    db = createMockDb()
    context = createMockContext(db)
  })

  it('returns error when no fee structure exists', () => {
    // fetchFeeStructure returns empty
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) {
        return { get: vi.fn(), all: vi.fn().mockReturnValue([]), run: vi.fn() }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No fee structure defined')
  })

  it('returns error when no active enrollments exist', () => {
    let callCount = 0
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) {
        return {
          get: vi.fn(),
          all: vi.fn().mockReturnValue([
            { id: 1, academic_year_id: 1, term_id: 1, stream_id: 1, student_type: 'DAY_SCHOLAR', fee_category_id: 1, amount: 5000, fee_items: '[]', total_amount: 5000, created_at: '2024-01-01' },
          ]),
          run: vi.fn(),
        }
      }
      if (sql.includes('enrollment')) {
        return { get: vi.fn(), all: vi.fn().mockReturnValue([]), run: vi.fn() }
      }
      callCount++
      return { get: vi.fn(), all: vi.fn().mockReturnValue([]), run: vi.fn().mockReturnValue({ lastInsertRowid: callCount }) }
    })

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No active enrollments')
  })

  it('generates invoices successfully for enrolled students', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY_SCHOLAR', fee_category_id: 1, amount: 10000, fee_items: '[]', total_amount: 10000, created_at: '2024-01-01' },
    ]
    const enrollments = [
      { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY_SCHOLAR', class_id: 1, status: 'ACTIVE', first_name: 'John', last_name: 'Doe' },
    ]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(enrollments), run: vi.fn() } }
      if (sql.includes('SELECT id') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 50 }) }
    })

    // Make transaction just execute the callback
    db.transaction.mockImplementation((fn: () => void) => fn)

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
  })

  it('skips students with existing invoices', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 5000, fee_items: '[]', total_amount: 5000, created_at: '2024-01-01' },
    ]
    const enrollments = [
      { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'A', last_name: 'B' },
    ]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(enrollments), run: vi.fn() } }
      // Already has an invoice
      if (sql.includes('SELECT id') && sql.includes('fee_invoice')) { return { get: vi.fn().mockReturnValue({ id: 99 }), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    db.transaction.mockImplementation((fn: () => void) => fn)

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.count).toBe(0)
  })

  it('catches transaction errors and returns failure', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 5000, fee_items: '[]', total_amount: 5000, created_at: '2024-01-01' },
    ]
    const enrollments = [
      { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'A', last_name: 'B' },
    ]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(enrollments), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    db.transaction.mockImplementation(() => {
      return () => { throw new Error('DB constraint violation') }
    })

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toBe('DB constraint violation')
  })

  it('posts journal entry when fee has gl_account_code', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 7000, fee_items: '[]', total_amount: 7000, created_at: '2024-01-01', gl_account_code: '4100', gl_account_name: 'Tuition' },
    ]
    const enrollments = [
      { id: 1, student_id: 200, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Test', last_name: 'Student' },
    ]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(enrollments), run: vi.fn() } }
      if (sql.includes('SELECT id') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 60 }) }
    })

    db.transaction.mockImplementation((fn: () => void) => fn)

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
  })

  it('skips student when no fees match their stream/type', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 5000, fee_items: '[]', total_amount: 5000, created_at: '2024-01-01' },
    ]
    const enrollments = [
      { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 99, student_type: 'BOARDER', class_id: 1, status: 'ACTIVE', first_name: 'A', last_name: 'B' },
    ]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(enrollments), run: vi.fn() } }
      if (sql.includes('SELECT id') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    db.transaction.mockImplementation((fn: () => void) => fn)

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.count).toBe(0)
  })

  it('returns error when journal posting fails during batch', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 7000, fee_items: '[]', total_amount: 7000, created_at: '2024-01-01', gl_account_code: '4100', gl_account_name: 'Tuition' },
    ]
    const enrollments = [
      { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'A', last_name: 'B' },
    ]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(enrollments), run: vi.fn() } }
      if (sql.includes('SELECT id') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 60 }) }
    })

    // Make transaction throw (simulating journal failure rollback)
    db.transaction.mockImplementation(() => {
      return () => { throw new Error('Accounting Error: Journal entry failed') }
    })

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Accounting Error')
  })
})

// ---------------------------------------------------------------------------
// generateSingleStudentInvoice
// ---------------------------------------------------------------------------
describe('generateSingleStudentInvoice', () => {
  let db: ReturnType<typeof createMockDb>
  let context: FinanceContext

  beforeEach(() => {
    db = createMockDb()
    context = createMockContext(db)
  })

  it('returns error for invalid userId (zero)', () => {
    const result = generateSingleStudentInvoice(context, 1, 1, 1, 0)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid authenticated user context')
  })

  it('returns error for invalid userId (negative)', () => {
    const result = generateSingleStudentInvoice(context, 1, 1, 1, -5)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid authenticated user context')
  })

  it('returns error for invalid userId (float)', () => {
    const result = generateSingleStudentInvoice(context, 1, 1, 1, 1.5)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid authenticated user context')
  })

  it('returns error when no fee structure exists', () => {
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue([]), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No fee structure')
  })

  it('returns existing invoice number if invoice exists', () => {
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) {
        return {
          get: vi.fn(),
          all: vi.fn().mockReturnValue([{ id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 5000, fee_items: '[]', total_amount: 5000, created_at: '2024-01-01' }]),
          run: vi.fn(),
        }
      }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn().mockReturnValue({ id: 10, invoice_number: 'INV-EXISTING' }), all: vi.fn(), run: vi.fn() }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toBe('INV-EXISTING')
  })

  it('returns error when no enrollment found', () => {
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) {
        return {
          get: vi.fn(),
          all: vi.fn().mockReturnValue([{ id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 5000 }]),
          run: vi.fn(),
        }
      }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      if (sql.includes('enrollment')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No active enrollment')
  })

  it('returns error when no fees match student stream/type', () => {
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('fee_structure')) {
        return {
          get: vi.fn(),
          // Fee structure for stream_id=10 DAY, but student is stream_id=20
          all: vi.fn().mockReturnValue([
            { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 5000 },
          ]),
          run: vi.fn(),
        }
      }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      if (sql.includes('enrollment')) {
        return {
          get: vi.fn().mockReturnValue({ id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 20, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'A', last_name: 'B' }),
          all: vi.fn(),
          run: vi.fn(),
        }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain("No fee structure defined for this student")
  })

  it('generates invoice successfully when all conditions pass', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 8000, fee_items: '[]', total_amount: 8000, created_at: '2024-01-01' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Jane', last_name: 'Doe' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 200 }) }
    })

    db.transaction.mockImplementation((fn: () => void) => fn)

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toBeDefined()
    expect(result.invoiceNumber).toMatch(/^INV-/)
  })

  it('handles concurrent insert (unique constraint) gracefully', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 8000 },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Jane', last_name: 'Doe' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      // Concurrent insert: second time looking up invoice_number
      if (sql.includes('SELECT invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn().mockReturnValue({ invoice_number: 'INV-CONCURRENT' }), all: vi.fn(), run: vi.fn() }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 200 }) }
    })

    db.transaction.mockImplementation(() => {
      return () => { throw new Error('UNIQUE constraint failed: idx_fee_invoice_active_unique') }
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toBe('INV-CONCURRENT')
  })

  it('applies specific fee exemption to reduce invoice amount', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 5, amount: 10000, fee_items: '[]', total_amount: 10000, created_at: '2024-01-01' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Jane', last_name: 'Doe' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 300 }) }
    })

    // Return a specific exemption matching fee_category_id=5
    context.exemptionService.getStudentExemptions = vi.fn().mockReturnValue([
      { id: 10, fee_category_id: 5, status: 'ACTIVE', exemption_percentage: 50 }
    ])

    db.transaction.mockImplementation((fn: () => void) => fn)

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(true)
  })

  it('applies blanket exemption when no specific exemption matches', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 5, amount: 10000, fee_items: '[]', total_amount: 10000, created_at: '2024-01-01' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Jane', last_name: 'Doe' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 300 }) }
    })

    // Return a blanket exemption (fee_category_id is null)
    context.exemptionService.getStudentExemptions = vi.fn().mockReturnValue([
      { id: 20, fee_category_id: null, status: 'ACTIVE', exemption_percentage: 25 }
    ])

    db.transaction.mockImplementation((fn: () => void) => fn)

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(true)
  })

  it('returns generic error for non-unique-constraint transaction failures', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 8000, fee_items: '[]', total_amount: 8000, created_at: '2024-01-01' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Jane', last_name: 'Doe' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 200 }) }
    })

    db.transaction.mockImplementation(() => {
      return () => { throw new Error('Some other database error') }
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Some other database error')
  })

  // ── branch coverage: invalid userId (≤ 0) ──
  it('rejects invoice generation with invalid userId', () => {
    const result = generateSingleStudentInvoice(context, 100, 1, 1, 0)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid authenticated user context')
  })

  // ── branch coverage: unique constraint catch but no concurrent invoice found ──
  it('returns error when unique constraint fires but no concurrent invoice exists', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 8000, fee_items: '[]', total_amount: 8000, created_at: '2024-01-01' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Jane', last_name: 'Doe' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      // Return undefined for the concurrent invoice lookup
      if (sql.includes('SELECT invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 200 }) }
    })

    db.transaction.mockImplementation(() => {
      return () => { throw new Error('UNIQUE constraint failed: idx_fee_invoice_active_unique') }
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('idx_fee_invoice_active_unique')
  })

  // ── Function coverage: computeInvoiceItems with blanket exemption ──
  it('generates invoice applying blanket exemption when no specific exemption exists', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 10000, fee_items: '[]', total_amount: 10000, created_at: '2024-01-01' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Jane', last_name: 'Doe' }
    // Blanket exemption: fee_category_id is null
    const blanketExemptions = [{ id: 99, fee_category_id: null, status: 'ACTIVE', exemption_percentage: 50 }]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) {
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() }
      }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 200 }) }
    })

    context.exemptionService.getStudentExemptions = vi.fn().mockReturnValue(blanketExemptions)

    db.transaction.mockImplementation((fn: (...args: unknown[]) => unknown) => {
      return (...args: unknown[]) => fn(...args)
    })

    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toBeDefined()
  })

  // ── Branch coverage: single student invoice with GL account codes (journal posting path) ──
  it('posts journal entry when single student invoice items have gl_account_code', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 8000, fee_items: '[]', total_amount: 8000, created_at: '2024-01-01', gl_account_code: '4100', gl_account_name: 'Tuition' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Joel', last_name: 'GLC' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 400 }) }
    })

    db.transaction.mockImplementation((fn: (...args: unknown[]) => unknown) => {
      return (...args: unknown[]) => fn(...args)
    })

    mockRecordInvoiceSync.mockClear()
    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toMatch(/^INV-/)
    expect(mockRecordInvoiceSync).toHaveBeenCalledTimes(1)
  })

  // ── Branch coverage: journal posting failure in single student invoice ──
  it('returns error when journal fails during single student invoice generation', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 8000, fee_items: '[]', total_amount: 8000, created_at: '2024-01-01', gl_account_code: '4100', gl_account_name: 'Tuition' },
    ]
    const enrollment = { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Joel', last_name: 'GLC' }

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('SELECT id, invoice_number') && sql.includes('fee_invoice')) { return { get: vi.fn(), all: vi.fn(), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn().mockReturnValue(enrollment), all: vi.fn(), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 400 }) }
    })

    db.transaction.mockImplementation((fn: (...args: unknown[]) => unknown) => {
      return (...args: unknown[]) => fn(...args)
    })

    mockRecordInvoiceSync.mockReturnValueOnce({ success: false, error: 'GL accounts not balanced' })
    const result = generateSingleStudentInvoice(context, 100, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Accounting Error')
    expect(result.error).toContain('GL accounts not balanced')
  })

  // ── Function coverage: generateBatchInvoices error path ──
  it('batch invoice generation returns error on transaction failure', () => {
    const feeStructure = [
      { id: 1, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', fee_category_id: 1, amount: 5000, fee_items: '[]', total_amount: 5000, created_at: '2024-01-01' },
    ]
    const enrollments = [
      { id: 1, student_id: 100, academic_year_id: 1, term_id: 1, stream_id: 10, student_type: 'DAY', class_id: 1, status: 'ACTIVE', first_name: 'Test', last_name: 'Student' },
    ]

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM fee_structure')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(feeStructure), run: vi.fn() } }
      if (sql.includes('enrollment')) { return { get: vi.fn(), all: vi.fn().mockReturnValue(enrollments), run: vi.fn() } }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }) }
    })

    db.transaction.mockImplementation(() => {
      return () => { throw new Error('Transaction failed') }
    })

    const result = generateBatchInvoices(context, 1, 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Transaction failed')
  })
})
