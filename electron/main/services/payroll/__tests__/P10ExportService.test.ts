import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../database', () => ({
    getDatabase: () => { throw new Error('Must inject db') }
}))

import { P10ExportService } from '../P10ExportService'

function createTestDb(): Database.Database {
    const db = new Database(':memory:')

    db.exec(`
    CREATE TABLE system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL, setting_value TEXT, description TEXT
    );

    CREATE TABLE staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
      id_number TEXT, kra_pin TEXT, nhif_number TEXT, nssf_number TEXT,
      department TEXT, job_title TEXT,
      basic_salary INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE payroll_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT, period_name TEXT NOT NULL,
      month INTEGER NOT NULL, year INTEGER NOT NULL,
      start_date DATE NOT NULL, end_date DATE NOT NULL
    );

    CREATE TABLE payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT, period_id INTEGER NOT NULL, staff_id INTEGER NOT NULL,
      basic_salary INTEGER NOT NULL, gross_salary INTEGER NOT NULL,
      total_deductions INTEGER NOT NULL, net_salary INTEGER NOT NULL
    );

    CREATE TABLE payroll_deduction (
      id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER NOT NULL,
      deduction_name TEXT NOT NULL, amount INTEGER NOT NULL
    );

    CREATE TABLE payroll_allowance (
      id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER NOT NULL,
      allowance_name TEXT NOT NULL, amount INTEGER NOT NULL
    );
  `)

    // Seed Data
    db.exec(`
    INSERT INTO system_settings (setting_key, setting_value) VALUES ('SCHOOL_NAME', 'Test Academy');

    INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary) VALUES
      ('EMP-001', 'Alice', 'Teacher', '12345678', 'A123456789Z', 'Academics', 'Senior Teacher', 50000),
      ('EMP-002', 'Bob', 'Driver', '87654321', 'A987654321Y', 'Transport', 'Bus Driver', 30000);

    INSERT INTO payroll_period (period_name, month, year, start_date, end_date) VALUES
      ('January 2026', 1, 2026, '2026-01-01', '2026-01-31');

    -- Alice: Basic = 50,000, Housing = 10,000, Gross = 60,000, PAYE = 8,000, NSSF = 1,080, Net = 50,920
    INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary) VALUES
      (1, 1, 50000, 60000, 9080, 50920);
    
    INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES
      (1, 'Housing Allowance', 10000);

    INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES
      (1, 'PAYE', 8000),
      (1, 'NSSF', 1080),
      (1, 'Personal_Relief', 2400);

    -- Bob: Basic = 30,000, Overtime = 5,000, Gross = 35,000, PAYE = 2,000, NSSF = 1,080, Net = 31,920
    INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary) VALUES
      (1, 2, 30000, 35000, 3080, 31920);

    INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES
      (2, 'Overtime Allowance', 5000);

    INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES
      (2, 'PAYE', 2000),
      (2, 'NSSF', 1080),
      (2, 'Personal_Relief', 2400);
  `)

    return db
}

describe('P10ExportService', () => {
    let db: Database.Database
    let service: P10ExportService

    beforeEach(() => {
        db = createTestDb()
        service = new P10ExportService(db)
    })

    afterEach(() => {
        db.close()
    })

    it('generates raw KRA P10 CSV string matching column expectations', () => {
        const csv = service.generateP10Csv(1)

        // Check headers
        expect(csv).toContain('"KRA PIN"')
        expect(csv).toContain('"Gross Pay"')
        expect(csv).toContain('"PAYE Tax"')
        expect(csv).toContain('"Allowable Pension Deduction"')

        // Check Alice (Teacher) CSV row mappings
        expect(csv).toContain('"A123456789Z"')
        expect(csv).toContain('"Alice Teacher"')

        // Check computed fields for Alice:
        // Basic = 50000
        // E1 = 30% of 50000 = 15000
        // E2 = NSSF = 1080
        // E3 = 20000
        // Allowable Pension = min(15000, 1080, 20000) = 1080
        expect(csv).toContain('50000') // Basic
        expect(csv).toContain('60000') // Gross
        expect(csv).toContain('15000') // E1
        expect(csv).toContain('1080')  // E2 and Allowable Pension

        // Check Bob (Driver) Overtime Allowance heuristics
        expect(csv).toContain('"A987654321Y"')
        expect(csv).toContain('"Bob Driver"')
        expect(csv).toContain('5000') // Overtime Allowance should show up mapped in the overtime column implicitly
    })
})
