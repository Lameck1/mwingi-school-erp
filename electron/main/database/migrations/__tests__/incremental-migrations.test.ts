import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { up as migration1001 } from '../incremental/1001_journal_entry_bridge'
import { up as migration1002 } from '../incremental/1002_finance_schema_fixes'
import { up as migration1003 } from '../incremental/1003_budget_allocation'
import { up as migration1004 } from '../incremental/1004_enrollment_active_uniqueness'
import { up as migration1005 } from '../incremental/1005_journal_entry_type_expansion'
import { up as migration1006 } from '../incremental/1006_payment_invoice_allocation'
import { up as migration1007 } from '../incremental/1007_payment_idempotency_and_invoice_uniqueness'
import { up as migration1008 } from '../incremental/1008_attendance_and_reconciliation_uniqueness'
import { up as migration1009 } from '../incremental/1009_grant_expiry_date'
import { up as migration1010 } from '../incremental/1010_bank_reconciliation_constraints'
import { up as migration1011 } from '../incremental/1011_approval_canonicalization'

describe('incremental migrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
  })

  afterEach(() => {
    db.close()
  })

  it('1003 creates budget_allocation uniqueness with nullable department normalized', () => {
    db.exec(`
      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE
      );
    `)
    db.prepare(`INSERT INTO gl_account (account_code) VALUES ('5100')`).run()

    migration1003(db)

    db.prepare(`
      INSERT INTO budget_allocation (gl_account_code, fiscal_year, allocated_amount, department)
      VALUES ('5100', 2026, 100000, NULL)
    `).run()

    expect(() => {
      db.prepare(`
        INSERT INTO budget_allocation (gl_account_code, fiscal_year, allocated_amount, department)
        VALUES ('5100', 2026, 50000, NULL)
      `).run()
    }).toThrow()
  })

  it('1001 adds transaction_category.gl_account_code and backfills journal entries from ledger transactions', () => {
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
        entry_ref TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        description TEXT NOT NULL,
        created_by_user_id INTEGER NOT NULL
      );

      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );
    `)

    db.prepare(`INSERT INTO user (id) VALUES (1)`).run()
    db.prepare(`
      INSERT INTO gl_account (account_code)
      VALUES ('1010'), ('1020'), ('1100'), ('4300'), ('5900')
    `).run()
    db.prepare(`
      INSERT INTO transaction_category (id, category_name, category_type)
      VALUES (1, 'Other Income', 'INCOME')
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, amount, debit_credit,
        student_id, staff_id, term_id, payment_method, description, recorded_by_user_id, category_id, is_voided
      ) VALUES (
        10, 'TXN-001', '2026-01-05', 'INCOME', 25000, 'CREDIT',
        NULL, NULL, NULL, 'BANK_TRANSFER', 'Legacy income', 1, 1, 0
      )
    `).run()

    migration1001(db)

    const columns = db.prepare(`PRAGMA table_info(transaction_category)`).all() as Array<{ name: string }>
    expect(columns.some(c => c.name === 'gl_account_code')).toBe(true)

    const backfilled = db.prepare(`
      SELECT source_ledger_txn_id, entry_type
      FROM journal_entry
      WHERE source_ledger_txn_id = 10
    `).get() as { source_ledger_txn_id: number; entry_type: string } | undefined

    expect(backfilled?.source_ledger_txn_id).toBe(10)
    expect(backfilled?.entry_type).toBe('INCOME')
  })

  it('1002 updates ledger_transaction CHECK for INCOME and adds transaction_category.gl_account_code', () => {
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

    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        payment_method, recorded_by_user_id
      ) VALUES ('TXN-LEGACY', '2026-01-01', 'EXPENSE', 1, 1000, 'DEBIT', 'CASH', 1)
    `).run()

    migration1002(db)

    const categoryColumns = db.prepare(`PRAGMA table_info(transaction_category)`).all() as Array<{ name: string }>
    expect(categoryColumns.some(c => c.name === 'gl_account_code')).toBe(true)

    expect(() => {
      db.prepare(`
        INSERT INTO ledger_transaction (
          transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
          payment_method, recorded_by_user_id
        ) VALUES ('TXN-INCOME', '2026-01-02', 'INCOME', 1, 2000, 'CREDIT', 'BANK_TRANSFER', 1)
      `).run()
    }).not.toThrow()
  })

  it('1004 deactivates duplicate ACTIVE enrollment rows and enforces partial unique index', () => {
    db.exec(`
      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO enrollment (id, student_id, academic_year_id, term_id, status)
      VALUES
        (1, 10, 2026, 1, 'ACTIVE'),
        (2, 10, 2026, 1, 'ACTIVE'),
        (3, 10, 2026, 1, 'INACTIVE')
    `).run()

    migration1004(db)

    const activeCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM enrollment
      WHERE student_id = 10 AND academic_year_id = 2026 AND term_id = 1 AND status = 'ACTIVE'
    `).get() as { count: number }
    expect(activeCount.count).toBe(1)

    expect(() => {
      db.prepare(`
        INSERT INTO enrollment (student_id, academic_year_id, term_id, status)
        VALUES (10, 2026, 1, 'ACTIVE')
      `).run()
    }).toThrow()
  })

  it('1005 rebuilds journal_entry, preserves rows, and adds source_ledger_txn_id', () => {
    db.exec(`
      CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE student (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE staff (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE term (id INTEGER PRIMARY KEY AUTOINCREMENT);
      INSERT INTO user (id) VALUES (1);

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    db.prepare(`
      INSERT INTO journal_entry (
        entry_ref, entry_date, entry_type, description, created_by_user_id
      ) VALUES ('JE-001', '2026-01-01', 'FEE_PAYMENT', 'legacy row', 1)
    `).run()

    migration1005(db)

    const columns = db.prepare(`PRAGMA table_info(journal_entry)`).all() as Array<{ name: string }>
    expect(columns.some(c => c.name === 'source_ledger_txn_id')).toBe(true)

    const copied = db.prepare(`
      SELECT entry_ref, entry_type, created_by_user_id
      FROM journal_entry
      WHERE entry_ref = 'JE-001'
    `).get() as { entry_ref: string; entry_type: string; created_by_user_id: number } | undefined

    expect(copied?.entry_ref).toBe('JE-001')
    expect(copied?.entry_type).toBe('FEE_PAYMENT')
    expect(copied?.created_by_user_id).toBe(1)
  })

  it('1006 creates payment_invoice_allocation table and indexes', () => {
    db.exec(`
      CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY AUTOINCREMENT);
      INSERT INTO ledger_transaction (id) VALUES (1);
      INSERT INTO fee_invoice (id) VALUES (1);
    `)

    migration1006(db)

    db.prepare(`
      INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount)
      VALUES (1, 1, 2500)
    `).run()

    const row = db.prepare(`
      SELECT transaction_id, invoice_id, applied_amount
      FROM payment_invoice_allocation
      WHERE transaction_id = 1
    `).get() as { transaction_id: number; invoice_id: number; applied_amount: number } | undefined

    expect(row?.transaction_id).toBe(1)
    expect(row?.invoice_id).toBe(1)
    expect(row?.applied_amount).toBe(2500)
  })

  it('1007 adds idempotency key column and enforces unique active invoice per student/term', () => {
    db.exec(`
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        idempotency_key TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    db.prepare(`
      INSERT INTO fee_invoice (id, student_id, term_id, status)
      VALUES
        (1, 10, 1, 'PENDING'),
        (2, 10, 1, 'PARTIAL')
    `).run()

    migration1007(db)

    const activeCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM fee_invoice
      WHERE student_id = 10 AND term_id = 1 AND status != 'CANCELLED'
    `).get() as { count: number }

    expect(activeCount.count).toBe(1)

    db.prepare(`
      INSERT INTO ledger_transaction (transaction_ref, transaction_type, idempotency_key)
      VALUES ('TXN-1', 'FEE_PAYMENT', 'idem-key-1')
    `).run()

    expect(() => {
      db.prepare(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_type, idempotency_key)
        VALUES ('TXN-2', 'FEE_PAYMENT', 'idem-key-1')
      `).run()
    }).toThrow()
  })

  it('1008 enforces attendance uniqueness and one-to-one bank match uniqueness', () => {
    db.exec(`
      CREATE TABLE attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        attendance_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE bank_statement_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_matched INTEGER DEFAULT 0,
        matched_transaction_id INTEGER
      );
    `)

    db.prepare(`
      INSERT INTO attendance (student_id, academic_year_id, term_id, attendance_date)
      VALUES (4, 2026, 1, '2026-02-10'), (4, 2026, 1, '2026-02-10')
    `).run()
    db.prepare(`
      INSERT INTO bank_statement_line (is_matched, matched_transaction_id)
      VALUES (1, 99), (1, 99)
    `).run()

    migration1008(db)

    expect(() => {
      db.prepare(`
        INSERT INTO attendance (student_id, academic_year_id, term_id, attendance_date)
        VALUES (4, 2026, 1, '2026-02-10')
      `).run()
    }).toThrow()

    db.prepare(`
      INSERT INTO bank_statement_line (is_matched, matched_transaction_id)
      VALUES (0, NULL)
    `).run()
    expect(() => {
      db.prepare(`
        INSERT INTO bank_statement_line (is_matched, matched_transaction_id)
        VALUES (1, 99)
      `).run()
    }).toThrow()
  })

  it('1009 adds grant expiry_date and backfills from fiscal_year', () => {
    db.exec(`
      CREATE TABLE government_grant (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grant_name TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL
      );
    `)
    db.prepare(`INSERT INTO government_grant (grant_name, fiscal_year) VALUES ('Capitation', 2026)`).run()

    migration1009(db)

    const row = db.prepare(`
      SELECT expiry_date
      FROM government_grant
      WHERE grant_name = 'Capitation'
    `).get() as { expiry_date: string } | undefined

    expect(row?.expiry_date).toBe('2026-12-31')
  })

  it('1010 enforces bank account/statement uniqueness and statement-line integrity trigger', () => {
    db.exec(`
      CREATE TABLE bank_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_number TEXT NOT NULL
      );

      CREATE TABLE bank_statement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL,
        statement_date TEXT NOT NULL,
        statement_reference TEXT
      );

      CREATE TABLE bank_statement_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_statement_id INTEGER NOT NULL,
        transaction_date TEXT NOT NULL,
        description TEXT NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );
    `)

    db.prepare(`
      INSERT INTO bank_account (id, account_number)
      VALUES (1, '001122'), (2, '001122')
    `).run()
    db.prepare(`
      INSERT INTO bank_statement (id, bank_account_id, statement_date, statement_reference)
      VALUES
        (10, 1, '2026-02-01', 'REF-1'),
        (11, 1, '2026-02-01', 'REF-1')
    `).run()

    migration1010(db)

    expect(() => {
      db.prepare(`INSERT INTO bank_account (account_number) VALUES ('001122')`).run()
    }).toThrow()

    expect(() => {
      db.prepare(`
        INSERT INTO bank_statement (bank_account_id, statement_date, statement_reference)
        VALUES (1, '2026-02-01', 'REF-1')
      `).run()
    }).toThrow()

    expect(() => {
      db.prepare(`
        INSERT INTO bank_statement_line (bank_statement_id, transaction_date, description, debit_amount, credit_amount)
        VALUES (10, '2026-02-02', '', 100, 0)
      `).run()
    }).toThrow()
  })

  it('1011 backfills transaction approvals into approval_request canonical model', () => {
    db.exec(`
      CREATE TABLE approval_workflow (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_name TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL UNIQUE,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        current_step INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by_user_id INTEGER NOT NULL,
        final_approver_user_id INTEGER,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE approval_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        approval_request_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        action_by INTEGER NOT NULL,
        action_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        previous_status TEXT,
        new_status TEXT,
        notes TEXT
      );

      CREATE TABLE approval_rule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_name TEXT NOT NULL
      );

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT
      );

      CREATE TABLE transaction_approval (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        approval_rule_id INTEGER NOT NULL,
        requested_by_user_id INTEGER NOT NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'PENDING',
        reviewed_by_user_id INTEGER,
        reviewed_at DATETIME,
        review_notes TEXT
      );
    `)

    db.prepare(`INSERT INTO approval_rule (id, rule_name) VALUES (1, 'High Value Void')`).run()
    db.prepare(`INSERT INTO journal_entry (id) VALUES (100), (101)`).run()
    db.prepare(`
      INSERT INTO transaction_approval (
        id, journal_entry_id, approval_rule_id, requested_by_user_id, requested_at, status, reviewed_by_user_id, reviewed_at, review_notes
      ) VALUES
        (1, 100, 1, 9, '2026-02-01 10:00:00', 'PENDING', NULL, NULL, NULL),
        (2, 101, 1, 9, '2026-02-02 11:00:00', 'APPROVED', 7, '2026-02-03 08:00:00', 'Looks good')
    `).run()

    migration1011(db)

    const pending = db.prepare(`
      SELECT entity_type, entity_id, status, legacy_transaction_approval_id
      FROM approval_request
      WHERE legacy_transaction_approval_id = 1
    `).get() as { entity_type: string; entity_id: number; status: string; legacy_transaction_approval_id: number } | undefined
    expect(pending?.entity_type).toBe('JOURNAL_ENTRY')
    expect(pending?.entity_id).toBe(100)
    expect(pending?.status).toBe('PENDING')
    expect(pending?.legacy_transaction_approval_id).toBe(1)

    const approvedHistory = db.prepare(`
      SELECT COUNT(*) as count
      FROM approval_history ah
      JOIN approval_request ar ON ar.id = ah.approval_request_id
      WHERE ar.legacy_transaction_approval_id = 2
        AND ah.action = 'APPROVED'
    `).get() as { count: number }
    expect(approvedHistory.count).toBe(1)

    expect(() => {
      db.prepare(`
        INSERT INTO approval_request (
          workflow_id, entity_type, entity_id, status, requested_by_user_id
        ) VALUES (
          (SELECT id FROM approval_workflow WHERE entity_type = 'JOURNAL_ENTRY' LIMIT 1),
          'JOURNAL_ENTRY',
          100,
          'PENDING',
          2
        )
      `).run()
    }).toThrow()
  })
})
