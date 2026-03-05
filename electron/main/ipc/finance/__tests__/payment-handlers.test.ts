import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const journalServiceMock = {
  recordInvoiceSync: vi.fn((): { success: boolean; error?: string } => ({ success: true })),
  recordPaymentSync: vi.fn((): { success: boolean; error?: string } => ({ success: true })),
}
const paymentServiceMock = {
  recordPayment: vi.fn().mockReturnValue({ success: true, transactionRef: 'TXN-MOCK-1', receiptNumber: 'RCP-MOCK-1' }),
  voidPayment: vi.fn().mockResolvedValue({ success: true }),
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
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'DoubleEntryJournalService') { return journalServiceMock }
      if (name === 'PaymentService') { return paymentServiceMock }
      if (name === 'ExemptionService') { return {} }
      return {}
    })
  }
}))

import { registerPaymentHandlers, registerReceiptHandlers } from '../payment-handlers'
import { createGetOrCreateCategoryId, type FinanceContext } from '../finance-handler-utils'

function buildContext(): FinanceContext {
  return {
    db,
    exemptionService: {} as FinanceContext['exemptionService'],
    paymentService: paymentServiceMock as unknown as FinanceContext['paymentService'],
    getOrCreateCategoryId: createGetOrCreateCategoryId(db)
  }
}

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      credit_balance INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS term (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_name TEXT
    );

    CREATE TABLE IF NOT EXISTS fee_invoice (
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

    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER,
      description TEXT,
      amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT,
      description TEXT,
      gl_account_id INTEGER,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS transaction_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT,
      category_type TEXT,
      is_system BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ledger_transaction (
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

    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE,
      receipt_date TEXT NOT NULL,
      student_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT,
      payment_reference TEXT,
      created_by_user_id INTEGER NOT NULL,
      printed_count INTEGER DEFAULT 0,
      last_printed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_invoice_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      applied_amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      reference_invoice_id INTEGER,
      notes TEXT
    );

    INSERT INTO gl_account (id, account_code) VALUES (1, '4300');
    INSERT INTO fee_category (id, category_name, gl_account_id) VALUES (1, 'Tuition', 1);
  `)
}

type SuccessResult = { success: boolean; error?: string; [key: string]: unknown }

describe('payment-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    journalServiceMock.recordPaymentSync.mockReset()
    journalServiceMock.recordPaymentSync.mockReturnValue({ success: true })
    paymentServiceMock.recordPayment.mockReset()
    paymentServiceMock.recordPayment.mockReturnValue({ success: true, transactionRef: 'TXN-MOCK-1', receiptNumber: 'RCP-MOCK-1' })
    paymentServiceMock.voidPayment.mockReset()
    paymentServiceMock.voidPayment.mockResolvedValue({ success: true })

    db = new Database(':memory:')
    createSchema(db)

    const context = buildContext()
    registerPaymentHandlers(context)
    registerReceiptHandlers(db)
  })

  afterEach(() => {
    db.close()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected payment and receipt channels', () => {
    expect(handlerMap.has('payment:record')).toBe(true)
    expect(handlerMap.has('payment:getByStudent')).toBe(true)
    expect(handlerMap.has('payment:payWithCredit')).toBe(true)
    expect(handlerMap.has('payment:void')).toBe(true)
    expect(handlerMap.has('receipt:getByTransaction')).toBe(true)
    expect(handlerMap.has('receipt:markPrinted')).toBe(true)
  })

  // ─── payment:record ─────────────────────────────────────────────────

  it('payment:record calls payment service for valid payload', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('payment:record')!
    const result = await handler(
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
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(paymentServiceMock.recordPayment).toHaveBeenCalledTimes(1)
    expect(result.transactionRef).toBe('TXN-MOCK-1')
    expect(result.receiptNumber).toBe('RCP-MOCK-1')
  })

  it('payment:record rejects zero amount before service call', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('payment:record')!
    const result = await handler(
      {},
      {
        student_id: 1,
        amount: 0,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-0',
        transaction_date: today,
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record rejects invalid date format', async () => {
    const handler = handlerMap.get('payment:record')!
    const result = await handler(
      {},
      {
        student_id: 1,
        amount: 1000,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-BAD-DATE',
        transaction_date: '13/02/2026',
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record rejects future date', async () => {
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
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record rejects renderer user mismatch', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('payment:record')!
    const result = await handler(
      {},
      {
        student_id: 1,
        amount: 1000,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-MISMATCH',
        transaction_date: today,
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      3
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record short-circuits idempotent replay', async () => {
    const today = new Date().toISOString().slice(0, 10)
    db.exec(`
      ALTER TABLE ledger_transaction ADD COLUMN idempotency_key TEXT;
      CREATE UNIQUE INDEX idx_ledger_transaction_idempotency
        ON ledger_transaction(idempotency_key);
    `)

    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, recorded_by_user_id, invoice_id, idempotency_key
      ) VALUES ('TXN-IDEMP-1', ?, 'FEE_PAYMENT', 1, 10000, 'CREDIT', 1, 'MPESA', 'MPESA-456', 'Tuition Fee Payment', 9, NULL, 'idem-key-1')
    `).run(today)
    db.prepare(`
      INSERT INTO receipt (
        receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id
      ) VALUES ('RCP-IDEMP-1', 1, ?, 1, 10000, 'MPESA', 'MPESA-456', 9)
    `).run(today)

    const handler = handlerMap.get('payment:record')!
    const result = await handler(
      {},
      {
        student_id: 1,
        amount: 10000,
        payment_method: 'MPESA',
        payment_reference: 'MPESA-NEW',
        transaction_date: today,
        description: 'Tuition Fee Payment',
        term_id: 1,
        idempotency_key: 'idem-key-1'
      },
      9
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.transactionRef).toBe('TXN-IDEMP-1')
    expect(result.receiptNumber).toBe('RCP-IDEMP-1')
    expect(paymentServiceMock.recordPayment).not.toHaveBeenCalled()
  })

  it('payment:record reports service failure', async () => {
    paymentServiceMock.recordPayment.mockReturnValueOnce({ success: false, error: 'Insufficient funds' })
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('payment:record')!
    const result = await handler(
      {},
      {
        student_id: 1,
        amount: 10000,
        payment_method: 'CASH',
        payment_reference: 'CASH-1',
        transaction_date: today,
        description: 'Tuition Fee Payment',
        term_id: 1
      },
      9
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Insufficient funds')
  })

  // ─── payment:getByStudent ───────────────────────────────────────────

  it('payment:getByStudent returns payments for valid student', async () => {
    const today = new Date().toISOString().slice(0, 10)
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, recorded_by_user_id
      ) VALUES ('TXN-1', ?, 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'CASH-1', 'Payment', 9)
    `).run(today)
    db.prepare(`
      INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id)
      VALUES ('RCP-1', 1, ?, 1, 5000, 'CASH', 'CASH-1', 9)
    `).run(today)

    const handler = handlerMap.get('payment:getByStudent')!
    const result = await handler({}, 1) as Array<{ transaction_ref: string; receipt_number: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].transaction_ref).toBe('TXN-1')
    expect(result[0].receipt_number).toBe('RCP-1')
  })

  it('payment:getByStudent rejects invalid student ID', async () => {
    const handler = handlerMap.get('payment:getByStudent')!
    const result = await handler({}, -1) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('payment:getByStudent returns empty array for student with no payments', async () => {
    const handler = handlerMap.get('payment:getByStudent')!
    const result = await handler({}, 999) as unknown[]

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  // ─── payment:payWithCredit ──────────────────────────────────────────

  it('payment:payWithCredit applies credit and updates invoice/student atomically', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 5000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (1, 'INV-001', 1, 5000, 0, 'PENDING', 1)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 3000 }, 9) as SuccessResult

    expect(result.success).toBe(true)

    const invoice = db.prepare(`SELECT amount_paid, status FROM fee_invoice WHERE id = 1`).get() as { amount_paid: number; status: string }
    expect(invoice.amount_paid).toBe(3000)
    expect(invoice.status).toBe('PARTIAL')

    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBe(2000)
  })

  it('payment:payWithCredit rejects invalid payload (zero amount)', async () => {
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 0 }, 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()

    const ledgerCount = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction`).get() as { count: number }
    expect(ledgerCount.count).toBe(0)
  })

  it('payment:payWithCredit short-circuits duplicate replay', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 5000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (1, 'INV-001', 1, 5000, 0, 'PENDING', 1)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, invoice_id, payment_method, payment_reference, description, recorded_by_user_id, created_at, is_voided
      ) VALUES ('TXN-CREDIT-EXIST-1', date('now'), 'FEE_PAYMENT', 1, 3000, 'CREDIT', 1, 1, 'CREDIT', 'CREDIT_BALANCE', 'Payment via Credit Balance', 9, datetime('now'), 0)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 3000 }, 9) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.message).toContain('Duplicate credit payment request detected')
    expect(result.transactionRef).toBe('TXN-CREDIT-EXIST-1')
  })

  it('payment:payWithCredit rejects invoice ownership mismatch', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 5000), (2, 5000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES ('INV-001', 2, 5000, 0, 'PENDING', 1)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 1000 }, 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('does not belong')
  })

  it('payment:payWithCredit rejects insufficient credit balance', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 500)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (1, 'INV-001', 1, 5000, 0, 'PENDING', 1)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 1000 }, 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Insufficient credit balance')
  })

  it('payment:payWithCredit rejects amount exceeding invoice balance', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 90000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (1, 'INV-001', 1, 5000, 0, 'PENDING', 1)
    `).run()

    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 6000 }, 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('exceeds invoice balance')
  })

  // ─── payment:void ───────────────────────────────────────────────────

  it('payment:void calls voidPayment service on success', async () => {
    const handler = handlerMap.get('payment:void')!
    const result = await handler({}, 1, 'Accidental duplicate', 9) as SuccessResult

    expect(result.success).toBe(true)
    expect(paymentServiceMock.voidPayment).toHaveBeenCalledTimes(1)
    expect(paymentServiceMock.voidPayment).toHaveBeenCalledWith(expect.objectContaining({
      transaction_id: 1,
      void_reason: 'Accidental duplicate',
      voided_by: 9,
    }))
  })

  it('payment:void rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('payment:void')!
    const result = await handler({}, 1, 'Void test', 3) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(paymentServiceMock.voidPayment).not.toHaveBeenCalled()
  })

  it('payment:void reports service failure', async () => {
    paymentServiceMock.voidPayment.mockResolvedValueOnce({ success: false, error: 'Transaction already voided' })
    const handler = handlerMap.get('payment:void')!
    const result = await handler({}, 1, 'Void it', 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Transaction already voided')
  })

  // ─── receipt:getByTransaction ───────────────────────────────────────

  it('receipt:getByTransaction returns receipt for valid transaction', async () => {
    const today = new Date().toISOString().slice(0, 10)
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, recorded_by_user_id
      ) VALUES ('TXN-R1', ?, 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'CASH-1', 'Payment', 9)
    `).run(today)
    db.prepare(`
      INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id)
      VALUES ('RCP-R1', 1, ?, 1, 5000, 'CASH', 'CASH-1', 9)
    `).run(today)

    const handler = handlerMap.get('receipt:getByTransaction')!
    const result = await handler({}, 1) as { receipt_number: string } | null

    expect(result).not.toBeNull()
    expect(result!.receipt_number).toBe('RCP-R1')
  })

  it('receipt:getByTransaction returns null for non-existent transaction', async () => {
    const handler = handlerMap.get('receipt:getByTransaction')!
    const result = await handler({}, 999)

    expect(result).toBeNull()
  })

  // ─── receipt:markPrinted ────────────────────────────────────────────

  it('receipt:markPrinted increments the printed count', async () => {
    const today = new Date().toISOString().slice(0, 10)
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, description, recorded_by_user_id
      ) VALUES ('TXN-P1', ?, 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'Payment', 9)
    `).run(today)
    db.prepare(`
      INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, created_by_user_id)
      VALUES ('RCP-P1', 1, ?, 1, 5000, 'CASH', 9)
    `).run(today)

    const handler = handlerMap.get('receipt:markPrinted')!
    const result = await handler({}, 1) as SuccessResult

    expect(result.success).toBe(true)

    const receipt = db.prepare(`SELECT printed_count FROM receipt WHERE id = 1`).get() as { printed_count: number }
    expect(receipt.printed_count).toBe(1)
  })

  it('receipt:markPrinted returns error for non-existent receipt', async () => {
    const handler = handlerMap.get('receipt:markPrinted')!
    const result = await handler({}, 999) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Receipt not found')
  })

  // ─── Uncovered payment:payWithCredit branches ────────────────────────

  it('payment:payWithCredit rejects non-existent student', async () => {
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 999, invoiceId: 1, amount: 1000 }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Student not found')
  })

  it('payment:payWithCredit rejects non-existent invoice', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (10, 5000)`).run()
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 10, invoiceId: 999, amount: 1000 }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invoice not found')
  })

  it('payment:payWithCredit rejects invoice in PAID state', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (11, 5000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (11, 'INV-PAID-2', 11, 5000, 5000, 'PAID', 1)
    `).run()
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 11, invoiceId: 11, amount: 1000 }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('cannot accept payments')
  })

  it('payment:payWithCredit rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 1, invoiceId: 1, amount: 1000 }, 3) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('payment:payWithCredit rolls back on journal failure', async () => {
    journalServiceMock.recordPaymentSync.mockReturnValueOnce({ success: false, error: 'Journal entry failed' })
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (12, 8000)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (12, 'INV-J1', 12, 8000, 0, 'PENDING', 1)
    `).run()
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 12, invoiceId: 12, amount: 3000 }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Journal entry failed')
    const student = db.prepare('SELECT credit_balance FROM student WHERE id = 12').get() as { credit_balance: number }
    expect(student.credit_balance).toBe(8000)
  })

  // ─── Uncovered payment:void branch (recovery_method) ───────────────

  it('payment:void passes recovery method to service', async () => {
    const handler = handlerMap.get('payment:void')!
    const result = await handler({}, 1, 'Void reason', 9, 'CASH_RETURN') as SuccessResult
    expect(result.success).toBe(true)
    expect(paymentServiceMock.voidPayment).toHaveBeenCalledWith(expect.objectContaining({
      transaction_id: 1,
      void_reason: 'Void reason',
      voided_by: 9,
      recovery_method: 'CASH_RETURN'
    }))
  })

  // ─── Additional branch coverage ────────────────────────────────────

  it('payment:record with invoice_id and amount_in_words passes them to service', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (20, 0)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (20, 'INV-IW1', 20, 50000, 0, 'PENDING', 1)
    `).run()
    const handler = handlerMap.get('payment:record')!
    const result = await handler({}, {
      student_id: 20,
      amount: 5000,
      transaction_date: '2026-01-15',
      payment_method: 'CASH',
      payment_reference: 'REF-IW1',
      description: 'Payment with invoice',
      invoice_id: 20,
      amount_in_words: 'Five thousand shillings',
      term_id: 1
    }, 9) as SuccessResult
    expect(result.success).toBe(true)
    expect(paymentServiceMock.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_id: 20,
        amount_in_words: 'Five thousand shillings'
      })
    )
  })

  it('payment:record catches UNIQUE constraint and retries idempotency lookup', async () => {
    try {
      db.exec(`ALTER TABLE ledger_transaction ADD COLUMN idempotency_key TEXT`)
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transaction_idempotency ON ledger_transaction(idempotency_key)`)
    } catch { /* column may already exist */ }

    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (30, 0)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (30, 'INV-IDEM-RACE', 30, 50000, 0, 'PENDING', 1)
    `).run()

    // Insert existing txn with the idempotency key
    db.prepare(`
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, recorded_by_user_id, invoice_id, idempotency_key)
      VALUES ('TXN-RACE-1', '2026-01-15', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 30, 'CASH', 'REF-RACE', 'Payment', 1, 30, 'race-key-1')
    `).run()
    db.prepare(`INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, created_by_user_id)
      VALUES ('RCT-RACE-1', last_insert_rowid(), '2026-01-15', 30, 5000, 1)`).run()

    // Make recordPayment throw the UNIQUE constraint error
    paymentServiceMock.recordPayment.mockImplementationOnce(() => {
      throw new Error('UNIQUE constraint failed: ledger_transaction.idempotency_key')
    })

    const handler = handlerMap.get('payment:record')!
    const result = await handler({}, {
      student_id: 30,
      amount: 5000,
      transaction_date: '2026-01-15',
      payment_method: 'CASH',
      payment_reference: 'REF-RACE',
      description: 'Race payment',
      idempotency_key: 'race-key-1',
      term_id: 1
    }, 9) as SuccessResult
    expect(result.success).toBe(true)
    expect(result.message).toContain('Idempotent replay')
  })

  it('payment:record returns generic error for non-idempotency exceptions', async () => {
    paymentServiceMock.recordPayment.mockImplementationOnce(() => {
      throw new Error('Unexpected database error')
    })
    const handler = handlerMap.get('payment:record')!
    const result = await handler({}, {
      student_id: 1,
      amount: 1000,
      transaction_date: '2026-01-15',
      payment_method: 'CASH',
      payment_reference: 'REF-ERR',
      description: 'Error payment',
      term_id: 1
    }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('payment:payWithCredit rejects when student not found', async () => {
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 999, invoiceId: 1, amount: 1000 }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  // ── extended branch coverage ──────────────────────────────────
  it('payment:void returns error when paymentService throws an exception', async () => {
    paymentServiceMock.voidPayment.mockRejectedValueOnce(new Error('DB connection lost'))
    const handler = handlerMap.get('payment:void')!
    const result = await handler({}, 1, 'Void reason', 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB connection lost')
  })

  it('payment:record proceeds without idempotency when column is absent', async () => {
    // Default schema has no idempotency_key column, so supportsIdempotency() returns false
    const handler = handlerMap.get('payment:record')!
    const result = await handler({}, {
      student_id: 1,
      amount: 500,
      transaction_date: new Date().toISOString().slice(0, 10),
      payment_method: 'CASH',
      payment_reference: 'NO-IDEM-REF',
      description: 'No idempotency test',
      term_id: 1,
      idempotency_key: 'should-be-ignored'
    }, 9) as SuccessResult
    expect(result.success).toBe(true)
  })

  it('payment:payWithCredit rejects invoice not found', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (80, 50000)`).run()
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 80, invoiceId: 99999, amount: 1000 }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invoice not found')
  })

  // ── branch coverage: normalizeIdempotencyKey with whitespace-only key ──
  it('payment:record treats whitespace-only idempotency_key as absent', async () => {
    const handler = handlerMap.get('payment:record')!
    const result = await handler({}, {
      student_id: 1,
      amount: 500,
      transaction_date: new Date().toISOString().slice(0, 10),
      payment_method: 'CASH',
      payment_reference: 'WS-KEY-REF',
      description: 'Whitespace key test',
      term_id: 1,
      idempotency_key: '   '
    }, 9) as SuccessResult
    expect(result.success).toBe(true)
  })

  // ── branch coverage: UNIQUE constraint catch but idempotency lookup finds nothing ──
  it('payment:record falls through to error when idempotency retry finds no match', async () => {
    try {
      db.exec(`ALTER TABLE ledger_transaction ADD COLUMN idempotency_key TEXT`)
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transaction_idempotency ON ledger_transaction(idempotency_key)`)
    } catch { /* column may already exist */ }

    paymentServiceMock.recordPayment.mockImplementationOnce(() => {
      throw new Error('UNIQUE constraint failed: ledger_transaction.idempotency_key')
    })

    const handler = handlerMap.get('payment:record')!
    const result = await handler({}, {
      student_id: 1,
      amount: 1000,
      transaction_date: '2026-01-15',
      payment_method: 'CASH',
      payment_reference: 'REF-ORPHAN-KEY',
      description: 'Orphan idempotency key',
      idempotency_key: 'orphan-key-no-match',
      term_id: 1
    }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('UNIQUE constraint')
  })

  // ── branch coverage: payWithCredit invoice does not belong to student ──
  it('payment:payWithCredit rejects when invoice belongs to different student', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (90, 50000)`).run()
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (91, 0)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, amount_paid, status, created_by_user_id)
      VALUES (90, 'INV-OTHER-STU', 91, 10000, 0, 'PENDING', 1)
    `).run()
    const handler = handlerMap.get('payment:payWithCredit')!
    const result = await handler({}, { studentId: 90, invoiceId: 90, amount: 1000 }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not belong')
  })

  // ── branch coverage (line 119): catch-block idempotent replay ──────
  it('payment:record returns idempotent replay from catch block on UNIQUE constraint race', async () => {
    try {
      db.exec(`ALTER TABLE ledger_transaction ADD COLUMN idempotency_key TEXT`)
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transaction_idempotency ON ledger_transaction(idempotency_key)`)
    } catch { /* column may already exist */ }

    // Pre-insert a record that the catch-block lookup will find
    db.prepare(`
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, recorded_by_user_id, idempotency_key)
      VALUES ('TXN-CATCH-1', '2026-01-15', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'REF-CATCH', 'Payment', 9, 'catch-key-1')
    `).run()
    db.prepare(`INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, created_by_user_id)
      VALUES ('RCP-CATCH-1', last_insert_rowid(), '2026-01-15', 1, 5000, 'CASH', 9)`).run()

    // Override db.transaction to skip the in-transaction idempotency check
    // and go straight to the catch block (simulates a race condition).
    const origTransaction = db.transaction.bind(db)
    ;(db as any).transaction = () => {
      return () => {
        throw new Error('UNIQUE constraint failed: ledger_transaction.idempotency_key')
      }
    }

    try {
      const handler = handlerMap.get('payment:record')!
      const result = await handler({}, {
        student_id: 1,
        amount: 5000,
        transaction_date: '2026-01-15',
        payment_method: 'CASH',
        payment_reference: 'REF-CATCH-2',
        description: 'Catch block race test',
        idempotency_key: 'catch-key-1',
        term_id: 1
      }, 9) as SuccessResult
      expect(result.success).toBe(true)
      expect(result.message).toContain('Idempotent replay')
      expect(result.transactionRef).toBe('TXN-CATCH-1')
      expect(result.receiptNumber).toBe('RCP-CATCH-1')
    } finally {
      ;(db as any).transaction = origTransaction
    }
  })

  // ── branch coverage: paymentResult is null/undefined ───────────────
  it('payment:record handles null paymentResult from service', async () => {
    paymentServiceMock.recordPayment.mockReturnValueOnce(null)
    const handler = handlerMap.get('payment:record')!
    const result = await handler({}, {
      student_id: 1,
      amount: 1000,
      transaction_date: new Date().toISOString().slice(0, 10),
      payment_method: 'CASH',
      payment_reference: 'CASH-NULL',
      description: 'Null result test',
      term_id: 1
    }, 9) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Payment failed')
  })
})
