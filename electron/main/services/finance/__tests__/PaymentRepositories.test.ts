import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({ getDatabase: () => db }))

import { PaymentTransactionRepository, VoidAuditRepository } from '../PaymentRepositories'

describe('PaymentTransactionRepository', () => {
  let repo: PaymentTransactionRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        admission_number TEXT,
        credit_balance INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE ledger_transaction (
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
        term_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_voided BOOLEAN DEFAULT 0,
        voided_reason TEXT
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
        voided_at TEXT NOT NULL,
        recovered_method TEXT,
        recovered_by INTEGER,
        recovered_at TEXT
      );

      CREATE TABLE "user" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT
      );

      INSERT INTO student (id, first_name, last_name, admission_number, credit_balance) VALUES (1, 'Jane', 'Doe', 'ADM-001', 5000);
      INSERT INTO student (id, first_name, last_name, admission_number, credit_balance) VALUES (2, 'John', 'Smith', 'ADM-002', 0);
      INSERT INTO "user" (id, first_name, last_name) VALUES (9, 'Admin', 'User');
    `)
    repo = new PaymentTransactionRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('createTransaction inserts a record and returns the id', async () => {
    const id = await repo.createTransaction({
      student_id: 1,
      amount: 10000,
      transaction_date: '2026-03-01',
      payment_method: 'MPESA',
      payment_reference: 'MPESA-123',
      recorded_by_user_id: 9,
      term_id: 1,
    })

    expect(id).toBeGreaterThan(0)
    const row = db.prepare('SELECT * FROM ledger_transaction WHERE id = ?').get(id) as Record<string, unknown>
    expect(row).toBeDefined()
    expect(row.student_id).toBe(1)
    expect(row.amount).toBe(10000)
    expect(row.transaction_type).toBe('FEE_PAYMENT')
    expect(row.debit_credit).toBe('CREDIT')
    expect((row.transaction_ref as string).startsWith('TXN-')).toBe(true)
  })

  it('createTransaction uses provided description', async () => {
    const id = await repo.createTransaction({
      student_id: 1,
      amount: 5000,
      transaction_date: '2026-03-01',
      payment_method: 'CASH',
      payment_reference: 'CASH-001',
      recorded_by_user_id: 9,
      term_id: 1,
      description: 'Custom payment description',
    })

    const row = db.prepare('SELECT description FROM ledger_transaction WHERE id = ?').get(id) as { description: string }
    expect(row.description).toBe('Custom payment description')
  })

  it('createTransaction falls back to default description when none provided', async () => {
    const id = await repo.createTransaction({
      student_id: 1,
      amount: 5000,
      transaction_date: '2026-03-01',
      payment_method: 'BANK',
      payment_reference: 'BANK-001',
      recorded_by_user_id: 9,
      term_id: 1,
    })

    const row = db.prepare('SELECT description FROM ledger_transaction WHERE id = ?').get(id) as { description: string }
    expect(row.description).toContain('Payment received: BANK-001')
  })

  it('getTransaction returns the transaction by id', async () => {
    const id = await repo.createTransaction({
      student_id: 1,
      amount: 5000,
      transaction_date: '2026-03-01',
      payment_method: 'CASH',
      payment_reference: 'CASH-001',
      recorded_by_user_id: 9,
      term_id: 1,
    })

    const txn = await repo.getTransaction(id)
    expect(txn).toBeDefined()
    expect(txn!.id).toBe(id)
    expect(txn!.amount).toBe(5000)
  })

  it('getTransaction returns null/undefined for non-existent id', async () => {
    const txn = await repo.getTransaction(99999)
    expect(txn).toBeFalsy()
  })

  it('getStudentHistory returns non-voided payment transactions', async () => {
    // Insert two payments and one voided payment
    await repo.createTransaction({
      student_id: 1, amount: 5000, transaction_date: '2026-02-01',
      payment_method: 'CASH', payment_reference: 'C-1', recorded_by_user_id: 9, term_id: 1,
    })
    await repo.createTransaction({
      student_id: 1, amount: 3000, transaction_date: '2026-02-15',
      payment_method: 'MPESA', payment_reference: 'M-1', recorded_by_user_id: 9, term_id: 1,
    })
    // Mark second one as voided
    db.prepare('UPDATE ledger_transaction SET is_voided = 1 WHERE payment_reference = ?').run('M-1')

    const history = await repo.getStudentHistory(1, 10)
    expect(history).toHaveLength(1)
    expect(history[0].amount).toBe(5000)
  })

  it('updateStudentBalance sets new balance', async () => {
    await repo.updateStudentBalance(1, 12000)

    const bal = db.prepare('SELECT credit_balance FROM student WHERE id = 1').get() as { credit_balance: number }
    expect(bal.credit_balance).toBe(12000)
  })

  it('getStudentBalance returns the credit balance', async () => {
    const balance = await repo.getStudentBalance(1)
    expect(balance).toBe(5000)
  })

  it('getStudentBalance returns 0 for non-existent student', async () => {
    const balance = await repo.getStudentBalance(9999)
    expect(balance).toBe(0)
  })

  it('getStudentById returns student record', async () => {
    const student = await repo.getStudentById(1)
    expect(student).toBeDefined()
    expect(student!.id).toBe(1)
    expect(student!.credit_balance).toBe(5000)
  })

  it('getStudentById returns null/undefined for non-existent student', async () => {
    const student = await repo.getStudentById(9999)
    expect(student).toBeFalsy()
  })

  it('createReversal inserts a REFUND reversal record', async () => {
    const id = await repo.createReversal(1, 5000, 'Overpayment', 9, 1)

    expect(id).toBeGreaterThan(0)
    const row = db.prepare('SELECT * FROM ledger_transaction WHERE id = ?').get(id) as Record<string, unknown>
    expect(row).toBeDefined()
    expect(row.transaction_type).toBe('REFUND')
    expect(row.amount).toBe(-5000)
    expect(row.debit_credit).toBe('DEBIT')
    expect(row.is_voided).toBe(1)
    expect(row.voided_reason).toBe('Overpayment')
    expect((row.transaction_ref as string).startsWith('VOID-')).toBe(true)
  })
})

describe('VoidAuditRepository', () => {
  let repo: VoidAuditRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE void_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        original_amount INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        description TEXT,
        void_reason TEXT NOT NULL,
        voided_by INTEGER NOT NULL,
        voided_at TEXT NOT NULL,
        recovered_method TEXT,
        recovered_by INTEGER,
        recovered_at TEXT
      );

      CREATE TABLE "user" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT
      );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        admission_number TEXT
      );

      INSERT INTO "user" (id, first_name, last_name) VALUES (9, 'Admin', 'User');
      INSERT INTO student (id, first_name, last_name, admission_number) VALUES (1, 'Jane', 'Doe', 'ADM-001');
    `)
    repo = new VoidAuditRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('recordVoid inserts a void audit entry and returns id', async () => {
    const id = await repo.recordVoid({
      transactionId: 42,
      studentId: 1,
      amount: 10000,
      description: 'Tuition payment void',
      voidReason: 'Duplicate payment',
      voidedBy: 9,
    })

    expect(id).toBeGreaterThan(0)
    const row = db.prepare('SELECT * FROM void_audit WHERE id = ?').get(id) as Record<string, unknown>
    expect(row.transaction_id).toBe(42)
    expect(row.original_amount).toBe(10000)
    expect(row.void_reason).toBe('Duplicate payment')
    expect(row.voided_by).toBe(9)
  })

  it('getVoidReport returns void records within date range', async () => {
    await repo.recordVoid({
      transactionId: 1,
      studentId: 1,
      amount: 5000,
      description: 'Void 1',
      voidReason: 'Reason 1',
      voidedBy: 9,
    })
    await repo.recordVoid({
      transactionId: 2,
      studentId: 1,
      amount: 3000,
      description: 'Void 2',
      voidReason: 'Reason 2',
      voidedBy: 9,
    })

    const report = await repo.getVoidReport('2020-01-01', '2030-12-31')
    expect(report).toHaveLength(2)
    expect((report[0] as unknown as Record<string, unknown>).original_amount).toBeDefined()
  })

  it('recordVoid stores recoveryMethod when provided', async () => {
    const id = await repo.recordVoid({
      transactionId: 50,
      studentId: 1,
      amount: 7000,
      description: 'With recovery',
      voidReason: 'Mistake',
      voidedBy: 9,
      recoveryMethod: 'BANK_TRANSFER',
    })

    const row = db.prepare('SELECT recovered_method FROM void_audit WHERE id = ?').get(id) as { recovered_method: string | null }
    expect(row.recovered_method).toBe('BANK_TRANSFER')
  })

  it('recordVoid stores null recoveryMethod when not provided', async () => {
    const id = await repo.recordVoid({
      transactionId: 51,
      studentId: 1,
      amount: 3000,
      description: 'No recovery',
      voidReason: 'Error',
      voidedBy: 9,
    })

    const row = db.prepare('SELECT recovered_method FROM void_audit WHERE id = ?').get(id) as { recovered_method: string | null }
    expect(row.recovered_method).toBeNull()
  })

  it('getVoidReport returns empty array when no records in range', async () => {
    const report = await repo.getVoidReport('2099-01-01', '2099-12-31')
    expect(report).toHaveLength(0)
  })
})

