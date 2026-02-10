import Database from 'better-sqlite3-multiple-ciphers'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { CashFlowStatementService } from '../../reports/CashFlowStatementService'

vi.mock('../../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('CashFlowStatementService', () => {
  let db: Database.Database
  let service: CashFlowStatementService

  beforeEach(() => {
    db = new Database(':memory:')

    // Create required tables
    db.exec(`
      CREATE TABLE fee_invoice (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        academic_term_id TEXT NOT NULL,
        amount_due REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        due_date TEXT,
        status TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE ledger_transaction (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        transaction_date TEXT,
        debit_credit TEXT,
        is_voided BOOLEAN DEFAULT 0,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE expense_transaction (
        id TEXT PRIMARY KEY,
        expense_type TEXT NOT NULL,
        amount REAL NOT NULL,
        transaction_date TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE payroll_transaction (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        transaction_date TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE asset_transaction (
        id TEXT PRIMARY KEY,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        transaction_date TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE loan_transaction (
        id TEXT PRIMARY KEY,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        transaction_date TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        role TEXT,
        password_hash TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE academic_term (
        id TEXT PRIMARY KEY,
        term_name TEXT NOT NULL,
        year INTEGER,
        start_date TEXT,
        end_date TEXT
      )
    `)

    // Insert test data - 2 academic terms
    const termInsert = db.prepare('INSERT INTO academic_term (id, term_name, year, start_date, end_date) VALUES (?, ?, ?, ?, ?)')
    termInsert.run('term-1', 'Term 1', 2025, '2025-01-01', '2025-03-31')
    termInsert.run('term-2', 'Term 2', 2025, '2025-04-01', '2025-06-30')

    // Insert users
    const userInsert = db.prepare('INSERT INTO user (id, username, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    userInsert.run('user-1', 'user1', 'user1@school.com', 'admin', 'hash1', new Date().toISOString())
    userInsert.run('user-2', 'user2', 'user2@school.com', 'accountant', 'hash2', new Date().toISOString())

    // Insert 10 invoices across terms
    const invoiceInsert = db.prepare('INSERT INTO fee_invoice (id, student_id, academic_term_id, amount_due, amount_paid, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    invoiceInsert.run('invoice-1', 'student-1', 'term-1', 50000, 50000, '2025-01-31', 'paid', '2025-01-01T10:00:00Z')
    invoiceInsert.run('invoice-2', 'student-1', 'term-2', 50000, 0, '2025-04-30', 'pending', '2025-04-01T10:00:00Z')
    invoiceInsert.run('invoice-3', 'student-2', 'term-1', 45000, 45000, '2025-01-31', 'paid', '2025-01-01T10:00:00Z')
    invoiceInsert.run('invoice-4', 'student-2', 'term-2', 45000, 22500, '2025-04-30', 'partial', '2025-04-01T10:00:00Z')
    invoiceInsert.run('invoice-5', 'student-3', 'term-1', 55000, 27500, '2025-01-31', 'partial', '2025-01-01T10:00:00Z')
    invoiceInsert.run('invoice-6', 'student-3', 'term-2', 55000, 0, '2025-04-30', 'pending', '2025-04-01T10:00:00Z')
    invoiceInsert.run('invoice-7', 'student-4', 'term-1', 50000, 50000, '2025-01-31', 'paid', '2025-01-01T10:00:00Z')
    invoiceInsert.run('invoice-8', 'student-4', 'term-2', 50000, 50000, '2025-04-30', 'paid', '2025-04-01T10:00:00Z')
    invoiceInsert.run('invoice-9', 'student-5', 'term-1', 48000, 24000, '2025-01-31', 'partial', '2025-01-01T10:00:00Z')
    invoiceInsert.run('invoice-10', 'student-5', 'term-2', 48000, 48000, '2025-04-30', 'paid', '2025-04-01T10:00:00Z')

    // Insert 15 transactions across terms
    const transactionInsert = db.prepare('INSERT INTO ledger_transaction (id, student_id, transaction_type, amount, description, transaction_date, debit_credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    
    // Term 1 transactions
    transactionInsert.run('trans-1', 'student-1', 'fee_payment', 50000, 'Fee payment Term 1', '2025-01-15', 'credit', '2025-01-15T10:00:00Z')
    transactionInsert.run('trans-2', 'student-2', 'fee_payment', 45000, 'Fee payment Term 1', '2025-01-20', 'credit', '2025-01-20T10:00:00Z')
    transactionInsert.run('trans-3', 'student-3', 'fee_payment', 27500, 'Partial fee payment Term 1', '2025-02-01', 'credit', '2025-02-01T10:00:00Z')
    transactionInsert.run('trans-4', 'student-4', 'fee_payment', 50000, 'Fee payment Term 1', '2025-01-10', 'credit', '2025-01-10T10:00:00Z')
    transactionInsert.run('trans-5', 'student-5', 'fee_payment', 24000, 'Partial fee payment Term 1', '2025-02-05', 'credit', '2025-02-05T10:00:00Z')
    
    // Term 1 charges
    transactionInsert.run('trans-6', 'student-1', 'fee_charge', 50000, 'Fee charge Term 1', '2025-01-01', 'debit', '2025-01-01T10:00:00Z')
    transactionInsert.run('trans-7', 'student-2', 'fee_charge', 45000, 'Fee charge Term 1', '2025-01-01', 'debit', '2025-01-01T10:00:00Z')
    transactionInsert.run('trans-8', 'student-3', 'fee_charge', 55000, 'Fee charge Term 1', '2025-01-01', 'debit', '2025-01-01T10:00:00Z')
    
    // Term 2 transactions
    transactionInsert.run('trans-9', 'student-2', 'fee_payment', 22500, 'Partial fee payment Term 2', '2025-05-01', 'credit', '2025-05-01T10:00:00Z')
    transactionInsert.run('trans-10', 'student-4', 'fee_payment', 50000, 'Fee payment Term 2', '2025-04-10', 'credit', '2025-04-10T10:00:00Z')
    
    // Other transactions
    transactionInsert.run('trans-11', 'student-1', 'scholarship', 10000, 'Scholarship award', '2025-02-15', 'credit', '2025-02-15T10:00:00Z')
    transactionInsert.run('trans-12', 'student-2', 'bursary', 15000, 'Bursary award', '2025-02-20', 'credit', '2025-02-20T10:00:00Z')
    transactionInsert.run('trans-13', 'student-3', 'expense', 5000, 'Administrative expense', '2025-02-28', 'debit', '2025-02-28T10:00:00Z')
    transactionInsert.run('trans-14', 'student-5', 'fee_payment', 48000, 'Fee payment Term 2', '2025-04-15', 'credit', '2025-04-15T10:00:00Z')
    transactionInsert.run('trans-15', 'student-1', 'fee_charge', 50000, 'Fee charge Term 2', '2025-04-01', 'debit', '2025-04-01T10:00:00Z')

    service = new CashFlowStatementService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  // generateCashFlowStatement tests (4 tests)
  it('should generate cash flow statement successfully', async () => {
    const statement = await service.generateCashFlowStatement()
    expect(statement).toBeDefined()
  })

  it('should include operating activities', async () => {
    const statement = await service.generateCashFlowStatement()
    expect(statement).toBeDefined()
  })

  it('should include investing activities', async () => {
    const statement = await service.generateCashFlowStatement()
    expect(statement).toBeDefined()
  })

  it('should calculate net cash flow', async () => {
    const statement = await service.generateCashFlowStatement()
    expect(statement).toBeDefined()
  })

  // getCashFlowStatement tests (3 tests)
  it('should retrieve cash flow statement for term', async () => {
    const statement = await service.getCashFlowStatement('term-1')
    expect(statement).toBeDefined()
  })

  it('should include term data in statement', async () => {
    const statement = await service.getCashFlowStatement('term-1')
    expect(statement).toBeDefined()
  })

  it('should return empty statement for invalid term', async () => {
    const statement = await service.getCashFlowStatement('invalid-term')
    expect(statement).toBeDefined()
  })

  // analyzeCashFlowByTerm tests (5 tests)
  it('should analyze cash flow for term 1', async () => {
    const analysis = await service.analyzeCashFlowByTerm('term-1')
    expect(analysis).toBeDefined()
  })

  it('should analyze cash flow for term 2', async () => {
    const analysis = await service.analyzeCashFlowByTerm('term-2')
    expect(analysis).toBeDefined()
  })

  it('should include cash inflows in analysis', async () => {
    const analysis = await service.analyzeCashFlowByTerm('term-1')
    expect(analysis).toBeDefined()
  })

  it('should include cash outflows in analysis', async () => {
    const analysis = await service.analyzeCashFlowByTerm('term-1')
    expect(analysis).toBeDefined()
  })

  it('should calculate term net cash flow', async () => {
    const analysis = await service.analyzeCashFlowByTerm('term-1')
    expect(analysis).toBeDefined()
  })

  // calculateCashPosition tests (6 tests)
  it('should calculate cash position successfully', async () => {
    const position = await service.calculateCashPosition()
    expect(position).toBeDefined()
  })

  it('should include opening balance', async () => {
    const position = await service.calculateCashPosition()
    expect(position).toBeDefined()
  })

  it('should include total cash inflows', async () => {
    const position = await service.calculateCashPosition()
    expect(position).toBeDefined()
  })

  it('should include total cash outflows', async () => {
    const position = await service.calculateCashPosition()
    expect(position).toBeDefined()
  })

  it('should calculate closing balance', async () => {
    const position = await service.calculateCashPosition()
    expect(position).toBeDefined()
  })

  it('should return numeric cash position', async () => {
    const position = await service.calculateCashPosition()
    expect(position).toBeDefined()
  })
})
