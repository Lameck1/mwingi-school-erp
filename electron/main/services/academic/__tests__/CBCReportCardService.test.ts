import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { CBCReportCardService } from '../CBCReportCardService'

interface FeesBalanceAccessor {
  getFeesBalance(studentId: number): number
}

describe('CBCReportCardService fee balance normalization', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('uses normalized invoice amount and excludes cancelled invoices', () => {
    db.exec(`
      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES
        (1, 10, 0, 17000, 17000, 0, 'pending'),
        (2, 10, 7000, 7000, 7000, 8500, 'PARTIAL'),
        (3, 10, 9000, 9000, 9000, 0, 'cancelled');
    `)

    const service = new CBCReportCardService()
    const balance = (service as unknown as FeesBalanceAccessor).getFeesBalance(10)

    expect(balance).toBe(15500)
  })

  it('falls back to legacy amount column when newer amount columns are empty', () => {
    db.exec(`
      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES
        (4, 22, NULL, NULL, 12000, 2000, 'OUTSTANDING');
    `)

    const service = new CBCReportCardService()
    const balance = (service as unknown as FeesBalanceAccessor).getFeesBalance(22)

    expect(balance).toBe(10000)
  })
})

describe('CBCReportCardService report card correctness', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE exam (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL
      );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        student_type TEXT,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        enrollment_date TEXT NOT NULL
      );

      CREATE TABLE subject (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE exam_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        score REAL NOT NULL,
        teacher_remarks TEXT
      );

      CREATE TABLE attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE stream (
        id INTEGER PRIMARY KEY,
        stream_name TEXT NOT NULL
      );

      CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY,
        year_name TEXT NOT NULL
      );

      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_name TEXT NOT NULL,
        term_number INTEGER NOT NULL,
        start_date TEXT
      );

      CREATE TABLE report_card (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        generated_by_user_id INTEGER NOT NULL,
        overall_grade TEXT,
        total_marks REAL,
        average_marks REAL,
        position_in_class INTEGER,
        position_in_stream INTEGER,
        class_teacher_remarks TEXT,
        principal_remarks TEXT,
        attendance_days_present INTEGER,
        attendance_days_absent INTEGER,
        attendance_percentage REAL,
        qr_code_token TEXT,
        generated_at TEXT
      );

      CREATE TABLE report_card_subject (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_card_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        marks REAL,
        grade TEXT,
        percentage REAL,
        teacher_comment TEXT,
        competency_level TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT
      );

      INSERT INTO exam (id, academic_year_id, term_id) VALUES (1, 2026, 1);
      INSERT INTO academic_year (id, year_name) VALUES (2026, '2026');
      INSERT INTO term (id, academic_year_id, term_name, term_number, start_date) VALUES (1, 2026, 'Term 1', 1, '2026-01-10');
      INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 7A');

      INSERT INTO student (id, admission_number, first_name, last_name, student_type, is_active)
      VALUES
        (1, 'ADM/1', 'Grace', 'Mutua', 'DAY_SCHOLAR', 1),
        (2, 'ADM/2', 'Sarah', 'Ochieng', 'DAY_SCHOLAR', 1),
        (3, 'ADM/3', 'John', 'Kamau', 'DAY_SCHOLAR', 1);

      INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status, enrollment_date)
      VALUES
        (1, 1, 2026, 1, 'ACTIVE', '2026-01-12'),
        (2, 1, 2026, 1, 'ACTIVE', '2026-01-12'),
        (3, 1, 2026, 1, 'ACTIVE', '2026-01-12');

      INSERT INTO subject (id, name) VALUES (10, 'Mathematics'), (11, 'English');

      INSERT INTO exam_result (exam_id, student_id, subject_id, score, teacher_remarks)
      VALUES
        (1, 1, 10, 90, 'Great'),
        (1, 1, 11, 90, 'Great'),
        (1, 2, 10, 80, 'Good'),
        (1, 2, 11, 80, 'Good'),
        (1, 3, 10, 70, 'Fair'),
        (1, 3, 11, 70, 'Fair');

      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES (5, 2, 10000, 10000, 10000, 2000, 'PENDING');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('calculates class position as one-based ranking', async () => {
    const service = new CBCReportCardService()
    const report = await service.generateReportCard(2, 1, 99)

    expect(report.position_in_class).toBe(2)
    expect(report.position_in_stream).toBe(2)
  })

  it('returns stored report card with subject names and current fee balance', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(2, 1, 99)

    const report = await service.getReportCard(1, 2)
    expect(report).not.toBeNull()
    expect(report?.subjects.map((subject) => subject.subject_name)).toContain('Mathematics')
    expect(report?.fees_balance).toBe(8000)
  })
})
