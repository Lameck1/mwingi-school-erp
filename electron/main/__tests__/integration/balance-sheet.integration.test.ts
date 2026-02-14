/**
 * Balance Sheet Integration Tests
 *
 * Verifies that the balance sheet correctly:
 *  1. Reports ASSET, LIABILITY, and EQUITY account balances
 *  2. Calculates net income from REVENUE and EXPENSE accounts
 *  3. Satisfies the accounting equation: Assets = L + E + Net Income
 *  4. Reports is_balanced = true when books are correct
 */

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DoubleEntryJournalService } from '../../services/accounting/DoubleEntryJournalService'

// Mock audit — no DB writes needed for audit table during these tests
vi.mock('../../database/utils/audit', () => ({
    logAudit: vi.fn(),
}))

// Mock getDatabase so services that call it internally get our test DB
let testDb: Database.Database
vi.mock('../../database', () => ({
    getDatabase: () => testDb,
}))

// ---------------------------------------------------------------------------
// Schema + seed helper
// ---------------------------------------------------------------------------

function createSchema(db: Database.Database) {
    db.exec(`
    -- Core tables
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT
    );

    -- Double-entry accounting
    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      normal_balance TEXT NOT NULL DEFAULT 'DEBIT',
      parent_account_id INTEGER,
      is_active BOOLEAN DEFAULT 1,
      is_system BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL,
      description TEXT,
      student_id INTEGER,
      staff_id INTEGER,
      term_id INTEGER,
      is_posted BOOLEAN DEFAULT 0,
      is_voided BOOLEAN DEFAULT 0,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'APPROVED',
      voided_reason TEXT,
      voided_by_user_id INTEGER,
      posted_by_user_id INTEGER,
      posted_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE journal_entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      gl_account_id INTEGER NOT NULL,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      description TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id),
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id)
    );

    -- Audit log (used by mock)
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Approval rules (queried by checkApprovalRequired)
    CREATE TABLE approval_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL,
      min_amount INTEGER,
      is_active BOOLEAN DEFAULT 1
    );

    -- Seed data -----------------------------------------------------------

    INSERT INTO user (username, email, role) VALUES
      ('admin', 'admin@school.com', 'ADMIN');

    -- Chart of Accounts
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES
      ('1010', 'Cash on Hand',                  'ASSET',     'DEBIT'),
      ('1020', 'Bank Account - KCB',            'ASSET',     'DEBIT'),
      ('1100', 'Accounts Receivable - Students', 'ASSET',    'DEBIT'),
      ('2000', 'Accounts Payable',              'LIABILITY', 'CREDIT'),
      ('3000', 'Retained Earnings',             'EQUITY',    'CREDIT'),
      ('4000', 'Tuition Revenue',               'REVENUE',   'CREDIT'),
      ('4100', 'Boarding Revenue',              'REVENUE',   'CREDIT'),
      ('5100', 'Salaries Expense',              'EXPENSE',   'DEBIT'),
      ('5300', 'Utilities - Electricity',       'EXPENSE',   'DEBIT');
  `)
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Balance Sheet Integration', () => {
    let journalService: DoubleEntryJournalService

    beforeEach(() => {
        testDb = new Database(':memory:')
        createSchema(testDb)
        journalService = new DoubleEntryJournalService(testDb)
    })

    afterEach(() => {
        testDb.close()
    })

    // Helper: create a journal entry, assert success, and wait 2ms to avoid
    // Date.now() collisions in generateEntryRef (which uses millisecond timestamps)
    async function createEntry(data: Parameters<typeof journalService.createJournalEntry>[0]) {
        const result = await journalService.createJournalEntry(data)
        expect(result.success, `createJournalEntry failed: ${result.message}`).toBe(true)
        await new Promise((resolve) => setTimeout(resolve, 2))
        return result
    }

    // ── 1. Empty books ─────────────────────────────────────────────

    it('returns zeros and balanced for empty books', async () => {
        const bs = await journalService.getBalanceSheet('2026-12-31')

        expect(bs.assets).toHaveLength(0)
        expect(bs.liabilities).toHaveLength(0)
        expect(bs.equity).toHaveLength(0)
        expect(bs.total_assets).toBe(0)
        expect(bs.total_liabilities).toBe(0)
        expect(bs.total_equity).toBe(0)
        expect(bs.net_income).toBe(0)
        expect(bs.is_balanced).toBe(true)
    })

    // ── 2. Asset-only entries balance ──────────────────────────────

    it('balances when moving money between asset accounts', async () => {
        // Record fee invoice: DR Receivable, CR Revenue
        await createEntry({
            entry_date: '2026-01-10',
            entry_type: 'FEE_INVOICE',
            description: 'Tuition invoice',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1100', debit_amount: 50000, credit_amount: 0, description: 'AR' },
                { gl_account_code: '4000', debit_amount: 0, credit_amount: 50000, description: 'Revenue' },
            ],
        })

        // Record payment: DR Cash, CR Receivable
        await createEntry({
            entry_date: '2026-01-15',
            entry_type: 'FEE_PAYMENT',
            description: 'Cash payment',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1010', debit_amount: 50000, credit_amount: 0, description: 'Cash' },
                { gl_account_code: '1100', debit_amount: 0, credit_amount: 50000, description: 'AR' },
            ],
        })

        const bs = await journalService.getBalanceSheet('2026-01-31')

        // Cash = 50000, AR = 0 (paid off)
        expect(bs.total_assets).toBe(50000)
        // Revenue = 50000, Expenses = 0
        expect(bs.net_income).toBe(50000)
        // Assets (50000) = L (0) + E (0) + NI (50000)
        expect(bs.is_balanced).toBe(true)
    })

    // ── 3. Full scenario with revenue, expenses, and equity ───────

    it('produces correct balance sheet with revenue, expenses, and equity entries', async () => {
        // 1. Owner contribution: DR Bank, CR Equity
        await createEntry({
            entry_date: '2026-01-01',
            entry_type: 'GENERAL',
            description: 'Opening capital',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1020', debit_amount: 100000, credit_amount: 0 },
                { gl_account_code: '3000', debit_amount: 0, credit_amount: 100000 },
            ],
        })

        // 2. Fee invoice: DR AR 80000, CR Revenue (Tuition 50000 + Boarding 30000)
        await createEntry({
            entry_date: '2026-01-05',
            entry_type: 'FEE_INVOICE',
            description: 'Student fees',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1100', debit_amount: 80000, credit_amount: 0 },
                { gl_account_code: '4000', debit_amount: 0, credit_amount: 50000 },
                { gl_account_code: '4100', debit_amount: 0, credit_amount: 30000 },
            ],
        })

        // 3. Payment received: DR Cash 80000, CR AR 80000
        await createEntry({
            entry_date: '2026-01-10',
            entry_type: 'FEE_PAYMENT',
            description: 'Payment received',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1010', debit_amount: 80000, credit_amount: 0 },
                { gl_account_code: '1100', debit_amount: 0, credit_amount: 80000 },
            ],
        })

        // 4. Pay salary: DR Salary Expense 45000, CR Bank 45000
        await createEntry({
            entry_date: '2026-01-25',
            entry_type: 'EXPENSE',
            description: 'January salaries',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '5100', debit_amount: 45000, credit_amount: 0 },
                { gl_account_code: '1020', debit_amount: 0, credit_amount: 45000 },
            ],
        })

        // 5. Pay electricity: DR Utilities 5000, CR Cash 5000
        await createEntry({
            entry_date: '2026-01-28',
            entry_type: 'EXPENSE',
            description: 'Electricity bill',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '5300', debit_amount: 5000, credit_amount: 0 },
                { gl_account_code: '1010', debit_amount: 0, credit_amount: 5000 },
            ],
        })

        const bs = await journalService.getBalanceSheet('2026-01-31')

        // Expected balances:
        // Cash: 80000 - 5000 = 75000
        // Bank: 100000 - 45000 = 55000
        // AR: 80000 - 80000 = 0 (won't appear since no balance)
        // Total Assets = 75000 + 55000 = 130000
        expect(bs.total_assets).toBe(130000)

        // Liabilities = 0
        expect(bs.total_liabilities).toBe(0)

        // Equity (Retained Earnings) = 100000
        expect(bs.total_equity).toBe(100000)

        // Revenue = 50000 + 30000 = 80000
        // Expenses = 45000 + 5000 = 50000
        // Net Income = 80000 - 50000 = 30000
        expect(bs.net_income).toBe(30000)

        // Accounting equation: 130000 = 0 + 100000 + 30000 ✓
        expect(bs.is_balanced).toBe(true)
        expect(bs.total_assets).toBe(bs.total_liabilities + bs.total_equity + bs.net_income)
    })

    // ── 4. Date filtering works correctly ─────────────────────────

    it('respects the as-of date and excludes future entries', async () => {
        // Revenue entry on Jan 10
        await createEntry({
            entry_date: '2026-01-10',
            entry_type: 'FEE_INVOICE',
            description: 'January invoice',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1100', debit_amount: 30000, credit_amount: 0 },
                { gl_account_code: '4000', debit_amount: 0, credit_amount: 30000 },
            ],
        })

        // Revenue entry on Feb 10 (should be excluded for Jan 31 balance sheet)
        await createEntry({
            entry_date: '2026-02-10',
            entry_type: 'FEE_INVOICE',
            description: 'February invoice',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1100', debit_amount: 20000, credit_amount: 0 },
                { gl_account_code: '4000', debit_amount: 0, credit_amount: 20000 },
            ],
        })

        const bsJan = await journalService.getBalanceSheet('2026-01-31')
        expect(bsJan.total_assets).toBe(30000)
        expect(bsJan.net_income).toBe(30000)
        expect(bsJan.is_balanced).toBe(true)

        const bsFeb = await journalService.getBalanceSheet('2026-02-28')
        expect(bsFeb.total_assets).toBe(50000)
        expect(bsFeb.net_income).toBe(50000)
        expect(bsFeb.is_balanced).toBe(true)
    })

    // ── 5. Net loss scenario ──────────────────────────────────────

    it('handles net loss (expenses exceed revenue) correctly', async () => {
        // Seed opening capital: DR Bank, CR Equity
        await createEntry({
            entry_date: '2026-01-01',
            entry_type: 'GENERAL',
            description: 'Opening capital',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1020', debit_amount: 200000, credit_amount: 0 },
                { gl_account_code: '3000', debit_amount: 0, credit_amount: 200000 },
            ],
        })

        // Small revenue: 10000
        await createEntry({
            entry_date: '2026-01-05',
            entry_type: 'FEE_INVOICE',
            description: 'Small invoice',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '1100', debit_amount: 10000, credit_amount: 0 },
                { gl_account_code: '4000', debit_amount: 0, credit_amount: 10000 },
            ],
        })

        // Large expense: 60000 salary
        await createEntry({
            entry_date: '2026-01-25',
            entry_type: 'EXPENSE',
            description: 'Large salary expense',
            created_by_user_id: 1,
            lines: [
                { gl_account_code: '5100', debit_amount: 60000, credit_amount: 0 },
                { gl_account_code: '1020', debit_amount: 0, credit_amount: 60000 },
            ],
        })

        const bs = await journalService.getBalanceSheet('2026-01-31')

        // Assets: Bank (200000 - 60000) + AR (10000) = 150000
        expect(bs.total_assets).toBe(150000)
        // Equity: 200000
        expect(bs.total_equity).toBe(200000)
        // Net Income: 10000 - 60000 = -50000 (net loss)
        expect(bs.net_income).toBe(-50000)
        // 150000 = 0 + 200000 + (-50000) ✓
        expect(bs.is_balanced).toBe(true)
    })
})
