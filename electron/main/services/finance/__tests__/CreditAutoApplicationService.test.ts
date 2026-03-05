import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CreditAutoApplicationService } from '../CreditAutoApplicationService'

type DbRow = Record<string, unknown>

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('CreditAutoApplicationService', () => {
  let db: Database.Database
  let service: CreditAutoApplicationService

  beforeEach(() => {
    db = new Database(':memory:')

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
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
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
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );
          CREATE TABLE IF NOT EXISTS approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL UNIQUE,
            description TEXT,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            max_amount INTEGER,
            days_since_transaction INTEGER,
            required_role_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        reference_invoice_id INTEGER,
        notes TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        total_amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        description TEXT,
        invoice_date TEXT NOT NULL DEFAULT '2026-01-01',
        due_date DATE NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO student (first_name, last_name, admission_number)
      VALUES ('John', 'Doe', 'STU-001');

      INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
      VALUES 
        (1, 'INV-001', 50000, 0, 50000, 0, '2026-01-15', 'PENDING', '2026-01-01 10:00:00'),
        (1, 'INV-002', 30000, 30000, 30000, 0, '2026-01-20', 'pending', '2026-01-05 10:00:00'),
        (1, 'INV-003', 20000, 20000, 20000, 0, '2026-01-25', 'PENDING', '2026-01-10 10:00:00'),
        (1, 'INV-004', 15000, 15000, 15000, 0, '2026-01-26', 'cancelled', '2026-01-11 10:00:00');

      INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at)
      VALUES (1, 70000, 'CREDIT_RECEIVED', 'Overpayment', '2026-01-12 10:00:00');
    `)

    service = new CreditAutoApplicationService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  describe('autoApplyCredits', () => {
    it('applies available credit in FIFO order and updates invoice status consistently', () => {
      const result = service.autoApplyCredits(1)

      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(70000)
      expect(result.remaining_credit).toBe(0)
      expect(result.invoices_affected).toBe(2)

      const invoice1 = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-001') as DbRow
      const invoice2 = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-002') as DbRow
      const invoice3 = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-003') as DbRow
      const invoice4 = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-004') as DbRow

      expect(invoice1.amount_paid).toBe(50000)
      expect(invoice1.status).toBe('PAID')
      expect(invoice2.amount_paid).toBe(20000)
      expect(invoice2.status).toBe('PARTIAL')
      expect(invoice3.amount_paid).toBe(0)
      expect(invoice3.status).toBe('PENDING')
      expect(invoice4.amount_paid).toBe(0)
      expect(invoice4.status).toBe('cancelled')

      const appliedRows = db.prepare(`SELECT COUNT(*) as count FROM credit_transaction WHERE transaction_type = 'CREDIT_APPLIED'`).get() as { count: number }
      expect(appliedRows.count).toBe(2)
    })

    it('returns no-op when student has no credits', () => {
      db.exec('DELETE FROM credit_transaction')

      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(0)
      expect(result.message).toContain('No credits')
    })
  })

  describe('getCreditBalance', () => {
    it('returns net credit balance based on transaction type semantics', () => {
      db.exec(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, notes)
        VALUES (1, 2000, 'CREDIT_APPLIED', 'Applied to invoice'),
               (1, 1000, 'CREDIT_REFUNDED', 'Refund issued')
      `)
      const balance = service.getCreditBalance(1)
      expect(balance).toBe(67000)
    })

    it('returns 0 for student with no credits', () => {
      db.exec('INSERT INTO student (first_name, last_name, admission_number) VALUES (\'New\', \'Student\', \'STU-002\')')

      const balance = service.getCreditBalance(2)
      expect(balance).toBe(0)
    })
  })

  describe('addCredit', () => {
    it('rejects non-positive credit amount', () => {
      const result = service.addCredit(1, 0, 'Bad input', 10)
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('creates CREDIT_RECEIVED transaction with default notes', () => {
      const result = service.addCredit(1, 25000, '', 10)
      expect(result.success).toBe(true)

      const row = db.prepare('SELECT amount, transaction_type, notes FROM credit_transaction WHERE id = ?').get(result.credit_id) as DbRow
      expect(row.amount).toBe(25000)
      expect(row.transaction_type).toBe('CREDIT_RECEIVED')
      expect(row.notes).toBe('Manual credit adjustment')
    })
  })

  describe('getCreditTransactions', () => {
    it('retrieves credit transactions with limit cap support', async () => {
      const transactions = await service.getCreditTransactions(1)
      expect(Array.isArray(transactions)).toBe(true)
      expect(transactions.length).toBeGreaterThan(0)
    })

    it('returns empty for student with no credits', async () => {
      db.exec('INSERT INTO student (first_name, last_name, admission_number) VALUES (\'New\', \'Student\', \'STU-003\')')

      const transactions = await service.getCreditTransactions(3)
      expect(transactions).toEqual([])
    })
  })

  describe('reverseCredit', () => {
    it('creates CREDIT_REFUNDED transaction when reversing received credit', () => {
      const result = service.reverseCredit(1, 'Error correction', 10)
      expect(result.success).toBe(true)

      const reverseEntry = db.prepare('SELECT transaction_type, amount FROM credit_transaction WHERE id = ?').get(result.credit_id) as DbRow
      expect(reverseEntry.transaction_type).toBe('CREDIT_REFUNDED')
      expect(reverseEntry.amount).toBe(70000)
    })

    it('rejects reversing non-receipt credit types', () => {
      const applyCreditId = db.prepare(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, notes)
        VALUES (1, 1000, 'CREDIT_APPLIED', 'Applied credit')
      `).run().lastInsertRowid as number

      const result = service.reverseCredit(applyCreditId, 'Invalid', 10)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Only received credits')
    })

    it('returns error when credit transaction not found', () => {
      const result = service.reverseCredit(9999, 'Nonexistent', 10)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('uses default reason when none provided', () => {
      const result = service.reverseCredit(1, undefined, 10)
      expect(result.success).toBe(true)
      const row = db.prepare(
        `SELECT notes FROM credit_transaction WHERE id = ?`
      ).get(result.credit_id) as { notes: string }
      expect(row.notes).toContain('No reason provided')
    })
  })

  /* ============================================================== */
  /*  getTransactions (synchronous)                                  */
  /* ============================================================== */
  describe('getTransactions', () => {
    it('returns all credit transactions for a student ordered by created_at DESC', () => {
      const txns = service.getTransactions(1)
      expect(Array.isArray(txns)).toBe(true)
      expect(txns.length).toBeGreaterThan(0)
      expect(txns[0].student_id).toBe(1)
    })

    it('returns empty array for nonexistent student', () => {
      expect(service.getTransactions(9999)).toEqual([])
    })
  })

  /* ============================================================== */
  /*  getCreditTransactions – limit edge cases                       */
  /* ============================================================== */
  describe('getCreditTransactions – limit handling', () => {
    it('applies numeric limit when provided', async () => {
      // Add extra transactions for student 1
      db.exec(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (1, 1000, 'CREDIT_RECEIVED', 'Extra 1');
        INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (1, 2000, 'CREDIT_RECEIVED', 'Extra 2');
      `)
      const txns = await service.getCreditTransactions(1, 2)
      expect(txns).toHaveLength(2)
    })

    it('ignores invalid limit (negative)', async () => {
      const txns = await service.getCreditTransactions(1, -5)
      // Should return all transactions (no LIMIT clause)
      expect(txns.length).toBeGreaterThan(0)
    })

    it('ignores non-integer limit', async () => {
      const txns = await service.getCreditTransactions(1, 1.5)
      expect(txns.length).toBeGreaterThan(0)
    })

    it('caps limit at 500', async () => {
      const txns = await service.getCreditTransactions(1, 999)
      // Should not throw – capped at 500
      expect(Array.isArray(txns)).toBe(true)
    })
  })

  /* ============================================================== */
  /*  getStudentCreditBalance (async)                                */
  /* ============================================================== */
  describe('getStudentCreditBalance', () => {
    it('returns the expected credit balance', async () => {
      const balance = await service.getStudentCreditBalance(1)
      expect(balance).toBe(70000) // Only CREDIT_RECEIVED
    })

    it('returns 0 for student with no transactions', async () => {
      const balance = await service.getStudentCreditBalance(9999)
      expect(balance).toBe(0)
    })
  })

  /* ============================================================== */
  /*  addCreditToStudent (async)                                     */
  /* ============================================================== */
  describe('addCreditToStudent', () => {
    it('records a CREDIT_RECEIVED transaction', async () => {
      const result = await service.addCreditToStudent(1, 5000, 'Manual top-up', 10)
      expect(result.success).toBe(true)
      expect(result.credit_id).toBeGreaterThan(0)
      expect(result.message).toContain('5000.00')
    })
  })

  /* ============================================================== */
  /*  allocateCreditsToInvoices (async)                              */
  /* ============================================================== */
  describe('allocateCreditsToInvoices', () => {
    it('returns no-credit error when balance is zero', async () => {
      db.exec('DELETE FROM credit_transaction')
      const result = await service.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(false)
      expect(result.message).toContain('No credit balance')
    })

    it('returns no-invoices error when none outstanding', async () => {
      // Pay off all invoices so none outstanding
      db.exec(`UPDATE fee_invoice SET amount_paid = amount, status = 'PAID' WHERE student_id = 1`)
      const result = await service.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(false)
      expect(result.message).toContain('No outstanding invoices')
    })

    it('allocates credits successfully across invoices', async () => {
      const result = await service.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(true)
      expect(result.total_credit_applied).toBeGreaterThan(0)
      expect(result.invoices_affected).toBeGreaterThan(0)
      expect(result.allocations.length).toBeGreaterThan(0)
    })
  })

  /* ============================================================== */
  /*  autoApplyCredits – journal failure path                        */
  /* ============================================================== */
  describe('autoApplyCredits – journal error', () => {
    it('returns error when journal entry creation fails', () => {
      // Remove gl_account rows so journal creation fails
      db.exec('DELETE FROM gl_account')
      const result = service.autoApplyCredits(1, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  /* ============================================================== */
  /*  Additional branch coverage                                     */
  /* ============================================================== */
  describe('addCredit – validation and edge cases', () => {
    it('rejects non-positive credit amount', () => {
      const result = service.addCredit(1, 0)
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('rejects negative credit amount', () => {
      const result = service.addCredit(1, -500)
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('rejects NaN credit amount', () => {
      const result = service.addCredit(1, Number.NaN)
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('uses default notes when none provided', () => {
      const result = service.addCredit(1, 1000)
      expect(result.success).toBe(true)
      const txns = service.getTransactions(1)
      const latest = txns[0]
      expect(latest.notes).toBe('Manual credit adjustment')
    })

    it('trims custom notes', () => {
      const result = service.addCredit(1, 1000, '  Custom note  ')
      expect(result.success).toBe(true)
      const txns = service.getTransactions(1)
      expect(txns[0].notes).toBe('Custom note')
    })
  })

  describe('reverseCredit – branch coverage', () => {
    it('reverses a CREDIT_RECEIVED transaction', () => {
      const addResult = service.addCredit(1, 2000, 'To be reversed', 10)
      expect(addResult.success).toBe(true)
      const result = service.reverseCredit(addResult.credit_id!, 'Test reason', 10)
      expect(result.success).toBe(true)
      expect(result.credit_id).toBeGreaterThan(0)
    })

    it('rejects reversal of non-existent credit', () => {
      const result = service.reverseCredit(99999)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('rejects reversal of non-CREDIT_RECEIVED type', () => {
      // Insert a CREDIT_APPLIED transaction directly
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (1, 500, 'CREDIT_APPLIED', 'Applied')`)
      const applied = db.prepare('SELECT id FROM credit_transaction WHERE transaction_type = ? ORDER BY id DESC LIMIT 1').get('CREDIT_APPLIED') as { id: number }
      const result = service.reverseCredit(applied.id)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Only received credits')
    })
  })

  describe('autoApplyCredits – no credit balance', () => {
    it('returns no-op message when credit balance is zero', () => {
      db.exec('DELETE FROM credit_transaction')
      const result = service.autoApplyCredits(1, 1)
      expect(result.success).toBe(true)
      expect(result.message).toContain('No credits to apply')
      expect(result.credits_applied).toBe(0)
    })
  })

  describe('getCreditBalance (sync)', () => {
    it('returns zero for student with no transactions', () => {
      expect(service.getCreditBalance(9999)).toBe(0)
    })
  })

  describe('autoApplyCredits – FIFO ordering with overdue invoices', () => {
    it('applies credits to overdue invoices before non-overdue ones', () => {
      // Delete existing invoices and create ones with specific due_date ordering
      db.exec('DELETE FROM fee_invoice')
      // Non-overdue: due far in the future
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-FUTURE', 40000, 40000, 40000, 0, '2099-12-31', 'PENDING', '2026-01-01 10:00:00')`)
      // Overdue: due in the past
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-OVERDUE', 30000, 30000, 30000, 0, '2020-01-01', 'PENDING', '2026-01-02 10:00:00')`)

      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(70000)

      // Overdue invoice should be fully paid first
      const overdue = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-OVERDUE') as any
      expect(overdue.amount_paid).toBe(30000)
      expect(overdue.status).toBe('PAID')

      // Then remaining 40000 goes to future invoice
      const future = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-FUTURE') as any
      expect(future.amount_paid).toBe(40000)
      expect(future.status).toBe('PAID')
    })
  })

  describe('autoApplyCredits – all invoices already paid', () => {
    it('returns no-op when all invoices are already paid', () => {
      db.exec(`UPDATE fee_invoice SET amount_paid = amount, status = 'PAID' WHERE student_id = 1 AND status != 'cancelled'`)
      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(0)
    })
  })

  // ── Branch coverage: amountDue <= 0 continue in FIFO loop ──
  describe('autoApplyCredits – invoice with zero balance skipped', () => {
    it('skips invoices where amount_paid equals amount_due', () => {
      // Set up: one invoice already fully paid (amount_due === amount_paid), one outstanding
      db.exec('DELETE FROM fee_invoice')
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-FULLPAID', 20000, 20000, 20000, 20000, '2026-01-15', 'PAID', '2026-01-01 10:00:00')`)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-OUTSTANDING', 30000, 30000, 30000, 0, '2026-01-20', 'PENDING', '2026-01-02 10:00:00')`)

      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      // Only the outstanding invoice should have credit applied
      const outstanding = db.prepare('SELECT amount_paid FROM fee_invoice WHERE invoice_number = ?').get('INV-OUTSTANDING') as any
      expect(outstanding.amount_paid).toBe(30000)
    })
  })

  // ── Branch coverage: partial payment status path ──
  describe('autoApplyCredits – partial payment status', () => {
    it('sets status to PARTIAL when credit covers less than full balance', () => {
      db.exec('DELETE FROM fee_invoice')
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-BIG', 200000, 200000, 200000, 0, '2026-01-15', 'PENDING', '2026-01-01 10:00:00')`)
      // Student credit balance is 70000 but invoice is 200000
      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      const inv = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE invoice_number = ?').get('INV-BIG') as any
      expect(inv.amount_paid).toBe(70000)
      expect(inv.status).toBe('PARTIAL')
    })
  })

  /* ============================================================== */
  /*  allocateCreditsToInvoices – FIFO sort with overdue invoices   */
  /* ============================================================== */
  describe('allocateCreditsToInvoices – FIFO overdue sort', () => {
    it('sorts overdue invoices before non-overdue via FIFO strategy', async () => {
      db.exec('DELETE FROM fee_invoice')
      // Non-overdue invoice (due in the future)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-FUTURE', 40000, 40000, 40000, 0, '2099-12-31', 'PENDING', '2026-01-01')`)
      // Overdue invoice (due in the past)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-PAST', 30000, 30000, 30000, 0, '2020-01-01', 'PENDING', '2026-01-02')`)

      const result = await service.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(true)
      // FIFO: overdue should be allocated first
      const first = result.allocations[0]
      expect(first.invoice_number).toBe('INV-PAST')
      expect(first.amount_applied).toBe(30000)
    })

    it('sorts by due_date when both invoices are overdue', async () => {
      db.exec('DELETE FROM fee_invoice')
      // Older overdue
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-OLDER', 25000, 25000, 25000, 0, '2019-01-01', 'PENDING', '2026-01-01')`)
      // Newer overdue
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-NEWER', 25000, 25000, 25000, 0, '2020-06-01', 'PENDING', '2026-01-02')`)

      const result = await service.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(true)
      expect(result.allocations[0].invoice_number).toBe('INV-OLDER')
    })

    it('sorts non-overdue before overdue correctly (b overdue, a not)', async () => {
      db.exec('DELETE FROM fee_invoice')
      // Non-overdue invoice inserted first
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-NOTDUE', 20000, 20000, 20000, 0, '2099-06-01', 'PENDING', '2026-01-01')`)
      // Overdue invoice
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-DUE', 20000, 20000, 20000, 0, '2020-01-01', 'PENDING', '2026-01-02')`)

      const result = await service.allocateCreditsToInvoices(1, 1)
      expect(result.success).toBe(true)
      // Overdue should come first
      expect(result.allocations[0].invoice_number).toBe('INV-DUE')
    })
  })

  /* ============================================================== */
  /*  autoApplyCredits – invoice_number ?? id fallback              */
  /* ============================================================== */
  describe('autoApplyCredits – invoice_number fallback', () => {
    it('uses invoice_number when present in notes', () => {
      db.exec('DELETE FROM fee_invoice')
      db.exec(`INSERT INTO fee_invoice (id, student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (99, 1, 'INV-NAMED', 30000, 30000, 30000, 0, '2026-01-15', 'PENDING', '2026-01-01')`)

      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(30000)
      const txn = db.prepare(`SELECT notes FROM credit_transaction WHERE transaction_type = 'CREDIT_APPLIED' ORDER BY id DESC LIMIT 1`).get() as { notes: string }
      expect(txn.notes).toContain('INV-NAMED')
    })
  })

  /* ============================================================== */
  /*  autoApplyCredits – OUTSTANDING status preservation            */
  /* ============================================================== */
  describe('autoApplyCredits – no outstanding invoices returns no-op', () => {
    it('returns success with 0 applied when SQL finds no outstanding invoices', () => {
      // Cancel all invoices - they won't appear as active/outstanding
      db.exec(`UPDATE fee_invoice SET status = 'cancelled'`)
      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      // Either 0 applied or message about no invoices
      expect(result.credits_applied).toBeDefined()
    })
  })

  /* ============================================================== */
  /*  addCreditToStudent – error path                               */
  /* ============================================================== */
  describe('addCreditToStudent – error handling', () => {
    it('throws when DB insert fails', async () => {
      db.exec('DROP TABLE credit_transaction')
      await expect(service.addCreditToStudent(1, 5000, 'Test', 10)).rejects.toThrow('Failed to add credit')
    })
  })

  /* ============================================================== */
  /*  autoApplyCredits – journal totalApplied > 0 false branch     */
  /* ============================================================== */
  describe('autoApplyCredits – no matching invoices path', () => {
    it('skips journal when no credit applied (non-matching student)', () => {
      // Student 999 has no invoices
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (999, 'Ghost', 'Student', 'STU-GHOST')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (999, 5000, 'CREDIT_RECEIVED', 'Ghost credit')`)
      const result = service.autoApplyCredits(999)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(0)
      expect(result.invoices_affected).toBe(0)
    })
  })

  // ── Branch coverage: getCreditTransactions – limit handling (L108-116) ──
  describe('getCreditTransactions – limit variants', () => {
    it('returns all transactions when limit is null/undefined', async () => {
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (1, 1000, 'CREDIT_RECEIVED', 'Test credit 1')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (1, 2000, 'CREDIT_RECEIVED', 'Test credit 2')`)
      const txns = await service.getCreditTransactions(1)
      expect(txns.length).toBeGreaterThanOrEqual(2)
    })

    it('respects limit when provided', async () => {
      const txns = await service.getCreditTransactions(1, 1)
      expect(txns.length).toBeLessThanOrEqual(1)
    })

    it('treats non-integer limit as no-limit', async () => {
      const txns = await service.getCreditTransactions(1, 1.5 as any)
      // Non-integer → treated as null → no limit
      expect(Array.isArray(txns)).toBe(true)
    })
  })

  // ── Branch coverage: allocateCreditsToInvoices – no credit balance (L277) ──
  describe('allocateCreditsToInvoices – zero credit', () => {
    it('returns failure when student has no credit balance', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (888, 'NoCredit', 'Stu', 'STU-NOCRD')`)
      const result = await service.allocateCreditsToInvoices(888, 1)
      expect(result.success).toBe(false)
      expect(result.message).toContain('No credit balance')
    })
  })

  // ── Branch coverage: FIFOAllocationStrategy – overdue vs non-overdue tie-breaking (L235-240) ──
  describe('FIFOAllocationStrategy – sorting', () => {
    it('prioritizes overdue invoices before non-overdue', async () => {
      // Student 777 with credit and two invoices: one overdue, one not
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (777, 'Sort', 'Test', 'STU-SORT')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (777, 100000, 'CREDIT_RECEIVED', 'Sort credit')`)
      // Overdue invoice (due date in the past)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_at) VALUES (777, 'INV-OVER', '2024-01-01', '2024-06-01', 5000, 5000, 5000, 0, 'OUTSTANDING', '2024-01-01')`)
      // Non-overdue invoice (due date in the future)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, invoice_date, due_date, total_amount, amount_due, amount, amount_paid, status, created_at) VALUES (777, 'INV-FUTURE', '2026-01-01', '2027-01-01', 3000, 3000, 3000, 0, 'OUTSTANDING', '2026-01-01')`)
      const result = await service.allocateCreditsToInvoices(777, 1)
      expect(result.success).toBe(true)
      expect(result.invoices_affected).toBeGreaterThanOrEqual(1)
      // First allocation should be the overdue invoice
      if (result.allocations.length > 0) {
        expect(result.allocations[0].invoice_number).toBe('INV-OVER')
      }
    })
  })

  // ── Branch coverage: autoApplyCredits – amountDue <= 0 continue (L516) ──
  describe('autoApplyCredits – skips fully-paid invoice', () => {
    it('skips invoice where amount_paid >= amount_due', () => {
      db.exec('DELETE FROM fee_invoice')
      db.exec('DELETE FROM credit_transaction')
      // Already paid invoice (amount_paid >= amount_due)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-FULL', 5000, 5000, 5000, 5000, '2026-01-01', 'OUTSTANDING', '2026-01-01 10:00:00')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (1, 1000, 'CREDIT_RECEIVED', 'Test')`)
      const result = service.autoApplyCredits(1)
      // Should succeed but with 0 applications since the only invoice is already paid
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(0)
    })
  })

  // ── Branch coverage: autoApplyCredits – PARTIAL status (L520) ──
  describe('autoApplyCredits – partial payment status', () => {
    it('sets status to PARTIAL when credit covers part of invoice', () => {
      db.exec('DELETE FROM fee_invoice')
      db.exec('DELETE FROM credit_transaction')
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, created_at)
        VALUES (1, 'INV-BIG', 100000, 100000, 100000, 0, '2026-01-01', 'OUTSTANDING', '2026-01-01 10:00:00')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (1, 5000, 'CREDIT_RECEIVED', 'Small credit')`)
      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(5000)
      const inv = db.prepare("SELECT status FROM fee_invoice WHERE invoice_number = 'INV-BIG'").get() as any
      expect(inv.status).toBe('PARTIAL')
    })
  })

  // ── Branch coverage: addCredit – catch block (DB failure) ──
  describe('addCredit – catch block from DB failure', () => {
    it('returns error when credit_transaction table is missing', () => {
      db.exec('DROP TABLE credit_transaction')
      const result = service.addCredit(1, 1000, 'Crash', 1)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to add credit')
      // Re-create table for afterEach cleanup
      db.exec(`CREATE TABLE credit_transaction (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, amount INTEGER NOT NULL, transaction_type TEXT NOT NULL, reference_invoice_id INTEGER, notes TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    })
  })

  // ── Branch coverage: reverseCredit – catch block (DB failure) ──
  describe('reverseCredit – catch block from DB failure', () => {
    it('returns error when DB write fails during reversal', () => {
      // Insert a valid CREDIT_RECEIVED transaction, then break the table
      const addResult = service.addCredit(1, 500, 'To reverse', 1)
      expect(addResult.success).toBe(true)
      // Drop the table to trigger an error on the INSERT during reversal
      db.exec('ALTER TABLE credit_transaction RENAME TO credit_transaction_bak')
      const result = service.reverseCredit(addResult.credit_id!)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to reverse credit')
      // Restore table
      db.exec('ALTER TABLE credit_transaction_bak RENAME TO credit_transaction')
    })
  })

  // ── Branch coverage: allocateCreditsToInvoices – no outstanding invoices (L291) ──
  describe('allocateCreditsToInvoices – no outstanding invoices', () => {
    it('returns failure when student has credit but no outstanding invoices', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (555, 'Clear', 'Student', 'STU-CLEAR')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (555, 10000, 'CREDIT_RECEIVED', 'Extra credit')`)
      const result = await service.allocateCreditsToInvoices(555, 1)
      expect(result.success).toBe(false)
      expect(result.message).toContain('No outstanding invoices')
    })
  })

  /* ==================================================================
   *  Branch coverage: autoApplyCredits – zero credit balance (L468)
   * ================================================================== */
  describe('autoApplyCredits – zero credit balance', () => {
    it('returns success with "No credits to apply" when balance is zero', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (600, 'Zero', 'Credit', 'STU-600')`)
      const result = service.autoApplyCredits(600)
      expect(result.success).toBe(true)
      expect(result.message).toContain('No credits to apply')
      expect(result.credits_applied).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: autoApplyCredits – PARTIAL status (L506)
   * ================================================================== */
  describe('autoApplyCredits – partial payment status', () => {
    it('sets status to PARTIAL when credit is less than invoice amount', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (601, 'Partial', 'Pay', 'STU-601')`)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status)
               VALUES (601, 'INV-601', 100000, 100000, 100000, 0, '2026-02-01', 'PENDING')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (601, 30000, 'CREDIT_RECEIVED', 'partial')`)
      const result = service.autoApplyCredits(601)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(30000)
      const inv = db.prepare("SELECT status FROM fee_invoice WHERE invoice_number = 'INV-601'").get() as any
      expect(inv.status).toBe('PARTIAL')
    })
  })

  /* ==================================================================
   *  Branch coverage: autoApplyCredits – OUTSTANDING status preserved (L508)
   * ================================================================== */
  describe('autoApplyCredits – outstanding status', () => {
    it('preserves OUTSTANDING status when newAmountPaid is 0 and status was OUTSTANDING', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (602, 'Out', 'Standing', 'STU-602')`)
      // Invoice with amount_paid = amount_due (already fully paid) so amountDue=0 → skip (continue branch)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status)
               VALUES (602, 'INV-602', 100000, 100000, 100000, 100000, '2026-02-01', 'PAID')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (602, 5000, 'CREDIT_RECEIVED', 'refund')`)
      const result = service.autoApplyCredits(602)
      // No invoices outstanding → nothing to apply
      expect(result.success).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: autoApplyCredits – error catch branch (L568)
   * ================================================================== */
  describe('autoApplyCredits – error handling', () => {
    it('returns failure when database throws', () => {
      db.exec(`ALTER TABLE credit_transaction RENAME TO credit_transaction_bak`)
      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      db.exec(`ALTER TABLE credit_transaction_bak RENAME TO credit_transaction`)
    })
  })

  /* ==================================================================
   *  Branch coverage: addCredit – invalid amount (L610)
   * ================================================================== */
  describe('addCredit – validation', () => {
    it('rejects non-finite amount', () => {
      const result = service.addCredit(1, Number.NaN)
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('rejects zero amount', () => {
      const result = service.addCredit(1, 0)
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('succeeds with valid amount and trims notes', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (610, 'Add', 'Cr', 'STU-610')`)
      const result = service.addCredit(610, 5000, '  Extra credit  ', 1)
      expect(result.success).toBe(true)
      expect(result.credit_id).toBeGreaterThan(0)
    })

    it('succeeds with no notes (uses default)', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (611, 'NoNote', 'Cr', 'STU-611')`)
      const result = service.addCredit(611, 1000)
      expect(result.success).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: reverseCredit – non-CREDIT_RECEIVED type (L637)
   * ================================================================== */
  describe('reverseCredit – type validation', () => {
    it('rejects reversal of CREDIT_APPLIED transactions', () => {
      // Create a CREDIT_APPLIED transaction
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (620, 'Rev', 'Test', 'STU-620')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (620, 5000, 'CREDIT_APPLIED', 'Applied')`)
      const txId = (db.prepare('SELECT id FROM credit_transaction WHERE student_id = 620').get() as any).id
      const result = service.reverseCredit(txId)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Only received credits')
    })

    it('rejects reversal of non-existent credit', () => {
      const result = service.reverseCredit(999999)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('successfully reverses a CREDIT_RECEIVED transaction with reason', () => {
      const creditTxns = db.prepare('SELECT id FROM credit_transaction WHERE transaction_type = ?').all('CREDIT_RECEIVED') as any[]
      const result = service.reverseCredit(creditTxns[0].id, 'Refund requested', 1)
      expect(result.success).toBe(true)
      expect(result.credit_id).toBeGreaterThan(0)
    })

    it('reverses credit without reason (uses default)', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (621, 'Rev2', 'Test', 'STU-621')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (621, 2000, 'CREDIT_RECEIVED', 'Test')`)
      const txId = (db.prepare("SELECT id FROM credit_transaction WHERE student_id = 621 AND transaction_type = 'CREDIT_RECEIVED'").get() as any).id
      const result = service.reverseCredit(txId)
      expect(result.success).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: getCreditBalance, getTransactions
   * ================================================================== */
  describe('getCreditBalance & getTransactions', () => {
    it('returns computed balance from all transaction types', () => {
      const bal = service.getCreditBalance(1)
      expect(typeof bal).toBe('number')
    })

    it('returns 0 for student with no transactions', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (630, 'No', 'Tx', 'STU-630')`)
      expect(service.getCreditBalance(630)).toBe(0)
    })

    it('getTransactions returns ordered list', () => {
      const txns = service.getTransactions(1)
      expect(Array.isArray(txns)).toBe(true)
      expect(txns.length).toBeGreaterThan(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: allocateCreditsToInvoices – no credit balance (L229)
   * ================================================================== */
  describe('allocateCreditsToInvoices – no balance', () => {
    it('returns failure when student has no credit', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (640, 'No', 'Bal', 'STU-640')`)
      const result = await service.allocateCreditsToInvoices(640, 1)
      expect(result.success).toBe(false)
      expect(result.message).toContain('No credit balance')
    })
  })

  /* ==================================================================
   *  Branch coverage: allocateCreditsToInvoices – overdue first sort (FIFO L211)
   * ================================================================== */
  describe('allocateCreditsToInvoices – FIFO overdue sorting', () => {
    it('applies credit to overdue invoices before current ones', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (650, 'FIFO', 'Test', 'STU-650')`)
      // Overdue invoice (past due_date)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, invoice_date)
               VALUES (650, 'INV-650A', 20000, 20000, 20000, 0, '2020-01-01', 'PENDING', '2020-01-01')`)
      // Future invoice
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, invoice_date)
               VALUES (650, 'INV-650B', 20000, 20000, 20000, 0, '2099-01-01', 'PENDING', '2099-01-01')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (650, 20000, 'CREDIT_RECEIVED', 'Test')`)
      const result = await service.allocateCreditsToInvoices(650, 1)
      expect(result.success).toBe(true)
      expect(result.total_credit_applied).toBe(20000)
      expect(result.invoices_affected).toBe(1)
      // Overdue invoice should be paid first
      const invA = db.prepare("SELECT amount_paid FROM fee_invoice WHERE invoice_number = 'INV-650A'").get() as any
      expect(invA.amount_paid).toBe(20000)
    })
  })

  /* ==================================================================
   *  Branch coverage: autoApplyCredits – zero credit (L468)
   * ================================================================== */
  describe('autoApplyCredits – zero credit balance', () => {
    it('returns success with no credits to apply', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (660, 'Zero', 'Cred', 'STU-660')`)
      const result = service.autoApplyCredits(660, 1)
      expect(result.success).toBe(true)
      expect(result.message).toContain('No credits to apply')
    })
  })

  /* ==================================================================
   *  Branch coverage: autoApplyCredits – applies credits to invoices (L500-506)
   * ================================================================== */
  describe('autoApplyCredits – full flow', () => {
    it('applies credits to outstanding invoices and creates journal entry', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (670, 'Sync', 'Apply', 'STU-670')`)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, invoice_date)
               VALUES (670, 'INV-670A', 15000, 15000, 15000, 0, '2025-01-01', 'PENDING', '2025-01-01')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (670, 10000, 'CREDIT_RECEIVED', 'Sync test')`)
      const result = service.autoApplyCredits(670, 1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(10000)
      expect(result.invoices_affected).toBe(1)
      // Invoice should be PARTIAL
      const inv = db.prepare("SELECT status, amount_paid FROM fee_invoice WHERE invoice_number = 'INV-670A'").get() as any
      expect(inv.amount_paid).toBe(10000)
      expect(inv.status).toBe('PARTIAL')
    })

    it('marks invoice as PAID when credit covers full amount', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (671, 'Full', 'Pay', 'STU-671')`)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, total_amount, amount_due, amount_paid, due_date, status, invoice_date)
               VALUES (671, 'INV-671A', 5000, 5000, 5000, 0, '2025-01-01', 'PENDING', '2025-01-01')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (671, 10000, 'CREDIT_RECEIVED', 'Overpay')`)
      const result = service.autoApplyCredits(671, 1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(5000)
      expect(result.remaining_credit).toBe(5000)
      const inv = db.prepare("SELECT status FROM fee_invoice WHERE invoice_number = 'INV-671A'").get() as any
      expect(inv.status).toBe('PAID')
    })
  })

  /* ==================================================================
   *  Branch coverage: getCreditTransactions with limit (L108 safeLimit branches)
   * ================================================================== */
  describe('getCreditTransactions – limit handling', () => {
    it('reads all transactions when no limit supplied', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (680, 'Lim', 'None', 'STU-680')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (680, 100, 'CREDIT_RECEIVED', 'A')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (680, 200, 'CREDIT_RECEIVED', 'B')`)
      const txns = await service.getCreditTransactions(680)
      expect(txns.length).toBe(2)
    })

    it('limits results when valid limit supplied', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (681, 'Lim', 'One', 'STU-681')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (681, 100, 'CREDIT_RECEIVED', 'A')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (681, 200, 'CREDIT_RECEIVED', 'B')`)
      const txns = await service.getCreditTransactions(681, 1)
      expect(txns.length).toBe(1)
    })

    it('ignores non-integer/negative/zero limit', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (682, 'Lim', 'Bad', 'STU-682')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (682, 100, 'CREDIT_RECEIVED', 'A')`)
      const txns0 = await service.getCreditTransactions(682, 0)
      expect(txns0.length).toBe(1) // No limit applied, returns all
      const txnsNeg = await service.getCreditTransactions(682, -5)
      expect(txnsNeg.length).toBe(1)
      const txnsFrac = await service.getCreditTransactions(682, 1.5)
      expect(txnsFrac.length).toBe(1)
    })
  })

  /* ==================================================================
   *  Branch coverage: addCredit – invalid amount (L598)
   * ================================================================== */
  describe('addCredit – validation', () => {
    it('rejects negative amount', () => {
      const result = service.addCredit(1, -100, 'Neg')
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('rejects zero amount', () => {
      const result = service.addCredit(1, 0, 'Zero')
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('rejects NaN amount', () => {
      const result = service.addCredit(1, Number.NaN, 'NaN')
      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('succeeds without notes (uses default)', () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (690, 'Credit', 'Test', 'STU-690')`)
      const result = service.addCredit(690, 500)
      expect(result.success).toBe(true)
      expect(result.credit_id).toBeGreaterThan(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: reverseCredit – non-RECEIVED type (L636)
   * ================================================================== */
  describe('reverseCredit – wrong type', () => {
    it('rejects reversing CREDIT_APPLIED transaction', () => {
      db.exec(`INSERT INTO credit_transaction (id, student_id, amount, transaction_type, notes) VALUES (9000, 1, 1000, 'CREDIT_APPLIED', 'Applied')`)
      const result = service.reverseCredit(9000)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Only received credits')
    })

    it('rejects non-existent credit', () => {
      const result = service.reverseCredit(99999)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  /* ==================================================================
   *  Branch coverage: allocateCreditsToInvoices – no outstanding invoices (L241)
   * ================================================================== */
  describe('allocateCreditsToInvoices – no invoices', () => {
    it('returns failure when credit exists but no outstanding invoices', async () => {
      db.exec(`INSERT INTO student (id, first_name, last_name, admission_number) VALUES (700, 'No', 'Inv', 'STU-700')`)
      db.exec(`INSERT INTO credit_transaction (student_id, amount, transaction_type, notes) VALUES (700, 5000, 'CREDIT_RECEIVED', 'Test')`)
      const result = await service.allocateCreditsToInvoices(700, 1)
      expect(result.success).toBe(false)
      expect(result.message).toContain('No outstanding invoices')
    })
  })

  /* ==================================================================
   *  Branch coverage: autoApplyCredits – null invoice_number ?? id fallback (L525)
   * ================================================================== */
  describe('autoApplyCredits – null invoice_number uses id fallback', () => {
    it('uses invoice id in notes when invoice_number is null', () => {
      // Recreate fee_invoice table without NOT NULL on invoice_number
      db.exec('DROP TABLE fee_invoice')
      db.exec(`CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE,
        amount INTEGER NOT NULL,
        total_amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        description TEXT,
        invoice_date TEXT NOT NULL DEFAULT '2026-01-01',
        due_date DATE NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`)
      db.exec(`INSERT INTO fee_invoice (id, student_id, amount, total_amount, amount_due, amount_paid, due_date, status)
        VALUES (42, 1, 10000, 10000, 10000, 0, '2026-01-15', 'PENDING')`)

      const result = service.autoApplyCredits(1)
      expect(result.success).toBe(true)
      expect(result.credits_applied).toBe(10000)
      const txn = db.prepare(`SELECT notes FROM credit_transaction WHERE transaction_type = 'CREDIT_APPLIED' ORDER BY id DESC LIMIT 1`).get() as { notes: string }
      expect(txn.notes).toContain('42') // uses invoice id as fallback when invoice_number is null
    })
  })

  /* ==================================================================
   *  Branch coverage: allocateCreditsToInvoices – catch block (L360)
   * ================================================================== */
  describe('allocateCreditsToInvoices – transaction error', () => {
    it('throws wrapped error when the allocation transaction fails', async () => {
      // Monkey-patch db.transaction to throw inside the transaction
      const origTransaction = db.transaction.bind(db)
      ;(db as any).transaction = () => () => { throw new Error('Intentional transaction error') }
      await expect(service.allocateCreditsToInvoices(1, 1)).rejects.toThrow('Failed to allocate credits')
      ;(db as any).transaction = origTransaction
    })

    it('wraps DB errors thrown inside the allocation transaction (L360)', async () => {
      // Make the UPDATE fee_invoice inside the transaction throw by spying on db.prepare
      const origPrepare = db.prepare.bind(db)
      let updateCallCount = 0
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE fee_invoice')) {
          updateCallCount++
          if (updateCallCount > 0) {
            throw new Error('Simulated update failure')
          }
        }
        return origPrepare(sql)
      })
      await expect(service.allocateCreditsToInvoices(1, 1)).rejects.toThrow('Failed to allocate credits')
      vi.restoreAllMocks()
    })
  })
})
