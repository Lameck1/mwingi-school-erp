import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

import { ReconciliationService } from '../ReconciliationService'

describe('ReconciliationService', () => {
  let service: ReconciliationService

  beforeEach(() => {
    db = new Database(':memory:')

    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admission_number TEXT,
        credit_balance INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reference_invoice_id INTEGER
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        amount_paid INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_type TEXT NOT NULL,
        student_id INTEGER,
        invoice_id INTEGER,
        amount INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_ledger_txn_id INTEGER,
        is_posted BOOLEAN DEFAULT 0,
        is_voided BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );

      CREATE TABLE ledger_reconciliation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_date TEXT NOT NULL,
        gl_account_id INTEGER NOT NULL,
        opening_balance INTEGER NOT NULL,
        total_debits INTEGER NOT NULL,
        total_credits INTEGER NOT NULL,
        closing_balance INTEGER NOT NULL,
        calculated_balance INTEGER NOT NULL,
        variance INTEGER NOT NULL,
        is_balanced BOOLEAN NOT NULL,
        reconciled_by_user_id INTEGER NOT NULL,
        notes TEXT
      );
    `)

    db.prepare(`
      INSERT INTO student (id, admission_number, credit_balance, is_active)
      VALUES (1, 'ADM001', 1500, 1), (2, 'ADM002', 1000, 1)
    `).run()

    db.prepare(`
      INSERT INTO credit_transaction (student_id, transaction_type, amount)
      VALUES
        (1, 'CREDIT_RECEIVED', 2000),
        (1, 'CREDIT_APPLIED', 500),
        (2, 'CREDIT_RECEIVED', 1200)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, total_amount, amount_paid)
      VALUES (1, 'INV-001', 10000, 5000)
    `).run()

    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare(`
      INSERT INTO ledger_transaction (transaction_type, student_id, invoice_id, amount, created_at)
      VALUES
        ('FEE_PAYMENT', 1, 1, 3000, ?),
        ('FEE_PAYMENT', 1, 1, 2000, ?)
    `).run(oldDate, oldDate)

    db.prepare(`
      INSERT INTO gl_account (id, account_code, account_name, account_type, is_active)
      VALUES (1, '1100', 'Student Receivables', 'ASSET', 1)
    `).run()

    db.prepare(`
      INSERT INTO journal_entry (id, source_ledger_txn_id, is_posted, is_voided, created_at)
      VALUES (1, NULL, 1, 0, ?)
    `).run(new Date().toISOString())

    db.prepare(`
      INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount)
      VALUES (1, 1, 5000, 5000)
    `).run()

    service = new ReconciliationService()
  })

  afterEach(() => {
    db.close()
  })

  it('runs checks and reports FAIL when student and invoice balances drift', async () => {
    const report = await service.runAllChecks(1)

    expect(report.summary.total_checks).toBe(7)
    expect(report.summary.failed).toBeGreaterThanOrEqual(1)
    expect(report.overall_status).toBe('FAIL')
    expect(report.checks.find(c => c.check_name === 'Student Credit Balance Verification')?.status).toBe('FAIL')
    expect(report.checks.find(c => c.check_name === 'Invoice Payment Verification')?.status).toBe('PASS')
    expect(report.checks.find(c => c.check_name === 'Invoice Settlement Drift Check')?.status).toBe('PASS')
  })

  it('warns for recent unlinked ledger transactions using source_ledger_txn_id linkage', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (id, transaction_type, student_id, invoice_id, amount, created_at)
      VALUES (200, 'FEE_PAYMENT', 1, 1, 4000, ?)
    `).run(new Date().toISOString())

    const report = await service.runAllChecks(1)
    const linkage = report.checks.find(c => c.check_name === 'Ledger-Journal Linkage Check')

    expect(linkage?.status).toBe('WARNING')
    expect(linkage?.message).toContain('not linked')
  })

  it('passes ledger linkage once source_ledger_txn_id is populated and stores reconciliation history', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (id, transaction_type, student_id, invoice_id, amount, created_at)
      VALUES (201, 'FEE_PAYMENT', 1, 1, 4000, ?)
    `).run(new Date().toISOString())

    db.prepare(`
      INSERT INTO journal_entry (source_ledger_txn_id, is_posted, is_voided, created_at)
      VALUES (201, 1, 0, ?)
    `).run(new Date().toISOString())

    const report = await service.runAllChecks(1)
    const linkage = report.checks.find(c => c.check_name === 'Ledger-Journal Linkage Check')
    expect(linkage?.status).toBe('PASS')

    const history = await service.getReconciliationHistory(5)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0].summary.total_checks).toBe(7)
  })

  it('fails settlement drift check when invoice amount_paid exceeds payment-plus-credit sources', async () => {
    db.prepare(`UPDATE fee_invoice SET amount_paid = 9000 WHERE id = 1`).run()

    const report = await service.runAllChecks(1)
    const drift = report.checks.find(c => c.check_name === 'Invoice Settlement Drift Check')

    expect(drift?.status).toBe('FAIL')
    expect(drift?.message).toContain('settlement drift')
  })
})
