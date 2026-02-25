import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const fsMock = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  unlinkSync: vi.fn()
}))

vi.mock('node:fs', () => ({
  mkdirSync: fsMock.mkdirSync,
  writeFileSync: fsMock.writeFileSync,
  existsSync: fsMock.existsSync,
  unlinkSync: fsMock.unlinkSync
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

import { NEMISExportService } from '../../reports/NEMISExportService'

describe('NEMISExportService', () => {
  let db: Database.Database
  let service: NEMISExportService

  beforeEach(() => {
    fsMock.mkdirSync.mockReset()
    fsMock.writeFileSync.mockReset()
    fsMock.existsSync.mockReset()
    fsMock.unlinkSync.mockReset()
    fsMock.existsSync.mockReturnValue(false)

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

      CREATE TABLE school_settings (
        id INTEGER PRIMARY KEY,
        school_name TEXT NOT NULL
      );

      CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY,
        year_name TEXT NOT NULL
      );

      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_name TEXT NOT NULL
      );

      CREATE TABLE stream (
        id INTEGER PRIMARY KEY,
        stream_name TEXT NOT NULL
      );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT NOT NULL,
        date_of_birth TEXT,
        gender TEXT,
        guardian_name TEXT,
        guardian_phone TEXT,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount INTEGER,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT
      );

      CREATE TABLE staff (
        id INTEGER PRIMARY KEY,
        staff_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        id_number TEXT,
        job_title TEXT,
        employment_date TEXT,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE nemis_export (
        id INTEGER PRIMARY KEY,
        export_type TEXT NOT NULL,
        format TEXT NOT NULL,
        record_count INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        exported_by INTEGER,
        status TEXT NOT NULL,
        exported_at TEXT
      );
    `)

    db.exec(`
      INSERT INTO school_settings (id, school_name) VALUES (1, 'Mwingi Adventist School');
      INSERT INTO academic_year (id, year_name) VALUES (1, '2026');
      INSERT INTO term (id, academic_year_id, term_name) VALUES (1, 1, 'Term 1');
      INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 1');

      INSERT INTO student (id, first_name, last_name, admission_number, date_of_birth, gender, guardian_name, guardian_phone, is_active)
      VALUES
        (1, 'John', 'Doe', 'ADM001', '2010-05-15', 'M', 'John Senior', '0720123456', 1),
        (2, 'Jane', 'Smith', 'ADM002', '2010-08-22', 'F', 'Jane Senior', '0720234567', 1);

      INSERT INTO enrollment (id, student_id, academic_year_id, term_id, stream_id)
      VALUES
        (1, 1, 1, 1, 1),
        (2, 2, 1, 1, 1);

      INSERT INTO fee_invoice (id, student_id, total_amount, amount, amount_due, amount_paid, status)
      VALUES
        (1, 1, 0, 100000, 100000, 20000, 'pending'),
        (2, 2, 200000, 200000, 200000, 50000, 'PAID'),
        (3, 1, 50000, 50000, 50000, 0, 'cancelled');

      INSERT INTO staff (id, staff_number, first_name, last_name, id_number, job_title, employment_date, is_active)
      VALUES
        (1, 'TSC-001', 'Alice', 'Teacher', 'ID-001', 'Mathematics', '2024-01-01', 1);
    `)

    service = new NEMISExportService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  it('extracts student data with class names', async () => {
    const result = await service.extractStudentData()
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty('class_name', 'Grade 1')
  })

  it('extracts staff data from staff table', async () => {
    const result = await service.extractStaffData()
    expect(result).toHaveLength(1)
    expect(result[0].tsc_number).toBe('TSC-001')
  })

  it('extracts enrollment aggregates by stream/year', async () => {
    const result = await service.extractEnrollmentData('2026')
    expect(result).toHaveLength(1)
    expect(result[0].total_count).toBe(2)
  })

  it('extracts financial totals from invoices', async () => {
    const result = await service.extractFinancialData()
    expect(result?.total_invoices).toBe(2)
    expect(result?.total_fees).toBe(300000)
    expect(result?.total_paid).toBe(70000)
    expect(result?.total_outstanding).toBe(230000)
  })

  it('generates a report with counts', async () => {
    const report = await service.generateNEMISReport()
    expect(report.student_count).toBe(2)
    expect(report.enrollment_count).toBe(2)
  })

  it('persists export file before marking export completed', async () => {
    const result = await service.createExport({ export_type: 'STAFF', format: 'CSV' }, 1)
    expect(result.success).toBe(true)
    expect(result.file_path).toContain('nemis_exports')
    expect(fsMock.writeFileSync).toHaveBeenCalledTimes(1)

    const latest = db.prepare('SELECT status, file_path FROM nemis_export ORDER BY id DESC LIMIT 1').get() as {
      status: string
      file_path: string
    } | undefined
    expect(latest?.status).toBe('COMPLETED')
    expect(latest?.file_path).toBe(result.file_path)
  })

  it('records failed status when export file write fails', async () => {
    fsMock.writeFileSync.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    const result = await service.createExport({ export_type: 'STAFF', format: 'CSV' }, 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to persist export file')

    const statusRows = db.prepare('SELECT status FROM nemis_export ORDER BY id DESC LIMIT 1').all() as Array<{ status: string }>
    expect(statusRows[0]?.status).toBe('FAILED')
    const completedCount = db.prepare("SELECT COUNT(*) as count FROM nemis_export WHERE status = 'COMPLETED'").get() as { count: number }
    expect(completedCount.count).toBe(0)
  })
})
