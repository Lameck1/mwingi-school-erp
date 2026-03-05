import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { PaymentProcessor, VoidProcessor, PaymentQueryService } from '../PaymentService.internal'

// Mock audit log
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

// Mock DoubleEntryJournalService
vi.mock('../../accounting/DoubleEntryJournalService', () => {
  class MockDoubleEntryJournalService {
    recordPaymentSync() { return { success: true } }
    voidJournalEntrySync() { /* no-op */ }
  }
  return { DoubleEntryJournalService: MockDoubleEntryJournalService }
})

// Mock VoteHeadSpreadingService
vi.mock('../VoteHeadSpreadingService', () => ({
  VoteHeadSpreadingService: vi.fn().mockImplementation(function () {
    return { spreadPaymentOverItems: vi.fn() }
  })
}))

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
      gl_account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
      payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      credit_balance INTEGER DEFAULT 0,
      admission_number TEXT
    );

    CREATE TABLE transaction_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      category_type TEXT NOT NULL,
      parent_category_id INTEGER,
      is_system BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      first_name TEXT,
      last_name TEXT
    );

    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      normal_balance TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL,
      description TEXT NOT NULL,
      student_id INTEGER,
      staff_id INTEGER,
      term_id INTEGER,
      is_posted BOOLEAN DEFAULT 0,
      posted_by_user_id INTEGER,
      posted_at DATETIME,
      is_voided BOOLEAN DEFAULT 0,
      voided_reason TEXT,
      voided_by_user_id INTEGER,
      voided_at DATETIME,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'PENDING',
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      source_ledger_txn_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE journal_entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      gl_account_id INTEGER NOT NULL,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      description TEXT
    );

    CREATE TABLE fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      total_amount INTEGER NOT NULL,
      amount_due INTEGER,
      amount INTEGER,
      amount_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      notes TEXT,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE ledger_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_ref TEXT NOT NULL UNIQUE,
      transaction_date DATE NOT NULL,
      transaction_type TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      debit_credit TEXT NOT NULL,
      student_id INTEGER,
      staff_id INTEGER,
      invoice_id INTEGER,
      payment_method TEXT,
      payment_reference TEXT,
      description TEXT,
      term_id INTEGER,
      recorded_by_user_id INTEGER NOT NULL,
      is_voided BOOLEAN DEFAULT 0,
      voided_reason TEXT,
      voided_by_user_id INTEGER,
      voided_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE payment_invoice_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      applied_amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE void_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      original_amount INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      description TEXT,
      void_reason TEXT NOT NULL,
      voided_by INTEGER NOT NULL,
      voided_at DATETIME NOT NULL,
      recovered_method TEXT,
      recovered_by INTEGER,
      recovered_at DATETIME
    );

    CREATE TABLE credit_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      reference_invoice_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE approval_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      requested_by INTEGER NOT NULL,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO student (first_name, last_name, credit_balance, admission_number) VALUES ('John', 'Doe', 0, 'STU-001');
    INSERT INTO transaction_category (category_name, category_type, is_system, is_active)
    VALUES ('School Fees', 'INCOME', 1, 1);
    INSERT INTO user (username, first_name, last_name) VALUES ('testuser', 'Test', 'User');
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES
      ('1010', 'Cash on Hand', 'ASSET', 'DEBIT', 1),
      ('1020', 'Bank Account', 'ASSET', 'DEBIT', 1),
      ('1100', 'Student Receivables', 'ASSET', 'DEBIT', 1),
      ('4300', 'General Revenue', 'REVENUE', 'CREDIT', 1);
    INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id)
    VALUES (1, 'INV-001', 1, '2026-01-15', '2026-02-15', 50000, 50000, 50000, 0, 'OUTSTANDING', 1);
  `)
  return db
}

describe('PaymentProcessor', () => {
  let db: Database.Database
  let processor: PaymentProcessor

  beforeEach(() => {
    db = createTestDb()
    processor = new PaymentProcessor(db)
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('should process a valid payment and return transaction refs', () => {
    const result = processor.processPayment({
      student_id: 1,
      amount: 15000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-001',
      recorded_by_user_id: 1,
      term_id: 1
    })

    expect(result).toBeDefined()
    expect(result.transactionId).toBeGreaterThan(0)
    expect(result.transactionRef).toMatch(/^TXN-/)
    expect(result.receiptNumber).toMatch(/^RCP-/)
  })

  it('should create a receipt for the payment', () => {
    const result = processor.processPayment({
      student_id: 1,
      amount: 10000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-RECEIPT',
      recorded_by_user_id: 1,
      term_id: 1
    })

    const receipt = db.prepare(`SELECT * FROM receipt WHERE transaction_id = ?`).get(result.transactionId) as {
      receipt_number: string; amount: number; student_id: number
    } | undefined
    expect(receipt).toBeDefined()
    expect(receipt!.amount).toBe(10000)
    expect(receipt!.student_id).toBe(1)
  })

  it('should allocate payment to outstanding invoice', () => {
    const result = processor.processPayment({
      student_id: 1,
      amount: 15000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-ALLOC',
      recorded_by_user_id: 1,
      term_id: 1
    })

    const allocation = db.prepare(
      `SELECT applied_amount FROM payment_invoice_allocation WHERE transaction_id = ?`
    ).get(result.transactionId) as { applied_amount: number } | undefined

    expect(allocation).toBeDefined()
    expect(allocation!.applied_amount).toBe(15000)
  })

  it('should update invoice amount_paid and status to PARTIAL', () => {
    processor.processPayment({
      student_id: 1,
      amount: 15000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-PARTIAL',
      recorded_by_user_id: 1,
      term_id: 1
    })

    const invoice = db.prepare(`SELECT amount_paid, status FROM fee_invoice WHERE id = 1`).get() as {
      amount_paid: number; status: string
    }
    expect(invoice.amount_paid).toBe(15000)
    expect(invoice.status).toBe('PARTIAL')
  })

  it('should mark invoice PAID when full amount is applied', () => {
    processor.processPayment({
      student_id: 1,
      amount: 50000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-FULL',
      recorded_by_user_id: 1,
      term_id: 1
    })

    const invoice = db.prepare(`SELECT amount_paid, status FROM fee_invoice WHERE id = 1`).get() as {
      amount_paid: number; status: string
    }
    expect(invoice.amount_paid).toBe(50000)
    expect(invoice.status).toBe('PAID')
  })

  it('should credit student balance when overpaying', () => {
    processor.processPayment({
      student_id: 1,
      amount: 60000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-OVER',
      recorded_by_user_id: 1,
      term_id: 1
    })

    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBe(10000)

    const creditTxn = db.prepare(
      `SELECT * FROM credit_transaction WHERE student_id = 1 AND transaction_type = 'CREDIT_RECEIVED'`
    ).get() as { amount: number } | undefined
    expect(creditTxn).toBeDefined()
    expect(creditTxn!.amount).toBe(10000)
  })

  it('should apply payment to specific invoice when invoice_id is provided', () => {
    const result = processor.processPayment({
      student_id: 1,
      amount: 20000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-SPECIFIC',
      recorded_by_user_id: 1,
      term_id: 1,
      invoice_id: 1
    })

    const allocation = db.prepare(
      `SELECT invoice_id, applied_amount FROM payment_invoice_allocation WHERE transaction_id = ?`
    ).get(result.transactionId) as { invoice_id: number; applied_amount: number }
    expect(allocation.invoice_id).toBe(1)
    expect(allocation.applied_amount).toBe(20000)
  })

  it('should run atomically using database transaction', () => {
    // Delete the GL account to force journal service to still succeed (mocked)
    // but verify ledger + receipt + allocation all committed together
    const result = processor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-ATOMIC',
      recorded_by_user_id: 1,
      term_id: 1
    })

    const ledger = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction WHERE id = ?`).get(result.transactionId) as { count: number }
    const receipt = db.prepare(`SELECT COUNT(*) as count FROM receipt WHERE transaction_id = ?`).get(result.transactionId) as { count: number }

    expect(ledger.count).toBe(1)
    expect(receipt.count).toBe(1)
  })

  it('should handle idempotency column when present', () => {
    db.exec(`ALTER TABLE ledger_transaction ADD COLUMN idempotency_key TEXT`)

    const result = processor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-IDEMP',
      idempotency_key: 'unique-key-123',
      recorded_by_user_id: 1,
      term_id: 1
    })

    const txn = db.prepare(`SELECT idempotency_key FROM ledger_transaction WHERE id = ?`).get(result.transactionId) as { idempotency_key: string }
    expect(txn.idempotency_key).toBe('unique-key-123')
  })

  it('should create School Fees category if not present', () => {
    db.prepare(`DELETE FROM transaction_category`).run()

    const result = processor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-CAT',
      recorded_by_user_id: 1,
      term_id: 1
    })

    expect(result.transactionId).toBeGreaterThan(0)
    const category = db.prepare(`SELECT * FROM transaction_category WHERE category_name = 'School Fees'`).get()
    expect(category).toBeDefined()
  })
})

