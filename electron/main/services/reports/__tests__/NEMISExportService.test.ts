import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { NEMISExportService } from '../../reports/NEMISExportService'

vi.mock('../../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('NEMISExportService', () => {
  let db: Database.Database
  let service: NEMISExportService

  beforeEach(() => {
    db = new Database(':memory:')

    db.exec(`
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
})
