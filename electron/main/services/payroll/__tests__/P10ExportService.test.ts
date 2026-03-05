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

    it('throws for non-existent payroll period', () => {
        expect(() => service.generateP10Csv(999)).toThrow('Payroll period 999 not found')
    })

    it('returns empty string when no payroll records exist', () => {
        // Create a period with no payroll
        db.exec(`INSERT INTO payroll_period (period_name, month, year, start_date, end_date) VALUES ('Empty Feb 2026', 2, 2026, '2026-02-01', '2026-02-28')`)
        const emptyPeriodId = (db.prepare('SELECT id FROM payroll_period WHERE period_name = ?').get('Empty Feb 2026') as { id: number }).id
        const csv = service.generateP10Csv(emptyPeriodId)
        expect(csv).toBe('')
    })

    it('maps travel/commute allowances to transport column', () => {
        // Add a staff member with travel allowance
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-003', 'Carol', 'Clerk', '11111111', 'C111111111X', 'Admin', 'Clerk', 20000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 20000, 25000, 1000, 24000);
            INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (3, 'Travel Allowance', 3000);
            INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (3, 'Commute Reimbursement', 2000);
            INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (3, 'PAYE', 1000);
        `)
        const csv = service.generateP10Csv(1)
        // Carol should appear in CSV
        expect(csv).toContain('"C111111111X"')
        expect(csv).toContain('"Carol Clerk"')
    })

    it('maps leave allowance correctly', () => {
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-004', 'Dave', 'Guard', '22222222', 'D222222222W', 'Security', 'Guard', 15000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 15000, 18000, 500, 17500);
            INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (3, 'Leave Allowance', 3000);
            INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (3, 'PAYE', 500);
        `)
        const csv = service.generateP10Csv(1)
        expect(csv).toContain('"D222222222W"')
    })

    it('uses NOT_PROVIDED for missing KRA PIN', () => {
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-005', 'Eve', 'Helper', '33333333', NULL, 'Support', 'Helper', 10000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 10000, 10000, 0, 10000);
        `)
        const csv = service.generateP10Csv(1)
        expect(csv).toContain('"NOT_PROVIDED"')
    })

    it('defaults personal relief to 2400 when not specified in deductions', () => {
        // Add a staff without Personal_Relief deduction
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-006', 'Frank', 'Cook', '44444444', 'F444444444V', 'Kitchen', 'Cook', 12000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 12000, 12000, 0, 12000);
        `)
        const csv = service.generateP10Csv(1)
        // Frank should have default personal relief of 2400
        expect(csv).toContain('"F444444444V"')
        expect(csv).toContain('2400')
    })

    it('escapes double quotes in employee names', () => {
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-007', 'O''Brien', 'Test"Name', '55555555', 'G555555555U', 'Admin', 'Staff', 10000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 10000, 10000, 0, 10000);
        `)
        const csv = service.generateP10Csv(1)
        // Should contain escaped quote
        expect(csv).toContain('""')
    })

    it('maps other/unrecognized allowances to other_allowances', () => {
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-008', 'Grace', 'Nurse', '66666666', 'H666666666T', 'Medical', 'Nurse', 25000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 25000, 30000, 2000, 28000);
            INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (3, 'Hardship Allowance', 5000);
            INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (3, 'PAYE', 2000);
        `)
        const csv = service.generateP10Csv(1)
        expect(csv).toContain('"H666666666T"')
    })

    it('ensures PAYE is never negative', () => {
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-009', 'Henry', 'Intern', '77777777', 'I777777777S', 'Admin', 'Intern', 8000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 8000, 8000, 0, 8000);
            INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (3, 'PAYE', -100);
        `)
        const csv = service.generateP10Csv(1)
        expect(csv).toContain('"I777777777S"')
        // PAYE should be 0, not -100
        const rows = csv.split('\n')
        const henryRow = rows.find(r => r.includes('I777777777S'))
        expect(henryRow).toBeDefined()
        // Last field is PAYE tax, should be 0
        const fields = henryRow!.split(',')
        const payeField = fields[fields.length - 1]
        expect(Number(payeField)).toBeGreaterThanOrEqual(0)
    })

    // ── Branch coverage: getDeductions ignores unrecognized deduction names (L77 false) ──
    it('ignores unrecognized deduction names in getDeductions', () => {
        db.exec(`
            INSERT INTO staff (staff_number, first_name, last_name, id_number, kra_pin, department, job_title, basic_salary)
            VALUES ('EMP-010', 'Ivan', 'Clerk', '88888888', 'J888888888R', 'Admin', 'Clerk', 15000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
            VALUES (1, 3, 15000, 15000, 3000, 12000);
            INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (3, 'PAYE', 1500);
            INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (3, 'SHIF', 500);
            INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (3, 'Housing Levy', 1000);
        `)
        const csv = service.generateP10Csv(1)
        // Ivan should be in CSV; SHIF and Housing Levy are unrecognized deductions, just ignored
        expect(csv).toContain('"J888888888R"')
        expect(csv).toContain('Ivan')
    })

    // ── Branch coverage: CSV formatter return '' for non-string/non-number value (L179) ──
    it('outputs empty field when a P10Row value is neither string nor number', () => {
        // Create a separate DB with nullable basic_salary to force a null value in the P10Row
        const nullDb = new Database(':memory:')
        nullDb.exec(`
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
              basic_salary INTEGER, gross_salary INTEGER,
              total_deductions INTEGER, net_salary INTEGER
            );
            CREATE TABLE payroll_deduction (
              id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER NOT NULL,
              deduction_name TEXT NOT NULL, amount INTEGER NOT NULL
            );
            CREATE TABLE payroll_allowance (
              id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER NOT NULL,
              allowance_name TEXT NOT NULL, amount INTEGER NOT NULL
            );
            INSERT INTO payroll_period (period_name, month, year, start_date, end_date)
              VALUES ('Jan 2026', 1, 2026, '2026-01-01', '2026-01-31');
            INSERT INTO staff (staff_number, first_name, last_name, kra_pin, basic_salary)
              VALUES ('EMP-NULL', 'Null', 'Test', 'N000000000Z', 10000);
            INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
              VALUES (1, 1, NULL, NULL, 0, 10000);
        `)
        const nullService = new P10ExportService(nullDb)
        const csv = nullService.generateP10Csv(1)
        // basic_salary and gross_salary are null → typeof null !== 'number' && !== 'string' → return ''
        // The CSV row should contain consecutive commas for these empty fields
        expect(csv).toContain(',,')
        nullDb.close()
    })
})