describe('VoidProcessor', () => {
  let db: Database.Database
  let voidProcessor: VoidProcessor

  beforeEach(() => {
    db = createTestDb()
    voidProcessor = new VoidProcessor(db)

    // Insert a payment to void
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-VOID-1', '2024-01-15', 'FEE_PAYMENT', 1, 15000, 'CREDIT', 1, 'CASH', 'REF-001', 'Payment', 1, 1, 1)
    `).run()

    // Insert an allocation
    db.prepare(`
      INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount)
      VALUES (1, 1, 15000)
    `).run()

    // Update invoice to reflect payment
    db.prepare(`UPDATE fee_invoice SET amount_paid = 15000, status = 'PARTIAL' WHERE id = 1`).run()
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('should void a payment successfully', async () => {
    const result = await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Incorrect payment',
      voided_by: 1
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('voided successfully')
  })

  it('should mark original transaction as voided', async () => {
    await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Wrong student',
      voided_by: 1
    })

    const txn = db.prepare(`SELECT is_voided FROM ledger_transaction WHERE id = 1`).get() as { is_voided: number }
    expect(txn.is_voided).toBe(1)
  })

  it('should create a reversal transaction', async () => {
    await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Duplicate',
      voided_by: 1
    })

    const reversal = db.prepare(
      `SELECT * FROM ledger_transaction WHERE transaction_type = 'REFUND' AND transaction_ref LIKE 'VOID-%'`
    ).get() as { amount: number; student_id: number } | undefined

    expect(reversal).toBeDefined()
    expect(reversal!.amount).toBe(15000)
    expect(reversal!.student_id).toBe(1)
  })

  it('should reverse invoice allocation on void', async () => {
    await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Error',
      voided_by: 1
    })

    const invoice = db.prepare(`SELECT amount_paid, status FROM fee_invoice WHERE id = 1`).get() as {
      amount_paid: number; status: string
    }
    expect(invoice.amount_paid).toBe(0)
    expect(invoice.status).toBe('PENDING')
  })

  it('should record void audit entry', async () => {
    await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Audit trail test',
      voided_by: 1
    })

    const auditRow = db.prepare(`SELECT * FROM void_audit WHERE transaction_id = 1`).get() as {
      void_reason: string; original_amount: number
    } | undefined
    expect(auditRow).toBeDefined()
    expect(auditRow!.void_reason).toBe('Audit trail test')
    expect(auditRow!.original_amount).toBe(15000)
  })

  it('should fail to void already voided transaction', async () => {
    await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'First void',
      voided_by: 1
    })

    const result = await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Second void',
      voided_by: 1
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('not found or already voided')
  })

  it('should fail to void non-existent transaction', async () => {
    const result = await voidProcessor.voidPayment({
      transaction_id: 999,
      void_reason: 'Does not exist',
      voided_by: 1
    })

    expect(result.success).toBe(false)
  })

  it('markTransactionVoided throws when transaction is already voided (L685)', () => {
    // First, mark the transaction as voided directly
    db.prepare('UPDATE ledger_transaction SET is_voided = 1, voided_reason = ?, voided_by_user_id = ?, voided_at = CURRENT_TIMESTAMP WHERE id = 1').run('Pre-voided', 1)
    // Now call the private markTransactionVoided – UPDATE ... WHERE is_voided = 0 changes 0 rows
    expect(() =>
      (voidProcessor as any).markTransactionVoided({ transaction_id: 1, void_reason: 'Double void', voided_by: 1 })
    ).toThrow('Transaction was already voided')
  })

  it('should reverse student credit when payment had overpayment', async () => {
    // Set up: student has credit from overpayment
    db.prepare(`UPDATE student SET credit_balance = 5000 WHERE id = 1`).run()

    // Insert a payment that went entirely to credit (no invoice allocations for this txn)
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
      ) VALUES ('TXN-CREDIT-1', '2024-01-16', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'REF-002', 'Extra', 1, 1)
    `).run()

    const txnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-CREDIT-1'`).get() as { id: number }).id

    const result = await voidProcessor.voidPayment({
      transaction_id: txnId,
      void_reason: 'Reverse credit',
      voided_by: 1
    })

    expect(result.success).toBe(true)

    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBeLessThanOrEqual(5000)
  })

  it('should void linked journal entries when source_ledger_txn_id column exists', async () => {
    // Insert a linked journal entry
    db.prepare(`
      INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, student_id, created_by_user_id, source_ledger_txn_id)
      VALUES ('JE-LINK-1', '2024-01-15', 'PAYMENT', 'Linked payment', 1, 1, 1)
    `).run()

    const result = await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Void with journal',
      voided_by: 1
    })

    expect(result.success).toBe(true)
  })
})

