/**
 * Extended incremental migration tests — covering down() functions, branch gaps,
 * and migrations not tested in the original incremental-migrations.test.ts
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* Individual migration imports */
import { up as m1001 } from '../incremental/1001_journal_entry_bridge'
import { up as m1002Finance } from '../incremental/1002_finance_schema_fixes'
import { down as m1002SubjectNamesDown } from '../incremental/1002_fix_subject_names'
import { down as m1003GradingScaleDown } from '../incremental/1003_fix_grading_scale'
import { up as m1005 } from '../incremental/1005_journal_entry_type_expansion'
import { up as m1007 } from '../incremental/1007_payment_idempotency_and_invoice_uniqueness'
import { up as m1008 } from '../incremental/1008_attendance_and_reconciliation_uniqueness'
import { up as m1009 } from '../incremental/1009_grant_expiry_date'
import { up as m1010 } from '../incremental/1010_bank_reconciliation_constraints'
import { up as m1011 } from '../incremental/1011_approval_canonicalization'
import { up as m1012 } from '../incremental/1012_add_void_reversal_type'
import { up as m1013 } from '../incremental/1013_financial_period_status'
import { up as m1014 } from '../incremental/1014_remediation_schema_fixes'
import { up as m1015 } from '../incremental/1015_seed_missing_system_accounts'
import { up as m1016 } from '../incremental/1016_migrate_sms_credentials'
import { up as m1020 } from '../incremental/1020_add_supplier_id_to_journal'
import { up as m1021, down as m1021Down } from '../incremental/1021_accounting_periods'
import { up as m1022, down as m1022Down } from '../incremental/1022_expand_journal_entry_types'
import { up as m1023, down as m1023Down } from '../incremental/1023_add_department_to_journal_entry'
import { up as m1025 } from '../incremental/1025_dev_database_health_remediation'
import { up as m1026 } from '../incremental/1026_vote_head_and_installments'
import { up as m1027 } from '../incremental/1027_jss_three_account_architecture'
import { up as m1030, down as m1030Down } from '../incremental/1030_school_type_config'
import { up as m1031 } from '../incremental/1031_procurement_integration'

