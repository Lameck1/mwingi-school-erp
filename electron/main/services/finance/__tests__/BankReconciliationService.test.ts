import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { BankReconciliationService } from '../BankReconciliationService'

describe('BankReconciliationService', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT
      );
      INSERT INTO transaction_category (id, category_name) VALUES (1, 'Fees');

      CREATE TABLE bank_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name TEXT NOT NULL,
        account_number TEXT NOT NULL
      );
      INSERT INTO bank_account (id, account_name, account_number) VALUES (1, 'Main Account', '1234567890');

      CREATE TABLE bank_statement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL,
        statement_date DATE NOT NULL,
        opening_balance INTEGER NOT NULL,
        closing_balance INTEGER NOT NULL,
        status TEXT DEFAULT 'PENDING',
        reconciled_by_user_id INTEGER,
        reconciled_at DATETIME
      );
      INSERT INTO bank_statement (id, bank_account_id, statement_date, opening_balance, closing_balance, status)
      VALUES (1, 1, '2026-02-14', 0, 0, 'PENDING');

      CREATE TABLE bank_statement_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_statement_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        description TEXT NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        is_matched BOOLEAN DEFAULT 0,
        matched_transaction_id INTEGER
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        is_voided BOOLEAN DEFAULT 0
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('rejects matching when amount difference exceeds tolerance', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (10, 1, '2026-02-14', 'Bank credit', 5000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (20, 'TXN-20', '2026-02-14', 'FEE_PAYMENT', 1, 7000, 'CREDIT', 'BANK_TRANSFER')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(10, 20)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Amount mismatch')
  })

  it('rejects matching when transaction date is outside allowed tolerance', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (11, 1, '2026-02-14', 'Bank credit', 5000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (21, 'TXN-21', '2026-01-20', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 'BANK_TRANSFER')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(11, 21)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Date mismatch')
  })

  it('returns account-scoped unmatched transactions using account reference heuristics', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES
        (31, 'TXN-31', '2026-02-10', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 'BANK_TRANSFER', 'ACC-1234567890', 'Fee payment main account'),
        (32, 'TXN-32', '2026-02-10', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 'BANK_TRANSFER', 'ACC-9999999999', 'Different account payment')
    `).run()

    const service = new BankReconciliationService()
    const scoped = await service.getUnmatchedLedgerTransactions('2026-02-01', '2026-02-28', 1) as Array<{ id: number }>

    expect(scoped.map(row => row.id)).toContain(31)
    expect(scoped.map(row => row.id)).not.toContain(32)
  })

  it('rejects adding statement line with invalid debit/credit combination', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-14',
      description: 'Bad line',
      reference: null,
      debit_amount: 0,
      credit_amount: 0,
      running_balance: null
    })

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Exactly one')
  })

  it('marks statement reconciled only when all lines are matched and balances agree', async () => {
    db.prepare(`
      UPDATE bank_statement
      SET opening_balance = 1000, closing_balance = 1500
      WHERE id = 1
    `).run()
    db.prepare(`
      INSERT INTO bank_statement_line (
        bank_statement_id, transaction_date, description, debit_amount, credit_amount, is_matched
      ) VALUES
        (1, '2026-02-10', 'Deposit', 0, 700, 1),
        (1, '2026-02-11', 'Withdrawal', 200, 0, 1)
    `).run()

    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)

    expect(result.success).toBe(true)

    const row = db.prepare(`SELECT status FROM bank_statement WHERE id = 1`).get() as { status: string }
    expect(row.status).toBe('RECONCILED')
  })
})