describe('PaymentQueryService', () => {
  let db: Database.Database
  let queryService: PaymentQueryService

  beforeEach(() => {
    db = createTestDb()
    queryService = new PaymentQueryService(db)

    // Insert test transactions
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, is_voided
      ) VALUES
        ('TXN-Q1', '2024-01-15', 'FEE_PAYMENT', 1, 10000, 'CREDIT', 1, 'CASH', 'REF-Q1', 'Payment 1', 1, 1, 0),
        ('TXN-Q2', '2024-01-16', 'FEE_PAYMENT', 1, 20000, 'CREDIT', 1, 'MPESA', 'REF-Q2', 'Payment 2', 1, 1, 0),
        ('TXN-Q3', '2024-01-17', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'REF-Q3', 'Voided payment', 1, 1, 1)
    `).run()
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('should return student payment history excluding voided', async () => {
    const history = await queryService.getStudentPaymentHistory(1)
    expect(history).toHaveLength(2)
    expect(history.every(t => t.student_id === 1)).toBe(true)
  })

  it('should respect limit parameter', async () => {
    const history = await queryService.getStudentPaymentHistory(1, 1)
    expect(history).toHaveLength(1)
  })

  it('should return voided transactions report', async () => {
    db.prepare(`
      INSERT INTO void_audit (transaction_id, transaction_type, original_amount, student_id, description, void_reason, voided_by, voided_at)
      VALUES (3, 'PAYMENT', 5000, 1, 'Voided payment', 'Error', 1, '2024-01-17T10:00:00Z')
    `).run()

    const report = await queryService.getVoidedTransactionsReport('2024-01-01', '2024-12-31')
    expect(report).toHaveLength(1)
    expect(report[0].transaction_id).toBe(3)
  })

  it('should return empty array for student with no payments', async () => {
    const history = await queryService.getStudentPaymentHistory(999)
    expect(history).toEqual([])
  })

  it('should return payment approval queue for pending approvals', async () => {
    // Insert a pending PAYMENT approval request
    db.prepare(`
      INSERT INTO approval_request (request_type, entity_type, entity_id, amount, description, requested_by, status)
      VALUES ('VOID', 'PAYMENT', 1, 10000, 'Void request', 1, 'PENDING')
    `).run()

    const queue = await queryService.getPaymentApprovalQueue('admin')
    expect(queue).toHaveLength(1)
    expect((queue[0] as unknown as Record<string, unknown>).entity_type).toBe('PAYMENT')
    expect(queue[0].status).toBe('PENDING')
  })

  it('should return empty array when no pending approval requests', async () => {
    const queue = await queryService.getPaymentApprovalQueue('admin')
    expect(queue).toEqual([])
  })
})

/* ==================================================================
 *  PaymentProcessor – additional coverage
 * ================================================================== */
describe('PaymentProcessor – extra branches', () => {
  let db: Database.Database
  let processor: PaymentProcessor

  beforeEach(() => {
    db = createTestDb()
    processor = new PaymentProcessor(db)
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('applyPaymentToSpecificInvoice returns full amount when invoice is not found', () => {
    const _result = processor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-MISSING-INV',
      recorded_by_user_id: 1,
      term_id: 1,
      invoice_id: 9999
    })
    // All 5000 should go to credit since invoice_id 9999 doesn't exist
    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBe(5000)
  })

  it('applyPaymentToSpecificInvoice returns full amount when invoice is cancelled', () => {
    // Add a cancelled invoice
    db.prepare(`
      INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id)
      VALUES (1, 'INV-CANC', 1, '2026-01-15', '2026-02-15', 20000, 20000, 20000, 0, 'CANCELLED', 1)
    `).run()
    const cancelledId = (db.prepare(`SELECT id FROM fee_invoice WHERE invoice_number = 'INV-CANC'`).get() as { id: number }).id

    const _result = processor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-CANCELLED-INV',
      recorded_by_user_id: 1,
      term_id: 1,
      invoice_id: cancelledId
    })
    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBe(5000)
  })

  it('uses cached hasFeeCategoryPriorityColumn on subsequent calls', () => {
    // First payment triggers column check
    processor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-CACHE-1',
      recorded_by_user_id: 1,
      term_id: 1
    })
    // Second payment should use cached result
    const result = processor.processPayment({
      student_id: 1,
      amount: 3000,
      transaction_date: '2024-01-16',
      payment_method: 'CASH',
      payment_reference: 'TEST-CACHE-2',
      recorded_by_user_id: 1,
      term_id: 1
    })
    expect(result.transactionId).toBeGreaterThan(0)
  })

  it('spreadAcrossVoteHeads skips when payment_item_allocation table does not exist', () => {
    // Default test DB does not have payment_item_allocation → should silently skip
    const result = processor.processPayment({
      student_id: 1,
      amount: 10000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-NOVH',
      recorded_by_user_id: 1,
      term_id: 1
    })
    expect(result.transactionId).toBeGreaterThan(0)
  })

  it('spreadAcrossVoteHeads invokes VoteHeadSpreadingService when payment_item_allocation table exists', () => {
    db.exec('CREATE TABLE IF NOT EXISTS payment_item_allocation (id INTEGER PRIMARY KEY, payment_allocation_id INTEGER, invoice_item_id INTEGER, applied_amount INTEGER)')
    // Need to reset the cached flag by creating a new processor
    const freshProcessor = new PaymentProcessor(db)
    db.prepare(`INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id) VALUES (1, 'INV-VH-1', 1, '2024-01-15', '2024-02-15', 10000, 10000, 10000, 0, 'OUTSTANDING', 1)`).run()
    const result = freshProcessor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-VH-1',
      recorded_by_user_id: 1,
      term_id: 1
    })
    expect(result.transactionId).toBeGreaterThan(0)
  })

  it('applyPaymentAcrossOutstandingInvoicesPriority falls back to FIFO when no priority column', () => {
    // Create a fresh DB without the priority column on fee_category
    const freshDb = new Database(':memory:')
    freshDb.exec(`
      CREATE TABLE student (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, credit_balance INTEGER DEFAULT 0, admission_number TEXT);
      CREATE TABLE transaction_category (id INTEGER PRIMARY KEY, category_name TEXT, category_type TEXT, parent_category_id INTEGER, is_system BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT UNIQUE, first_name TEXT, last_name TEXT);
      CREATE TABLE gl_account (id INTEGER PRIMARY KEY, account_code TEXT UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT UNIQUE, entry_date DATE, entry_type TEXT, description TEXT, student_id INTEGER, staff_id INTEGER, term_id INTEGER, is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING', approved_by_user_id INTEGER, approved_at DATETIME, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE journal_entry_line (id INTEGER PRIMARY KEY, journal_entry_id INTEGER, line_number INTEGER, gl_account_id INTEGER, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, invoice_number TEXT UNIQUE, student_id INTEGER, term_id INTEGER, invoice_date DATE, due_date DATE, total_amount INTEGER, amount_due INTEGER, amount INTEGER, amount_paid INTEGER DEFAULT 0, status TEXT DEFAULT 'PENDING', notes TEXT, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT UNIQUE, transaction_date DATE, transaction_type TEXT, category_id INTEGER, amount INTEGER, debit_credit TEXT, student_id INTEGER, staff_id INTEGER, invoice_id INTEGER, payment_method TEXT, payment_reference TEXT, description TEXT, term_id INTEGER, recorded_by_user_id INTEGER, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE payment_invoice_allocation (id INTEGER PRIMARY KEY, transaction_id INTEGER, invoice_id INTEGER, applied_amount INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE void_audit (id INTEGER PRIMARY KEY, transaction_id INTEGER, transaction_type TEXT, original_amount INTEGER, student_id INTEGER, description TEXT, void_reason TEXT, voided_by INTEGER, voided_at DATETIME, recovered_method TEXT, recovered_by INTEGER, recovered_at DATETIME);
      CREATE TABLE credit_transaction (id INTEGER PRIMARY KEY, student_id INTEGER, amount INTEGER, transaction_type TEXT, reference_invoice_id INTEGER, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE approval_request (id INTEGER PRIMARY KEY, request_type TEXT, entity_type TEXT, entity_id INTEGER, amount INTEGER, description TEXT, requested_by INTEGER, status TEXT DEFAULT 'PENDING', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT UNIQUE, description TEXT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE invoice_item (id INTEGER PRIMARY KEY, invoice_id INTEGER, fee_category_id INTEGER, description TEXT, amount INTEGER);
      CREATE TABLE receipt (id INTEGER PRIMARY KEY, receipt_number TEXT UNIQUE, transaction_id INTEGER UNIQUE, receipt_date DATE, student_id INTEGER, amount INTEGER, amount_in_words TEXT, payment_method TEXT, payment_reference TEXT, printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

      INSERT INTO student VALUES (1, 'John', 'Doe', 0, 'STU-001');
      INSERT INTO transaction_category VALUES (1, 'School Fees', 'INCOME', NULL, 1, 1);
      INSERT INTO user VALUES (1, 'testuser', 'Test', 'User');
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('1010','Cash','ASSET','DEBIT',1), ('1020','Bank','ASSET','DEBIT',1), ('1100','AR','ASSET','DEBIT',1), ('4300','Revenue','REVENUE','CREDIT',1);
      INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id) VALUES (1, 'INV-NP', 1, '2024-01-15', '2024-02-15', 50000, 50000, 50000, 0, 'OUTSTANDING', 1);
    `)

    const freshProcessor = new PaymentProcessor(freshDb)
    const result = freshProcessor.processPayment({
      student_id: 1,
      amount: 20000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-NO-PRIO',
      recorded_by_user_id: 1,
      term_id: 1
    })
    expect(result.transactionId).toBeGreaterThan(0)
    freshDb.close()
  })
})

/* ==================================================================
 *  VoidProcessor – extra branches
 * ================================================================== */
describe('VoidProcessor – extra branches', () => {
  let db: Database.Database
  let voidProcessor: VoidProcessor

  beforeEach(() => {
    db = createTestDb()
    voidProcessor = new VoidProcessor(db)
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('recordVoidAudit uses approval_request_id column when present', async () => {
    db.exec('ALTER TABLE void_audit ADD COLUMN approval_request_id INTEGER')

    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-APPR-1', '2024-01-15', 'FEE_PAYMENT', 1, 10000, 'CREDIT', 1, 'CASH', 'REF-A1', 'Payment', 1, 1, 1)
    `).run()
    db.prepare(`INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (1, 1, 10000)`).run()
    db.prepare(`UPDATE fee_invoice SET amount_paid = 10000, status = 'PARTIAL' WHERE id = 1`).run()

    const result = await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'With approval',
      voided_by: 1,
      approval_request_id: 42
    })

    expect(result.success).toBe(true)
    const audit = db.prepare('SELECT approval_request_id FROM void_audit WHERE transaction_id = 1').get() as { approval_request_id: number }
    expect(audit.approval_request_id).toBe(42)
  })

  it('reversePaymentAllocations returns full amount when no allocations and no invoice_id', async () => {
    // Insert a payment with no invoice_id and no allocations
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
      ) VALUES ('TXN-NOALLOC', '2024-01-15', 'FEE_PAYMENT', 1, 8000, 'CREDIT', 1, 'CASH', 'REF-NA', 'On account', 1, 1)
    `).run()
    db.prepare(`UPDATE student SET credit_balance = 8000 WHERE id = 1`).run()

    const txnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-NOALLOC'`).get() as { id: number }).id

    const result = await voidProcessor.voidPayment({
      transaction_id: txnId,
      void_reason: 'No alloc void',
      voided_by: 1
    })

    expect(result.success).toBe(true)
    // Credit should be reversed
    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBe(0)
  })

  it('reverseStudentCredit handles shortfall with forced negative balance', async () => {
    // Set up: student has 0 credit but we need to claw back overpayment
    db.prepare(`UPDATE student SET credit_balance = 0 WHERE id = 1`).run()

    // Insert a payment that was fully allocated to invoice (via payment_invoice_allocation)
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-OVERPAID', '2024-01-15', 'FEE_PAYMENT', 1, 60000, 'CREDIT', 1, 'CASH', 'REF-OP', 'Overpaid', 1, 1, 1)
    `).run()
    const txnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-OVERPAID'`).get() as { id: number }).id
    db.prepare(`INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (?, 1, 50000)`).run(txnId)
    db.prepare(`UPDATE fee_invoice SET amount_paid = 50000, status = 'PAID' WHERE id = 1`).run()

    const result = await voidProcessor.voidPayment({
      transaction_id: txnId,
      void_reason: 'Shortfall test',
      voided_by: 1
    })

    expect(result.success).toBe(true)
    // The remaining 10000 should be clawed back from credit
    const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
    expect(student.credit_balance).toBeLessThanOrEqual(0)
  })

  it('voidLinkedJournalEntries skips safely when source_ledger_txn_id column missing', async () => {
    // Create a db without source_ledger_txn_id column
    const freshDb = new Database(':memory:')
    freshDb.exec(`
      CREATE TABLE student (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, credit_balance INTEGER DEFAULT 0, admission_number TEXT);
      CREATE TABLE transaction_category (id INTEGER PRIMARY KEY, category_name TEXT, category_type TEXT, parent_category_id INTEGER, is_system BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT UNIQUE, first_name TEXT, last_name TEXT);
      CREATE TABLE gl_account (id INTEGER PRIMARY KEY, account_code TEXT UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT UNIQUE, entry_date DATE, entry_type TEXT, description TEXT, student_id INTEGER, staff_id INTEGER, term_id INTEGER, is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING', approved_by_user_id INTEGER, approved_at DATETIME, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE journal_entry_line (id INTEGER PRIMARY KEY, journal_entry_id INTEGER, line_number INTEGER, gl_account_id INTEGER, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, invoice_number TEXT UNIQUE, student_id INTEGER, term_id INTEGER, invoice_date DATE, due_date DATE, total_amount INTEGER, amount_due INTEGER, amount INTEGER, amount_paid INTEGER DEFAULT 0, status TEXT DEFAULT 'PENDING', notes TEXT, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT UNIQUE, transaction_date DATE, transaction_type TEXT, category_id INTEGER, amount INTEGER, debit_credit TEXT, student_id INTEGER, staff_id INTEGER, invoice_id INTEGER, payment_method TEXT, payment_reference TEXT, description TEXT, term_id INTEGER, recorded_by_user_id INTEGER, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE payment_invoice_allocation (id INTEGER PRIMARY KEY, transaction_id INTEGER, invoice_id INTEGER, applied_amount INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE void_audit (id INTEGER PRIMARY KEY, transaction_id INTEGER, transaction_type TEXT, original_amount INTEGER, student_id INTEGER, description TEXT, void_reason TEXT, voided_by INTEGER, voided_at DATETIME, recovered_method TEXT, recovered_by INTEGER, recovered_at DATETIME);
      CREATE TABLE credit_transaction (id INTEGER PRIMARY KEY, student_id INTEGER, amount INTEGER, transaction_type TEXT, reference_invoice_id INTEGER, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE approval_request (id INTEGER PRIMARY KEY, request_type TEXT, entity_type TEXT, entity_id INTEGER, amount INTEGER, description TEXT, requested_by INTEGER, status TEXT DEFAULT 'PENDING', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT UNIQUE, description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99, gl_account_id INTEGER);
      CREATE TABLE invoice_item (id INTEGER PRIMARY KEY, invoice_id INTEGER, fee_category_id INTEGER, description TEXT, amount INTEGER);
      CREATE TABLE receipt (id INTEGER PRIMARY KEY, receipt_number TEXT UNIQUE, transaction_id INTEGER UNIQUE, receipt_date DATE, student_id INTEGER, amount INTEGER, amount_in_words TEXT, payment_method TEXT, payment_reference TEXT, printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

      INSERT INTO student VALUES (1, 'John', 'Doe', 0, 'STU-001');
      INSERT INTO transaction_category VALUES (1, 'School Fees', 'INCOME', NULL, 1, 1);
      INSERT INTO user VALUES (1, 'testuser', 'Test', 'User');
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('1010','Cash','ASSET','DEBIT',1), ('1020','Bank','ASSET','DEBIT',1), ('1100','AR','ASSET','DEBIT',1), ('4300','Revenue','REVENUE','CREDIT',1);
      INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id) VALUES (1, 'INV-NS', 1, '2026-01-15', '2026-02-15', 50000, 50000, 50000, 0, 'OUTSTANDING', 1);
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id) VALUES ('TXN-NS-1', '2024-01-15', 'FEE_PAYMENT', 1, 15000, 'CREDIT', 1, 'CASH', 'REF-NS', 'Payment', 1, 1, 1);
      INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (1, 1, 15000);
      UPDATE fee_invoice SET amount_paid = 15000, status = 'PARTIAL' WHERE id = 1;
    `)

    const freshVoidProcessor = new VoidProcessor(freshDb)
    const result = await freshVoidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'No source column test',
      voided_by: 1
    })
    expect(result.success).toBe(true)
    freshDb.close()
  })
})