/* ==================================================================
 *  Branch coverage: constructor fallback (db || getDatabase())
 * ================================================================== */
describe('constructor fallback – db || getDatabase()', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        admission_number TEXT,
        credit_balance INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE ledger_transaction (
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
        term_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_voided BOOLEAN DEFAULT 0,
        voided_reason TEXT
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
        voided_at TEXT NOT NULL,
        recovered_method TEXT,
        recovered_by INTEGER,
        recovered_at TEXT
      );
      CREATE TABLE "user" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT
      );
      INSERT INTO student (id, first_name, last_name, admission_number, credit_balance) VALUES (1, 'Jane', 'Doe', 'ADM-001', 5000);
      INSERT INTO "user" (id, first_name, last_name) VALUES (9, 'Admin', 'User');
    `)
  })

  afterEach(() => { db.close() })

  it('PaymentTransactionRepository uses getDatabase() when no db param', async () => {
    const repo = new PaymentTransactionRepository()
    const balance = await repo.getStudentBalance(1)
    expect(balance).toBe(5000)
  })

  it('VoidAuditRepository uses getDatabase() when no db param', async () => {
    const repo = new VoidAuditRepository()
    const id = await repo.recordVoid({
      transactionId: 1,
      studentId: 1,
      amount: 1000,
      description: 'Test',
      voidReason: 'Test reason',
      voidedBy: 9,
    })
    expect(id).toBeGreaterThan(0)
  })
})
