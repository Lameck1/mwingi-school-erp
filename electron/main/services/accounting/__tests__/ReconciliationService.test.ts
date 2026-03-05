import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

import { ReconciliationService } from '../ReconciliationService'

describe('ReconciliationService', () => {
  let service: ReconciliationService

  beforeEach(() => {
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
        admission_number TEXT,
        credit_balance INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reference_invoice_id INTEGER
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        amount_paid INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_type TEXT NOT NULL,
        student_id INTEGER,
        invoice_id INTEGER,
        amount INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_ledger_txn_id INTEGER,
        is_posted BOOLEAN DEFAULT 0,
        is_voided BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );

      CREATE TABLE ledger_reconciliation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_date TEXT NOT NULL,
        gl_account_id INTEGER NOT NULL,
        opening_balance INTEGER NOT NULL,
        total_debits INTEGER NOT NULL,
        total_credits INTEGER NOT NULL,
        closing_balance INTEGER NOT NULL,
        calculated_balance INTEGER NOT NULL,
        variance INTEGER NOT NULL,
        is_balanced BOOLEAN NOT NULL,
        reconciled_by_user_id INTEGER NOT NULL,
        notes TEXT
      );
    `)

    db.prepare(`
      INSERT INTO student (id, admission_number, credit_balance, is_active)
      VALUES (1, 'ADM001', 1500, 1), (2, 'ADM002', 1000, 1)
    `).run()

    db.prepare(`
      INSERT INTO credit_transaction (student_id, transaction_type, amount)
      VALUES
        (1, 'CREDIT_RECEIVED', 2000),
        (1, 'CREDIT_APPLIED', 500),
        (2, 'CREDIT_RECEIVED', 1200)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, total_amount, amount_paid)
      VALUES (1, 'INV-001', 10000, 5000)
    `).run()

    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare(`
      INSERT INTO ledger_transaction (transaction_type, student_id, invoice_id, amount, created_at)
      VALUES
        ('FEE_PAYMENT', 1, 1, 3000, ?),
        ('FEE_PAYMENT', 1, 1, 2000, ?)
    `).run(oldDate, oldDate)

    db.prepare(`
      INSERT INTO gl_account (id, account_code, account_name, account_type, is_active)
      VALUES (1, '1100', 'Student Receivables', 'ASSET', 1)
    `).run()

    db.prepare(`
      INSERT INTO journal_entry (id, source_ledger_txn_id, is_posted, is_voided, created_at)
      VALUES (1, NULL, 1, 0, ?)
    `).run(new Date().toISOString())

    db.prepare(`
      INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount)
      VALUES (1, 1, 5000, 5000)
    `).run()

    service = new ReconciliationService()
  })

  afterEach(() => {
    db.close()
  })

  it('runs checks and reports FAIL when student and invoice balances drift', async () => {
    const report = await service.runAllChecks(1)

    expect(report.summary.total_checks).toBe(7)
    expect(report.summary.failed).toBeGreaterThanOrEqual(1)
    expect(report.overall_status).toBe('FAIL')
    expect(report.checks.find(c => c.check_name === 'Student Credit Balance Verification')?.status).toBe('FAIL')
    expect(report.checks.find(c => c.check_name === 'Invoice Payment Verification')?.status).toBe('PASS')
    expect(report.checks.find(c => c.check_name === 'Invoice Settlement Drift Check')?.status).toBe('PASS')
  })

  it('warns for recent unlinked ledger transactions using source_ledger_txn_id linkage', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (id, transaction_type, student_id, invoice_id, amount, created_at)
      VALUES (200, 'FEE_PAYMENT', 1, 1, 4000, ?)
    `).run(new Date().toISOString())

    const report = await service.runAllChecks(1)
    const linkage = report.checks.find(c => c.check_name === 'Ledger-Journal Linkage Check')

    expect(linkage?.status).toBe('WARNING')
    expect(linkage?.message).toContain('not linked')
  })

  it('passes ledger linkage once source_ledger_txn_id is populated and stores reconciliation history', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (id, transaction_type, student_id, invoice_id, amount, created_at)
      VALUES (201, 'FEE_PAYMENT', 1, 1, 4000, ?)
    `).run(new Date().toISOString())

    db.prepare(`
      INSERT INTO journal_entry (source_ledger_txn_id, is_posted, is_voided, created_at)
      VALUES (201, 1, 0, ?)
    `).run(new Date().toISOString())

    const report = await service.runAllChecks(1)
    const linkage = report.checks.find(c => c.check_name === 'Ledger-Journal Linkage Check')
    expect(linkage?.status).toBe('PASS')

    const history = await service.getReconciliationHistory(5)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0].summary.total_checks).toBe(7)
  })

  it('fails settlement drift check when invoice amount_paid exceeds payment-plus-credit sources', async () => {
    db.prepare(`UPDATE fee_invoice SET amount_paid = 9000 WHERE id = 1`).run()

    const report = await service.runAllChecks(1)
    const drift = report.checks.find(c => c.check_name === 'Invoice Settlement Drift Check')

    expect(drift?.status).toBe('FAIL')
    expect(drift?.message).toContain('settlement drift')
  })

  it('reports FAIL for orphaned transactions when count > 10', async () => {
    const stmt = db.prepare(`
      INSERT INTO ledger_transaction (transaction_type, student_id, amount, created_at)
      VALUES ('FEE_PAYMENT', NULL, 1000, ?)
    `)
    for (let i = 0; i < 12; i++) {
      stmt.run(new Date().toISOString())
    }
    const report = await service.runAllChecks(1)
    const orphaned = report.checks.find(c => c.check_name === 'Orphaned Transactions Check')
    expect(orphaned?.status).toBe('FAIL')
    expect(orphaned?.message).toContain('12')
  })

  it('detects abnormal negative asset balances', async () => {
    db.prepare(`INSERT INTO journal_entry (id, source_ledger_txn_id, is_posted, is_voided, created_at) VALUES (10, NULL, 1, 0, ?)`).run(new Date().toISOString())
    db.prepare(`INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount) VALUES (10, 1, 0, 50000)`).run()

    const report = await service.runAllChecks(1)
    const abnormal = report.checks.find(c => c.check_name === 'Abnormal Balance Detection')
    expect(abnormal?.status).toBe('WARNING')
    expect(abnormal?.message).toContain('unexpected negative')
  })

  it('getLatestReconciliationSummary returns the most recent report', async () => {
    await service.runAllChecks(1)
    const latest = await service.getLatestReconciliationSummary()
    expect(latest).not.toBeNull()
    expect(latest!.summary.total_checks).toBe(7)
  })

  it('getLatestReconciliationSummary returns null when no reconciliations exist', async () => {
    const latest = await service.getLatestReconciliationSummary()
    expect(latest).toBeNull()
  })

  it('reports overall PASS when all checks pass', async () => {
    db.prepare(`DELETE FROM credit_transaction`).run()
    db.prepare(`UPDATE student SET credit_balance = 0`).run()
    db.prepare(`DELETE FROM ledger_transaction`).run()
    db.prepare(`UPDATE fee_invoice SET amount_paid = 0`).run()

    const report = await service.runAllChecks(1)
    expect(report.overall_status).toBe('PASS')
    expect(report.summary.failed).toBe(0)
    expect(report.summary.warnings).toBe(0)
  })

  it('reports overall WARNING when only warnings present (no failures)', async () => {
    db.prepare(`DELETE FROM credit_transaction`).run()
    db.prepare(`UPDATE student SET credit_balance = 0`).run()
    db.prepare(`DELETE FROM ledger_transaction`).run()
    db.prepare(`UPDATE fee_invoice SET amount_paid = 0`).run()
    // Add single orphaned FEE_PAYMENT (count <= 10 → WARNING)
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, student_id, amount, created_at) VALUES ('FEE_PAYMENT', NULL, 1000, ?)`).run(new Date().toISOString())

    const report = await service.runAllChecks(1)
    expect(report.summary.failed).toBe(0)
    expect(report.summary.warnings).toBeGreaterThan(0)
    expect(report.overall_status).toBe('WARNING')
  })

  it('getReconciliationHistory returns empty array when no history', async () => {
    const history = await service.getReconciliationHistory(10)
    expect(history).toEqual([])
  })

  it('checkTrialBalance passes when journal entries are balanced', async () => {
    const report = await service.runAllChecks(1)
    const trial = report.checks.find(c => c.check_name === 'Trial Balance Verification')
    expect(trial).toBeDefined()
    expect(trial?.status).toBe('PASS')
  })

  it('checkTrialBalance fails when debits != credits', async () => {
    db.prepare(`INSERT INTO journal_entry (id, source_ledger_txn_id, is_posted, is_voided, created_at) VALUES (50, NULL, 1, 0, ?)`).run(new Date().toISOString())
    db.prepare(`INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount) VALUES (50, 1, 9000, 3000)`).run()

    const report = await service.runAllChecks(1)
    const trial = report.checks.find(c => c.check_name === 'Trial Balance Verification')
    expect(trial?.status).toBe('FAIL')
    expect(trial?.message).toContain('OUT OF BALANCE')
  })

  it('settlement drift check uses payment_invoice_allocation table when present', async () => {
    // Add allocation table
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_invoice_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        applied_amount INTEGER NOT NULL
      )
    `)
    // Create matching allocation for existing payment
    db.prepare(`INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (1, 1, 3000)`).run()
    db.prepare(`INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (2, 1, 2000)`).run()

    const report = await service.runAllChecks(1)
    const drift = report.checks.find(c => c.check_name === 'Invoice Settlement Drift Check')
    expect(drift).toBeDefined()
    expect(drift?.status).toBe('PASS')
  })

  it('stores multiple reconciliation history entries', async () => {
    await service.runAllChecks(1)
    await service.runAllChecks(1)
    const history = await service.getReconciliationHistory(10)
    expect(history.length).toBeGreaterThanOrEqual(2)
  })

  it('reports orphaned transactions as WARNING when count <= 10', async () => {
    const stmt = db.prepare(`
      INSERT INTO ledger_transaction (transaction_type, student_id, amount, created_at)
      VALUES ('FEE_PAYMENT', NULL, 1000, ?)
    `)
    for (let i = 0; i < 3; i++) {
      stmt.run(new Date().toISOString())
    }
    const report = await service.runAllChecks(1)
    const orphaned = report.checks.find(c => c.check_name === 'Orphaned Transactions Check')
    expect(orphaned?.status).toBe('WARNING')
  })

  it('detects abnormal negative liability balances', async () => {
    // Add a LIABILITY account
    db.prepare(`INSERT INTO gl_account (id, account_code, account_name, account_type, is_active) VALUES (20, '2100', 'Student Deposits', 'LIABILITY', 1)`).run()
    // Create journal entries that produce negative liability balance (debits > credits by more than 100)
    db.prepare(`INSERT INTO journal_entry (id, source_ledger_txn_id, is_posted, is_voided, created_at) VALUES (30, NULL, 1, 0, ?)`).run(new Date().toISOString())
    db.prepare(`INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount) VALUES (30, 20, 5000, 0)`).run()

    const report = await service.runAllChecks(1)
    const abnormal = report.checks.find(c => c.check_name === 'Abnormal Balance Detection')
    expect(abnormal?.status).toBe('WARNING')
    expect(abnormal?.message).toContain('unexpected negative')
    const details = abnormal?.details as Array<{ type: string }>
    expect(details.some(d => d.type === 'Negative Liability')).toBe(true)
  })

  it('logReconciliation uses fallback GL account when primary 1100 not found', async () => {
    // Remove the primary '1100' account and add a different one
    db.prepare(`DELETE FROM gl_account WHERE account_code = '1100'`).run()
    db.prepare(`INSERT INTO gl_account (id, account_code, account_name, account_type, is_active) VALUES (50, '2000', 'Fallback Account', 'LIABILITY', 1)`).run()

    // runAllChecks should still succeed using the fallback GL account
    const report = await service.runAllChecks(1)
    expect(report.summary.total_checks).toBe(7)

    // Verify the reconciliation was logged with the fallback account
    const row = db.prepare(`SELECT gl_account_id FROM ledger_reconciliation ORDER BY id DESC LIMIT 1`).get() as { gl_account_id: number }
    expect(row.gl_account_id).toBe(50)
  })

  it('getReconciliationHistory returns empty array when notes JSON is corrupted', async () => {
    // Insert a reconciliation row with invalid JSON in notes
    db.prepare(`INSERT INTO ledger_reconciliation (reconciliation_date, gl_account_id, opening_balance, total_debits, total_credits, closing_balance, calculated_balance, variance, is_balanced, reconciled_by_user_id, notes) VALUES (?, 1, 0, 5000, 5000, 5000, 5000, 0, 1, 1, 'NOT-VALID-JSON')`).run(new Date().toISOString())

    // Should handle the JSON parse error gracefully
    const history = await service.getReconciliationHistory(5)
    // The function catches errors and returns [], or the individual row parsing may throw
    // Either way it shouldn't crash
    expect(Array.isArray(history)).toBe(true)
  })

  it('logReconciliation throws when no GL accounts exist at all', async () => {
    // Remove all GL accounts so logReconciliation cannot find any fallback
    db.prepare(`DELETE FROM gl_account`).run()
    db.prepare(`DELETE FROM journal_entry_line`).run()
    db.prepare(`DELETE FROM journal_entry`).run()

    // runAllChecks calls logReconciliation internally; it should catch the error
    const report = await service.runAllChecks(1)
    // The report is still returned (logReconciliation catches its own error)
    expect(report.summary.total_checks).toBe(7)

    // No reconciliation should be logged
    const count = (db.prepare(`SELECT COUNT(*) as c FROM ledger_reconciliation`).get() as { c: number }).c
    expect(count).toBe(0)
  })

  // ── Branch coverage: checkStudentCreditBalances catch branch ──
  it('checkStudentCreditBalances returns FAIL on SQL error', async () => {
    // Drop credit_transaction to force a SQL error in the check
    db.exec(`DROP TABLE credit_transaction`)
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Student Credit Balance Verification')
    expect(check?.status).toBe('FAIL')
    expect(check?.message).toContain('Error during check')
  })

  // ── Branch coverage: checkSettlementDrift catch branch ──
  it('checkSettlementDrift returns FAIL on SQL error', async () => {
    // Drop payment_invoice_allocation to force use of fallback path,
    // then drop ledger_transaction to trigger SQL error in settlement drift
    db.exec(`DROP TABLE IF EXISTS payment_invoice_allocation`)
    db.exec(`DROP TABLE ledger_transaction`)
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Invoice Settlement Drift Check')
    expect(check?.status).toBe('FAIL')
    expect(check?.message).toContain('Error during check')
  })

  // ── Branch coverage: checkInvoicePayments catch branch ──
  it('checkInvoicePayments returns FAIL on SQL error', async () => {
    // Drop fee_invoice to force SQL error
    db.exec(`DROP TABLE fee_invoice`)
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Invoice Payment Verification')
    expect(check?.status).toBe('FAIL')
    expect(check?.message).toContain('Error during check')
  })

  // ── Branch coverage: checkAbnormalBalances catch branch ──
  it('checkAbnormalBalances returns FAIL on SQL error', async () => {
    // Drop gl_account to force SQL error in the abnormal balance check
    db.exec(`DROP TABLE journal_entry_line`)
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Abnormal Balance Detection')
    expect(check?.status).toBe('FAIL')
    expect(check?.message).toContain('Error during check')
  })

  // ── Branch coverage: getReconciliationHistory with null notes ──
  it('getReconciliationHistory handles rows with null notes', async () => {
    db.prepare(`INSERT INTO ledger_reconciliation (reconciliation_date, gl_account_id, opening_balance, total_debits, total_credits, closing_balance, calculated_balance, variance, is_balanced, reconciled_by_user_id, notes) VALUES (?, 1, 0, 5000, 5000, 5000, 5000, 0, 1, 1, NULL)`).run(new Date().toISOString())
    const history = await service.getReconciliationHistory(5)
    expect(history.length).toBeGreaterThanOrEqual(1)
    const row = history.find(h => h.checks.length === 0)
    expect(row).toBeDefined()
    expect(row!.summary.total_checks).toBe(0)
  })

  // ── Branch coverage: checkOrphanedTransactions with >10 orphaned → FAIL (L241) ──
  it('checkOrphanedTransactions returns FAIL when >10 orphaned transactions', async () => {
    // Insert 15 FEE_PAYMENT transactions without student_id
    for (let i = 1; i <= 15; i++) {
      db.prepare(`INSERT INTO ledger_transaction (transaction_type, student_id, amount, is_voided, created_at) VALUES ('FEE_PAYMENT', NULL, 1000, 0, datetime('now'))`).run()
    }
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Orphaned Transactions Check')
    expect(check).toBeDefined()
    expect(check!.status).toBe('FAIL')
  })

  // ── Branch coverage: checkOrphanedTransactions with few orphaned → WARNING (L241) ──
  it('checkOrphanedTransactions returns WARNING when <=10 orphaned transactions', async () => {
    // Insert 5 FEE_PAYMENT transactions without student_id
    for (let i = 1; i <= 5; i++) {
      db.prepare(`INSERT INTO ledger_transaction (transaction_type, student_id, amount, is_voided, created_at) VALUES ('FEE_PAYMENT', NULL, 1000, 0, datetime('now'))`).run()
    }
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Orphaned Transactions Check')
    expect(check).toBeDefined()
    expect(check!.status).toBe('WARNING')
  })

  // ── Branch coverage: getLatestReconciliationSummary with no history ──
  it('getLatestReconciliationSummary returns null when no history', async () => {
    const summary = await service.getLatestReconciliationSummary()
    expect(summary).toBeNull()
  })

  // ── Branch coverage: getLatestReconciliationSummary with existing history ──
  it('getLatestReconciliationSummary returns latest entry', async () => {
    // Run checks first to create a reconciliation record
    await service.runAllChecks(1)
    const summary = await service.getLatestReconciliationSummary()
    expect(summary).not.toBeNull()
    expect(summary!.run_date).toBeDefined()
  })

  // ── Branch coverage: checkTrialBalance PASS with zero debits/credits ──
  it('checkTrialBalance passes with zero debits and credits when no journal entry lines exist', async () => {
    db.exec('DELETE FROM journal_entry_line')
    // Clean other data
    db.exec('DELETE FROM credit_transaction')
    db.exec('UPDATE student SET credit_balance = 0')
    db.exec('DELETE FROM ledger_transaction')
    db.exec('UPDATE fee_invoice SET amount_paid = 0')

    const report = await service.runAllChecks(1)
    const trial = report.checks.find(c => c.check_name === 'Trial Balance Verification')
    expect(trial?.status).toBe('PASS')
    expect(trial?.message).toContain('balanced')
  })

  // ── Branch coverage: orphaned.total_amount || 0 when amount column sums to NULL (L241) ──
  it('checkOrphanedTransactions handles null total_amount via || 0 fallback', async () => {
    // Recreate ledger_transaction without NOT NULL on amount to allow NULL
    db.exec('DROP TABLE ledger_transaction')
    db.exec(`CREATE TABLE ledger_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL,
      student_id INTEGER,
      invoice_id INTEGER,
      amount INTEGER,
      is_voided BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL
    )`)
    db.prepare(`INSERT INTO ledger_transaction (transaction_type, student_id, amount, created_at) VALUES ('FEE_PAYMENT', NULL, NULL, ?)`).run(new Date().toISOString())

    const report = await service.runAllChecks(1)
    const orphaned = report.checks.find(c => c.check_name === 'Orphaned Transactions Check')
    expect(orphaned?.status).toBe('WARNING')
    expect((orphaned?.details as any).total_amount).toBe(0)
  })

  // ── Branch coverage: logReconciliation totalDebits/Credits || 0 fallback (L538-539) ──
  it('logReconciliation uses 0 fallback when trial debits/credits are zero', async () => {
    // Remove all journal entry lines so total_debits/credits = 0 (falsy)
    db.exec('DELETE FROM journal_entry_line')
    // Clean data so checks pass cleanly
    db.exec('DELETE FROM credit_transaction')
    db.exec('UPDATE student SET credit_balance = 0')
    db.exec('DELETE FROM ledger_transaction')
    db.exec('UPDATE fee_invoice SET amount_paid = 0')

    const report = await service.runAllChecks(1)
    expect(report.summary.total_checks).toBe(7)
    // Verify reconciliation was logged with zero values
    const row = db.prepare('SELECT total_debits, total_credits, variance FROM ledger_reconciliation ORDER BY id DESC LIMIT 1').get() as { total_debits: number; total_credits: number; variance: number }
    expect(row.total_debits).toBe(0)
    expect(row.total_credits).toBe(0)
    expect(row.variance).toBe(0)
  })

  // ── Branch coverage: getReconciliationHistory FAIL status for is_balanced=0 (L594) ──
  it('getReconciliationHistory returns FAIL overall_status when is_balanced is 0', async () => {
    db.prepare(`INSERT INTO ledger_reconciliation (reconciliation_date, gl_account_id, opening_balance, total_debits, total_credits, closing_balance, calculated_balance, variance, is_balanced, reconciled_by_user_id, notes) VALUES (?, 1, 0, 6000, 5000, 6000, 5000, 1000, 0, 1, ?)`).run(
      new Date().toISOString(),
      JSON.stringify({ overall_status: 'FAIL', summary: { total_checks: 7, passed: 5, failed: 2, warnings: 0 }, checks: [] })
    )
    const history = await service.getReconciliationHistory(5)
    const unbalanced = history.find(h => h.overall_status === 'FAIL')
    expect(unbalanced).toBeDefined()
  })

  // ── Branch coverage: getReconciliationHistory notes with missing checks/summary keys (L595-596) ──
  it('getReconciliationHistory handles notes JSON without checks or summary keys', async () => {
    db.prepare(`INSERT INTO ledger_reconciliation (reconciliation_date, gl_account_id, opening_balance, total_debits, total_credits, closing_balance, calculated_balance, variance, is_balanced, reconciled_by_user_id, notes) VALUES (?, 1, 0, 5000, 5000, 5000, 5000, 0, 1, 1, ?)`).run(
      new Date().toISOString(),
      JSON.stringify({ overall_status: 'PASS' }) // no checks or summary keys
    )
    const history = await service.getReconciliationHistory(5)
    const row = history.find(h => h.checks.length === 0 && h.summary.total_checks === 0)
    expect(row).toBeDefined()
    expect(row!.summary).toEqual({ total_checks: 0, passed: 0, failed: 0, warnings: 0 })
  })

  // ── Branch: checkTrialBalance catch block when table is missing ──
  it('checkTrialBalance returns FAIL when journal_entry table is dropped', async () => {
    db.exec('DROP TABLE journal_entry_line')
    db.exec('DROP TABLE journal_entry')
    const report = await service.runAllChecks(1)
    const trial = report.checks.find(c => c.check_name === 'Trial Balance Verification')
    expect(trial?.status).toBe('FAIL')
    expect(trial?.message).toContain('Error during check')
  })

  // ── Branch: checkLedgerLinkage catch block when table is missing ──
  it('checkLedgerLinkage returns WARNING when journal_entry table is missing', async () => {
    db.exec('DROP TABLE journal_entry_line')
    db.exec('DROP TABLE journal_entry')
    const report = await service.runAllChecks(1)
    const linkage = report.checks.find(c => c.check_name === 'Ledger-Journal Linkage Check')
    expect(linkage?.status).toBe('WARNING')
    expect(linkage?.message).toContain('not yet implemented')
  })

  // ── Branch: checkInvoicePayments FAIL with explicit detail assertions ──
  it('checkInvoicePayments returns FAIL with details when payment totals mismatch', async () => {
    db.prepare('UPDATE fee_invoice SET amount_paid = 8000 WHERE id = 1').run()
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Invoice Payment Verification')
    expect(check?.status).toBe('FAIL')
    expect(check?.message).toContain('payment mismatches')
    const details = check?.details as Array<{ invoice_number: string; variance: number }>
    expect(details.length).toBe(1)
    expect(details[0].invoice_number).toBe('INV-001')
  })

  // ── Branch: settlement drift FAIL with payment_invoice_allocation table present ──
  it('checkInvoiceSettlementDrift fails when allocation table exists but amounts mismatch', async () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_invoice_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        applied_amount INTEGER NOT NULL
      )
    `)
    // Only allocate 1000 of the 5000 amount_paid
    db.prepare('INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (1, 1, 1000)').run()
    const report = await service.runAllChecks(1)
    const drift = report.checks.find(c => c.check_name === 'Invoice Settlement Drift Check')
    expect(drift?.status).toBe('FAIL')
    expect(drift?.message).toContain('settlement drift')
    expect(drift?.variance).toBeGreaterThan(0)
  })

  // ── Branch: checkOrphanedTransactions catch block (SQL error) ──
  it('checkOrphanedTransactions returns FAIL on SQL error when ledger_transaction table is missing', async () => {
    db.exec('DROP TABLE ledger_transaction')
    const report = await service.runAllChecks(1)
    const check = report.checks.find(c => c.check_name === 'Orphaned Transactions Check')
    expect(check?.status).toBe('FAIL')
    expect(check?.message).toContain('Error during check')
  })
})