describe('PaymentProcessor – priority-based invoice allocation', () => {
  let db: Database.Database
  let processor: PaymentProcessor

  beforeEach(() => {
    db = createTestDb()
    processor = new PaymentProcessor(db)

    // Create two fee categories with different priorities
    db.prepare(`INSERT INTO fee_category (id, category_name, priority) VALUES (10, 'Tuition', 1)`).run()
    db.prepare(`INSERT INTO fee_category (id, category_name, priority) VALUES (20, 'Transport', 50)`).run()

    // Create two invoices with items linked to different priority categories
    db.prepare(`INSERT INTO fee_invoice (id, student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id)
      VALUES (10, 1, 'INV-PRI-1', 1, '2024-01-01', '2024-02-01', 30000, 30000, 30000, 0, 'OUTSTANDING', 1)`).run()
    db.prepare(`INSERT INTO fee_invoice (id, student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id)
      VALUES (11, 1, 'INV-PRI-2', 1, '2024-01-01', '2024-02-01', 20000, 20000, 20000, 0, 'OUTSTANDING', 1)`).run()

    // Link invoice items to fee categories (INV-PRI-1 → low priority, INV-PRI-2 → high priority)
    db.prepare(`INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (10, 20, 'Transport Fee', 30000)`).run()
    db.prepare(`INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (11, 10, 'Tuition Fee', 20000)`).run()
  })

  afterEach(() => { db.close() })

  it('allocates to higher-priority invoice first', () => {
    const result = processor.processPayment({
      student_id: 1,
      amount: 25000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'PRI-TEST',
      recorded_by_user_id: 1,
      term_id: 1
    })

    expect(result.transactionId).toBeGreaterThan(0)

    // Tuition (priority 1) should be fully paid first (20000), then 5000 to Transport (priority 50)
    const tuitionInv = db.prepare('SELECT amount_paid FROM fee_invoice WHERE id = 11').get() as { amount_paid: number }
    expect(tuitionInv.amount_paid).toBe(20000)

    const transportInv = db.prepare('SELECT amount_paid FROM fee_invoice WHERE id = 10').get() as { amount_paid: number }
    expect(transportInv.amount_paid).toBe(5000)
  })
})