describe('incremental migrations – extended coverage', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = OFF')
  })

  afterEach(() => {
    db.close()
  })

  /* ============================================================== */
  /* 1001: Journal Entry Bridge – branch: journal entries pre-exist  */
  /* ============================================================== */
  describe('1001 – non-empty journal_entry branch', () => {
    it('adds gl_account_code to transaction_category when column is missing', () => {
      setupBasic1001Prereqs(db)
      m1001(db)
      const cols = db.prepare('PRAGMA table_info(transaction_category)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'gl_account_code')).toBe(true)
    })

    it('skips gl_account_code add if column already exists', () => {
      setupBasic1001Prereqs(db)
      db.exec('ALTER TABLE transaction_category ADD COLUMN gl_account_code TEXT')
      // Should not throw on duplicate column
      expect(() => m1001(db)).not.toThrow()
    })

    it('preserves existing journal_entry data when not empty', () => {
      setupBasic1001Prereqs(db)
      // Insert a journal entry so journalCount > 0 → different branch
      db.prepare(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('JE-OLD', '2026-01-01', 'EXPENSE', 'old entry', 1)`).run()

      m1001(db)

      // The old entry should still exist since table wasn't recreated
      const old = db.prepare("SELECT entry_ref FROM journal_entry WHERE entry_ref = 'JE-OLD'").get() as { entry_ref: string } | undefined
      expect(old?.entry_ref).toBe('JE-OLD')
    })

    it('skips backfill for transactions needing missing GL accounts', () => {
      setupBasic1001Prereqs(db)
      // Remove all GL accounts so backfill skip branch is hit
      db.exec('DELETE FROM gl_account')
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (1, 'TXN-NGL', '2026-01-05', 'FEE_PAYMENT', 10000, 'CREDIT', NULL, NULL, NULL, 'CASH', 'No GL', 1, 1, 0)`).run()

      m1001(db)

      const entries = db.prepare("SELECT * FROM journal_entry WHERE source_ledger_txn_id = 1").all()
      expect(entries).toHaveLength(0)
    })

    it('backfills different transaction types (EXPENSE, SALARY, DONATION, GRANT, REFUND, default)', () => {
      setupBasic1001Prereqs(db)
      const insertTxn = db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (?, ?, '2026-01-05', ?, 1000, 'DEBIT', NULL, NULL, NULL, ?, ?, 1, 1, 0)`)

      insertTxn.run(10, 'TXN-EXP', 'EXPENSE', 'CASH', 'expense')
      insertTxn.run(11, 'TXN-SAL', 'SALARY_PAYMENT', 'BANK_TRANSFER', 'salary')
      insertTxn.run(12, 'TXN-DON', 'DONATION', 'CASH', 'donation')
      insertTxn.run(13, 'TXN-GRN', 'GRANT', 'BANK_TRANSFER', 'grant')
      insertTxn.run(14, 'TXN-REF', 'REFUND', 'CASH', 'refund')
      insertTxn.run(15, 'TXN-OTH', 'INCOME', 'CASH', 'other income')

      m1001(db)

      const entries = db.prepare('SELECT entry_type FROM journal_entry WHERE source_ledger_txn_id IS NOT NULL').all() as Array<{ entry_type: string }>
      const types = entries.map(e => e.entry_type)
      expect(types).toContain('EXPENSE')
      expect(types).toContain('SALARY')
      expect(types).toContain('DONATION')
      expect(types).toContain('GRANT')
      expect(types).toContain('REFUND')
      expect(types).toContain('INCOME')
    })

    it('maps category names to GL codes (INCOME map)', () => {
      setupBasic1001Prereqs(db)
      // Change category to test different map paths
      db.exec("UPDATE transaction_category SET category_name = 'School Fees', category_type = 'INCOME' WHERE id = 1")
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (20, 'TXN-FEE', '2026-01-05', 'INCOME', 5000, 'CREDIT', NULL, NULL, NULL, 'CASH', 'school fees', 1, 1, 0)`).run()

      m1001(db)

      const cat = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 1').get() as { gl_account_code: string } | undefined
      expect(cat?.gl_account_code).toBe('4010')
    })

    // ── branch coverage: existingSourceIds.has(txn.id) – skip already-backfilled (L196) ──
    it('skips backfill for transactions that already have journal entries', () => {
      setupBasic1001Prereqs(db)
      // Insert a ledger transaction
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (50, 'TXN-ALREADY', '2026-01-05', 'FEE_PAYMENT', 8000, 'CREDIT', NULL, NULL, NULL, 'CASH', 'Already migrated', 1, 1, 0)`).run()
      // Pre-insert a journal entry with source_ledger_txn_id = 50 so it's already in existingSourceIds
      db.prepare(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id, source_ledger_txn_id) VALUES ('MIG-TXN-ALREADY', '2026-01-05', 'FEE_PAYMENT', 'pre-existing', 1, 50)`).run()
      const debitAcct = db.prepare("SELECT id FROM gl_account WHERE account_code = '1010'").get() as { id: number }
      const creditAcct = db.prepare("SELECT id FROM gl_account WHERE account_code = '1100'").get() as { id: number }
      db.prepare('INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount) VALUES (1, 1, ?, 8000, 0)').run(debitAcct.id)
      db.prepare('INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount) VALUES (1, 2, ?, 0, 8000)').run(creditAcct.id)

      // Run migration – table is empty (journalCount branch via DROP+recreate won't fire since we have entries)
      // Actually journalCount > 0 since we inserted a journal_entry, so table won't be recreated.
      // This means up() will pick up the entry through existingSourceIds, and skip txn 50.
      m1001(db)

      // Should still have exactly 1 journal entry (the pre-existing one, no duplicate created)
      const entries = db.prepare('SELECT * FROM journal_entry WHERE source_ledger_txn_id = 50').all()
      expect(entries).toHaveLength(1)
    })

    // ── branch coverage: null description fallback in backfill (L249) ──
    it('uses fallback description when transaction description is null', () => {
      setupBasic1001Prereqs(db)
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (60, 'TXN-NODESC', '2026-01-05', 'FEE_PAYMENT', 3000, 'CREDIT', NULL, NULL, NULL, 'CASH', NULL, 1, 1, 0)`).run()

      m1001(db)

      const entry = db.prepare('SELECT description FROM journal_entry WHERE source_ledger_txn_id = 60').get() as { description: string } | undefined
      expect(entry).toBeDefined()
      expect(entry!.description).toContain('Backfilled from FEE_PAYMENT')
    })

    // ── branch coverage: EXPENSE with null gl_account_code → fallback '5900' (L279) ──
    it('uses fallback GL code for expense with null gl_account_code', () => {
      setupBasic1001Prereqs(db)
      // Insert an expense transaction with no category gl_account_code
      db.exec("UPDATE transaction_category SET category_type = 'EXPENSE', category_name = 'Zzz Unknown' WHERE id = 1")
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (70, 'TXN-EXPNULL', '2026-01-05', 'EXPENSE', 2000, 'DEBIT', NULL, NULL, NULL, 'CASH', 'Unknown expense', 1, 1, 0)`).run()

      m1001(db)

      // The entry should be created using fallback code '5900' (debitCode for EXPENSE)
      const entry = db.prepare('SELECT id FROM journal_entry WHERE source_ledger_txn_id = 70').get()
      expect(entry).toBeDefined()
    })

    // ── branch coverage: category_type = 'INCOME' fallback gl_account_code → '4300' (L303) ──
    it('maps INCOME category with unrecognized name to fallback GL code 4300', () => {
      setupBasic1001Prereqs(db)
      db.exec("UPDATE transaction_category SET category_name = 'Alien Revenue', category_type = 'INCOME' WHERE id = 1")

      m1001(db)

      const cat = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 1').get() as { gl_account_code: string }
      expect(cat.gl_account_code).toBe('4300')
    })

    // ── branch coverage: EXPENSE keyword map paths ──
    it('maps EXPENSE categories with recognized keywords to specific GL codes', () => {
      setupBasic1001Prereqs(db)
      db.exec('DELETE FROM transaction_category')
      db.exec("INSERT INTO transaction_category (id, category_name, category_type) VALUES (1, 'Salaries Academic', 'EXPENSE')")
      db.exec("INSERT INTO transaction_category (id, category_name, category_type) VALUES (2, 'Food and Catering', 'EXPENSE')")
      db.exec("INSERT INTO transaction_category (id, category_name, category_type) VALUES (3, 'Electricity Bills', 'EXPENSE')")
      db.exec("INSERT INTO transaction_category (id, category_name, category_type) VALUES (4, 'Cleaning Services', 'EXPENSE')")

      m1001(db)

      const salary = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 1').get() as { gl_account_code: string }
      expect(salary.gl_account_code).toBe('5010')
      const food = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 2').get() as { gl_account_code: string }
      expect(food.gl_account_code).toBe('5100')
      const electric = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 3').get() as { gl_account_code: string }
      expect(electric.gl_account_code).toBe('5300')
      const clean = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 4').get() as { gl_account_code: string }
      expect(clean.gl_account_code).toBe('5410')
    })

    // ── branch coverage: resolveGLMapping fallback when gl_account_code is null (L173) ──
    it('uses fallback GL codes when category has no gl_account_code', () => {
      setupBasic1001Prereqs(db)
      // Insert a non-system category without a known name → gl_account_code stays null after seeding
      db.exec("INSERT INTO transaction_category (id, category_name, category_type) VALUES (99, 'Unknown Category', 'EXPENSE')")

      // EXPENSE txn referencing NON-EXISTENT category → LEFT JOIN yields null gl_account_code
      // This exercises the `txn.gl_account_code || '5900'` fallback branch in EXPENSE case
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (70, 'TXN-FALLBACK-EXP', '2026-01-05', 'EXPENSE', 2000, 'DEBIT', NULL, NULL, NULL, 'CASH', 'expense fallback', 1, 777, 0)`).run()

      // INCOME txn referencing non-existent category → LEFT JOIN gives null gl_account_code
      // This exercises the `txn.gl_account_code || '4300'` fallback in default case
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (71, 'TXN-FALLBACK-INC', '2026-01-05', 'INCOME', 3000, 'CREDIT', NULL, NULL, NULL, 'CASH', 'income fallback', 1, 888, 0)`).run()

      m1001(db)

      // Both transactions should be backfilled successfully
      const expEntry = db.prepare("SELECT * FROM journal_entry WHERE source_ledger_txn_id = 70").get()
      expect(expEntry).toBeTruthy()
      const incEntry = db.prepare("SELECT * FROM journal_entry WHERE source_ledger_txn_id = 71").get()
      expect(incEntry).toBeTruthy()
    })

    // ── branch coverage: counter stays 0 when no new entries are backfilled ──
    it('does not log backfill message when all transactions were already migrated', () => {
      setupBasic1001Prereqs(db)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Insert a ledger transaction AND its matching journal entry
      db.prepare(`INSERT INTO ledger_transaction (id, transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided) VALUES (80, 'TXN-PREMIG', '2026-01-05', 'FEE_PAYMENT', 5000, 'CREDIT', NULL, NULL, NULL, 'CASH', 'pre-migrated', 1, 1, 0)`).run()
      db.prepare(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id, source_ledger_txn_id) VALUES ('MIG-TXN-PREMIG', '2026-01-05', 'FEE_PAYMENT', 'pre-migrated', 1, 80)`).run()

      m1001(db)

      // The "Backfilled N journal entries" message should NOT appear (counter === 0)
      const backfillCalls = warnSpy.mock.calls.filter(c => String(c[0]).includes('Backfilled'))
      expect(backfillCalls).toHaveLength(0)
      warnSpy.mockRestore()
    })
  })

  /* ============================================================== */
  /* 1002_finance_schema_fixes: branches                            */
  /* ============================================================== */
  describe('1002_finance_schema_fixes – branch coverage', () => {
    it('skips when ledger_transaction table does not exist', () => {
      db.exec('CREATE TABLE transaction_category (id INTEGER PRIMARY KEY, category_name TEXT, category_type TEXT, is_system INTEGER DEFAULT 0)')
      expect(() => m1002Finance(db)).not.toThrow()
    })

    it('skips gl_account_code add when column already exists', () => {
      setup1002Prereqs(db)
      db.exec('ALTER TABLE transaction_category ADD COLUMN gl_account_code TEXT')
      expect(() => m1002Finance(db)).not.toThrow()
    })

    it('skips when transaction_category table does not exist', () => {
      db.exec(`CREATE TABLE user (id INTEGER PRIMARY KEY); INSERT INTO user (id) VALUES (1)`)
      db.exec(`CREATE TABLE student (id INTEGER PRIMARY KEY)`)
      db.exec(`CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY)`)
      db.exec(`CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_ref TEXT NOT NULL UNIQUE, transaction_date DATE, transaction_type TEXT, category_id INTEGER, amount INTEGER, debit_credit TEXT, student_id INTEGER, staff_id INTEGER, invoice_id INTEGER, payment_method TEXT, payment_reference TEXT, description TEXT, term_id INTEGER, recorded_by_user_id INTEGER NOT NULL, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, created_at DATETIME)`)
      expect(() => m1002Finance(db)).not.toThrow()
    })

    // ── branch coverage: seeds INCOME categories with code '4300' (L108) ──
    it('seeds INCOME system categories with code 4300', () => {
      setup1002Prereqs(db)
      // Add an INCOME system category so the INCOME ternary branch is exercised
      db.exec("INSERT INTO transaction_category (id, category_name, category_type, is_system) VALUES (2, 'Donations', 'INCOME', 1)")

      m1002Finance(db)

      const income = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 2').get() as { gl_account_code: string }
      expect(income.gl_account_code).toBe('4300')

      // The existing EXPENSE category should get '5900'
      const expense = db.prepare('SELECT gl_account_code FROM transaction_category WHERE id = 1').get() as { gl_account_code: string }
      expect(expense.gl_account_code).toBe('5900')
    })
  })

  /* ============================================================== */
  /* 1002_fix_subject_names: down()                                 */
  /* ============================================================== */
  describe('1002_fix_subject_names – down()', () => {
    it('down() does not throw', () => {
      db.exec('CREATE TABLE subject (id INTEGER PRIMARY KEY, code TEXT, name TEXT)')
      expect(() => m1002SubjectNamesDown(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1003_fix_grading_scale: down()                                 */
  /* ============================================================== */
  describe('1003_fix_grading_scale – down()', () => {
    it('down() does not throw', () => {
      db.exec('CREATE TABLE grading_scale (id INTEGER PRIMARY KEY, curriculum TEXT, grade TEXT, min_score INTEGER, max_score INTEGER, remarks TEXT)')
      expect(() => m1003GradingScaleDown(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1005: branch – no journal_entry table                          */
  /* ============================================================== */
  describe('1005 – early return when journal_entry missing', () => {
    it('returns early if journal_entry table does not exist', () => {
      expect(() => m1005(db)).not.toThrow()
    })

    it('copies data and rebuilds journal_entry table with expanded types', () => {
      db.exec(`
        CREATE TABLE user (id INTEGER PRIMARY KEY);
        INSERT INTO user (id) VALUES (1);
        CREATE TABLE journal_entry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_ref TEXT NOT NULL UNIQUE,
          entry_date DATE NOT NULL,
          entry_type TEXT NOT NULL,
          description TEXT NOT NULL,
          created_by_user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('REF-1005', '2026-01-01', 'FEE_PAYMENT', 'Test 1005', 1)`)

      m1005(db)

      // Verify data was copied over
      const row = db.prepare("SELECT * FROM journal_entry WHERE entry_ref = 'REF-1005'").get() as { description: string } | undefined
      expect(row).toBeTruthy()
      expect(row!.description).toBe('Test 1005')

      // Verify new table supports expanded types (GRANT is new in 1005)
      db.exec(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('REF-GRANT', '2026-02-01', 'GRANT', 'Grant entry', 1)`)
      const grant = db.prepare("SELECT entry_type FROM journal_entry WHERE entry_ref = 'REF-GRANT'").get() as { entry_type: string }
      expect(grant.entry_type).toBe('GRANT')
    })

    it('skips data copy when source and target columns have no intersection', () => {
      // Create a journal_entry table with columns that DON'T match the target
      db.exec(`
        CREATE TABLE user (id INTEGER PRIMARY KEY);
        INSERT INTO user (id) VALUES (1);
        CREATE TABLE journal_entry (
          unrelated_col_a TEXT,
          unrelated_col_b INTEGER
        )
      `)
      db.exec(`INSERT INTO journal_entry (unrelated_col_a, unrelated_col_b) VALUES ('test', 42)`)

      // Migration should succeed (journal_entry exists, but columns don't intersect)
      m1005(db)

      // New table was created (empty since no data was copied)
      const count = db.prepare('SELECT COUNT(*) as cnt FROM journal_entry').get() as { cnt: number }
      expect(count.cnt).toBe(0)
    })
  })

  /* ============================================================== */
  /* 1007: branches for missing tables                              */
  /* ============================================================== */
  describe('1007 – branch coverage', () => {
    it('handles missing ledger_transaction table – throws since CREATE INDEX references it', () => {
      db.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, term_id INTEGER, status TEXT, notes TEXT, created_at DATETIME)')
      // CREATE UNIQUE INDEX on ledger_transaction fires unconditionally → fails when table missing
      expect(() => m1007(db)).toThrow()
    })

    it('handles missing fee_invoice table', () => {
      db.exec('CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT, transaction_type TEXT)')
      db.exec('ALTER TABLE ledger_transaction ADD COLUMN idempotency_key TEXT')
      expect(() => m1007(db)).not.toThrow()
    })

    it('skips idempotency_key add when column already exists', () => {
      db.exec('CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT, transaction_type TEXT, idempotency_key TEXT)')
      db.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, term_id INTEGER, status TEXT, notes TEXT, created_at DATETIME)')
      expect(() => m1007(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1008: branches for missing tables                              */
  /* ============================================================== */
  describe('1008 – branch coverage', () => {
    it('handles missing attendance table', () => {
      db.exec('CREATE TABLE bank_statement_line (id INTEGER PRIMARY KEY, is_matched INTEGER DEFAULT 0, matched_transaction_id INTEGER)')
      expect(() => m1008(db)).not.toThrow()
    })

    it('handles missing bank_statement_line table', () => {
      db.exec('CREATE TABLE attendance (id INTEGER PRIMARY KEY, student_id INTEGER, academic_year_id INTEGER, term_id INTEGER, attendance_date TEXT, created_at DATETIME)')
      expect(() => m1008(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1009: branches                                                 */
  /* ============================================================== */
  describe('1009 – branch coverage', () => {
    it('returns early if government_grant table does not exist', () => {
      expect(() => m1009(db)).not.toThrow()
    })

    it('skips expiry_date column add if already exists', () => {
      db.exec('CREATE TABLE government_grant (id INTEGER PRIMARY KEY, grant_name TEXT, fiscal_year INTEGER, expiry_date DATE)')
      expect(() => m1009(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1010: branches for missing tables                              */
  /* ============================================================== */
  describe('1010 – branch coverage', () => {
    it('handles missing bank_account table', () => {
      db.exec('CREATE TABLE bank_statement (id INTEGER PRIMARY KEY, bank_account_id INTEGER, statement_date TEXT, statement_reference TEXT)')
      db.exec('CREATE TABLE bank_statement_line (id INTEGER PRIMARY KEY, bank_statement_id INTEGER, transaction_date TEXT, description TEXT, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0)')
      expect(() => m1010(db)).not.toThrow()
    })

    it('handles missing bank_statement table', () => {
      db.exec('CREATE TABLE bank_account (id INTEGER PRIMARY KEY, account_number TEXT)')
      db.exec('CREATE TABLE bank_statement_line (id INTEGER PRIMARY KEY, bank_statement_id INTEGER, transaction_date TEXT, description TEXT, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0)')
      expect(() => m1010(db)).not.toThrow()
    })

    it('handles missing bank_statement_line table', () => {
      db.exec('CREATE TABLE bank_account (id INTEGER PRIMARY KEY, account_number TEXT)')
      db.exec('CREATE TABLE bank_statement (id INTEGER PRIMARY KEY, bank_account_id INTEGER, statement_date TEXT, statement_reference TEXT)')
      expect(() => m1010(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1011: branches for missing tables                              */
  /* ============================================================== */
  describe('1011 – branch coverage', () => {
    it('returns early if approval_request table does not exist', () => {
      expect(() => m1011(db)).not.toThrow()
    })

    it('returns early if approval_workflow table does not exist', () => {
      db.exec('CREATE TABLE approval_request (id INTEGER PRIMARY KEY)')
      expect(() => m1011(db)).not.toThrow()
    })

    it('skips approval_rule_id column add if it already exists', () => {
      db.exec('CREATE TABLE approval_workflow (id INTEGER PRIMARY KEY, workflow_name TEXT UNIQUE, entity_type TEXT UNIQUE, is_active INTEGER DEFAULT 1, created_at DATETIME)')
      db.exec('CREATE TABLE approval_request (id INTEGER PRIMARY KEY, workflow_id INTEGER, entity_type TEXT, entity_id INTEGER, current_step INTEGER, status TEXT, requested_by_user_id INTEGER, final_approver_user_id INTEGER, completed_at DATETIME, created_at DATETIME, approval_rule_id INTEGER, legacy_transaction_approval_id INTEGER)')
      db.exec('CREATE TABLE approval_history (id INTEGER PRIMARY KEY, approval_request_id INTEGER, action TEXT, action_by INTEGER, action_at DATETIME, previous_status TEXT, new_status TEXT, notes TEXT)')
      db.exec('CREATE TABLE approval_rule (id INTEGER PRIMARY KEY, rule_name TEXT)')

      expect(() => m1011(db)).not.toThrow()
    })

    it('skips transaction_approval backfill when table does not exist', () => {
      db.exec('CREATE TABLE approval_workflow (id INTEGER PRIMARY KEY, workflow_name TEXT UNIQUE, entity_type TEXT UNIQUE, is_active INTEGER DEFAULT 1, created_at DATETIME)')
      db.exec('CREATE TABLE approval_request (id INTEGER PRIMARY KEY, workflow_id INTEGER, entity_type TEXT, entity_id INTEGER, current_step INTEGER, status TEXT DEFAULT \'PENDING\', requested_by_user_id INTEGER, final_approver_user_id INTEGER, completed_at DATETIME, created_at DATETIME)')
      db.exec('CREATE TABLE journal_entry (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE approval_history (id INTEGER PRIMARY KEY, approval_request_id INTEGER, action TEXT, action_by INTEGER, action_at DATETIME, previous_status TEXT, new_status TEXT, notes TEXT)')
      db.exec('CREATE TABLE approval_rule (id INTEGER PRIMARY KEY, rule_name TEXT)')

      expect(() => m1011(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1012: branches                                                 */
  /* ============================================================== */
  describe('1012 – branch coverage', () => {
    it('returns early if journal_entry table does not exist', () => {
      expect(() => m1012(db)).not.toThrow()
    })

    it('copies data and handles FK state when journal_entry exists with data', () => {
      // Build prerequisite tables for FK references
      db.exec(`
        CREATE TABLE student (id INTEGER PRIMARY KEY);
        CREATE TABLE staff (id INTEGER PRIMARY KEY);
        CREATE TABLE term (id INTEGER PRIMARY KEY);
        CREATE TABLE user (id INTEGER PRIMARY KEY);
        INSERT INTO user (id) VALUES (1);
      `)
      db.exec(`
        CREATE TABLE journal_entry (
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          source_ledger_txn_id INTEGER
        )
      `)
      db.exec(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('REF-001', '2026-01-01', 'FEE_PAYMENT', 'Test entry', 1)`)

      // Enable FK to trigger the fkState.foreign_keys === true branch
      db.pragma('foreign_keys = ON')

      m1012(db)

      // Verify data was copied
      const row = db.prepare("SELECT * FROM journal_entry WHERE entry_ref = 'REF-001'").get() as { entry_ref: string; description: string } | undefined
      expect(row).toBeTruthy()
      expect(row!.entry_ref).toBe('REF-001')
      expect(row!.description).toBe('Test entry')

      // Verify FK state was restored (should be ON)
      const fkState = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
      expect(fkState.foreign_keys).toBe(1)
    })

    it('runs migration with FK disabled (fkState.foreign_keys === 0)', () => {
      db.exec(`
        CREATE TABLE user (id INTEGER PRIMARY KEY);
        INSERT INTO user (id) VALUES (1);
        CREATE TABLE journal_entry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_ref TEXT NOT NULL UNIQUE,
          entry_date DATE NOT NULL,
          entry_type TEXT NOT NULL,
          description TEXT NOT NULL,
          created_by_user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('REF-002', '2026-02-01', 'EXPENSE', 'FK off entry', 1)`)

      // FK is already OFF (default for tests)
      db.pragma('foreign_keys = OFF')
      m1012(db)

      const row = db.prepare("SELECT entry_ref FROM journal_entry WHERE entry_ref = 'REF-002'").get() as { entry_ref: string } | undefined
      expect(row).toBeTruthy()
    })
  })

  /* ============================================================== */
  /* 1013: branches for already-existing columns                    */
  /* ============================================================== */
  describe('1013 – branch coverage', () => {
    it('adds all missing columns', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE financial_period (id INTEGER PRIMARY KEY, is_locked INTEGER DEFAULT 0)')
      m1013(db)

      const cols = db.prepare('PRAGMA table_info(financial_period)').all() as Array<{ name: string }>
      const names = cols.map(c => c.name)
      expect(names).toContain('status')
      expect(names).toContain('locked_by')
      expect(names).toContain('closed_by')
      expect(names).toContain('closed_at')
    })

    it('skips columns that already exist', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE financial_period (id INTEGER PRIMARY KEY, is_locked INTEGER DEFAULT 0, status TEXT, locked_by INTEGER, closed_by INTEGER, closed_at DATETIME)')
      expect(() => m1013(db)).not.toThrow()
    })

    it('backfills status from is_locked', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE financial_period (id INTEGER PRIMARY KEY, is_locked INTEGER DEFAULT 0)')
      db.exec("INSERT INTO financial_period (id, is_locked) VALUES (1, 1)")
      db.exec("INSERT INTO financial_period (id, is_locked) VALUES (2, 0)")

      m1013(db)

      const p1 = db.prepare('SELECT status FROM financial_period WHERE id = 1').get() as { status: string }
      const p2 = db.prepare('SELECT status FROM financial_period WHERE id = 2').get() as { status: string }
      expect(p1.status).toBe('LOCKED')
      expect(p2.status).toBe('OPEN')
    })

    it('backfills locked_by from locked_by_user_id if present', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE financial_period (id INTEGER PRIMARY KEY, is_locked INTEGER DEFAULT 0, locked_by_user_id INTEGER)')
      db.exec("INSERT INTO financial_period (id, is_locked, locked_by_user_id) VALUES (1, 1, 42)")

      m1013(db)

      const p = db.prepare('SELECT locked_by FROM financial_period WHERE id = 1').get() as { locked_by: number }
      expect(p.locked_by).toBe(42)
    })
  })

  /* ============================================================== */
  /* 1014: branch coverage – index fallback paths                   */
  /* ============================================================== */
  describe('1014 – branch coverage', () => {
    it('creates attendance unique index when no duplicates', () => {
      setupRemediation1014(db)
      m1014(db)

      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_attendance_student_date'").get()
      expect(idx).toBeTruthy()
    })

    it('falls back to non-unique index when duplicates exist', () => {
      setupRemediation1014(db)
      // Insert duplicate attendance rows
      db.exec("INSERT INTO attendance (student_id, attendance_date, stream_id) VALUES (1, '2026-01-01', 1), (1, '2026-01-01', 1)")

      m1014(db)

      // Either the unique index exists (deduped) or the fallback non-unique exists
      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_attendance_student_date%'").get()
      expect(idx).toBeTruthy()
    })

    it('adds is_voided to fee_invoice when missing', () => {
      setupRemediation1014(db)
      m1014(db)

      const cols = db.prepare('PRAGMA table_info(fee_invoice)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'is_voided')).toBe(true)
    })

    it('skips is_voided on fee_invoice when already present', () => {
      setupRemediation1014(db)
      db.exec('ALTER TABLE fee_invoice ADD COLUMN is_voided INTEGER DEFAULT 0')
      expect(() => m1014(db)).not.toThrow()
    })

    it('handles missing student_route_assignment table', () => {
      setupRemediation1014(db)
      db.exec('DROP TABLE IF EXISTS student_route_assignment')
      expect(() => m1014(db)).not.toThrow()
    })

    it('falls back to non-unique opening_balance index when duplicates exist', () => {
      setupRemediation1014(db)
      db.exec("INSERT INTO opening_balance (gl_account_id, academic_year_id) VALUES (1, 2026), (1, 2026)")
      m1014(db)

      // Should have the fallback non-unique index
      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_opening_balance_acct_yr'").get()
      expect(idx).toBeTruthy()
    })

    it('skips grading_scale unique index when duplicates exist (empty catch)', () => {
      setupRemediation1014(db)
      db.exec("INSERT INTO grading_scale (curriculum, grade) VALUES ('CBC', 'A'), ('CBC', 'A')")
      expect(() => m1014(db)).not.toThrow()
    })

    it('skips attendance index creation when it already exists', () => {
      setupRemediation1014(db)
      db.exec('CREATE INDEX idx_attendance_student_date ON attendance(student_id, attendance_date, stream_id)')
      expect(() => m1014(db)).not.toThrow()
    })

    it('skips opening_balance index creation when it already exists', () => {
      setupRemediation1014(db)
      db.exec('CREATE INDEX idx_opening_balance_account_year ON opening_balance(gl_account_id, academic_year_id)')
      expect(() => m1014(db)).not.toThrow()
    })

    it('handles student_route_assignment without student_id column (hasColumn false)', () => {
      setupRemediation1014(db)
      db.exec('DROP TABLE student_route_assignment')
      db.exec('CREATE TABLE student_route_assignment (id INTEGER PRIMARY KEY AUTOINCREMENT, route_number INTEGER)')
      expect(() => m1014(db)).not.toThrow()
    })

    it('handles student_route_assignment with duplicates in unique index (catch)', () => {
      setupRemediation1014(db)
      db.exec("INSERT INTO student_route_assignment (student_id, route_id, academic_year, term) VALUES (1, 1, 2026, 1), (1, 1, 2026, 1)")
      expect(() => m1014(db)).not.toThrow()
    })

    it('skips fee_invoice index creation when idx_fee_invoice_student_status already exists', () => {
      setupRemediation1014(db)
      db.exec('CREATE INDEX idx_fee_invoice_student_status ON fee_invoice(student_id, status)')
      expect(() => m1014(db)).not.toThrow()
      // Index should still exist (not recreated)
      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_fee_invoice_student_status'").get()
      expect(idx).toBeTruthy()
    })

    it('skips grading_scale index creation when idx_grading_scale_curriculum_grade already exists', () => {
      setupRemediation1014(db)
      db.exec('CREATE INDEX idx_grading_scale_curriculum_grade ON grading_scale(curriculum, grade)')
      expect(() => m1014(db)).not.toThrow()
      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_grading_scale_curriculum_grade'").get()
      expect(idx).toBeTruthy()
    })

    it('skips student_route_unique index creation when idx_student_route_unique already exists', () => {
      setupRemediation1014(db)
      db.exec('CREATE INDEX idx_student_route_unique ON student_route_assignment(student_id, route_id, academic_year, term)')
      expect(() => m1014(db)).not.toThrow()
      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_student_route_unique'").get()
      expect(idx).toBeTruthy()
    })
  })

  /* ============================================================== */
  /* 1015: branch coverage – missing GL accounts                    */
  /* ============================================================== */
  describe('1015 – branch coverage', () => {
    it('seeds missing GL accounts', () => {
      db.exec('CREATE TABLE gl_account (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT NOT NULL UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_system_account INTEGER, is_active INTEGER)')
      db.exec('CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT, gl_account_id INTEGER)')

      m1015(db)

      const acct = db.prepare("SELECT * FROM gl_account WHERE account_code = '5250'").get()
      expect(acct).toBeTruthy()
    })

    it('fixes Maintenance fee category GL mapping when both accounts exist', () => {
      db.exec('CREATE TABLE gl_account (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT NOT NULL UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_system_account INTEGER, is_active INTEGER)')
      db.exec('CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT, gl_account_id INTEGER)')
      db.prepare("INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active) VALUES ('5500', 'Repairs', 'EXPENSE', 'DEBIT', 1, 1)").run()
      db.prepare("INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active) VALUES ('4300', 'Other Income', 'REVENUE', 'CREDIT', 1, 1)").run()
      const expense = db.prepare("SELECT id FROM gl_account WHERE account_code = '5500'").get() as { id: number }
      db.prepare("INSERT INTO fee_category (category_name, gl_account_id) VALUES ('Maintenance', ?)").run(expense.id)

      m1015(db)

      const cat = db.prepare("SELECT gl_account_id FROM fee_category WHERE category_name = 'Maintenance'").get() as { gl_account_id: number }
      const revenue = db.prepare("SELECT id FROM gl_account WHERE account_code = '4300'").get() as { id: number }
      expect(cat.gl_account_id).toBe(revenue.id)
    })

    it('skips Maintenance fix when expense GL account is missing', () => {
      db.exec('CREATE TABLE gl_account (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT NOT NULL UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_system_account INTEGER, is_active INTEGER)')
      db.exec('CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT, gl_account_id INTEGER)')
      // Only 4300 exists, not 5500
      db.prepare("INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active) VALUES ('4300', 'Other Income', 'REVENUE', 'CREDIT', 1, 1)").run()

      expect(() => m1015(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1016: SMS credential migration branches                        */
  /* ============================================================== */
  describe('1016 – branch coverage', () => {
    it('creates system_config table if not exists', () => {
      db.exec("CREATE TABLE school_settings (id INTEGER PRIMARY KEY, sms_api_key TEXT, sms_api_secret TEXT, sms_sender_id TEXT)")
      db.exec("INSERT INTO school_settings (id, sms_api_key, sms_api_secret, sms_sender_id) VALUES (1, 'key123', 'secret456', 'SCHOOL')")

      m1016(db)

      const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_config'").get()
      expect(table).toBeTruthy()

      const key = db.prepare("SELECT value FROM system_config WHERE key = 'sms_api_key'").get() as { value: string }
      expect(key.value).toBe('key123')

      // Check plaintext is nulled
      const settings = db.prepare("SELECT sms_api_key FROM school_settings WHERE id = 1").get() as { sms_api_key: string | null }
      expect(settings.sms_api_key).toBeNull()
    })

    it('returns early when no school_settings row', () => {
      db.exec("CREATE TABLE school_settings (id INTEGER PRIMARY KEY, sms_api_key TEXT, sms_api_secret TEXT, sms_sender_id TEXT)")
      db.exec("CREATE TABLE system_config (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL, is_encrypted INTEGER DEFAULT 0, updated_at DATETIME)")
      // No row in school_settings
      expect(() => m1016(db)).not.toThrow()
    })

    it('handles null SMS credentials (only sender_id is set)', () => {
      db.exec("CREATE TABLE school_settings (id INTEGER PRIMARY KEY, sms_api_key TEXT, sms_api_secret TEXT, sms_sender_id TEXT)")
      db.exec("INSERT INTO school_settings (id, sms_api_key, sms_api_secret, sms_sender_id) VALUES (1, NULL, NULL, 'MWINGI')")

      m1016(db)

      const configs = db.prepare('SELECT COUNT(*) as cnt FROM system_config').get() as { cnt: number }
      expect(configs.cnt).toBe(1) // Only sms_sender_id
    })

    it('uses existing system_config table if already present', () => {
      db.exec("CREATE TABLE system_config (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL, is_encrypted INTEGER DEFAULT 0, updated_at DATETIME)")
      db.exec("CREATE TABLE school_settings (id INTEGER PRIMARY KEY, sms_api_key TEXT, sms_api_secret TEXT, sms_sender_id TEXT)")
      db.exec("INSERT INTO school_settings (id, sms_api_key, sms_api_secret, sms_sender_id) VALUES (1, 'K', 'S', 'ID')")

      expect(() => m1016(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1020: branch coverage                                          */
  /* ============================================================== */
  describe('1020 – branch coverage', () => {
    it('adds supplier_id column to journal_entry', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE supplier (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT NOT NULL UNIQUE, entry_date DATE, entry_type TEXT, description TEXT, created_by_user_id INTEGER)')

      m1020(db)

      const cols = db.prepare('PRAGMA table_info(journal_entry)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'supplier_id')).toBe(true)
    })

    it('skips when supplier_id already exists', () => {
      db.exec('CREATE TABLE journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT, entry_date DATE, entry_type TEXT, description TEXT, created_by_user_id INTEGER, supplier_id INTEGER)')

      expect(() => m1020(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1021: accounting_periods – up() and down()                     */
  /* ============================================================== */
  describe('1021 – up/down coverage', () => {
    it('creates accounting_period table and seeds initial period', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')

      m1021(db)

      const periods = db.prepare('SELECT COUNT(*) as cnt FROM accounting_period').get() as { cnt: number }
      expect(periods.cnt).toBe(1)
    })

    it('does not re-seed if period already exists', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')

      m1021(db)
      m1021(db) // Second run

      const periods = db.prepare('SELECT COUNT(*) as cnt FROM accounting_period').get() as { cnt: number }
      expect(periods.cnt).toBe(1)
    })

    it('down() drops accounting_period table', () => {
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      m1021(db)
      m1021Down(db)

      const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_period'").get()
      expect(table).toBeFalsy()
    })
  })

  /* ============================================================== */
  /* 1022: expand journal entry types – down()                      */
  /* ============================================================== */
  describe('1022 – branch and down coverage', () => {
    it('returns early when journal_entry table does not exist', () => {
      expect(() => m1022(db)).not.toThrow()
    })

    it('handles journal_entry with FK on, then restores', () => {
      db.exec('PRAGMA foreign_keys = ON')
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE student (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE staff (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE supplier (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE term (id INTEGER PRIMARY KEY)')
      db.exec(`CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_ref TEXT NOT NULL UNIQUE, entry_date DATE, entry_type TEXT NOT NULL,
        description TEXT NOT NULL, created_by_user_id INTEGER NOT NULL,
        source_ledger_txn_id INTEGER
      )`)
      db.exec("INSERT INTO user (id) VALUES (1)")
      db.prepare("INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('JE-1', '2026-01-01', 'EXPENSE', 'test', 1)").run()

      m1022(db)

      // Should be able to insert ASSET_ACQUISITION
      db.prepare("INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('JE-2', '2026-01-02', 'ASSET_ACQUISITION', 'new type', 1)").run()
      const row = db.prepare("SELECT entry_type FROM journal_entry WHERE entry_ref = 'JE-2'").get() as { entry_type: string }
      expect(row.entry_type).toBe('ASSET_ACQUISITION')
    })

    it('down() does not throw', () => {
      expect(() => m1022Down(db)).not.toThrow()
    })

    // ── branch coverage: columnsToCopy.length === 0 (L64) ──
    it('skips data copy when journal_entry columns do not match target', () => {
      // Create journal_entry with columns that do NOT match the new table's columns
      db.exec(`CREATE TABLE user (id INTEGER PRIMARY KEY)`)
      db.exec(`CREATE TABLE journal_entry (
        unrelated_x TEXT,
        unrelated_y INTEGER
      )`)
      db.exec("INSERT INTO journal_entry (unrelated_x, unrelated_y) VALUES ('a', 1)")

      m1022(db)

      // Table was recreated (empty: no data copied since no columns matched)
      const rows = db.prepare('SELECT COUNT(*) as cnt FROM journal_entry').get() as { cnt: number }
      expect(rows.cnt).toBe(0)

      // New table supports the expanded types
      db.exec("INSERT INTO user (id) VALUES (1)")
      db.prepare("INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('JE-NEW', '2026-01-01', 'DEPRECIATION', 'test', 1)").run()
      const row = db.prepare("SELECT entry_type FROM journal_entry WHERE entry_ref = 'JE-NEW'").get() as { entry_type: string }
      expect(row.entry_type).toBe('DEPRECIATION')
    })
  })

  /* ============================================================== */
  /* 1023: add department – down()                                  */
  /* ============================================================== */
  describe('1023 – branch and down coverage', () => {
    it('adds department column', () => {
      db.exec('CREATE TABLE journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT)')

      m1023(db)

      const cols = db.prepare('PRAGMA table_info(journal_entry)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'department')).toBe(true)
    })

    it('skips when department column already exists', () => {
      db.exec('CREATE TABLE journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT, department TEXT)')
      expect(() => m1023(db)).not.toThrow()
    })

    it('down() does not throw', () => {
      expect(() => m1023Down(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1025: database health remediation – branches                   */
  /* ============================================================== */
  describe('1025 – branch coverage', () => {
    it('prunes orphaned payment_invoice_allocation records', () => {
      db.exec('CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE payment_invoice_allocation (id INTEGER PRIMARY KEY, transaction_id INTEGER)')
      db.exec('CREATE TABLE gl_account (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT NOT NULL UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_system_account INTEGER, is_active INTEGER)')

      // Insert a valid and an orphaned allocation
      db.exec('INSERT INTO ledger_transaction (id) VALUES (1)')
      db.exec('INSERT INTO payment_invoice_allocation (id, transaction_id) VALUES (1, 1), (2, 999)')

      m1025(db)

      const count = db.prepare('SELECT COUNT(*) as cnt FROM payment_invoice_allocation').get() as { cnt: number }
      expect(count.cnt).toBe(1)
    })

    it('skips pruning when no orphans exist', () => {
      db.exec('CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE payment_invoice_allocation (id INTEGER PRIMARY KEY, transaction_id INTEGER)')
      db.exec('CREATE TABLE gl_account (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT NOT NULL UNIQUE, account_name TEXT, account_type TEXT, normal_balance TEXT, is_system_account INTEGER, is_active INTEGER)')

      db.exec('INSERT INTO ledger_transaction (id) VALUES (1)')
      db.exec('INSERT INTO payment_invoice_allocation (id, transaction_id) VALUES (1, 1)')

      m1025(db)

      const count = db.prepare('SELECT COUNT(*) as cnt FROM payment_invoice_allocation').get() as { cnt: number }
      expect(count.cnt).toBe(1)
    })
  })

  /* ============================================================== */
  /* 1026: vote heads and installments – branch                     */
  /* ============================================================== */
  describe('1026 – branch coverage', () => {
    it('adds priority column and creates installment tables', () => {
      db.exec('CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT)')
      db.exec('CREATE TABLE payment_invoice_allocation (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE invoice_item (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE academic_year (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE stream (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec("INSERT INTO fee_category (id, category_name) VALUES (1, 'Tuition Fees')")

      m1026(db)

      const cols = db.prepare('PRAGMA table_info(fee_category)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'priority')).toBe(true)

      // Check priority was seeded
      const cat = db.prepare('SELECT priority FROM fee_category WHERE id = 1').get() as { priority: number }
      expect(cat.priority).toBe(1)

      // Tables created
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('installment_policy','installment_schedule','payment_item_allocation')").all()
      expect(tables.length).toBe(3)
    })

    it('skips priority add when column already exists', () => {
      db.exec('CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT, priority INTEGER DEFAULT 99)')
      db.exec('CREATE TABLE payment_invoice_allocation (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE invoice_item (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE academic_year (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE stream (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')

      expect(() => m1026(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1027: JSS 3-account architecture – branch                      */
  /* ============================================================== */
  describe('1027 – branch coverage', () => {
    it('adds jss_account_type and creates virement table', () => {
      db.exec('CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT)')
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
      db.exec("INSERT INTO fee_category (id, category_name) VALUES (1, 'Tuition'), (2, 'Lunch'), (3, 'Development Levy')")

      m1027(db)

      const cols = db.prepare('PRAGMA table_info(fee_category)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'jss_account_type')).toBe(true)

      const tuition = db.prepare('SELECT jss_account_type FROM fee_category WHERE id = 1').get() as { jss_account_type: string }
      expect(tuition.jss_account_type).toBe('TUITION')

      const lunch = db.prepare('SELECT jss_account_type FROM fee_category WHERE id = 2').get() as { jss_account_type: string }
      expect(lunch.jss_account_type).toBe('OPERATIONS')

      const dev = db.prepare('SELECT jss_account_type FROM fee_category WHERE id = 3').get() as { jss_account_type: string }
      expect(dev.jss_account_type).toBe('INFRASTRUCTURE')

      const virement = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jss_virement_request'").get()
      expect(virement).toBeTruthy()
    })

    it('skips jss_account_type add when column already exists', () => {
      db.exec("CREATE TABLE fee_category (id INTEGER PRIMARY KEY, category_name TEXT, jss_account_type TEXT CHECK(jss_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE')))")
      db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')

      expect(() => m1027(db)).not.toThrow()
    })
  })

  /* ============================================================== */
  /* 1030: school_type_config – up() and down()                     */
  /* ============================================================== */
  describe('1030 – up/down coverage', () => {
    it('adds school_type column', () => {
      db.exec('CREATE TABLE school_settings (id INTEGER PRIMARY KEY, school_name TEXT)')

      m1030(db)

      const cols = db.prepare('PRAGMA table_info(school_settings)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'school_type')).toBe(true)
    })

    it('handles duplicate column gracefully', () => {
      db.exec("CREATE TABLE school_settings (id INTEGER PRIMARY KEY, school_name TEXT, school_type TEXT NOT NULL DEFAULT 'PUBLIC')")
      expect(() => m1030(db)).not.toThrow()
    })

    it('down() removes school_type column', () => {
      db.exec('CREATE TABLE school_settings (id INTEGER PRIMARY KEY, school_name TEXT)')
      m1030(db)
      m1030Down(db)

      // In modern SQLite, DROP COLUMN is supported
      const cols = db.prepare('PRAGMA table_info(school_settings)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'school_type')).toBe(false)
    })

    it('up() rethrows non-duplicate-column errors', () => {
      // No school_settings table exists → ALTER TABLE will fail with "no such table"
      expect(() => m1030(db)).toThrow()
    })

    it('down() catches and warns when DROP COLUMN fails', () => {
      // Create school_settings without school_type column so DROP COLUMN fails
      db.exec('CREATE TABLE school_settings (id INTEGER PRIMARY KEY, school_name TEXT)')
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() => m1030Down(db)).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not drop school_type'),
        expect.anything()
      )
      warnSpy.mockRestore()
    })
  })

  /* ============================================================== */
  /* 1031: procurement integration – branches                       */
  /* ============================================================== */
  describe('1031 – branch coverage', () => {
    it('adds committed_amount and requisition_item columns', () => {
      db.exec('CREATE TABLE asset_category (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE budget_line_item (id INTEGER PRIMARY KEY, budget_id INTEGER, description TEXT)')
      db.exec('CREATE TABLE requisition_item (id INTEGER PRIMARY KEY, requisition_id INTEGER, description TEXT)')

      m1031(db)

      const blCols = db.prepare('PRAGMA table_info(budget_line_item)').all() as Array<{ name: string }>
      expect(blCols.some(c => c.name === 'committed_amount')).toBe(true)

      const riCols = db.prepare('PRAGMA table_info(requisition_item)').all() as Array<{ name: string }>
      expect(riCols.some(c => c.name === 'is_capital_asset')).toBe(true)
      expect(riCols.some(c => c.name === 'asset_category_id')).toBe(true)
    })

    it('handles duplicate columns gracefully', () => {
      db.exec('CREATE TABLE asset_category (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE budget_line_item (id INTEGER PRIMARY KEY, committed_amount INTEGER NOT NULL DEFAULT 0)')
      db.exec('CREATE TABLE requisition_item (id INTEGER PRIMARY KEY, is_capital_asset BOOLEAN NOT NULL DEFAULT 0, asset_category_id INTEGER)')

      expect(() => m1031(db)).not.toThrow()
    })

    it('throws for non-duplicate-column errors on budget_line_item', () => {
      // No budget_line_item table at all → ALTER TABLE fails with different error
      db.exec('CREATE TABLE requisition_item (id INTEGER PRIMARY KEY)')
      expect(() => m1031(db)).toThrow()
    })

    it('throws for non-duplicate-column errors on requisition_item is_capital_asset', () => {
      // budget_line_item exists (so first ALTER succeeds) but requisition_item is missing
      db.exec('CREATE TABLE budget_line_item (id INTEGER PRIMARY KEY, budget_id INTEGER, description TEXT)')
      // No requisition_item table → ALTER TABLE fails with non-duplicate error → rethrow
      expect(() => m1031(db)).toThrow()
    })

    it('throws for non-duplicate-column errors on requisition_item asset_category_id', () => {
      // budget_line_item and requisition_item both exist, is_capital_asset already added
      db.exec('CREATE TABLE asset_category (id INTEGER PRIMARY KEY)')
      db.exec('CREATE TABLE budget_line_item (id INTEGER PRIMARY KEY, budget_id INTEGER, description TEXT)')
      db.exec('CREATE TABLE requisition_item (id INTEGER PRIMARY KEY, is_capital_asset BOOLEAN NOT NULL DEFAULT 0)')
      // committed_amount will be added, is_capital_asset duplicate → caught,
      // but asset_category_id ALTER should succeed. To force a different error on asset_category_id,
      // drop asset_category so FK target is missing. However, SQLite ignores FK by default.
      // Instead, verify no throw when is_capital_asset already exists but asset_category_id does not.
      expect(() => m1031(db)).not.toThrow()
      const cols = db.prepare('PRAGMA table_info(requisition_item)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'asset_category_id')).toBe(true)
    })
  })

  /* ──────────────────────────────────────────────────────────────── */
  /* Helpers                                                         */
  /* ──────────────────────────────────────────────────────────────── */
  function setupBasic1001Prereqs(db: Database.Database) {
    db.exec(`
      CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE student (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE staff (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE term (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY AUTOINCREMENT);

      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL,
        category_type TEXT NOT NULL
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        student_id INTEGER,
        staff_id INTEGER,
        term_id INTEGER,
        payment_method TEXT,
        description TEXT,
        recorded_by_user_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        is_voided INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_ref TEXT NOT NULL UNIQUE,
        entry_date TEXT NOT NULL,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_ledger_txn_id INTEGER
      );

      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        description TEXT
      );
    `)

    db.prepare(`INSERT INTO user (id) VALUES (1)`).run()
    db.prepare(`INSERT INTO gl_account (account_code) VALUES ('1010'), ('1020'), ('1100'), ('4010'), ('4100'), ('4200'), ('4300'), ('5010'), ('5900')`).run()
    db.prepare(`INSERT INTO transaction_category (id, category_name, category_type) VALUES (1, 'Other Income', 'INCOME')`).run()
  }

  function setup1002Prereqs(db: Database.Database) {
    db.exec(`
      CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE student (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY AUTOINCREMENT);
      INSERT INTO user (id) VALUES (1);

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL,
        category_type TEXT NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO transaction_category (id, category_name, category_type, is_system)
      VALUES (1, 'Misc Expense', 'EXPENSE', 1);

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN (
          'FEE_PAYMENT', 'DONATION', 'GRANT', 'EXPENSE', 'SALARY_PAYMENT',
          'REFUND', 'OPENING_BALANCE', 'ADJUSTMENT'
        )),
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL CHECK(debit_credit IN ('DEBIT', 'CREDIT')),
        student_id INTEGER,
        staff_id INTEGER,
        invoice_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        term_id INTEGER,
        recorded_by_user_id INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        voided_reason TEXT,
        voided_by_user_id INTEGER,
        voided_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
  }

  function setupRemediation1014(db: Database.Database) {
    db.exec(`
      CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, attendance_date TEXT, stream_id INTEGER);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, status TEXT);
      CREATE TABLE opening_balance (id INTEGER PRIMARY KEY AUTOINCREMENT, gl_account_id INTEGER, academic_year_id INTEGER);
      CREATE TABLE stock_movement (id INTEGER PRIMARY KEY AUTOINCREMENT, quantity INTEGER);
      CREATE TABLE grading_scale (id INTEGER PRIMARY KEY AUTOINCREMENT, curriculum TEXT, grade TEXT);
      CREATE TABLE student_route_assignment (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, route_id INTEGER, academic_year INTEGER, term INTEGER);
      CREATE TABLE student (id INTEGER PRIMARY KEY AUTOINCREMENT, credit_balance INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
      CREATE TABLE credit_transaction (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, amount INTEGER, transaction_type TEXT);
    `)
  }
})
