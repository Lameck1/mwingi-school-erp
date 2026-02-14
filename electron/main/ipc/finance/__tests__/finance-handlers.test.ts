import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const journalServiceMock = {
  recordInvoiceSync: vi.fn(() => ({ success: true })),
  recordPaymentSync: vi.fn(() => ({ success: true })),
}
const paymentServiceMock = {
  recordPayment: vi.fn(() => ({ success: true, transactionRef: 'TXN-MOCK-1', receiptNumber: 'RCP-MOCK-1' })),
  voidPayment: vi.fn(async () => ({ success: true })),
}

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'DoubleEntryJournalService') {
        return journalServiceMock
      }
      if (name === 'PaymentService') {
        return paymentServiceMock
      }
      if (name === 'ExemptionService') {
        return {}
      }
      if (name === 'CreditAutoApplicationService') {
        return {
          allocateCreditsToInvoices: vi.fn(async () => ({ success: true })),
          getStudentCreditBalance: vi.fn(async () => 0),
          getCreditTransactions: vi.fn(async () => []),
          addCreditToStudent: vi.fn(async () => ({ success: true })),
        }
      }
      if (name === 'FeeProrationService') {
        return {
          calculateProRatedFee: vi.fn(),
          validateEnrollmentDate: vi.fn(),
          generateProRatedInvoice: vi.fn(async () => ({ success: true })),
          getStudentProRationHistory: vi.fn(async () => []),
        }
      }
      if (name === 'ScholarshipService') {
        return {
          createScholarship: vi.fn(async () => ({ success: true })),
          allocateScholarshipToStudent: vi.fn(async () => ({ success: true })),
          validateScholarshipEligibility: vi.fn(async () => ({ success: true })),
          getActiveScholarships: vi.fn(async () => []),
          getStudentScholarships: vi.fn(async () => []),
          getScholarshipAllocations: vi.fn(async () => []),
          applyScholarshipToInvoice: vi.fn(async () => ({ success: true })),
        }
      }
      return {}
    })
  }
}))

import { registerFinanceHandlers } from '../finance-handlers'