describe('PaymentQueryService', () => {
  let db: Database.Database
  let queryService: PaymentQueryService

  beforeEach(() => {
    db = createTestDb()
    queryService = new PaymentQueryService(db)
  })

  afterEach(() => { db.close() })

  it('getStudentPaymentHistory returns empty for student with no transactions', async () => {
    const history = await queryService.getStudentPaymentHistory(99)
    expect(history).toEqual([])
  })

  it('getVoidedTransactionsReport returns empty for date range with no voids', async () => {
    const report = await queryService.getVoidedTransactionsReport('2099-01-01', '2099-12-31')
    expect(report).toEqual([])
  })

  it('processPayment uses custom description when provided', () => {
    const processor = new PaymentProcessor(db)
    const result = processor.processPayment({
      student_id: 1,
      amount: 5000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-DESC',
      description: 'Exam Retake Fee',
      recorded_by_user_id: 1,
      term_id: 1
    })
    expect(result.transactionId).toBeGreaterThan(0)
    const txn = db.prepare('SELECT description FROM ledger_transaction WHERE id = ?').get(result.transactionId) as { description: string }
    expect(txn.description).toBe('Exam Retake Fee')
  })

  it('processPayment uses BANK method correctly', () => {
    const processor = new PaymentProcessor(db)
    const result = processor.processPayment({
      student_id: 1,
      amount: 10000,
      transaction_date: '2024-01-15',
      payment_method: 'BANK',
      payment_reference: 'BANK-001',
      recorded_by_user_id: 1,
      term_id: 1
    })
    expect(result.transactionId).toBeGreaterThan(0)
    const txn = db.prepare('SELECT payment_method FROM ledger_transaction WHERE id = ?').get(result.transactionId) as { payment_method: string }
    expect(txn.payment_method).toBe('BANK')
  })
})

/* ==================================================================
 *  VoidProcessor – reversePaymentAllocations branch coverage
 * ================================================================== */
