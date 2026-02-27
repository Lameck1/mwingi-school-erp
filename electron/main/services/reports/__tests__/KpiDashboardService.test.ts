import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../database', () => ({
    getDatabase: () => { throw new Error('Must inject db') }
}))

import { KpiDashboardService } from '../KpiDashboardService'

function createTestDb(): Database.Database {
    const db = new Database(':memory:')
    db.exec(`
    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_subtype TEXT,
      normal_balance TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_number TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'MANUAL',
      description TEXT NOT NULL,
      is_posted BOOLEAN DEFAULT 0,
      is_voided BOOLEAN DEFAULT 0,
      created_by_user_id INTEGER NOT NULL
    );

    CREATE TABLE journal_entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      gl_account_id INTEGER NOT NULL,
      debit_amount INTEGER NOT NULL DEFAULT 0,
      credit_amount INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id) ON DELETE CASCADE,
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id)
    );

    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      invoice_date DATE, due_date DATE, total_amount INTEGER NOT NULL,
      amount_paid INTEGER DEFAULT 0, status TEXT DEFAULT 'PENDING',
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE budget_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL, utilized INTEGER DEFAULT 0
    );
  `)

    // Seed GL Accounts
    db.exec(`
    INSERT INTO gl_account (account_code, account_name, account_type, account_subtype, normal_balance) VALUES
      ('1000', 'Cash in Bank', 'ASSET', 'Cash', 'DEBIT'),
      ('1200', 'Computers', 'ASSET', 'ICT Equipment', 'DEBIT'),
      ('2000', 'Accounts Payable', 'LIABILITY', 'Current Liabilities', 'CREDIT'),
      ('4000', 'Tuition Fees', 'REVENUE', 'Operating Revenue', 'CREDIT'),
      ('5000', 'Salaries', 'EXPENSE', 'Personnel Expense', 'DEBIT'),
      ('5100', 'Admin Supplies', 'EXPENSE', 'Admin Expense', 'DEBIT');
  `)

    // Seed Students
    db.exec(`
    INSERT INTO student (is_active) VALUES (1), (1), (1), (1), (1); -- 5 active students
  `)

    // Seed Budget
    db.exec(`
    INSERT INTO budget_allocation (amount, utilized) VALUES
      (1000000, 800000), -- 80% utilization
      (500000, 100000);  -- 20% utilization
      -- Total 1.5M budget, 900K utilized = 60%
  `)

    // Seed Invoices (Total 100K billed, 75K paid = 75% FCE)
    // Aged Receivables: One invoice 60 days old with 25K outstanding
    const sixtydaysago = new Date()
    sixtydaysago.setDate(sixtydaysago.getDate() - 60)
    const dstr = sixtydaysago.toISOString().slice(0, 10)

    db.exec(`
    INSERT INTO fee_invoice (invoice_number, student_id, term_id, invoice_date, total_amount, amount_paid, status, created_by_user_id) VALUES
      ('INV-1', 1, 1, '${dstr}', 100000, 75000, 'PARTIAL', 1);
  `)

    return db
}

function createJournalEntry(db: Database.Database, date: string, type: string, lines: Array<{ accountId: number; debit: number; credit: number }>) {
    const result = db.prepare(`
    INSERT INTO journal_entry (entry_number, entry_date, entry_type, description, is_posted, created_by_user_id)
    VALUES (?, ?, ?, 'Test', 1, 1)
  `).run(`JE-${Math.random().toString().slice(2, 8)}`, date, type)

    const jeId = result.lastInsertRowid as number
    const insertLine = db.prepare(
        'INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount) VALUES (?, ?, ?, ?)'
    )

    for (const line of lines) {
        insertLine.run(jeId, line.accountId, line.debit, line.credit)
    }
}

describe('KpiDashboardService', () => {
    let db: Database.Database
    let service: KpiDashboardService

    beforeEach(() => {
        db = createTestDb()
        service = new KpiDashboardService(db)

        // Setup KPI scenarios (Current date simulated)
        createJournalEntry(db, '2026-01-01', 'OPENING_BALANCE', [
            { accountId: 1, debit: 120000, credit: 0 }, // Assets = 120,000
            { accountId: 3, debit: 0, credit: 40000 },  // Liabilities = 40,000 -> Current Ratio = 3.0
        ])

        createJournalEntry(db, '2026-02-01', 'RECEIPT', [
            { accountId: 1, debit: 50000, credit: 0 },
            { accountId: 4, debit: 0, credit: 50000 },  // Revenue = 50,000
        ])

        createJournalEntry(db, '2026-02-15', 'PAYMENT', [
            { accountId: 5, debit: 20000, credit: 0 },  // Standard Expense = 20,000
            { accountId: 1, debit: 0, credit: 20000 },
        ])

        createJournalEntry(db, '2026-02-20', 'PAYMENT', [
            { accountId: 6, debit: 5000, credit: 0 },   // Admin Expense = 5,000
            { accountId: 1, debit: 0, credit: 5000 },
        ])
        // Total Expense = 25,000. Admin = 5,000 -> Admin Cost Ratio = 20%
        // Revenue Per Student = 50,000 / 5 = 10,000
        // Cost Per Student = 25,000 / 5 = 5,000
    })

    afterEach(() => {
        db.close()
    })

    it('computes all 7 standard KPIs correctly', () => {
        const dashboard = service.generateDashboard()
        expect(dashboard.metrics).toHaveLength(7)

        const getMetric = (name: string) => dashboard.metrics.find(m => m.name === name)

        const fce = getMetric('fee_collection_efficiency')
        expect(fce?.value).toBe(75) // 75k paid / 100k billed

        const cr = getMetric('current_ratio')
        expect(cr?.value).toBe(3.63) // Assets = 120k + 50k - 20k - 5k = 145k. Liab = 40k. 145/40 = 3.625

        const admin = getMetric('admin_cost_ratio')
        expect(admin?.value).toBe(20) // 5k / 25k

        const budget = getMetric('budget_utilization')
        expect(budget?.value).toBe(60) // 900k / 1.5M

        const arDays = getMetric('aged_receivables_days')
        expect(arDays?.value).toBe(60) // Invoice created 60 days ago

        const revPerStudent = getMetric('revenue_per_student')
        expect(revPerStudent?.value).toBe(10000) // 50k / 5 students

        const costPerStudent = getMetric('cost_per_student')
        expect(costPerStudent?.value).toBe(5000) // 25k / 5 students
    })
})
