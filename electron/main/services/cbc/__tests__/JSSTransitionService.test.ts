import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { JSSTransitionService } from '../JSSTransitionService'

describe('JSSTransitionService outstanding balance normalization', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE jss_fee_structure (
        id INTEGER PRIMARY KEY,
        grade INTEGER NOT NULL,
        fiscal_year INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        student_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE stream (
        id INTEGER PRIMARY KEY,
        level_order INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        student_type TEXT NOT NULL,
        status TEXT NOT NULL
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
    `)

    db.exec(`
      INSERT INTO jss_fee_structure (id, grade, fiscal_year, is_active)
      VALUES (1, 7, 2026, 1);

      INSERT INTO stream (id, level_order, is_active)
      VALUES (100, 6, 1);

      INSERT INTO student (id, admission_number, first_name, last_name, student_type, is_active)
      VALUES
        (10, 'ADM-10', 'Grace', 'Mutua', 'DAY_SCHOLAR', 1),
        (11, 'ADM-11', 'Sarah', 'Ochieng', 'BOARDER', 1);

      INSERT INTO enrollment (id, student_id, stream_id, student_type, status)
      VALUES
        (1, 10, 100, 'DAY_SCHOLAR', 'ACTIVE'),
        (2, 11, 100, 'BOARDER', 'ACTIVE');

      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES
        (1, 10, 0, 17000, 17000, 0, 'partial'),
        (2, 10, 7000, 7000, 7000, 8500, 'PARTIAL'),
        (3, 10, 9000, 9000, 9000, 0, 'cancelled'),
        (4, 11, NULL, NULL, 12000, 2000, 'OUTSTANDING');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('calculates transition balances using normalized invoice amounts and status filtering', () => {
    const service = new JSSTransitionService()
    const students = service.getEligibleStudentsForTransition(6, 2026)

    expect(students).toHaveLength(2)

    const grace = students.find((student) => student.student_id === 10)
    const sarah = students.find((student) => student.student_id === 11)

    expect(grace?.outstanding_balance_cents).toBe(15500)
    expect(sarah?.outstanding_balance_cents).toBe(10000)
  })
})