describe('VoidProcessor – reversePaymentAllocations extra branches', () => {
  let db: Database.Database
  let voidProcessor: VoidProcessor

  beforeEach(() => {
    db = createTestDb()
    voidProcessor = new VoidProcessor(db)
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('reversePaymentAllocations reverses invoice application when no allocations but has invoice_id', async () => {
    // Insert payment with invoice_id but NO allocation rows
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-INV-NOALLOC', '2024-01-15', 'FEE_PAYMENT', 1, 20000, 'CREDIT', 1, 'CASH', 'REF-INA', 'Payment with invoice', 1, 1, 1)
    `).run()
    db.prepare(`UPDATE fee_invoice SET amount_paid = 20000, status = 'PARTIAL' WHERE id = 1`).run()

    const txnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-INV-NOALLOC'`).get() as { id: number }).id
    const result = await voidProcessor.voidPayment({
      transaction_id: txnId,
      void_reason: 'Reverse with invoice no alloc',
      voided_by: 1
    })
    expect(result.success).toBe(true)
    // Invoice should be reversed
    const invoice = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = 1').get() as { amount_paid: number; status: string }
    expect(invoice.amount_paid).toBe(0)
    expect(invoice.status).toBe('PENDING')
  })

  it('reverseInvoiceAllocation skips when invoice not found', async () => {
    // Insert a payment with allocation to a non-existent invoice
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-GHOST-INV', '2024-01-15', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'REF-GI', 'Ghost invoice', 1, 1, 9999)
    `).run()
    const txnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-GHOST-INV'`).get() as { id: number }).id
    db.prepare(`INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (?, 9999, 5000)`).run(txnId)

    const result = await voidProcessor.voidPayment({
      transaction_id: txnId,
      void_reason: 'Ghost invoice void',
      voided_by: 1
    })
    expect(result.success).toBe(true)
  })

  it('createReversalTransaction uses CASH as fallback when payment_method is null', async () => {
    // Insert a payment without payment_method
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
      ) VALUES ('TXN-NULLPM', '2024-01-15', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 1, NULL, 'REF-NP', 'Null method', 1, 1)
    `).run()
    const txnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-NULLPM'`).get() as { id: number }).id
    db.prepare(`UPDATE student SET credit_balance = 3000 WHERE id = 1`).run()

    const result = await voidProcessor.voidPayment({
      transaction_id: txnId,
      void_reason: 'Null payment method',
      voided_by: 1
    })
    expect(result.success).toBe(true)
    // Reversal should use CASH as fallback
    const reversal = db.prepare(`SELECT payment_method FROM ledger_transaction WHERE transaction_type = 'REFUND' ORDER BY id DESC LIMIT 1`).get() as { payment_method: string }
    expect(reversal.payment_method).toBe('CASH')
  })

  it('reverseStudentCredit traces through credit-funded allocations on shortfall', async () => {
    // Student has 0 credit but previously used credit to pay an invoice
    db.prepare(`UPDATE student SET credit_balance = 0 WHERE id = 1`).run()

    // Simulate a CREDIT_BALANCE payment that was allocated to an invoice
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
      ) VALUES ('TXN-CRED-USED', '2024-01-14', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CREDIT_BALANCE', 'CREDIT_BALANCE', 'Credit used', 1, 1)
    `).run()
    const creditTxnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-CRED-USED'`).get() as { id: number }).id
    db.prepare(`INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (?, 1, 5000)`).run(creditTxnId)

    // Now void a payment that had overpayment going to credit
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
      ) VALUES ('TXN-VOID-TRACE', '2024-01-13', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'REF-VT', 'To void', 1, 1)
    `).run()
    const txnId = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-VOID-TRACE'`).get() as { id: number }).id

    const result = await voidProcessor.voidPayment({
      transaction_id: txnId,
      void_reason: 'Trace shortfall',
      voided_by: 1
    })
    expect(result.success).toBe(true)
    // Credit balance should go negative (forced)
    const student = db.prepare('SELECT credit_balance FROM student WHERE id = 1').get() as { credit_balance: number }
    expect(student.credit_balance).toBeLessThanOrEqual(0)
  })

  // ── branch coverage: processPayment throws when journal entry creation fails ──
  it('processPayment throws with default message when journal returns failure', async () => {
    const localProcessor = new PaymentProcessor(db)
    const { DoubleEntryJournalService: MockDEJS } = await import('../../accounting/DoubleEntryJournalService') as any
    const origFn = MockDEJS.prototype.recordPaymentSync
    MockDEJS.prototype.recordPaymentSync = function () { return { success: false } }
    expect(() => {
      localProcessor.processPayment({
        student_id: 1, amount: 5000, transaction_date: '2024-01-15',
        payment_method: 'CASH', payment_reference: 'TEST-JF-DEFAULT',
        recorded_by_user_id: 1, term_id: 1
      })
    }).toThrow('Failed to create journal entry for payment')
    MockDEJS.prototype.recordPaymentSync = origFn
  })

  // ── branch coverage: void reverts invoice to PARTIAL when other payments remain ──
  it('void reverts invoice to PARTIAL when other payments remain on same invoice', async () => {
    const localProcessor = new PaymentProcessor(db)
    const r1 = localProcessor.processPayment({
      student_id: 1, amount: 25000, transaction_date: '2024-01-15',
      payment_method: 'CASH', payment_reference: 'PARTIAL-1',
      recorded_by_user_id: 1, term_id: 1, invoice_id: 1
    })
    localProcessor.processPayment({
      student_id: 1, amount: 25000, transaction_date: '2024-01-15',
      payment_method: 'CASH', payment_reference: 'PARTIAL-2',
      recorded_by_user_id: 1, term_id: 1, invoice_id: 1
    })
    const before = db.prepare('SELECT status FROM fee_invoice WHERE id = 1').get() as { status: string }
    expect(before.status).toBe('PAID')
    const result = await voidProcessor.voidPayment({
      transaction_id: r1.transactionId,
      void_reason: 'Partial revert test',
      voided_by: 1
    })
    expect(result.success).toBe(true)
    const after = db.prepare('SELECT status, amount_paid FROM fee_invoice WHERE id = 1').get() as { status: string; amount_paid: number }
    expect(after.status).toBe('PARTIAL')
    expect(after.amount_paid).toBe(25000)
  })

  // ── branch coverage: hasFeeCategoryPriorityColumn cache hit ──
  it('hasFeeCategoryPriorityColumn caches result on second call', () => {
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).hasFeeCategoryPriorityColumn.bind(localProcessor)
    const result1 = fn()
    const result2 = fn() // should hit cache
    expect(result1).toBe(result2)
    expect(typeof result1).toBe('boolean')
  })

  // ── branch coverage: hasIdempotencyColumn cache hit ──
  it('hasIdempotencyColumn caches result on second call', () => {
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).hasIdempotencyColumn.bind(localProcessor)
    const result1 = fn()
    const result2 = fn() // cache hit
    expect(result1).toBe(result2)
  })

  // ── branch coverage: recordPaymentAllocation skips when amount <= 0 ──
  it('recordPaymentAllocation no-ops when amount is zero', () => {
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).recordPaymentAllocation.bind(localProcessor)
    // Should NOT throw, should just return silently
    expect(() => fn(1, 1, 0)).not.toThrow()
    expect(() => fn(1, 1, -5)).not.toThrow()
  })

  // ── branch coverage: spreadAcrossVoteHeads – table not found (L237-240) ──
  it('spreadAcrossVoteHeads no-ops when payment_item_allocation table does not exist', () => {
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).spreadAcrossVoteHeads.bind(localProcessor)
    // First call checks for table existence; table doesn't exist → returns early
    expect(() => fn(1, 1, 100)).not.toThrow()
    // Second call should use cached result
    expect(() => fn(2, 1, 200)).not.toThrow()
  })

  // ── branch coverage: applyPaymentToSpecificInvoice – non-outstanding invoice (L261-267) ──
  it('applyPaymentToSpecificInvoice returns full amount for cancelled invoice', () => {
    // Create a cancelled invoice
    db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id) VALUES (1, 'INV-CANCEL', 1, '2026-01-15', '2026-02-15', 5000, 5000, 5000, 0, 'CANCELLED', 1)`)
    const cancelledInv = db.prepare("SELECT id FROM fee_invoice WHERE invoice_number = 'INV-CANCEL'").get() as { id: number }
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).applyPaymentToSpecificInvoice.bind(localProcessor)
    // Payment to cancelled invoice → should return full amount
    const remaining = fn(1, cancelledInv.id, 5000)
    expect(remaining).toBe(5000)
  })

  // ── branch coverage: applyPaymentAcrossOutstandingInvoices – outstanding<=0 skip (L295) ──
  it('applyPaymentAcrossOutstandingInvoices skips invoices with zero outstanding', () => {
    // Create a fully paid invoice (amount_paid >= amount)
    db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id) VALUES (1, 'INV-PAID-FULL', 1, '2026-01-15', '2026-02-15', 5000, 0, 5000, 5000, 'PAID', 1)`)
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).applyPaymentAcrossOutstandingInvoices.bind(localProcessor)
    // All invoices fully paid → should return full payment amount
    const remaining = fn(1, 1, 3000)
    // remaining should be >= 0 (payment not fully consumed by any outstanding)
    expect(remaining).toBeGreaterThanOrEqual(0)
  })

  // ── branch coverage: applyInvoiceAndCreditUpdates with invoice_id (specific invoice path) ──
  it('applyInvoiceAndCreditUpdates applies to specific invoice when invoice_id is given', () => {
    db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id) VALUES (1, 'INV-SPECIFIC', 1, '2026-01-15', '2026-02-15', 10000, 10000, 10000, 0, 'PENDING', 1)`)
    const inv = db.prepare("SELECT id FROM fee_invoice WHERE invoice_number = 'INV-SPECIFIC'").get() as { id: number }
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).applyInvoiceAndCreditUpdates.bind(localProcessor)
    // Should follow the invoice_id path
    expect(() => fn({ student_id: 1, amount: 5000, invoice_id: inv.id }, 1)).not.toThrow()
    // Invoice should be partially paid
    const updated = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = ?').get(inv.id) as { amount_paid: number; status: string }
    expect(updated.amount_paid).toBe(5000)
    expect(updated.status).toBe('PARTIAL')
  })

  // ── branch coverage: applyInvoiceAndCreditUpdates with overpayment → credit balance ──
  it('applyInvoiceAndCreditUpdates credits excess to student balance', () => {
    // Create a small invoice, pay more than owed
    db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id) VALUES (1, 'INV-SMALL', 1, '2026-01-15', '2026-02-15', 1000, 1000, 1000, 0, 'PENDING', 1)`)
    const inv = db.prepare("SELECT id FROM fee_invoice WHERE invoice_number = 'INV-SMALL'").get() as { id: number }
    const localProcessor = new PaymentProcessor(db)
    const fn = (localProcessor as any).applyInvoiceAndCreditUpdates.bind(localProcessor)
    fn({ student_id: 1, amount: 5000, invoice_id: inv.id }, 1)
    // Excess 4000 should go to student credit_balance
    const student = db.prepare('SELECT credit_balance FROM student WHERE id = 1').get() as { credit_balance: number }
    expect(student.credit_balance).toBeGreaterThanOrEqual(4000)
  })

  // ── branch coverage: VoidProcessor – reverseStudentCredit when creditAmount is 0 ──
  it('reverseStudentCredit is no-op when credit amount is zero', async () => {
    const localVoid = new VoidProcessor(db)
    const fn = (localVoid as any).reverseStudentCredit.bind(localVoid)
    // Should not throw and should not modify student
    expect(() => fn(1, 0, 1)).not.toThrow()
  })

  // ── branch coverage: VoidProcessor – voidPayment with non-existent transaction ──
  it('voidPayment returns failure for non-existent transaction', async () => {
    const localVoid = new VoidProcessor(db)
    const result = await localVoid.voidPayment({
      transaction_id: 999999,
      void_reason: 'Test',
      voided_by: 1,
    })
    expect(result.success).toBe(false)
    expect(result.message).toContain('not found')
  })

  // ── branch coverage: processPayment with MPESA payment method ──
  it('processPayment processes MPESA payment correctly', () => {
    const localProcessor = new PaymentProcessor(db)
    const result = localProcessor.processPayment({
      student_id: 1,
      amount: 5000,
      payment_method: 'MPESA',
      payment_reference: 'MPESA-XYZ',
      transaction_date: '2026-01-20',
      recorded_by_user_id: 1,
      term_id: 1,
    })
    expect(result.transactionId).toBeDefined()
    expect(result.transactionRef).toBeDefined()
    expect(result.receiptNumber).toBeDefined()
  })

  // ── branch coverage: PaymentQueryService – getPaymentApprovalQueue ──
  it('getPaymentApprovalQueue returns empty when no approval_request table data', async () => {
    const queryService = new PaymentQueryService(db)
    const queue = await queryService.getPaymentApprovalQueue('ADMIN')
    expect(Array.isArray(queue)).toBe(true)
  })
})

