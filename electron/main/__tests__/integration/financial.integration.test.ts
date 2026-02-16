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

import { DoubleEntryJournalService } from '../../services/accounting/DoubleEntryJournalService'
import { SystemAccounts } from '../../services/accounting/SystemAccounts'
import { CreditAutoApplicationService } from '../../services/finance/CreditAutoApplicationService'
import { FeeProrationService } from '../../services/finance/FeeProrationService'
import { PaymentIntegrationService } from '../../services/finance/PaymentIntegrationService'
import { VoidProcessor } from '../../services/finance/PaymentService.internal'

// Mock audit — no DB writes needed for audit table during these tests
vi.mock('../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

// Mock ipc handler
vi.mock('../../ipc-result', () => ({
  safeHandleRaw: vi.fn(),
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
      credit_balance INTEGER DEFAULT 0,
      student_type TEXT DEFAULT 'DAY_SCHOLAR',
      admission_date DATE
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT,
      password_hash TEXT,
      full_name TEXT
    );

    CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY, -- Manual ID for seeding
        year_name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE term (
        id INTEGER PRIMARY KEY, -- Manual ID
        academic_year_id INTEGER NOT NULL,
        term_number INTEGER NOT NULL,
        term_name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id)
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
      FOREIGN KEY (created_by_user_id) REFERENCES user(id),
      FOREIGN KEY (term_id) REFERENCES term(id)
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
      normal_balance TEXT DEFAULT 'DEBIT',
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
      posted_by_user_id INTEGER, -- Added
      posted_at DATETIME, -- Added
      is_voided BOOLEAN DEFAULT 0,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'APPROVED',
      voided_reason TEXT,
      voided_by_user_id INTEGER,
      voided_at DATETIME, -- Added
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_ledger_txn_id INTEGER, -- Added
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
    
    CREATE TABLE approval_rule (
       id INTEGER PRIMARY KEY,
       transaction_type TEXT,
       is_active BOOLEAN DEFAULT 1,
       min_amount INTEGER,
       days_since_transaction INTEGER,
       rule_name TEXT
    );
    -- We assume approval_rule is empty or basic, tests clear it anyway.

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
    
    -- Payment Allocation (needed for safe voiding tests)
    CREATE TABLE payment_invoice_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL, 
        invoice_id INTEGER NOT NULL,
        applied_amount INTEGER NOT NULL
    );


    -- Seed data -----------------------------------------------------------

    INSERT INTO user (username, email, role) VALUES
      ('admin', 'admin@school.com', 'ADMIN'),
      ('bursar', 'bursar@school.com', 'BURSAR');

    INSERT INTO student (first_name, last_name, admission_number) VALUES
      ('Alice', 'Mwangi', 'STU-001'),
      ('Bob', 'Odhiambo', 'STU-002');
      
    INSERT INTO academic_year (id, year_name, start_date, end_date) VALUES 
      (2025, '2025', '2025-01-01', '2025-12-31');
      
    INSERT INTO term (id, academic_year_id, term_number, term_name, start_date, end_date) VALUES 
      (1, 2025, 1, 'Term 1', '2025-01-01', '2025-04-01');

    INSERT INTO transaction_category (category_name, category_type, is_system, is_active) VALUES
      ('School Fees', 'INCOME', 1, 1),
      ('Miscellaneous', 'INCOME', 0, 1),
      ('Fees', 'INCOME', 1, 1); -- Ensure 'Fees' category exists for tests

    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES
      ('1010', 'Cash on Hand',              'ASSET', 'DEBIT'),
      ('1020', 'Bank Account - KCB',        'ASSET', 'DEBIT'),
      ('1030', 'Mobile Money - M-Pesa',     'ASSET', 'DEBIT'),
      ('1100', 'Accounts Receivable - Students', 'ASSET', 'DEBIT'),
      ('2010', 'Accounts Payable',          'LIABILITY', 'CREDIT'),
      ('4010', 'Tuition Fees',              'REVENUE', 'CREDIT');

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
    it('payment only updates student credit_balance with unapplied overpayment', async () => {
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
      expect(student.credit_balance).toBe(0)

      const invoice = testDb
        .prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = 1')
        .get() as { amount_paid: number; status: string }
      expect(invoice.amount_paid).toBe(25000)
      expect(invoice.status).toBe('PARTIAL')
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

  // ── 5. Financial Integrity & GL Integration ───────────────────

  describe('Financial Integrity (GL)', () => {
    let journalService: DoubleEntryJournalService

    beforeEach(() => {
      journalService = new DoubleEntryJournalService(testDb)
    })

    it('creates GL entries when generating an invoice', async () => {
      const studentId = 1
      const userId = 1

      // Manually invoke recordInvoiceSync
      const invoiceItems = [{
        gl_account_code: SystemAccounts.TUITION_REVENUE,
        amount: 5000,
        description: 'Tuition Fee'
      }]

      const result = journalService.recordInvoiceSync(studentId, invoiceItems, '2025-01-01', userId)
      if (!result.success) {
        console.error('Invoice Error:', result.error)
      }
      expect(result.success).toBe(true)

      // Verify Journal Entry created
      const entry = testDb.prepare('SELECT * FROM journal_entry WHERE id = ?').get(result.entry_id) as any
      expect(entry).toBeDefined()

      // Verify Lines with join to get code
      const lines = testDb.prepare(`
             SELECT jel.*, ga.account_code as gl_account_code 
             FROM journal_entry_line jel
             JOIN gl_account ga ON jel.gl_account_id = ga.id
             WHERE jel.journal_entry_id = ?
         `).all(result.entry_id) as any[]
      expect(lines.length).toBe(2)

      const dr = lines.find((l: any) => l.debit_amount > 0)
      const cr = lines.find((l: any) => l.credit_amount > 0)

      expect(dr.gl_account_code).toBe(SystemAccounts.ACCOUNTS_RECEIVABLE)
      expect(dr.debit_amount).toBe(5000)
      expect(cr.gl_account_code).toBe(SystemAccounts.TUITION_REVENUE)
      expect(cr.credit_amount).toBe(5000)
    })
  })

  // ── 6. Double Entry Voiding ───────────────────────────────────

  describe('Double Entry Voiding', () => {
    let journalService: DoubleEntryJournalService

    beforeEach(() => {
      journalService = new DoubleEntryJournalService(testDb)
      // Ensure no approval rules block immediate voiding
      testDb.prepare("DELETE FROM approval_rule").run()
    })

    it('creates a reversal entry instead of soft delete', async () => {
      // 1. Create original entry
      const result = journalService.createJournalEntrySync({
        entry_date: '2025-01-01',
        entry_type: 'FEE_PAYMENT',
        description: 'Original Payment',
        created_by_user_id: 1,
        lines: [
          { gl_account_code: SystemAccounts.CASH, debit_amount: 1000, credit_amount: 0, description: 'Cash' },
          { gl_account_code: SystemAccounts.ACCOUNTS_RECEIVABLE, debit_amount: 0, credit_amount: 1000, description: 'AR' }
        ]
      })

      expect(result.success).toBe(true)
      const originalId = result.entry_id

      // 2. Void it (MUST AWAIT)
      const voidResult = await journalService.voidJournalEntry(originalId!, 'Mistake', 1)
      if (!voidResult.success) {
        console.error('Void Error:', voidResult.message)
      }
      expect(voidResult.success).toBe(true)

      // 3. Verify Original is Voided
      const original = testDb.prepare('SELECT * FROM journal_entry WHERE id = ?').get(originalId) as any
      expect(original.is_voided).toBe(1)

      // 4. Verify Reversal Entry
      const reversal = testDb.prepare('SELECT * FROM journal_entry WHERE description LIKE ?').get(`Void Reversal for Ref: ${original.entry_ref}%`) as any
      expect(reversal).toBeDefined()

      // Verify Reversal Lines with join
      const lines = testDb.prepare(`
            SELECT jel.*, ga.account_code as gl_account_code
            FROM journal_entry_line jel
            JOIN gl_account ga ON jel.gl_account_id = ga.id
            WHERE jel.journal_entry_id = ?
        `).all(reversal.id) as any[]

      // Should be swapped
      const cashLine = lines.find((l: any) => l.gl_account_code === SystemAccounts.CASH)
      expect(cashLine.credit_amount).toBe(1000)
      expect(cashLine.debit_amount).toBe(0)

      const arLine = lines.find((l: any) => l.gl_account_code === SystemAccounts.ACCOUNTS_RECEIVABLE)
      expect(arLine.debit_amount).toBe(1000)
      expect(arLine.credit_amount).toBe(0)
    })
  })

  // ── 7. Payment Voiding Safeguards ─────────────────────────────

  describe('Payment Voiding Safeguards', () => {
    let voidProcessor: VoidProcessor

    beforeEach(() => {
      voidProcessor = new VoidProcessor(testDb)
    })

    it('returns full amount for On Account payments', () => {
      // 1. Insert Legacy Payment (On Account / No Allocation)
      const txnId = testDb.prepare(`
            INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id, student_id, term_id)
            VALUES ('PAY-TEST-1', '2025-01-01', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1, 1, 1)
        `).run().lastInsertRowid

      const tx = testDb.prepare('SELECT * FROM ledger_transaction WHERE id = ?').get(txnId) as any

      // 2. Call internal method to reverse allocations 
      const result = (voidProcessor as any).reversePaymentAllocations(tx)

      // Expect full amount back because there are no allocations in `payment_allocation` table
      expect(result).toBe(5000)
    })
  })

  // ── 8. Fee Proration ──────────────────────────────────────────

  describe('Fee Proration', () => {
    let prorationService: FeeProrationService

    beforeEach(() => {
      prorationService = new FeeProrationService(testDb)
    })

    it('calculates proration inclusively', () => {
      // Jan 1 to Jan 31 = 31 days.
      // Enroll Jan 31 = 1 day (inclusive).
      const result = prorationService.calculateProRatedFee(
        31000,
        '2025-01-01',
        '2025-01-31',
        '2025-01-31'
      )

      expect(result.days_in_term).toBe(31)
      expect(result.days_enrolled).toBe(1)
      expect(result.pro_rated_amount).toBe(1000)
    })

    it('handles full term correctly', () => {
      const result = prorationService.calculateProRatedFee(
        31000,
        '2025-01-01',
        '2025-01-31',
        '2025-01-01'
      )
      expect(result.days_enrolled).toBe(31)
      expect(result.pro_rated_amount).toBe(31000)
    })
  })
})
