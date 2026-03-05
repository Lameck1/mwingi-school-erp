import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const { sessionData } = vi.hoisted(() => ({
  sessionData: {
    userId: 9,
    role: 'TEACHER'
  }
}))

const nemisServiceMock = {
  extractStudentData: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  extractStaffData: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  extractEnrollmentData: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  createExport: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ success: true })),
  getExportHistory: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  validateStudentData: vi.fn((..._args: unknown[]): unknown => ({ valid: true })),
}

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: sessionData.userId,
      username: 'session-user',
      role: sessionData.role,
      full_name: 'Session User',
      email: null,
      is_active: 1,
      last_login: null,
      created_at: '2026-01-01T00:00:00'
    },
    lastActivity: Date.now()
  })),
  clearSessionCache: vi.fn()
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'NEMISExportService') {
        return nemisServiceMock
      }
      return {}
    })
  }
}))

const { logAuditMock } = vi.hoisted(() => ({
  logAuditMock: vi.fn()
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: logAuditMock
}))

import { clearSessionCache } from '../../../security/session'
import { registerReportsHandlers } from '../reports-handlers'

describe('reports IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionData.userId = 9
    sessionData.role = 'TEACHER'
    clearSessionCache()
    Object.values(nemisServiceMock).forEach(fn => fn.mockClear())
    logAuditMock.mockClear()
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
        admission_number TEXT,
        guardian_phone TEXT,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE stream (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_name TEXT
      );
      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        invoice_number TEXT,
        total_amount INTEGER NOT NULL,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        due_date TEXT
      );
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        attendance_date TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        transaction_type TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        is_voided INTEGER DEFAULT 0,
        category_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        staff_number TEXT,
        department TEXT,
        job_title TEXT,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS payroll_period (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_name TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        status TEXT DEFAULT 'DRAFT'
      );
      CREATE TABLE IF NOT EXISTS payroll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        period_id INTEGER NOT NULL,
        gross_salary INTEGER DEFAULT 0,
        total_deductions INTEGER DEFAULT 0,
        net_salary INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS inventory_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_code TEXT,
        item_name TEXT NOT NULL,
        category_id INTEGER,
        current_stock INTEGER DEFAULT 0,
        unit_cost INTEGER DEFAULT 0,
        reorder_level INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS inventory_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL
      );
    `)
    registerReportsHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('report:defaulters excludes PAID and CANCELLED invoices', async () => {
    db.prepare(`
      INSERT INTO student (id, first_name, last_name, admission_number, guardian_phone)
      VALUES (1, 'Jane', 'Doe', 'ADM001', '+254700000001')
    `).run()
    db.prepare(`INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 8')`).run()
    db.prepare(`INSERT INTO enrollment (id, student_id, stream_id) VALUES (1, 1, 1)`).run()

    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-OPEN', 10000, 1000, 'PENDING', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-PAID', 12000, 12000, 'PAID', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-CANCELLED', 8000, 0, 'CANCELLED', '2026-02-20')
    `).run()

    const handler = handlerMap.get('report:defaulters')
    expect(handler).toBeDefined()

    const result = await handler!({}) as Array<{ invoice_number: string }>
    expect(result).toHaveLength(1)
    expect(result[0].invoice_number).toBe('INV-OPEN')
  })

  it('report:defaulters applies term filter', async () => {
    db.prepare(`
      INSERT INTO student (id, first_name, last_name, admission_number, guardian_phone)
      VALUES (1, 'Jane', 'Doe', 'ADM001', '+254700000001')
    `).run()
    db.prepare(`INSERT INTO enrollment (id, student_id) VALUES (1, 1)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-T1', 10000, 1000, 'PENDING', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 2, 'INV-T2', 10000, 1000, 'PENDING', '2026-04-20')
    `).run()

    const handler = handlerMap.get('report:defaulters')!
    const term1Result = await handler({}, 1) as Array<{ invoice_number: string }>
    expect(term1Result).toHaveLength(1)
    expect(term1Result[0].invoice_number).toBe('INV-T1')
  })

  it('report:defaulters normalizes invoice amount and status casing', async () => {
    db.prepare(`
      INSERT INTO student (id, first_name, last_name, admission_number, guardian_phone)
      VALUES (2, 'Sarah', 'Ochieng', 'MAS-2026', '+254700000002')
    `).run()
    db.prepare(`INSERT INTO enrollment (id, student_id) VALUES (2, 2)`).run()

    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount, amount_due, amount_paid, status, due_date)
      VALUES (2, 1, 'INV-LEGACY', 0, 1700000, 1700000, 0, 'pending', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount, amount_due, amount_paid, status, due_date)
      VALUES (2, 1, 'INV-CAN', 100000, 100000, 100000, 0, 'cancelled', '2026-02-20')
    `).run()

    const handler = handlerMap.get('report:defaulters')!
    const result = await handler({}, 1) as Array<{ invoice_number: string; total_amount: number; balance: number }>

    expect(result).toHaveLength(1)
    expect(result[0].invoice_number).toBe('INV-LEGACY')
    expect(result[0].total_amount).toBe(1700000)
    expect(result[0].balance).toBe(1700000)
  })

  it('reports:createNEMISExport rejects renderer actor mismatch', async () => {
    sessionData.role = 'PRINCIPAL'
    const handler = handlerMap.get('reports:createNEMISExport')
    expect(handler).toBeDefined()

    const result = await handler!({}, { export_type: 'STUDENTS', format: 'CSV' }, 3) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(nemisServiceMock.createExport).not.toHaveBeenCalled()
  })

  it('reports:extractStudentData writes audit metadata with filters and row count', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStudentData.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
    const handler = handlerMap.get('reports:extractStudentData')
    expect(handler).toBeDefined()

    const result = await handler!({}, { streamId: 4, academicYear: '2026', status: 'ACTIVE' }) as Array<{ id: number }>
    expect(result).toHaveLength(2)
    expect(logAuditMock).toHaveBeenCalledWith(
      9,
      'NEMIS_EXTRACT_STUDENT_DATA',
      'nemis_export',
      null,
      null,
      expect.objectContaining({
        filters: expect.objectContaining({
          class_id: 4,
          academic_year: '2026',
          status: 'ACTIVE'
        }),
        row_count: 2
      })
    )
  })

  it('reports:extractStaffData and reports:extractEnrollmentData write audit metadata', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStaffData.mockResolvedValueOnce([{ id: 'S1' }])
    nemisServiceMock.extractEnrollmentData.mockResolvedValueOnce([{ class_name: 'Grade 1' }])

    const staffHandler = handlerMap.get('reports:extractStaffData')
    const enrollmentHandler = handlerMap.get('reports:extractEnrollmentData')
    expect(staffHandler).toBeDefined()
    expect(enrollmentHandler).toBeDefined()

    await staffHandler!({})
    await enrollmentHandler!({}, '2026')

    expect(logAuditMock).toHaveBeenCalledWith(
      9,
      'NEMIS_EXTRACT_STAFF_DATA',
      'nemis_export',
      null,
      null,
      expect.objectContaining({ row_count: 1 })
    )
    expect(logAuditMock).toHaveBeenCalledWith(
      9,
      'NEMIS_EXTRACT_ENROLLMENT_DATA',
      'nemis_export',
      null,
      null,
      expect.objectContaining({
        filters: expect.objectContaining({ academic_year: '2026' }),
        row_count: 1
      })
    )
  })

  // ==================== Empty data – || 0 fallback branches ====================

  it('report:financialSummary returns zeros when no transactions exist', async () => {
    const handler = handlerMap.get('report:financialSummary')!
    const result = await handler({}, '2026-01-01', '2026-01-31') as { totalIncome: number; totalExpense: number; feePayments: number; netBalance: number }
    expect(result.totalIncome).toBe(0)
    expect(result.totalExpense).toBe(0)
    expect(result.feePayments).toBe(0)
    expect(result.netBalance).toBe(0)
  })

  it('report:dashboard returns zeros when no data exists', async () => {
    const handler = handlerMap.get('report:dashboard')!
    const result = await handler({}) as { totalStudents: number; totalStaff: number; feeCollected: number; outstandingBalance: number }
    expect(result.totalStudents).toBe(0)
    expect(result.totalStaff).toBe(0)
    expect(result.feeCollected).toBe(0)
    expect(result.outstandingBalance).toBe(0)
  })

  it('reports:createNEMISExport passes when legacyId is undefined', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockResolvedValueOnce({ success: true, id: 50 })
    const handler = handlerMap.get('reports:createNEMISExport')!
    const result = await handler({}, { export_type: 'STUDENTS' as const, format: 'CSV' as const }) as { success: boolean }
    expect(result.success).toBe(true)
  })

  // ==================== Attendance & Collection Reports ====================

  it('report:attendance returns attendance summary for date range', async () => {
    db.prepare(`INSERT INTO student (id, first_name, last_name, admission_number, is_active) VALUES (1, 'Jane', 'Doe', 'ADM001', 1)`).run()
    db.prepare(`INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 8')`).run()
    db.prepare(`INSERT INTO enrollment (id, student_id, stream_id) VALUES (1, 1, 1)`).run()
    db.prepare(`INSERT INTO attendance (student_id, attendance_date, status) VALUES (1, '2026-01-10', 'PRESENT')`).run()
    db.prepare(`INSERT INTO attendance (student_id, attendance_date, status) VALUES (1, '2026-01-11', 'ABSENT')`).run()
    db.prepare(`INSERT INTO attendance (student_id, attendance_date, status) VALUES (1, '2026-01-12', 'LATE')`).run()

    const handler = handlerMap.get('report:attendance')!
    const result = await handler({}, '2026-01-10', '2026-01-12') as Array<{ present_days: number; absent_days: number; late_days: number }>
    expect(result).toHaveLength(1)
    expect(result[0].present_days).toBe(1)
    expect(result[0].absent_days).toBe(1)
    expect(result[0].late_days).toBe(1)
  })

  it('report:attendance filters by streamId when provided', async () => {
    db.prepare(`INSERT INTO student (id, first_name, last_name, admission_number, is_active) VALUES (1, 'Jane', 'Doe', 'ADM001', 1)`).run()
    db.prepare(`INSERT INTO student (id, first_name, last_name, admission_number, is_active) VALUES (2, 'Jay', 'Smith', 'ADM002', 1)`).run()
    db.prepare(`INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 7')`).run()
    db.prepare(`INSERT INTO stream (id, stream_name) VALUES (2, 'Grade 8')`).run()
    db.prepare(`INSERT INTO enrollment (id, student_id, stream_id) VALUES (1, 1, 1)`).run()
    db.prepare(`INSERT INTO enrollment (id, student_id, stream_id) VALUES (2, 2, 2)`).run()

    const handler = handlerMap.get('report:attendance')!
    const result = await handler({}, '2026-01-01', '2026-12-31', 1) as Array<{ admission_number: string }>
    expect(result).toHaveLength(1)
    expect(result[0].admission_number).toBe('ADM001')
  })

  it('report:dailyCollection returns fee payments for a date', async () => {
    db.prepare(`INSERT INTO student (id, first_name, last_name, admission_number, is_active) VALUES (1, 'Jane', 'Doe', 'ADM001', 1)`).run()
    db.prepare(`INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 8')`).run()
    db.prepare(`INSERT INTO enrollment (id, student_id, stream_id) VALUES (1, 1, 1)`).run()
    db.prepare(`INSERT INTO ledger_transaction (student_id, transaction_type, transaction_date, amount, payment_method, payment_reference, description, is_voided)
      VALUES (1, 'FEE_PAYMENT', '2026-03-15', 5000, 'CASH', 'REC-001', 'Term 1 fees', 0)`).run()
    db.prepare(`INSERT INTO ledger_transaction (student_id, transaction_type, transaction_date, amount, payment_method, payment_reference, description, is_voided)
      VALUES (1, 'FEE_PAYMENT', '2026-03-15', 3000, 'MPESA', 'REC-002', 'Term 1 balance', 0)`).run()
    // Voided transaction - should be excluded
    db.prepare(`INSERT INTO ledger_transaction (student_id, transaction_type, transaction_date, amount, payment_method, payment_reference, description, is_voided)
      VALUES (1, 'FEE_PAYMENT', '2026-03-15', 1000, 'CASH', 'REC-003', 'Voided', 1)`).run()

    const handler = handlerMap.get('report:dailyCollection')!
    const result = await handler({}, '2026-03-15') as Array<{ amount: number }>
    expect(result).toHaveLength(2)
  })

  // ==================== Financial Summary & Dashboard ====================

  it('report:financialSummary calculates income/expenses/net for date range', async () => {
    // Income transaction
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided) VALUES ('FEE_PAYMENT', '2026-01-15', 50000, 0)`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided) VALUES ('OTHER_INCOME', '2026-01-16', 10000, 0)`).run()
    // Expense transaction
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided) VALUES ('EXPENSE', '2026-01-17', 20000, 0)`).run()
    // Voided - should not count
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided) VALUES ('FEE_PAYMENT', '2026-01-18', 99999, 1)`).run()

    const handler = handlerMap.get('report:financialSummary')!
    const result = await handler({}, '2026-01-01', '2026-01-31') as { totalIncome: number; totalExpense: number; feePayments: number; netBalance: number }
    expect(result.feePayments).toBe(50000)
    expect(result.totalExpense).toBe(20000)
    expect(typeof result.netBalance).toBe('number')
  })

  it('report:dashboard returns aggregate counts', async () => {
    db.prepare(`INSERT INTO student (first_name, last_name, is_active) VALUES ('Jane', 'Doe', 1)`).run()
    db.prepare(`INSERT INTO student (first_name, last_name, is_active) VALUES ('John', 'Smith', 0)`).run()
    db.prepare(`INSERT INTO staff (first_name, last_name, is_active) VALUES ('Alice', 'Teacher', 1)`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided) VALUES ('FEE_PAYMENT', '2026-01-15', 10000, 0)`).run()
    db.prepare(`INSERT INTO fee_invoice (student_id, term_id, total_amount, amount_paid, status) VALUES (1, 1, 10000, 3000, 'PENDING')`).run()

    const handler = handlerMap.get('report:dashboard')!
    const result = await handler({}) as { totalStudents: number; totalStaff: number; feeCollected: number; outstandingBalance: number }
    expect(result.totalStudents).toBe(1) // only active
    expect(result.totalStaff).toBe(1)
    expect(result.feeCollected).toBe(10000)
    expect(result.outstandingBalance).toBe(7000) // 10000 - 3000
  })

  // ==================== Category Breakdowns ====================

  it('report:revenueByCategory groups income by transaction category', async () => {
    db.prepare(`INSERT INTO transaction_category (id, category_name) VALUES (1, 'Tuition')`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided, category_id)
      VALUES ('FEE_PAYMENT', '2026-01-10', 5000, 0, 1)`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided, category_id)
      VALUES ('FEE_PAYMENT', '2026-01-11', 3000, 0, 1)`).run()

    const handler = handlerMap.get('report:revenueByCategory')!
    const result = await handler({}, '2026-01-01', '2026-01-31') as Array<{ name: string; value: number }>
    expect(result.length).toBeGreaterThanOrEqual(1)
    const tuition = result.find(r => r.name === 'Tuition')
    expect(tuition?.value).toBe(8000)
  })

  it('report:expenseByCategory groups expenses by category', async () => {
    db.prepare(`INSERT INTO transaction_category (id, category_name) VALUES (1, 'Office Supplies')`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided, category_id)
      VALUES ('EXPENSE', '2026-02-10', 2000, 0, 1)`).run()

    const handler = handlerMap.get('report:expenseByCategory')!
    const result = await handler({}, '2026-02-01', '2026-02-28') as Array<{ name: string; value: number }>
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].name).toBe('Office Supplies')
    expect(result[0].value).toBe(2000)
  })

  it('report:feeCategoryBreakdown aggregates fee payments by category', async () => {
    db.prepare(`INSERT INTO transaction_category (id, category_name) VALUES (1, 'Tuition')`).run()
    db.prepare(`INSERT INTO transaction_category (id, category_name) VALUES (2, 'Boarding')`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided, category_id) VALUES ('FEE_PAYMENT', '2026-01-10', 5000, 0, 1)`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, is_voided, category_id) VALUES ('FEE_PAYMENT', '2026-01-11', 2000, 0, 2)`).run()

    const handler = handlerMap.get('report:feeCategoryBreakdown')!
    const result = await handler({}) as Array<{ name: string; value: number }>
    expect(result).toHaveLength(2)
  })

  // ==================== Operations Reports ====================

  it('report:inventoryValuation returns active inventory items with total value', async () => {
    db.prepare(`INSERT INTO inventory_category (id, category_name) VALUES (1, 'Stationery')`).run()
    db.prepare(`INSERT INTO inventory_item (item_code, item_name, category_id, current_stock, unit_cost, reorder_level, is_active)
      VALUES ('STN-001', 'Pens', 1, 100, 15, 20, 1)`).run()
    db.prepare(`INSERT INTO inventory_item (item_code, item_name, category_id, current_stock, unit_cost, reorder_level, is_active)
      VALUES ('STN-002', 'Inactive Item', 1, 50, 10, 5, 0)`).run()

    const handler = handlerMap.get('report:inventoryValuation')!
    const result = await handler({}) as Array<{ item_code: string; total_value: number }>
    expect(result).toHaveLength(1) // only active
    expect(result[0].item_code).toBe('STN-001')
    expect(result[0].total_value).toBe(1500) // 100 * 15
  })

  it('report:staffPayroll returns period+payroll+summary', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, status) VALUES (1, 'January 2026', 'CONFIRMED')`).run()
    db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title) VALUES (1, 'Alice', 'Teacher', 'ST001', 'Science', 'Teacher')`).run()
    db.prepare(`INSERT INTO payroll (staff_id, period_id, gross_salary, total_deductions, net_salary) VALUES (1, 1, 80000, 15000, 65000)`).run()

    const handler = handlerMap.get('report:staffPayroll')!
    const result = await handler({}, 1) as { period: { period_name: string }; payroll: unknown[]; summary: { total_gross: number } }
    expect(result.period.period_name).toBe('January 2026')
    expect(result.payroll).toHaveLength(1)
    expect(result.summary.total_gross).toBe(80000)
  })

  it('report:staffPayroll returns error for non-existent period', async () => {
    const handler = handlerMap.get('report:staffPayroll')!
    const result = await handler({}, 999) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('report:feeCollection groups payments by date and method', async () => {
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, payment_method, is_voided)
      VALUES ('FEE_PAYMENT', '2026-03-10', 5000, 'CASH', 0)`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, payment_method, is_voided)
      VALUES ('FEE_PAYMENT', '2026-03-10', 3000, 'MPESA', 0)`).run()
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, transaction_date, amount, payment_method, is_voided)
      VALUES ('FEE_PAYMENT', '2026-03-11', 7000, 'CASH', 0)`).run()

    const handler = handlerMap.get('report:feeCollection')!
    const result = await handler({}, '2026-03-01', '2026-03-31') as Array<{ payment_date: string; amount: number; payment_method: string }>
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  // ==================== NEMIS Export Handlers ====================

  it('reports:extractStudentData without filters fetches all', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStudentData.mockResolvedValueOnce([{ id: 1 }])
    const handler = handlerMap.get('reports:extractStudentData')!
    const result = await handler({}) as Array<{ id: number }>
    expect(result).toHaveLength(1)
    expect(nemisServiceMock.extractStudentData).toHaveBeenCalledWith()
    expect(logAuditMock).toHaveBeenCalledWith(
      9, 'NEMIS_EXTRACT_STUDENT_DATA', 'nemis_export', null, null,
      expect.objectContaining({ filters: null, row_count: 1 })
    )
  })

  it('reports:extractStudentData returns error on service failure', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStudentData.mockRejectedValueOnce(new Error('DB connection lost'))
    const handler = handlerMap.get('reports:extractStudentData')!
    const result = await handler({}, { streamId: 1 }) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB connection lost')
  })

  it('reports:extractStaffData returns error on service failure', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStaffData.mockRejectedValueOnce(new Error('Service unavailable'))
    const handler = handlerMap.get('reports:extractStaffData')!
    const result = await handler({}) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Service unavailable')
  })

  it('reports:extractEnrollmentData returns error on service failure', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractEnrollmentData.mockRejectedValueOnce(new Error('timeout'))
    const handler = handlerMap.get('reports:extractEnrollmentData')!
    const result = await handler({}, '2026') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('timeout')
  })

  it('reports:createNEMISExport succeeds with valid config', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockResolvedValueOnce({ success: true, id: 42 })
    const handler = handlerMap.get('reports:createNEMISExport')!
    const config = { export_type: 'STUDENTS' as const, format: 'CSV' as const, filters: { class_id: 1, academic_year: '2026', gender: 'F' as const, status: 'ACTIVE' }, academic_year: '2026' }
    const result = await handler({}, config, 9) as { success: boolean; id: number }
    expect(result.success).toBe(true)
    expect(nemisServiceMock.createExport).toHaveBeenCalledWith(
      expect.objectContaining({ export_type: 'STUDENTS', format: 'CSV', filters: expect.objectContaining({ class_id: 1, gender: 'F' }) }),
      9
    )
  })

  it('reports:createNEMISExport returns error on service failure', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockRejectedValueOnce(new Error('Export failed'))
    const handler = handlerMap.get('reports:createNEMISExport')!
    const result = await handler({}, { export_type: 'STAFF' as const, format: 'JSON' as const }, 9) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Export failed')
  })

  it('reports:getNEMISExportHistory returns export history', async () => {
    nemisServiceMock.getExportHistory.mockResolvedValueOnce([{ id: 1, export_type: 'STUDENTS' }])
    const handler = handlerMap.get('reports:getNEMISExportHistory')!
    const result = await handler({}, 10) as Array<{ id: number }>
    expect(result).toHaveLength(1)
    expect(nemisServiceMock.getExportHistory).toHaveBeenCalledWith(10)
  })

  it('reports:getNEMISExportHistory returns error on failure', async () => {
    nemisServiceMock.getExportHistory.mockRejectedValueOnce(new Error('Not found'))
    const handler = handlerMap.get('reports:getNEMISExportHistory')!
    const result = await handler({}) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Not found')
  })

  it('reports:validateNEMISStudentData validates student data', async () => {
    nemisServiceMock.validateStudentData.mockReturnValueOnce({ valid: true, errors: [] })
    const handler = handlerMap.get('reports:validateNEMISStudentData')!
    const student = {
      nemis_upi: 'UPI001',
      full_name: 'Jane Doe',
      date_of_birth: '2015-01-01',
      gender: 'F' as const,
      class_name: 'Grade 4',
      admission_number: 'ADM001',
      guardian_name: 'John Doe',
      guardian_phone: '+254700000001',
      county: 'Kitui',
      sub_county: 'Mwingi Central',
      special_needs: null
    }
    const result = await handler({}, student) as { valid: boolean }
    expect(result.valid).toBe(true)
    expect(nemisServiceMock.validateStudentData).toHaveBeenCalledWith(student)
  })

  it('reports:validateNEMISStudentData returns error on service failure', async () => {
    nemisServiceMock.validateStudentData.mockImplementationOnce(() => { throw new Error('Invalid data') })
    const handler = handlerMap.get('reports:validateNEMISStudentData')!
    const student = {
      nemis_upi: 'X',
      full_name: 'A B',
      date_of_birth: '2000-01-01',
      gender: 'M' as const,
      class_name: '1',
      admission_number: 'Z',
      guardian_name: 'Parent',
      guardian_phone: '+254700000000',
      county: 'Nairobi',
      sub_county: 'Westlands',
      special_needs: null
    }
    const result = await handler({}, student) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid data')
  })

  // ─── branch: extractStudentData with only academicYear filter ──

  it('reports:extractStudentData maps only academicYear when other filters are absent', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStudentData.mockResolvedValueOnce([{ id: 5 }])
    const handler = handlerMap.get('reports:extractStudentData')!
    const result = await handler({}, { academicYear: '2025' }) as Array<{ id: number }>
    expect(result).toHaveLength(1)
    expect(nemisServiceMock.extractStudentData).toHaveBeenCalledWith({ academic_year: '2025' })
  })

  it('reports:createNEMISExport normalizes config without filters', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockResolvedValueOnce({ success: true, id: 99 })
    const handler = handlerMap.get('reports:createNEMISExport')!
    const result = await handler({}, { export_type: 'FINANCIAL' as const, format: 'JSON' as const }, 9) as { success: boolean; id: number }
    expect(result.success).toBe(true)
    expect(nemisServiceMock.createExport).toHaveBeenCalledWith(
      expect.objectContaining({ export_type: 'FINANCIAL', format: 'JSON' }),
      9
    )
    // filters key should NOT be set on the normalizedConfig
    const callArg = nemisServiceMock.createExport.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(callArg.filters).toBeUndefined()
  })

  it('reports:createNEMISExport normalizes config with partial filters (only status)', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockResolvedValueOnce({ success: true, id: 100 })
    const handler = handlerMap.get('reports:createNEMISExport')!
    const result = await handler({}, { export_type: 'STUDENTS' as const, format: 'CSV' as const, filters: { status: 'ACTIVE' } }, 9) as { success: boolean }
    expect(result.success).toBe(true)
    const callArg = nemisServiceMock.createExport.mock.calls.at(-1)![0] as Record<string, unknown>
    expect((callArg.filters as Record<string, unknown>).status).toBe('ACTIVE')
    expect((callArg.filters as Record<string, unknown>).class_id).toBeUndefined()
    expect((callArg.filters as Record<string, unknown>).gender).toBeUndefined()
  })

  // ─── Branch coverage: error instanceof Error FALSE branches (non-Error thrown) ───

  it('reports:extractStudentData uses fallback message for non-Error rejection', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStudentData.mockRejectedValueOnce('string error, not an Error instance')
    const handler = handlerMap.get('reports:extractStudentData')!
    const result = await handler({}, { streamId: 1 }) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to extract student data')
  })

  it('reports:extractStaffData uses fallback message for non-Error rejection', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractStaffData.mockRejectedValueOnce(42)
    const handler = handlerMap.get('reports:extractStaffData')!
    const result = await handler({}) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to extract staff data')
  })

  it('reports:extractEnrollmentData uses fallback message for non-Error rejection', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.extractEnrollmentData.mockRejectedValueOnce(null)
    const handler = handlerMap.get('reports:extractEnrollmentData')!
    const result = await handler({}, '2026') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to extract enrollment data')
  })

  it('reports:createNEMISExport uses fallback "Unknown error" for non-Error rejection', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockRejectedValueOnce({ code: 500 })
    const handler = handlerMap.get('reports:createNEMISExport')!
    const result = await handler({}, { export_type: 'STAFF' as const, format: 'JSON' as const }, 9) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unknown error')
  })

  it('reports:getNEMISExportHistory uses fallback message for non-Error rejection', async () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    nemisServiceMock.getExportHistory.mockRejectedValueOnce(undefined)
    const handler = handlerMap.get('reports:getNEMISExportHistory')!
    const result = await handler({}) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to get export history')
  })

  it('reports:validateNEMISStudentData uses fallback message for non-Error thrown', async () => {
    nemisServiceMock.validateStudentData.mockImplementationOnce(() => {
      throw 'not an error object' // NOSONAR intentional: testing non-Error catch branch
    })
    const handler = handlerMap.get('reports:validateNEMISStudentData')!
    const student = {
      nemis_upi: 'UPI-NE',
      full_name: 'Test Student',
      date_of_birth: '2015-06-01',
      gender: 'M' as const,
      class_name: 'Grade 5',
      admission_number: 'ADM-NE',
      guardian_name: 'Guardian',
      guardian_phone: '+254700000099',
      county: 'Nairobi',
      sub_county: 'Central',
      special_needs: null
    }
    const result = await handler({}, student) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to validate student data')
  })

  // ── Branch coverage: NEMIS export gender filter (L386) ──
  it('reports:createNEMISExport normalizes config with gender filter', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockResolvedValueOnce({ success: true, id: 200 })
    const handler = handlerMap.get('reports:createNEMISExport')!
    const result = await handler({}, {
      export_type: 'STUDENTS' as const,
      format: 'CSV' as const,
      filters: { gender: 'M' as const },
    }, 9) as { success: boolean; id: number }
    expect(result.success).toBe(true)
    const callArg = nemisServiceMock.createExport.mock.calls.at(-1)![0] as Record<string, unknown>
    expect((callArg.filters as Record<string, unknown>).gender).toBe('M')
    // Other filters should not be set
    expect((callArg.filters as Record<string, unknown>).status).toBeUndefined()
    expect((callArg.filters as Record<string, unknown>).class_id).toBeUndefined()
  })

  it('reports:createNEMISExport normalizes config with all filters', async () => {
    sessionData.role = 'PRINCIPAL'
    nemisServiceMock.createExport.mockResolvedValueOnce({ success: true, id: 201 })
    const handler = handlerMap.get('reports:createNEMISExport')!
    const result = await handler({}, {
      export_type: 'STUDENTS' as const,
      format: 'JSON' as const,
      filters: { gender: 'F' as const, status: 'ACTIVE', class_id: 3, academic_year: '2026' },
    }, 9) as { success: boolean; id: number }
    expect(result.success).toBe(true)
    const callArg = nemisServiceMock.createExport.mock.calls.at(-1)![0] as Record<string, unknown>
    const filters = callArg.filters as Record<string, unknown>
    expect(filters.gender).toBe('F')
    expect(filters.status).toBe('ACTIVE')
    expect(filters.class_id).toBe(3)
    expect(filters.academic_year).toBe('2026')
  })
})