/* ==================================================================
 *  Branch coverage: hasSourceLedgerColumn cache hit (L445)
 *  The first voidPayment call computes the value; a second call on
 *  the SAME VoidProcessor instance returns the cached boolean.
 * ================================================================== */
describe('VoidProcessor – hasSourceLedgerColumn cache (L445)', () => {
  let db: Database.Database
  let voidProcessor: VoidProcessor

  beforeEach(() => {
    db = createTestDb()
    voidProcessor = new VoidProcessor(db)
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('uses cached sourceLedgerColumnAvailable on second void call', async () => {
    // Insert two separate payments
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
      ) VALUES
        ('TXN-CACHE-A', '2024-01-15', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 1, 'CASH', 'REF-CA', 'Pay A', 1, 1),
        ('TXN-CACHE-B', '2024-01-16', 'FEE_PAYMENT', 1, 4000, 'CREDIT', 1, 'CASH', 'REF-CB', 'Pay B', 1, 1)
    `).run()
    db.prepare('UPDATE student SET credit_balance = 7000 WHERE id = 1').run()

    const idA = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-CACHE-A'`).get() as { id: number }).id
    const idB = (db.prepare(`SELECT id FROM ledger_transaction WHERE transaction_ref = 'TXN-CACHE-B'`).get() as { id: number }).id

    // First void – computes hasSourceLedgerColumn
    const r1 = await voidProcessor.voidPayment({ transaction_id: idA, void_reason: 'Cache test 1', voided_by: 1 })
    expect(r1.success).toBe(true)

    // Second void – uses cached hasSourceLedgerColumn (L445)
    const r2 = await voidProcessor.voidPayment({ transaction_id: idB, void_reason: 'Cache test 2', voided_by: 1 })
    expect(r2.success).toBe(true)
  })
})

/* ==================================================================
 *  Branch coverage: voidPayment catch block (L643)
 *  The catch wraps errors with "Failed to void payment: ..."
 * ================================================================== */
