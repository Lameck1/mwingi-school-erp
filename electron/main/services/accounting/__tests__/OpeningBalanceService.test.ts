import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OpeningBalanceService } from '../OpeningBalanceService'

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('OpeningBalanceService.getStudentLedger', () => {
  let db: Database.Database
  let service: OpeningBalanceService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        credit_balance INTEGER DEFAULT 0
      );

      CREATE TABLE opening_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        student_id INTEGER,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT,
        student_id INTEGER NOT NULL,
        invoice_date TEXT,
        due_date TEXT,
        total_amount INTEGER,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT,
        description TEXT,
        created_at TEXT
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT,
        transaction_date TEXT,
        transaction_type TEXT,
        amount INTEGER,
        debit_credit TEXT,
        student_id INTEGER,
        payment_reference TEXT,
        description TEXT,
        is_voided INTEGER DEFAULT 0,
        created_at TEXT
      );

      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT,
        transaction_id INTEGER,
        receipt_date TEXT,
        student_id INTEGER,
        amount INTEGER,
        created_at TEXT
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)

    service = new OpeningBalanceService(db)
  })

  afterEach(() => {
    db.close()
  })

  it('uses legacy fee invoice amount columns when total_amount is missing/zero', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (1, 'MAS-2026', 'Sarah', 'Ochieng', 0)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-LEGACY', 1, '2026-02-15', '2026-02-25',
        0, 1700000, 1700000, 0, 'pending', 'Term invoice', '2026-02-15T09:00:00.000Z'
      )
    `).run()

    const ledger = await service.getStudentLedger(1, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.opening_balance).toBe(0)
    expect(ledger.closing_balance).toBe(1700000)
    expect(ledger.transactions).toHaveLength(1)
    expect(ledger.transactions[0]).toMatchObject({
      ref: 'INV-LEGACY',
      debit: 1700000,
      credit: 0
    })
  })

  it('treats lowercase ledger debit_credit values as valid and computes overpayment correctly', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (2, '2026/002', 'Grace', 'Mutua', 150000)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-GRACE', 2, '2026-01-05', '2026-02-05',
        700000, 700000, 700000, 700000, 'PAID', 'Fee invoice for student', '2026-01-05T08:00:00.000Z'
      )
    `).run()

    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id,
        payment_reference, description, is_voided, created_at
      ) VALUES (
        'PAY-GRACE-001', '2026-01-10', 'fee_payment', 850000, 'credit', 2,
        'MPESA-REF-1', 'Term fee payment', 0, '2026-01-10T08:00:00.000Z'
      )
    `).run()

    const ledger = await service.getStudentLedger(2, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.transactions).toHaveLength(2)
    expect(ledger.transactions[0]).toMatchObject({ debit: 700000, credit: 0 })
    expect(ledger.transactions[1]).toMatchObject({ debit: 0, credit: 850000, ref: 'MPESA-REF-1' })
    expect(ledger.closing_balance).toBe(-150000)
  })

  it('includes payment transactions resolved from receipt student linkage when ledger student_id is missing', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (4, '2026/004', 'Grace', 'ReceiptFix', 150000)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-GRACE-R', 4, '2026-01-05', '2026-02-05',
        700000, 700000, 700000, 700000, 'PAID', 'Fee invoice for student', '2026-01-05T08:00:00.000Z'
      )
    `).run()

    const paymentInsert = db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id,
        payment_reference, description, is_voided, created_at
      ) VALUES (
        'PAY-GRACE-RECEIPT', '2026-01-10', 'FEE_PAYMENT', 850000, 'CREDIT', NULL,
        '', 'Term fee payment', 0, '2026-01-10T08:00:00.000Z'
      )
    `)
    const paymentResult = paymentInsert.run()

    db.prepare(`
      INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, created_at)
      VALUES ('RCP-GRACE-1', ?, '2026-01-10', 4, 850000, '2026-01-10T08:01:00.000Z')
    `).run(paymentResult.lastInsertRowid)

    const ledger = await service.getStudentLedger(4, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.transactions).toHaveLength(2)
    expect(ledger.transactions[0]).toMatchObject({ debit: 700000, credit: 0 })
    expect(ledger.transactions[1]).toMatchObject({ debit: 0, credit: 850000, ref: 'RCP-GRACE-1' })
    expect(ledger.closing_balance).toBe(-150000)
  })

  it('includes manual credit adjustments and excludes internal overpayment/void-generated credit rows', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (3, '2026/003', 'Manual', 'Credit', 0)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-MANUAL', 3, '2026-01-05', '2026-02-05',
        700000, 700000, 700000, 0, 'PENDING', 'Fee invoice for student', '2026-01-05T08:00:00.000Z'
      )
    `).run()

    const insertCredit = db.prepare(`
      INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    insertCredit.run(3, 150000, 'CREDIT_RECEIVED', 'Manual credit adjustment', '2026-01-06T08:00:00.000Z')
    insertCredit.run(3, 200000, 'CREDIT_RECEIVED', 'Overpayment from transaction #44', '2026-01-06T09:00:00.000Z')
    insertCredit.run(3, 50000, 'CREDIT_REFUNDED', 'Manual credit reversal', '2026-01-07T08:00:00.000Z')
    insertCredit.run(3, 10000, 'CREDIT_REFUNDED', 'Void reversal of transaction #77', '2026-01-07T09:00:00.000Z')

    const ledger = await service.getStudentLedger(3, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.transactions).toHaveLength(3)
    expect(ledger.transactions.map((item) => item.description)).toEqual([
      'Fee invoice for student',
      'Manual credit adjustment',
      'Manual credit reversal'
    ])
    expect(ledger.closing_balance).toBe(600000)
  })
})
