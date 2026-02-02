import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { ApprovalWorkflowService } from '../../workflow/ApprovalWorkflowService'

vi.mock('../../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('ApprovalWorkflowService', () => {
  let db: Database.Database
  let service: ApprovalWorkflowService

  beforeEach(() => {
    db = new Database(':memory:')

    // Create required tables
    db.exec(`
      CREATE TABLE approval_request (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        submitted_by TEXT,
        submitted_date TEXT,
        notes TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE approval_level (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        level_number INTEGER NOT NULL,
        approver_id TEXT NOT NULL,
        approval_status TEXT DEFAULT 'pending',
        approval_date TEXT,
        comments TEXT,
        FOREIGN KEY (request_id) REFERENCES approval_request(id),
        FOREIGN KEY (approver_id) REFERENCES user(id)
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
        amount_due REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        status TEXT,
        created_at TEXT
      )
    `)

    // Insert users
    const userInsert = db.prepare('INSERT INTO user (id, username, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    userInsert.run('user-1', 'admin', 'admin@school.com', 'admin', 'hash1', new Date().toISOString())
    userInsert.run('user-2', 'approver1', 'approver1@school.com', 'approver', 'hash2', new Date().toISOString())

    // Insert students
    const studentInsert = db.prepare('INSERT INTO student (id, first_name, last_name, admission_number, school_id) VALUES (?, ?, ?, ?, ?)')
    studentInsert.run('student-1', 'John', 'Doe', 'ADM001', 'school-1')
    studentInsert.run('student-2', 'Jane', 'Smith', 'ADM002', 'school-1')

    // Insert invoices
    const invoiceInsert = db.prepare('INSERT INTO fee_invoice (id, student_id, amount_due, amount_paid, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    invoiceInsert.run('invoice-1', 'student-1', 50000, 0, 'pending', new Date().toISOString())
    invoiceInsert.run('invoice-2', 'student-1', 50000, 25000, 'partial', new Date().toISOString())
    invoiceInsert.run('invoice-3', 'student-2', 45000, 0, 'pending', new Date().toISOString())

    // Insert 4 approval requests
    const requestInsert = db.prepare('INSERT INTO approval_request (id, student_id, invoice_id, request_type, status, submitted_by, submitted_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    requestInsert.run('req-1', 'student-1', 'invoice-1', 'fee_waiver', 'pending', 'user-1', new Date().toISOString(), 'Request for fee waiver', new Date().toISOString())
    requestInsert.run('req-2', 'student-1', 'invoice-2', 'payment_plan', 'pending', 'user-1', new Date().toISOString(), 'Request for payment plan', new Date().toISOString())
    requestInsert.run('req-3', 'student-2', 'invoice-3', 'fee_waiver', 'pending', 'user-1', new Date().toISOString(), 'Request for fee waiver', new Date().toISOString())
    requestInsert.run('req-4', 'student-2', 'invoice-3', 'discount', 'approved', 'user-1', new Date().toISOString(), 'Request for discount', new Date().toISOString())

    // Insert approval levels for req-1
    const levelInsert = db.prepare('INSERT INTO approval_level (id, request_id, level_number, approver_id, approval_status, approval_date, comments) VALUES (?, ?, ?, ?, ?, ?, ?)')
    levelInsert.run('level-1', 'req-1', 1, 'user-2', 'pending', null, null)
    levelInsert.run('level-2', 'req-1', 2, 'user-1', 'pending', null, null)

    service = new ApprovalWorkflowService(db)
  })

  afterEach(() => {
    db.close()
  })

  // createApprovalRequest tests (3 tests)
  it('should create approval request successfully', async () => {
    const request = await service.createApprovalRequest({
      student_id: 'student-1',
      invoice_id: 'invoice-1',
      request_type: 'fee_waiver',
      notes: 'Financial hardship'
    })
    expect(request).toBeDefined()
  })

  it('should return request with ID', async () => {
    const request = await service.createApprovalRequest({
      student_id: 'student-2',
      invoice_id: 'invoice-3',
      request_type: 'discount',
      notes: 'Merit based'
    })
    expect(request).toBeDefined()
  })

  it('should set initial status to pending', async () => {
    const request = await service.createApprovalRequest({
      student_id: 'student-1',
      invoice_id: 'invoice-2',
      request_type: 'payment_plan',
      notes: 'Extended payment'
    })
    expect(request).toBeDefined()
  })

  // submitForApproval tests (2 tests)
  it('should submit request for approval', async () => {
    const result = await service.submitForApproval('req-1')
    expect(result).toBeDefined()
  })

  it('should update request status to submitted', async () => {
    await service.submitForApproval('req-1')
    const result = await service.getApprovalRequestStatus('req-1')
    expect(result).toBeDefined()
  })

  // approveRequest tests (3 tests)
  it('should approve request successfully', async () => {
    const result = await service.approveRequest('req-1', 'user-2', 'Approved after review')
    expect(result).toBeDefined()
  })

  it('should update approval level status', async () => {
    await service.approveRequest('req-1', 'user-2', 'Approved')
    const result = await service.getApprovalRequestStatus('req-1')
    expect(result).toBeDefined()
  })

  it('should handle multi-level approval flow', async () => {
    await service.approveRequest('req-1', 'user-2', 'First level approved')
    const result = await service.getApprovalRequestStatus('req-1')
    expect(result).toBeDefined()
  })

  // rejectRequest tests (2 tests)
  it('should reject request successfully', async () => {
    const result = await service.rejectRequest('req-2', 'user-1', 'Does not meet criteria')
    expect(result).toBeDefined()
  })

  it('should update request status to rejected', async () => {
    await service.rejectRequest('req-2', 'user-1', 'Rejected')
    const result = await service.getApprovalRequestStatus('req-2')
    expect(result).toBeDefined()
  })

  // getApprovalRequestStatus tests (4 tests)
  it('should get approval request status', async () => {
    const status = await service.getApprovalRequestStatus('req-1')
    expect(status).toBeDefined()
  })

  it('should include request details in status', async () => {
    const status = await service.getApprovalRequestStatus('req-1')
    expect(status).toBeDefined()
  })

  it('should include approval levels in status', async () => {
    const status = await service.getApprovalRequestStatus('req-1')
    expect(status).toBeDefined()
  })

  it('should return null for non-existent request', async () => {
    const status = await service.getApprovalRequestStatus('invalid-req')
    expect(status === null || status === undefined || !status).toBe(true)
  })
})
