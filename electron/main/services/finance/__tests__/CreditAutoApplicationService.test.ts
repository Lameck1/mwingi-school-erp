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
  })
})