describe('finance IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    journalServiceMock.recordInvoiceSync.mockReset()
    journalServiceMock.recordInvoiceSync.mockReturnValue({ success: true })
    journalServiceMock.recordPaymentSync.mockReset()
    journalServiceMock.recordPaymentSync.mockReturnValue({ success: true })
    paymentServiceMock.recordPayment.mockReset()
    paymentServiceMock.recordPayment.mockReturnValue({ success: true, transactionRef: 'TXN-MOCK-1', receiptNumber: 'RCP-MOCK-1' })
    paymentServiceMock.voidPayment.mockReset()
    paymentServiceMock.voidPayment.mockResolvedValue({ success: true })

    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credit_balance INTEGER DEFAULT 0
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        student_id INTEGER NOT NULL,
        term_id INTEGER,
        academic_term_id INTEGER,
        invoice_date TEXT,
        due_date TEXT,
        total_amount INTEGER NOT NULL,
        amount INTEGER,
        amount_due INTEGER,
        original_amount INTEGER,
        amount_paid INTEGER NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        created_by_user_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE invoice_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        fee_category_id INTEGER,
        description TEXT,
        amount INTEGER NOT NULL
      );

      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE
      );

      CREATE TABLE fee_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT,
        gl_account_id INTEGER
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT,
        category_type TEXT,
        is_system BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        student_id INTEGER,
        invoice_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        recorded_by_user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_voided BOOLEAN DEFAULT 0
      );

      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT NOT NULL UNIQUE,
        transaction_id INTEGER NOT NULL UNIQUE,
        receipt_date TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT,
        payment_reference TEXT,
        created_by_user_id INTEGER NOT NULL
      );
    `)

    db.prepare(`INSERT INTO gl_account (id, account_code) VALUES (1, '4300')`).run()
    db.prepare(`INSERT INTO fee_category (id, category_name, gl_account_id) VALUES (1, 'Tuition', 1)`).run()

    registerFinanceHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('payment:payWithCredit rejects invalid payload before persistence', async () => {
    const handler = handlerMap.get('payment:payWithCredit')
    expect(handler).toBeDefined()

    const result = await handler!({}, { studentId: 1, invoiceId: 1, amount: 0 }, 10) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid payment payload')

    const ledgerCount = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction`).get() as { count: number }
    expect(ledgerCount.count).toBe(0)
  })

  it('payment:payWithCredit short-circuits duplicate replay and returns existing transaction', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 5000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (1, 'INV-001', 1, 5000, 0, 'PENDING', 1)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, invoice_id, payment_method, payment_reference, description, recorded_by_user_id, created_at, is_voided
      ) VALUES ('TXN-CREDIT-EXIST-1', date('now'), 'FEE_PAYMENT', 1, 3000, 'CREDIT', 1, 1, 'CASH', 'CREDIT_BALANCE', 'Payment via Credit Balance', 9, datetime('now'), 0)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 3000 }, 9) as {
      success: boolean
      message?: string
      transactionRef?: string
    }
    expect(result.success).toBe(true)
    expect(result.message).toContain('Duplicate credit payment request detected')
    expect(result.transactionRef).toBe('TXN-CREDIT-EXIST-1')

    const ledgerCount = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction WHERE invoice_id = 1`).get() as { count: number }
    expect(ledgerCount.count).toBe(1)
  })

  it('payment:record short-circuits duplicate payload and returns existing receipt', async () => {
    const today = new Date().toISOString().slice(0, 10)
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-EXIST-1', ?, 'FEE_PAYMENT', 1, 10000, 'CREDIT', 1, 'MPESA', 'MPESA-123', 'Tuition Fee Payment', 9, NULL)
    `).run(today)
    db.prepare(`
      INSERT INTO receipt (
        receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id
      ) VALUES ('RCP-EXIST-1', 1, ?, 1, 10000, 'MPESA', 'MPESA-123', 9)
    `).run(today)

    const handler = handlerMap.get('payment:record')
    expect(handler).toBeDefined()

    const result = await handler!(
      {},
      {
        student_id: 1,
        amount: 10000,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-123',
        transaction_date: today,
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as { success: boolean; transactionRef?: string; receiptNumber?: string }

    expect(result.success).toBe(true)
    expect(result.transactionRef).toBe('TXN-EXIST-1')
    expect(result.receiptNumber).toBe('RCP-EXIST-1')
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record rejects zero amount before service call', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('payment:record')
    expect(handler).toBeDefined()

    const result = await handler!(
      {},
      {
        student_id: 1,
        amount: 0,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-000',
        transaction_date: today,
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('greater than zero')
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record calls payment service for non-duplicate payload', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('payment:record')
    expect(handler).toBeDefined()

    const result = await handler!(
      {},
      {
        student_id: 1,
        amount: 10000,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-NEW',
        transaction_date: today,
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as { success: boolean; transactionRef?: string; receiptNumber?: string }

    expect(result.success).toBe(true)
    expect(paymentServiceMock.recordPayment).toHaveBeenCalledTimes(1)
    expect(result.transactionRef).toBe('TXN-MOCK-1')
    expect(result.receiptNumber).toBe('RCP-MOCK-1')
  })

  it('payment:record rejects invalid date format before service call', async () => {
    const handler = handlerMap.get('payment:record')!
    const result = await handler(
      {},
      {
        student_id: 1,
        amount: 1000,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-INV-DATE',
        transaction_date: '13/02/2026',
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid date format')
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record rejects future date before service call', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const handler = handlerMap.get('payment:record')!
    const result = await handler(
      {},
      {
        student_id: 1,
        amount: 1000,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-FUTURE',
        transaction_date: tomorrow,
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('future')
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:payWithCredit rejects invoice ownership mismatch', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 5000), (2, 5000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES ('INV-001', 2, 5000, 0, 'PENDING', 1)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 1000 }, 9) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not belong')
  })

  it('payment:payWithCredit applies credit and updates invoice/student atomically', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 5000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (1, 'INV-001', 1, 5000, 0, 'PENDING', 1)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 3000 }, 9) as { success: boolean; error?: string }
    expect(result.success).toBe(true)

    const invoice = db.prepare(`SELECT amount_paid, status FROM fee_invoice WHERE id = 1`).get() as { amount_paid: number; status: string }
    expect(invoice.amount_paid).toBe(3000)
    expect(invoice.status).toBe('PARTIAL')

    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBe(2000)

    const ledgerCount = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction WHERE invoice_id = 1`).get() as { count: number }
    expect(ledgerCount.count).toBe(1)
  })

  it('invoice:create returns failure and rolls back invoice when journal posting fails', async () => {
    journalServiceMock.recordInvoiceSync.mockReturnValueOnce({ success: false, error: 'GL mapping missing' })

    const handler = handlerMap.get('invoice:create')
    expect(handler).toBeDefined()

    const result = await handler!(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-01',
        due_date: '2026-02-20'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      7
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('GL mapping missing')

    const invoiceCount = db.prepare(`SELECT COUNT(*) as count FROM fee_invoice`).get() as { count: number }
    const itemCount = db.prepare(`SELECT COUNT(*) as count FROM invoice_item`).get() as { count: number }
    expect(invoiceCount.count).toBe(0)
    expect(itemCount.count).toBe(0)
  })

  it('invoice:create short-circuits duplicate payload and returns existing invoice', async () => {
    db.prepare(`
      INSERT INTO fee_invoice (
        id, invoice_number, student_id, term_id, academic_term_id, invoice_date, due_date,
        total_amount, amount, amount_due, original_amount, created_by_user_id, created_at
      ) VALUES (8, 'INV-EXIST-001', 1, 1, 1, '2026-02-01', '2026-02-20', 10000, 10000, 10000, 10000, 7, datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
      VALUES (8, 1, 'Tuition', 10000)
    `).run()

    const handler = handlerMap.get('invoice:create')!
    const result = await handler!(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-01',
        due_date: '2026-02-20'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      7
    ) as { success: boolean; invoiceNumber?: string; id?: number; message?: string }

    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toBe('INV-EXIST-001')
    expect(result.id).toBe(8)
    expect(result.message).toContain('Duplicate invoice request detected')
    expect(journalServiceMock.recordInvoiceSync).not.toHaveBeenCalled()

    const invoiceCount = db.prepare(`SELECT COUNT(*) as count FROM fee_invoice`).get() as { count: number }
    expect(invoiceCount.count).toBe(1)
  })

  it('invoice:create creates a new invoice when item set differs', async () => {
    db.prepare(`
      INSERT INTO fee_invoice (
        id, invoice_number, student_id, term_id, academic_term_id, invoice_date, due_date,
        total_amount, amount, amount_due, original_amount, created_by_user_id, created_at
      ) VALUES (9, 'INV-EXIST-002', 1, 1, 1, '2026-02-01', '2026-02-20', 10000, 10000, 10000, 10000, 7, datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
      VALUES (9, 1, 'Tuition', 10000)
    `).run()

    const handler = handlerMap.get('invoice:create')!
    const result = await handler!(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-01',
        due_date: '2026-02-20'
      },
      [
        { fee_category_id: 1, description: 'Tuition', amount: 9000 },
        { fee_category_id: 1, description: 'Activity Fee', amount: 1000 }
      ],
      7
    ) as { success: boolean; id?: number }

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
    expect(result.id).not.toBe(9)
    expect(journalServiceMock.recordInvoiceSync).toHaveBeenCalledTimes(1)

    const invoiceCount = db.prepare(`SELECT COUNT(*) as count FROM fee_invoice`).get() as { count: number }
    expect(invoiceCount.count).toBe(2)
  })

  it('invoice:create rejects invalid invoice date format', async () => {
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '01/02/2026',
        due_date: '2026-02-20'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      7
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid date format')
  })

  it('invoice:create rejects due date earlier than invoice date', async () => {
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-20',
        due_date: '2026-02-01'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      7
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Due date cannot be earlier')
  })
})
