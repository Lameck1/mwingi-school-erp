import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PaymentIntegrationService } from '../PaymentIntegrationService'

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('PaymentIntegrationService', () => {
  let db: Database.Database
  let service: PaymentIntegrationService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        credit_balance INTEGER DEFAULT 0
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY,
        category_name TEXT NOT NULL,
        category_type TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount INTEGER,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT,
        invoice_date TEXT,
        due_date TEXT,
        created_at TEXT
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER,
        amount INTEGER NOT NULL,
        debit_credit TEXT,
        student_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        term_id INTEGER,
        recorded_by_user_id INTEGER,
        invoice_id INTEGER,
        journal_entry_id INTEGER
      );

      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT NOT NULL UNIQUE,
        transaction_id INTEGER NOT NULL,
        receipt_date TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        amount_in_words TEXT,
        payment_method TEXT,
        payment_reference TEXT,
        created_by_user_id INTEGER
      );

      INSERT INTO student (id, credit_balance) VALUES (1, 0);
      INSERT INTO transaction_category (id, category_name, category_type) VALUES (1, 'School Fees', 'INCOME');
      INSERT INTO fee_invoice (
        id, student_id, total_amount, amount, amount_due, amount_paid, status, invoice_date, due_date, created_at
      ) VALUES (
        1, 1, 0, 7000, 7000, 0, 'outstanding', '2026-02-01', '2026-02-20', '2026-02-01T08:00:00.000Z'
      );
    `)

    service = new PaymentIntegrationService(db)
  })

  afterEach(() => {
    db.close()
  })

  it('allocates payment to normalized outstanding invoices and only credits the remainder', async () => {
    const result = await service.recordPaymentDualSystem(
      {
        student_id: 1,
        amount: 8500,
        payment_method: 'CREDIT_BALANCE',
        transaction_date: '2026-02-16',
        payment_reference: 'CREDIT-BAL-001'
      },
      9
    )

    expect(result.success).toBe(true)

    const invoice = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = 1').get() as {
      amount_paid: number
      status: string
    }
    expect(invoice.amount_paid).toBe(7000)
    expect(invoice.status).toBe('PAID')

    const student = db.prepare('SELECT credit_balance FROM student WHERE id = 1').get() as { credit_balance: number }
    expect(student.credit_balance).toBe(1500)

    const ledger = db.prepare('SELECT amount, transaction_type FROM ledger_transaction WHERE student_id = 1').get() as {
      amount: number
      transaction_type: string
    }
    expect(ledger.amount).toBe(8500)
    expect(ledger.transaction_type).toBe('FEE_PAYMENT')
  })
})