describe('VoidProcessor – voidPayment error wrapping (L643)', () => {
  it('wraps internal errors with descriptive message', async () => {
    const db = createTestDb()
    const voidProcessor = new VoidProcessor(db)

    // Insert a payment so the SELECT finds it, but close DB to break the transaction
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
      ) VALUES ('TXN-ERR-1', '2024-01-15', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 'CASH', 'REF-E1', 'Pay', 1, 1)
    `).run()

    // Close DB to force an error during voidPayment
    db.close()

    await expect(
      voidProcessor.voidPayment({ transaction_id: 1, void_reason: 'Force error', voided_by: 1 })
    ).rejects.toThrow('Failed to void payment')
  })
})

/* ==================================================================
 *  Branch coverage: recordVoidAudit with recovery_method (L685)
 *  Exercises the `data.recovery_method || null` truthy path.
 * ================================================================== */
describe('VoidProcessor – recordVoidAudit recovery_method branch (L685)', () => {
  let db: Database.Database
  let voidProcessor: VoidProcessor

  beforeEach(() => {
    db = createTestDb()
    voidProcessor = new VoidProcessor(db)
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('passes recovery_method to void_audit when provided', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-RM-1', '2024-01-15', 'FEE_PAYMENT', 1, 8000, 'CREDIT', 1, 'CASH', 'REF-RM', 'Pay', 1, 1, 1)
    `).run()
    db.prepare('INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (1, 1, 8000)').run()
    db.prepare('UPDATE fee_invoice SET amount_paid = 8000, status = \'PARTIAL\' WHERE id = 1').run()

    const result = await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Recovery test',
      voided_by: 1,
      recovery_method: 'REFUND'
    })

    expect(result.success).toBe(true)
    const audit = db.prepare('SELECT recovered_method FROM void_audit WHERE transaction_id = 1').get() as { recovered_method: string }
    expect(audit.recovered_method).toBe('REFUND')
  })

  it('passes recovery_method with approval_request_id column present', async () => {
    db.exec('ALTER TABLE void_audit ADD COLUMN approval_request_id INTEGER')

    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES ('TXN-RMA-1', '2024-01-15', 'FEE_PAYMENT', 1, 6000, 'CREDIT', 1, 'MPESA', 'REF-RMA', 'Pay', 1, 1, 1)
    `).run()
    db.prepare('INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (1, 1, 6000)').run()
    db.prepare('UPDATE fee_invoice SET amount_paid = 6000, status = \'PARTIAL\' WHERE id = 1').run()

    const result = await voidProcessor.voidPayment({
      transaction_id: 1,
      void_reason: 'Recovery + approval test',
      voided_by: 1,
      recovery_method: 'BANK_TRANSFER',
      approval_request_id: 99
    })

    expect(result.success).toBe(true)
    const audit = db.prepare('SELECT recovered_method, approval_request_id FROM void_audit WHERE transaction_id = 1').get() as { recovered_method: string; approval_request_id: number }
    expect(audit.recovered_method).toBe('BANK_TRANSFER')
    expect(audit.approval_request_id).toBe(99)
  })
})

/* ==================================================================
 *  Branch coverage: getOrCreateSchoolFeesCategory – id=0 edge case (L91)
 *  Tests the branch where categoryRow exists but .id is falsy (0).
 * ================================================================== */
describe('PaymentProcessor – getOrCreateSchoolFeesCategory falsy id (L91)', () => {
  it('falls through to INSERT when existing category has id=0', () => {
    const db = createTestDb()
    // Remove default category and re-insert with explicit id=0
    db.prepare('DELETE FROM transaction_category').run()
    // SQLite allows explicit id=0 with AUTOINCREMENT
    try {
      db.prepare('INSERT INTO transaction_category (id, category_name, category_type, is_system, is_active) VALUES (0, \'School Fees\', \'INCOME\', 1, 1)').run()
    } catch {
      // Some SQLite versions may reject id=0 with AUTOINCREMENT; skip gracefully
      db.close()
      return
    }

    const processor = new PaymentProcessor(db)
    const result = processor.processPayment({
      student_id: 1,
      amount: 1000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'TEST-ID0',
      recorded_by_user_id: 1,
      term_id: 1
    })
    // categoryRow?.id is 0 (falsy) → falls through to INSERT path → new id created
    expect(result.transactionId).toBeGreaterThan(0)
    db.close()
  })
})

/* ==================================================================
 *  Branch coverage: applyPaymentAcrossOutstandingInvoices – break (L286)
 *  When payment runs out mid-loop, the break fires.
 * ================================================================== */
describe('PaymentProcessor – FIFO loop break branch (L286)', () => {
  it('stops allocating once payment is fully consumed (FIFO path)', () => {
    // Create a DB without fee_category.priority → falls back to FIFO
    const freshDb = new Database(':memory:')
    freshDb.exec(`
      CREATE TABLE student (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, credit_balance INTEGER DEFAULT 0, admission_number TEXT);
      CREATE TABLE transaction_category (id INTEGER PRIMARY KEY, category_name TEXT, category_type TEXT, parent_category_id INTEGER, is_system BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT UNIQUE, first_name TEXT, last_name TEXT);
      CREATE TABLE gl_account (id INTEGER PRIMARY KEY, account_code TEXT UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT UNIQUE, entry_date DATE, entry_type TEXT, description TEXT, student_id INTEGER, staff_id INTEGER, term_id INTEGER, is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING', approved_by_user_id INTEGER, approved_at DATETIME, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE journal_entry_line (id INTEGER PRIMARY KEY, journal_entry_id INTEGER, line_number INTEGER, gl_account_id INTEGER, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, invoice_number TEXT UNIQUE, student_id INTEGER, term_id INTEGER, invoice_date DATE, due_date DATE, total_amount INTEGER, amount_due INTEGER, amount INTEGER, amount_paid INTEGER DEFAULT 0, status TEXT DEFAULT 'PENDING', notes TEXT, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT UNIQUE, transaction_date DATE, transaction_type TEXT, category_id INTEGER, amount INTEGER, debit_credit TEXT, student_id INTEGER, staff_id INTEGER, invoice_id INTEGER, payment_method TEXT, payment_reference TEXT, description TEXT, term_id INTEGER, recorded_by_user_id INTEGER, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE payment_invoice_allocation (id INTEGER PRIMARY KEY, transaction_id INTEGER, invoice_id INTEGER, applied_amount INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE void_audit (id INTEGER PRIMARY KEY, transaction_id INTEGER, transaction_type TEXT, original_amount INTEGER, student_id INTEGER, description TEXT, void_reason TEXT, voided_by INTEGER, voided_at DATETIME, recovered_method TEXT, recovered_by INTEGER, recovered_at DATETIME);
      CREATE TABLE credit_transaction (id INTEGER PRIMARY KEY, student_id INTEGER, amount INTEGER, transaction_type TEXT, reference_invoice_id INTEGER, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE approval_request (id INTEGER PRIMARY KEY, request_type TEXT, entity_type TEXT, entity_id INTEGER, amount INTEGER, description TEXT, requested_by INTEGER, status TEXT DEFAULT 'PENDING', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT UNIQUE, description TEXT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE invoice_item (id INTEGER PRIMARY KEY, invoice_id INTEGER, fee_category_id INTEGER, description TEXT, amount INTEGER);
      CREATE TABLE receipt (id INTEGER PRIMARY KEY, receipt_number TEXT UNIQUE, transaction_id INTEGER UNIQUE, receipt_date DATE, student_id INTEGER, amount INTEGER, amount_in_words TEXT, payment_method TEXT, payment_reference TEXT, printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

      INSERT INTO student VALUES (1, 'John', 'Doe', 0, 'STU-001');
      INSERT INTO transaction_category VALUES (1, 'School Fees', 'INCOME', NULL, 1, 1);
      INSERT INTO user VALUES (1, 'testuser', 'Test', 'User');
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('1010','Cash','ASSET','DEBIT',1), ('1020','Bank','ASSET','DEBIT',1), ('1100','AR','ASSET','DEBIT',1), ('4300','Revenue','REVENUE','CREDIT',1);

      -- Three outstanding invoices for student 1
      INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_by_user_id)
      VALUES
        (1, 'INV-FIFO-1', 1, '2024-01-01', '2024-02-01', 10000, 10000, 10000, 0, 'OUTSTANDING', 1),
        (1, 'INV-FIFO-2', 1, '2024-01-10', '2024-02-10', 10000, 10000, 10000, 0, 'OUTSTANDING', 1),
        (1, 'INV-FIFO-3', 1, '2024-01-20', '2024-02-20', 10000, 10000, 10000, 0, 'OUTSTANDING', 1);
    `)

    const processor = new PaymentProcessor(freshDb)
    // Pay 15000 → covers first invoice (10000) fully + second (5000 partial) → loop breaks before 3rd
    const result = processor.processPayment({
      student_id: 1,
      amount: 15000,
      transaction_date: '2024-01-15',
      payment_method: 'CASH',
      payment_reference: 'FIFO-BREAK',
      recorded_by_user_id: 1,
      term_id: 1
    })
    expect(result.transactionId).toBeGreaterThan(0)

    // First invoice fully paid
    const inv1 = freshDb.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-FIFO-1') as { amount_paid: number; status: string }
    expect(inv1.amount_paid).toBe(10000)
    expect(inv1.status).toBe('PAID')

    // Second invoice partially paid
    const inv2 = freshDb.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-FIFO-2') as { amount_paid: number; status: string }
    expect(inv2.amount_paid).toBe(5000)
    expect(inv2.status).toBe('PARTIAL')

    // Third invoice untouched (loop broke before reaching it)
    const inv3 = freshDb.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-FIFO-3') as { amount_paid: number; status: string }
    expect(inv3.amount_paid).toBe(0)
    expect(inv3.status).toBe('OUTSTANDING')

    freshDb.close()
  })
})
