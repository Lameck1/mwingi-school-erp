import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../database', () => ({
    getDatabase: () => { throw new Error('Must inject db') }
}))

import { ChangesInNetAssetsService } from '../ChangesInNetAssetsService'

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

describe('ChangesInNetAssetsService', () => {
    let db: Database.Database
    let service: ChangesInNetAssetsService

    beforeEach(() => {
        db = createTestDb()
        service = new ChangesInNetAssetsService(db)

        // Setup Scenario
        // 1. Opening Balance (Before period start e.g 2026-01-01)
        // Assets: Cash=10,000, ICT=50,000. Liabilities: AP=5,000. Net Assets = 55,000
        createJournalEntry(db, '2025-12-31', 'OPENING_BALANCE', [
            { accountId: 1, debit: 10000, credit: 0 }, // Cash
            { accountId: 2, debit: 50000, credit: 0 }, // ICT
            { accountId: 3, debit: 0, credit: 5000 },  // AP
        ])

        // 2. During Period (2026-01-01 to 2026-03-31)
        // Revenue: 30,000 Tuition (Debit Cash, Credit Revenue)
        createJournalEntry(db, '2026-02-15', 'RECEIPT', [
            { accountId: 1, debit: 30000, credit: 0 },
            { accountId: 4, debit: 0, credit: 30000 },
        ])

        // Expense: 20,000 Salaries (Debit Expense, Credit Cash)
        createJournalEntry(db, '2026-02-28', 'PAYMENT', [
            { accountId: 5, debit: 20000, credit: 0 },
            { accountId: 1, debit: 0, credit: 20000 },
        ])

        // Asset Addition: Buy Computers 15,000 (Debit ICT, Credit Cash)
        createJournalEntry(db, '2026-03-10', 'ASSET_PURCHASE', [
            { accountId: 2, debit: 15000, credit: 0 },
            { accountId: 1, debit: 0, credit: 15000 },
        ])

        // Note: Surplus = Rev(30K) - Exp(20K) = 10,000
        // Closing Assets = Cash (10K OP + 30K - 20K - 15K = 5K) + ICT (50K OP + 15K = 65K) = 70,000
        // Closing Liabilities = AP (5K)
        // Closing Net Assets = 70K - 5K = 65,000
        // Proof: Opening (55K) + Surplus (10K) = 65K
    })

    afterEach(() => {
        db.close()
    })

    it('correctly calculates opening and closing net assets', () => {
        const report = service.generateReport('2026-01-01', '2026-03-31')

        expect(report.opening_net_assets).toBe(55000)
        expect(report.surplus_deficit).toBe(10000)
        expect(report.closing_net_assets).toBe(65000)
    })

    it('correctly categorizes asset movements', () => {
        const report = service.generateReport('2026-01-01', '2026-03-31')

        const ict = report.asset_changes.find(a => a.category === 'ICT Equipment')
        expect(ict).toBeDefined()
        expect(ict?.opening_balance).toBe(50000)
        expect(ict?.additions).toBe(15000) // The ASSET_PURCHASE entry
        expect(ict?.disposals).toBe(0)
        expect(ict?.closing_balance).toBe(65000)
    })

    it('tracks liability changes', () => {
        const report = service.generateReport('2026-01-01', '2026-03-31')

        const liabilities = report.liability_changes
        // AP = 5,000 opening, no new liabilities during period
        const ap = liabilities.find(l => l.category === 'Current Liabilities')
        expect(ap).toBeDefined()
        expect(ap?.opening_balance).toBe(5000)
        expect(ap?.closing_balance).toBe(5000)
    })

    it('returns zero balances when no journal entries exist', () => {
        const emptyDb = createTestDb()
        const emptySvc = new ChangesInNetAssetsService(emptyDb)
        const report = emptySvc.generateReport('2026-01-01', '2026-12-31')

        expect(report.opening_net_assets).toBe(0)
        expect(report.surplus_deficit).toBe(0)
        expect(report.closing_net_assets).toBe(0)
        expect(report.asset_changes).toEqual([])
        expect(report.liability_changes).toEqual([])
        emptyDb.close()
    })

    it('correctly calculates surplus_deficit from revenue minus expenses', () => {
        const report = service.generateReport('2026-01-01', '2026-03-31')
        // Revenue = 30K, Expense = 20K → surplus = 10K
        expect(report.surplus_deficit).toBe(10000)
    })

    it('handles periods with expenses exceeding revenue (deficit)', () => {
        // Add more expense entries during the period
        createJournalEntry(db, '2026-03-15', 'PAYMENT', [
            { accountId: 5, debit: 25000, credit: 0 },  // More salaries
            { accountId: 1, debit: 0, credit: 25000 },
        ])

        const report = service.generateReport('2026-01-01', '2026-03-31')
        // Revenue = 30K, Expense = 20K + 25K = 45K → deficit = -15K
        expect(report.surplus_deficit).toBe(-15000)
    })

    it('includes voided entries exclusion', () => {
        // Add a voided entry that should be excluded
        const result = db.prepare(`
            INSERT INTO journal_entry (entry_number, entry_date, entry_type, description, is_posted, is_voided, created_by_user_id)
            VALUES (?, ?, ?, 'Voided', 1, 1, 1)
        `).run(`JE-VOID-${Math.random().toString().slice(2, 8)}`, '2026-02-20', 'RECEIPT')

        const jeId = result.lastInsertRowid as number
        db.prepare('INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount) VALUES (?, ?, ?, ?)').run(jeId, 1, 100000, 0)
        db.prepare('INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount) VALUES (?, ?, ?, ?)').run(jeId, 4, 0, 100000)

        const report = service.generateReport('2026-01-01', '2026-03-31')
        // Voided entry should not affect surplus
        expect(report.surplus_deficit).toBe(10000)
    })

    it('handles asset disposals', () => {
        // Dispose of ICT equipment
        createJournalEntry(db, '2026-03-20', 'ASSET_DISPOSAL', [
            { accountId: 1, debit: 10000, credit: 0 },   // Cash from disposal
            { accountId: 2, debit: 0, credit: 10000 },    // Remove from ICT
        ])

        const report = service.generateReport('2026-01-01', '2026-03-31')
        const ict = report.asset_changes.find(a => a.category === 'ICT Equipment')
        expect(ict).toBeDefined()
        expect(ict?.disposals).toBe(10000)
        // ICT: opening 50K + additions 15K - disposals accounted → closing = 55K
        expect(ict?.closing_balance).toBe(55000)
    })

    it('includes report_date and period fields', () => {
        const report = service.generateReport('2026-01-01', '2026-03-31')
        expect(report.report_date).toBeDefined()
        expect(report.period_start).toBe('2026-01-01')
        expect(report.period_end).toBe('2026-03-31')
    })

    it('falls back to getDatabase() when no db argument is provided', () => {
        // Without an explicit db arg the constructor calls getDatabase(), which throws
        expect(() => new ChangesInNetAssetsService()).toThrow()
    })

    it('handles multiple asset categories in changes', () => {
        const report = service.generateReport('2026-01-01', '2026-03-31')
        // Cash and ICT Equipment should both appear
        expect(report.asset_changes.length).toBeGreaterThanOrEqual(2)
        const cash = report.asset_changes.find(a => a.category === 'Cash')
        expect(cash).toBeDefined()
        expect(cash?.opening_balance).toBe(10000) // Opening cash
    })
})
