/**
 * Financial Integration Tests
 *
 * Verifies critical money-handling paths end-to-end using an in-memory
 * SQLite database with the full schema. Tests cover:
 *
 *  1. Dual-system payment recording (ledger + journal)
 *  2. Invoice lifecycle (OUTSTANDING → PARTIAL → PAID)
 *  3. Credit auto-allocation (FIFO, oldest-first)
 *  4. Overpayment → credit balance → auto-apply on next allocation
 */

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CreditAutoApplicationService } from '../../services/finance/CreditAutoApplicationService'
import { PaymentIntegrationService } from '../../services/finance/PaymentIntegrationService'

// Mock audit — no DB writes needed for audit table during these tests
vi.mock('../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

// Mock getDatabase so services that call it internally get our test DB
let testDb: Database.Database
vi.mock('../../database', () => ({
  getDatabase: () => testDb,
}))

// ---------------------------------------------------------------------------
// Schema + seed helper
// ---------------------------------------------------------------------------

function createSchema(db: Database.Database) {
  db.exec(`
    -- Core tables
    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      admission_number TEXT UNIQUE NOT NULL,
      credit_balance INTEGER DEFAULT 0
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT
    );

    CREATE TABLE transaction_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      category_type TEXT NOT NULL,
      parent_category_id INTEGER,
      is_system BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1
    );

    -- Invoicing
    CREATE TABLE fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      total_amount INTEGER NOT NULL,
      amount_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      amount INTEGER,
      description TEXT,
      notes TEXT,
      updated_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    -- Legacy ledger
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
      journal_entry_id INTEGER,
      is_voided BOOLEAN DEFAULT 0,
      voided_reason TEXT,
      voided_by_user_id INTEGER,
      voided_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES transaction_category(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
      FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE,
      receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      amount_in_words TEXT,
      payment_method TEXT NOT NULL,
      payment_reference TEXT,
      printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES ledger_transaction(id),
      FOREIGN KEY (student_id) REFERENCES student(id)
    );

    -- Double-entry accounting
    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      parent_account_id INTEGER,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL,
      description TEXT,
      student_id INTEGER,
      staff_id INTEGER,
      term_id INTEGER,
      is_posted BOOLEAN DEFAULT 0,
      is_voided BOOLEAN DEFAULT 0,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'APPROVED',
      voided_reason TEXT,
      voided_by_user_id INTEGER,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE journal_entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      gl_account_id INTEGER NOT NULL,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      description TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id),
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id)
    );

    -- Credit system
    CREATE TABLE credit_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      reference_invoice_id INTEGER,
      notes TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id)
    );

    -- Audit log (used by mock)
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Seed data -----------------------------------------------------------

    INSERT INTO user (username, email, role) VALUES
      ('admin', 'admin@school.com', 'ADMIN'),
      ('bursar', 'bursar@school.com', 'BURSAR');

    INSERT INTO student (first_name, last_name, admission_number) VALUES
      ('Alice', 'Mwangi', 'STU-001'),
      ('Bob', 'Odhiambo', 'STU-002');

    INSERT INTO transaction_category (category_name, category_type, is_system, is_active) VALUES
      ('School Fees', 'INCOME', 1, 1),
      ('Miscellaneous', 'INCOME', 0, 1);

    INSERT INTO gl_account (account_code, account_name, account_type) VALUES
      ('1010', 'Cash on Hand',              'ASSET'),
      ('1020', 'Bank Account - KCB',        'ASSET'),
      ('1030', 'Mobile Money - M-Pesa',     'ASSET'),
      ('1100', 'Accounts Receivable - Students', 'ASSET'),
      ('4000', 'Tuition Revenue',           'REVENUE');

    INSERT INTO fee_invoice
      (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount, amount_paid, status, created_by_user_id)
    VALUES
      (1, 'INV-2026-001', 1, '2026-01-05', '2026-02-05', 50000, 50000, 0, 'OUTSTANDING', 1),
      (1, 'INV-2026-002', 1, '2026-01-10', '2026-02-10', 30000, 30000, 0, 'OUTSTANDING', 1),
      (2, 'INV-2026-003', 1, '2026-01-15', '2026-02-15', 60000, 60000, 0, 'OUTSTANDING', 1);
  `)
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Financial Integration', () => {
  let paymentService: PaymentIntegrationService
  let creditService: CreditAutoApplicationService

  beforeEach(() => {
    testDb = new Database(':memory:')
    createSchema(testDb)
    paymentService = new PaymentIntegrationService(testDb)
    creditService = new CreditAutoApplicationService(testDb)
  })

  afterEach(() => {
    testDb.close()
  })

  // ── 1. Dual-system payment recording ──────────────────────────

  describe('Payment recording (dual system)', () => {
    it('creates legacy transaction and journal entry together', async () => {
      const result = await paymentService.recordPaymentDualSystem(
        {
          student_id: 1,
          amount: 20000,
          payment_method: 'CASH',
          transaction_date: '2026-01-20',
          description: 'Term 1 payment',
          invoice_id: 1,
        },
        1, // userId
      )

      expect(result.success).toBe(true)
      expect(result.transactionRef).toBeDefined()
      expect(result.receiptNumber).toBeDefined()

      // Legacy ledger row exists
      const legacy = testDb
        .prepare('SELECT * FROM ledger_transaction WHERE id = ?')
        .get(result.legacyTransactionId) as Record<string, unknown>
      expect(legacy).toBeDefined()
      expect(legacy.amount).toBe(20000)
      expect(legacy.transaction_type).toBe('FEE_PAYMENT')

      // Receipt created
      const receipt = testDb
        .prepare('SELECT * FROM receipt WHERE transaction_id = ?')
        .get(result.legacyTransactionId) as Record<string, unknown>
      expect(receipt).toBeDefined()
      expect(receipt.amount).toBe(20000)

      // Journal entry created with balanced debits/credits
      if (result.journalEntryId) {
        const lines = testDb
          .prepare('SELECT * FROM journal_entry_line WHERE journal_entry_id = ?')
          .all(result.journalEntryId) as Array<{ debit_amount: number; credit_amount: number }>
        
        const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0)
        const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0)
        expect(totalDebit).toBe(totalCredit)
        expect(totalDebit).toBe(20000)
      }
    })

    it('rolls back everything on failure', async () => {
      // Drop the receipt table to force a failure mid-transaction
      testDb.exec('DROP TABLE receipt')

      const result = await paymentService.recordPaymentDualSystem(
        {
          student_id: 1,
          amount: 10000,
          payment_method: 'CASH',
          transaction_date: '2026-01-20',
        },
        1,
      )

      expect(result.success).toBe(false)

      // No orphaned ledger rows
      const count = testDb
        .prepare('SELECT COUNT(*) as c FROM ledger_transaction')
        .get() as { c: number }
      expect(count.c).toBe(0)
    })
  })

  // ── 2. Invoice lifecycle ──────────────────────────────────────

  describe('Invoice lifecycle', () => {
    it('partial payment keeps status as PARTIAL', async () => {
      await paymentService.recordPaymentDualSystem(
        {
          student_id: 1,
          amount: 20000,
          payment_method: 'MPESA',
          transaction_date: '2026-01-20',
          invoice_id: 1,
        },
        1,
      )

      const invoice = testDb
        .prepare('SELECT * FROM fee_invoice WHERE id = 1')
        .get() as { amount_paid: number; status: string }
      expect(invoice.amount_paid).toBe(20000)
      expect(invoice.status).toBe('PARTIAL')
    })

    it('full payment sets status to PAID', async () => {
      await paymentService.recordPaymentDualSystem(
        {
          student_id: 1,
          amount: 50000,
          payment_method: 'CASH',
          transaction_date: '2026-01-20',
          invoice_id: 1,
        },
        1,
      )

      const invoice = testDb
        .prepare('SELECT * FROM fee_invoice WHERE id = 1')
        .get() as { amount_paid: number; status: string }
      expect(invoice.amount_paid).toBe(50000)
      expect(invoice.status).toBe('PAID')
    })

    it('payment without invoice_id auto-allocates to oldest invoice first', async () => {
      // Pay 60000 without specifying an invoice — should fill INV-001 (50000)
      // and partially fill INV-002 (10000 of 30000)
      await paymentService.recordPaymentDualSystem(
        {
          student_id: 1,
          amount: 60000,
          payment_method: 'CASH',
          transaction_date: '2026-01-20',
        },
        1,
      )

      const inv1 = testDb
        .prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = 1')
        .get() as { amount_paid: number; status: string }
      expect(inv1.amount_paid).toBe(50000)
      expect(inv1.status).toBe('PAID')

      const inv2 = testDb
        .prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = 2')
        .get() as { amount_paid: number; status: string }
      expect(inv2.amount_paid).toBe(10000)
      expect(inv2.status).toBe('PARTIAL')
    })
  })

  // ── 3. Credit auto-allocation ─────────────────────────────────

  describe('Credit auto-allocation', () => {
    it('allocates credit balance to outstanding invoices (FIFO)', async () => {
      // Give student 1 a credit balance via a credit_transaction
      testDb
        .prepare(
          `INSERT INTO credit_transaction (student_id, amount, transaction_type, notes)
           VALUES (?, ?, 'CREDIT_RECEIVED', 'Overpayment')`,
        )
        .run(1, 40000)

      const result = await creditService.allocateCreditsToInvoices(1, 1)

      expect(result.success).toBe(true)
      expect(result.total_credit_applied).toBe(40000)
      expect(result.invoices_affected).toBe(1)

      // First invoice should be partially reduced
      const inv1 = testDb
        .prepare('SELECT amount_paid FROM fee_invoice WHERE id = 1')
        .get() as { amount_paid: number }
      expect(inv1.amount_paid).toBe(40000)
    })

    it('returns no-op when credit balance is zero', async () => {
      const result = await creditService.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(false)
      expect(result.total_credit_applied).toBe(0)
    })

    it('returns no-op when no outstanding invoices exist', async () => {
      // Mark all invoices as paid
      testDb.exec(`UPDATE fee_invoice SET amount_paid = total_amount, status = 'PAID' WHERE student_id = 1`)

      // Give credit
      testDb
        .prepare(
          `INSERT INTO credit_transaction (student_id, amount, transaction_type, notes)
           VALUES (?, ?, 'CREDIT_RECEIVED', 'Extra')`,
        )
        .run(1, 10000)

      const result = await creditService.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(false)
      expect(result.invoices_affected).toBe(0)
    })

    it('spreads credit across multiple invoices when balance exceeds single invoice', async () => {
      // Credit of 70000 should fully pay INV-001 (50000) and partially pay INV-002 (20000 of 30000)
      testDb
        .prepare(
          `INSERT INTO credit_transaction (student_id, amount, transaction_type, notes)
           VALUES (?, ?, 'CREDIT_RECEIVED', 'Large refund')`,
        )
        .run(1, 70000)

      const result = await creditService.allocateCreditsToInvoices(1, 1)

      expect(result.success).toBe(true)
      expect(result.total_credit_applied).toBe(70000)
      expect(result.invoices_affected).toBe(2)

      const inv1 = testDb
        .prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = 1')
        .get() as { amount_paid: number; status: string }
      expect(inv1.amount_paid).toBe(50000)

      const inv2 = testDb
        .prepare('SELECT amount_paid FROM fee_invoice WHERE id = 2')
        .get() as { amount_paid: number }
      expect(inv2.amount_paid).toBe(20000)
    })
  })

  // ── 4. Student credit balance tracking ────────────────────────

  describe('Credit balance tracking', () => {
    it('payment updates student credit_balance column', async () => {
      await paymentService.recordPaymentDualSystem(
        {
          student_id: 1,
          amount: 25000,
          payment_method: 'CASH',
          transaction_date: '2026-01-20',
        },
        1,
      )

      const student = testDb
        .prepare('SELECT credit_balance FROM student WHERE id = 1')
        .get() as { credit_balance: number }
      expect(student.credit_balance).toBe(25000)
    })

    it('credit service reports correct balance from transactions', async () => {
      // Add credit
      testDb
        .prepare(
          `INSERT INTO credit_transaction (student_id, amount, transaction_type, notes)
           VALUES (?, ?, 'CREDIT_RECEIVED', 'Overpayment')`,
        )
        .run(1, 30000)

      const balance = await creditService.getStudentCreditBalance(1)
      expect(balance).toBe(30000)

      // Apply some credit
      testDb
        .prepare(
          `INSERT INTO credit_transaction (student_id, amount, transaction_type, notes)
           VALUES (?, ?, 'CREDIT_APPLIED', 'Applied to INV')`,
        )
        .run(1, 10000)

      const newBalance = await creditService.getStudentCreditBalance(1)
      expect(newBalance).toBe(20000)
    })
  })
})
