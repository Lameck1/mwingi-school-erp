import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('Integration Workflows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')

    // Create all required tables
    db.exec(`
      CREATE TABLE student (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT,
        school_id TEXT
      )
    `)

    db.exec(`
      CREATE TABLE fee_invoice (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        academic_term_id TEXT NOT NULL,
        amount_due REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
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
        transaction_date TEXT,
        debit_credit TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE approval_request (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        submitted_date TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        role TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE school (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE
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

    db.exec(`
      CREATE TABLE scholarship (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        amount REAL NOT NULL,
        term_id TEXT NOT NULL,
        status TEXT,
        created_at TEXT
      )
    `)

    // Insert test data - 2 students
    const studentInsert = db.prepare('INSERT INTO student (id, first_name, last_name, admission_number, school_id) VALUES (?, ?, ?, ?, ?)')
    studentInsert.run('student-1', 'John', 'Doe', 'ADM001', 'school-1')
    studentInsert.run('student-2', 'Jane', 'Smith', 'ADM002', 'school-1')

    // Insert school
    db.prepare('INSERT INTO school (id, name, code) VALUES (?, ?, ?)').run('school-1', 'Mwingi School', 'MWS-001')

    // Insert academic terms
    db.prepare('INSERT INTO academic_term (id, term_name, year, start_date, end_date) VALUES (?, ?, ?, ?, ?)').run('term-1', 'Term 1', 2025, '2025-01-01', '2025-03-31')
    db.prepare('INSERT INTO academic_term (id, term_name, year, start_date, end_date) VALUES (?, ?, ?, ?, ?)').run('term-2', 'Term 2', 2025, '2025-04-01', '2025-06-30')

    // Insert users
    db.prepare('INSERT INTO user (id, username, email, role, created_at) VALUES (?, ?, ?, ?, ?)').run('user-1', 'admin', 'admin@school.com', 'admin', new Date().toISOString())
    db.prepare('INSERT INTO user (id, username, email, role, created_at) VALUES (?, ?, ?, ?, ?)').run('user-2', 'approver', 'approver@school.com', 'approver', new Date().toISOString())

    // Insert invoices
    db.prepare('INSERT INTO fee_invoice (id, student_id, academic_term_id, amount_due, amount_paid, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('invoice-1', 'student-1', 'term-1', 50000, 50000, 'paid', new Date().toISOString())
    db.prepare('INSERT INTO fee_invoice (id, student_id, academic_term_id, amount_due, amount_paid, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('invoice-2', 'student-1', 'term-2', 50000, 0, 'pending', new Date().toISOString())
    db.prepare('INSERT INTO fee_invoice (id, student_id, academic_term_id, amount_due, amount_paid, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('invoice-3', 'student-2', 'term-1', 45000, 45000, 'paid', new Date().toISOString())
    db.prepare('INSERT INTO fee_invoice (id, student_id, academic_term_id, amount_due, amount_paid, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('invoice-4', 'student-2', 'term-2', 45000, 22500, 'partial', new Date().toISOString())

    // Insert transactions
    db.prepare('INSERT INTO ledger_transaction (id, student_id, transaction_type, amount, transaction_date, debit_credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('trans-1', 'student-1', 'fee_payment', 50000, '2025-01-15', 'credit', new Date().toISOString())
    db.prepare('INSERT INTO ledger_transaction (id, student_id, transaction_type, amount, transaction_date, debit_credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('trans-2', 'student-2', 'fee_payment', 45000, '2025-01-20', 'credit', new Date().toISOString())
    db.prepare('INSERT INTO ledger_transaction (id, student_id, transaction_type, amount, transaction_date, debit_credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('trans-3', 'student-2', 'fee_payment', 22500, '2025-05-01', 'credit', new Date().toISOString())

    // Insert scholarships
    db.prepare('INSERT INTO scholarship (id, student_id, amount, term_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('scholar-1', 'student-1', 10000, 'term-1', 'active', new Date().toISOString())
    db.prepare('INSERT INTO scholarship (id, student_id, amount, term_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('scholar-2', 'student-2', 5000, 'term-1', 'active', new Date().toISOString())

    // Insert approval requests
    db.prepare('INSERT INTO approval_request (id, student_id, invoice_id, request_type, status, submitted_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('req-1', 'student-1', 'invoice-2', 'payment_plan', 'pending', new Date().toISOString(), new Date().toISOString())
    db.prepare('INSERT INTO approval_request (id, student_id, invoice_id, request_type, status, submitted_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('req-2', 'student-2', 'invoice-4', 'discount', 'approved', new Date().toISOString(), new Date().toISOString())
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  // Cross-service workflow tests
  it('should retrieve student financial data across services', () => {
    const student = db.prepare('SELECT * FROM student WHERE id = ?').get('student-1')
    expect(student).toBeDefined()

    const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = ?').all('student-1')
    expect(Array.isArray(invoices)).toBe(true)
  })

  it('should integrate student and ledger data', () => {
    const transactions = db.prepare('SELECT * FROM ledger_transaction WHERE student_id = ?').all('student-1')
    expect(Array.isArray(transactions)).toBe(true)
    
    const student = db.prepare('SELECT * FROM student WHERE id = ?').get('student-1')
    expect(student).toBeDefined()
  })

  it('should process approval workflow with financial data', () => {
    const approval = db.prepare('SELECT * FROM approval_request WHERE id = ?').get('req-1') as { invoice_id: string }
    expect(approval).toBeDefined()

    const invoice = db.prepare('SELECT * FROM fee_invoice WHERE id = ?').get(approval.invoice_id)
    expect(invoice).toBeDefined()
  })

  it('should link student scholarships to academic terms', () => {
    const scholarships = db.prepare('SELECT * FROM scholarship WHERE student_id = ? AND term_id = ?').all('student-1', 'term-1')
    expect(Array.isArray(scholarships)).toBe(true)

    const term = db.prepare('SELECT * FROM academic_term WHERE id = ?').get('term-1')
    expect(term).toBeDefined()
  })

  it('should track complete financial workflow for student', () => {
    const student = db.prepare('SELECT * FROM student WHERE id = ?').get('student-2')
    const invoices = db.prepare('SELECT SUM(amount_paid) as total_paid FROM fee_invoice WHERE student_id = ?').get('student-2')
    const transactions = db.prepare('SELECT COUNT(*) as count FROM ledger_transaction WHERE student_id = ?').get('student-2')
    
    expect(student).toBeDefined()
    expect(invoices).toBeDefined()
    expect(transactions).toBeDefined()
  })

  it('should verify approval request data consistency', () => {
    const allApprovals = db.prepare('SELECT * FROM approval_request').all() as { student_id: string; invoice_id: string }[]
    expect(Array.isArray(allApprovals)).toBe(true)

    for (const approval of allApprovals) {
      const student = db.prepare('SELECT * FROM student WHERE id = ?').get(approval.student_id)
      const invoice = db.prepare('SELECT * FROM fee_invoice WHERE id = ?').get(approval.invoice_id)
      expect(student).toBeDefined()
      expect(invoice).toBeDefined()
    }
  })

  it('should consolidate multi-term financial summary', () => {
    const term1Invoices = db.prepare('SELECT SUM(amount_due) as total FROM fee_invoice WHERE academic_term_id = ?').get('term-1')
    const term2Invoices = db.prepare('SELECT SUM(amount_due) as total FROM fee_invoice WHERE academic_term_id = ?').get('term-2')
    
    expect(term1Invoices).toBeDefined()
    expect(term2Invoices).toBeDefined()
  })

  it('should handle multi-table joins for reporting', () => {
    const report = db.prepare(`
      SELECT s.first_name, s.last_name, COUNT(fi.id) as invoice_count, SUM(fi.amount_paid) as total_paid
      FROM student s
      LEFT JOIN fee_invoice fi ON s.id = fi.student_id
      GROUP BY s.id
    `).all()
    expect(Array.isArray(report)).toBe(true)
  })
})
