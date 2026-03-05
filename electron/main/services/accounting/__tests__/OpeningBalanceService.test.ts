import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OpeningBalanceService } from '../OpeningBalanceService'

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('OpeningBalanceService.getStudentLedger', () => {
  let db: Database.Database
  let service: OpeningBalanceService

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
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
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
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
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
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        credit_balance INTEGER DEFAULT 0
      );

      CREATE TABLE opening_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        student_id INTEGER,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT,
        student_id INTEGER NOT NULL,
        invoice_date TEXT,
        due_date TEXT,
        total_amount INTEGER,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT,
        description TEXT,
        created_at TEXT
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT,
        transaction_date TEXT,
        transaction_type TEXT,
        amount INTEGER,
        debit_credit TEXT,
        student_id INTEGER,
        payment_reference TEXT,
        description TEXT,
        is_voided INTEGER DEFAULT 0,
        created_at TEXT
      );

      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT,
        transaction_id INTEGER,
        receipt_date TEXT,
        student_id INTEGER,
        amount INTEGER,
        created_at TEXT
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)

    service = new OpeningBalanceService(db)
  })

  afterEach(() => {
    db.close()
  })

  it('uses legacy fee invoice amount columns when total_amount is missing/zero', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (1, 'MAS-2026', 'Sarah', 'Ochieng', 0)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-LEGACY', 1, '2026-02-15', '2026-02-25',
        0, 1700000, 1700000, 0, 'pending', 'Term invoice', '2026-02-15T09:00:00.000Z'
      )
    `).run()

    const ledger = await service.getStudentLedger(1, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.opening_balance).toBe(0)
    expect(ledger.closing_balance).toBe(1700000)
    expect(ledger.transactions).toHaveLength(1)
    expect(ledger.transactions[0]).toMatchObject({
      ref: 'INV-LEGACY',
      debit: 1700000,
      credit: 0
    })
  })

  it('treats lowercase ledger debit_credit values as valid and computes overpayment correctly', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (2, '2026/002', 'Grace', 'Mutua', 150000)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-GRACE', 2, '2026-01-05', '2026-02-05',
        700000, 700000, 700000, 700000, 'PAID', 'Fee invoice for student', '2026-01-05T08:00:00.000Z'
      )
    `).run()

    db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id,
        payment_reference, description, is_voided, created_at
      ) VALUES (
        'PAY-GRACE-001', '2026-01-10', 'fee_payment', 850000, 'credit', 2,
        'MPESA-REF-1', 'Term fee payment', 0, '2026-01-10T08:00:00.000Z'
      )
    `).run()

    const ledger = await service.getStudentLedger(2, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.transactions).toHaveLength(2)
    expect(ledger.transactions[0]).toMatchObject({ debit: 700000, credit: 0 })
    expect(ledger.transactions[1]).toMatchObject({ debit: 0, credit: 850000, ref: 'MPESA-REF-1' })
    expect(ledger.closing_balance).toBe(-150000)
  })

  it('includes payment transactions resolved from receipt student linkage when ledger student_id is missing', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (4, '2026/004', 'Grace', 'ReceiptFix', 150000)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-GRACE-R', 4, '2026-01-05', '2026-02-05',
        700000, 700000, 700000, 700000, 'PAID', 'Fee invoice for student', '2026-01-05T08:00:00.000Z'
      )
    `).run()

    const paymentInsert = db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, amount, debit_credit, student_id,
        payment_reference, description, is_voided, created_at
      ) VALUES (
        'PAY-GRACE-RECEIPT', '2026-01-10', 'FEE_PAYMENT', 850000, 'CREDIT', NULL,
        '', 'Term fee payment', 0, '2026-01-10T08:00:00.000Z'
      )
    `)
    const paymentResult = paymentInsert.run()

    db.prepare(`
      INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, created_at)
      VALUES ('RCP-GRACE-1', ?, '2026-01-10', 4, 850000, '2026-01-10T08:01:00.000Z')
    `).run(paymentResult.lastInsertRowid)

    const ledger = await service.getStudentLedger(4, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.transactions).toHaveLength(2)
    expect(ledger.transactions[0]).toMatchObject({ debit: 700000, credit: 0 })
    expect(ledger.transactions[1]).toMatchObject({ debit: 0, credit: 850000, ref: 'RCP-GRACE-1' })
    expect(ledger.closing_balance).toBe(-150000)
  })

  it('includes manual credit adjustments and excludes internal overpayment/void-generated credit rows', async () => {
    db.prepare(`
      INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
      VALUES (3, '2026/003', 'Manual', 'Credit', 0)
    `).run()

    db.prepare(`
      INSERT INTO fee_invoice (
        invoice_number, student_id, invoice_date, due_date,
        total_amount, amount, amount_due, amount_paid, status, description, created_at
      ) VALUES (
        'INV-MANUAL', 3, '2026-01-05', '2026-02-05',
        700000, 700000, 700000, 0, 'PENDING', 'Fee invoice for student', '2026-01-05T08:00:00.000Z'
      )
    `).run()

    const insertCredit = db.prepare(`
      INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    insertCredit.run(3, 150000, 'CREDIT_RECEIVED', 'Manual credit adjustment', '2026-01-06T08:00:00.000Z')
    insertCredit.run(3, 200000, 'CREDIT_RECEIVED', 'Overpayment from transaction #44', '2026-01-06T09:00:00.000Z')
    insertCredit.run(3, 50000, 'CREDIT_REFUNDED', 'Manual credit reversal', '2026-01-07T08:00:00.000Z')
    insertCredit.run(3, 10000, 'CREDIT_REFUNDED', 'Void reversal of transaction #77', '2026-01-07T09:00:00.000Z')

    const ledger = await service.getStudentLedger(3, 2026, '1900-01-01', '2999-12-31')

    expect(ledger.transactions).toHaveLength(3)
    expect(ledger.transactions.map((item) => item.description)).toEqual([
      'Fee invoice for student',
      'Manual credit adjustment',
      'Manual credit reversal'
    ])
    expect(ledger.closing_balance).toBe(600000)
  })
})

describe('OpeningBalanceService import and verification', () => {
  let db: Database.Database
  let service: OpeningBalanceService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        normal_balance TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('3020', 'Retained Earnings', 'EQUITY', 'CREDIT');
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');

      CREATE TABLE IF NOT EXISTS journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_ref TEXT NOT NULL UNIQUE,
        entry_date DATE NOT NULL,
        entry_type TEXT NOT NULL,
        description TEXT NOT NULL,
        student_id INTEGER,
        staff_id INTEGER,
        term_id INTEGER,
        is_posted BOOLEAN DEFAULT 0,
        is_voided BOOLEAN DEFAULT 0,
        requires_approval BOOLEAN DEFAULT 0,
        approval_status TEXT DEFAULT 'PENDING',
        created_by_user_id INTEGER NOT NULL,
        source_ledger_txn_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS approval_rule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_name TEXT NOT NULL UNIQUE,
        description TEXT,
        transaction_type TEXT NOT NULL,
        min_amount INTEGER,
        is_active BOOLEAN DEFAULT 1,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        credit_balance INTEGER DEFAULT 0
      );

      CREATE TABLE opening_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        student_id INTEGER,
        gl_account_id INTEGER,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        description TEXT,
        imported_from TEXT,
        imported_by_user_id INTEGER,
        is_verified INTEGER DEFAULT 0,
        verified_by_user_id INTEGER,
        verified_at TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT,
        student_id INTEGER NOT NULL,
        invoice_date TEXT,
        due_date TEXT,
        total_amount INTEGER,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT,
        description TEXT,
        created_at TEXT
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT,
        transaction_date TEXT,
        transaction_type TEXT,
        amount INTEGER,
        debit_credit TEXT,
        student_id INTEGER,
        payment_reference TEXT,
        description TEXT,
        is_voided INTEGER DEFAULT 0,
        created_at TEXT
      );

      INSERT INTO student (id, admission_number, first_name, last_name) VALUES (1, 'ADM-001', 'Alice', 'Smith');
      INSERT INTO student (id, admission_number, first_name, last_name) VALUES (2, 'ADM-002', 'Bob', 'Jones');
    `)

    service = new OpeningBalanceService(db)
  })

  afterEach(() => { db.close() })

  it('importStudentOpeningBalances creates records and journal entries for DEBIT balances', async () => {
    const result = await service.importStudentOpeningBalances(
      [
        { student_id: 1, admission_number: 'ADM-001', student_name: 'Alice Smith', opening_balance: 50000, balance_type: 'DEBIT' }
      ],
      2026,
      'MIGRATION',
      99
    )
    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(1)

    const ob = db.prepare('SELECT * FROM opening_balance WHERE student_id = 1').get() as any
    expect(ob.debit_amount).toBe(50000)
    expect(ob.credit_amount).toBe(0)
  })

  it('importStudentOpeningBalances creates CREDIT journal entry for CREDIT balance', async () => {
    const result = await service.importStudentOpeningBalances(
      [
        { student_id: 2, admission_number: 'ADM-002', student_name: 'Bob Jones', opening_balance: 30000, balance_type: 'CREDIT' }
      ],
      2026,
      'MIGRATION',
      99
    )
    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(1)

    const ob = db.prepare('SELECT * FROM opening_balance WHERE student_id = 2').get() as any
    expect(ob.debit_amount).toBe(0)
    expect(ob.credit_amount).toBe(30000)
  })

  it('importStudentOpeningBalances skips journal entry for zero balance', async () => {
    const result = await service.importStudentOpeningBalances(
      [
        { student_id: 1, admission_number: 'ADM-001', student_name: 'Alice Smith', opening_balance: 0, balance_type: 'DEBIT' }
      ],
      2026,
      'MIGRATION',
      99
    )
    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(1)

    const journals = db.prepare('SELECT * FROM journal_entry WHERE entry_type = ?').all('OPENING_BALANCE')
    expect(journals).toHaveLength(0)
  })

  it('importGLOpeningBalances creates records and journals', async () => {
    const result = await service.importGLOpeningBalances(
      [
        {
          academic_year_id: 2026,
          gl_account_code: '1100',
          debit_amount: 100000,
          credit_amount: 0,
          description: 'Opening AR',
          imported_from: 'SAGE',
          imported_by_user_id: 99
        }
      ],
      99
    )
    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(1)
  })

  it('importGLOpeningBalances fails for invalid GL account', async () => {
    const result = await service.importGLOpeningBalances(
      [
        {
          academic_year_id: 2026,
          gl_account_code: '9999',
          debit_amount: 100000,
          credit_amount: 0,
          description: 'Bad account',
          imported_from: 'SAGE',
          imported_by_user_id: 99
        }
      ],
      99
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('Invalid GL account code')
  })

  it('verifyOpeningBalances returns balanced when debits equal credits', async () => {
    db.prepare(`INSERT INTO opening_balance (academic_year_id, debit_amount, credit_amount) VALUES (2026, 50000, 50000)`).run()
    const result = await service.verifyOpeningBalances(2026, 99)
    expect(result.success).toBe(true)
    expect(result.is_balanced).toBe(true)
    expect(result.variance).toBe(0)

    const verified = db.prepare('SELECT is_verified FROM opening_balance WHERE academic_year_id = 2026').get() as any
    expect(verified.is_verified).toBe(1)
  })

  it('verifyOpeningBalances returns unbalanced when debits differ from credits', async () => {
    db.prepare(`INSERT INTO opening_balance (academic_year_id, debit_amount, credit_amount) VALUES (2026, 50000, 30000)`).run()
    const result = await service.verifyOpeningBalances(2026, 99)
    expect(result.success).toBe(false)
    expect(result.is_balanced).toBe(false)
    expect(result.variance).toBe(20000)
    expect(result.message).toContain('OUT OF BALANCE')
  })

  it('getOpeningBalanceSummary returns grouped data', async () => {
    db.prepare(`INSERT INTO opening_balance (academic_year_id, gl_account_id, debit_amount, credit_amount) VALUES (2026, 1, 50000, 0)`).run()
    const summary = await service.getOpeningBalanceSummary(2026)
    expect(summary.length).toBeGreaterThanOrEqual(1)
    expect(summary[0].account_code).toBe('1100')
    expect(summary[0].total_debit).toBe(50000)
    expect(summary[0].net_balance).toBe(50000)
  })

  it('getStudentLedger throws for non-existent student', async () => {
    await expect(service.getStudentLedger(999, 2026, '2026-01-01', '2026-12-31')).rejects.toThrow('Student not found')
  })

  it('columnExists returns false for non-existent table', () => {
    // Access internal method via casting to test tableExists/columnExists caching
    const svc = service as any
    const result = svc.columnExists('nonexistent_table_xyz', 'some_column')
    expect(result).toBe(false)
  })

  it('tableExists caches results on repeated calls', () => {
    const svc = service as any
    // First call resolves against sqlite_master
    const first = svc.tableExists('student')
    // Second call should hit cache
    const second = svc.tableExists('student')
    expect(first).toBe(true)
    expect(second).toBe(true)
    // Non-existent table
    expect(svc.tableExists('no_such_table_abc')).toBe(false)
  })

  it('getInvoiceAmountExpression returns 0 when fee_invoice has no recognized amount columns', () => {
    // Drop and recreate fee_invoice without amount columns
    db.exec('DROP TABLE IF EXISTS fee_invoice')
    db.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL, status TEXT)')
    const svc = new OpeningBalanceService(db) as any
    const expr = svc.getInvoiceAmountExpression('fi')
    expect(expr).toBe('0')
  })

  it('getInvoiceDateExpression falls back to DATE(now) when no date columns exist', () => {
    db.exec('DROP TABLE IF EXISTS fee_invoice')
    db.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL, amount INTEGER)')
    const svc = new OpeningBalanceService(db) as any
    const expr = svc.getInvoiceDateExpression('fi')
    expect(expr).toContain("DATE('now')")
  })

  // ── Branch coverage: date expression fallbacks ──────────────────
  it('getLedgerDateExpression returns DATE(now) when ledger_transaction has no date columns', () => {
    db.exec('DROP TABLE IF EXISTS ledger_transaction')
    db.exec('CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL, amount INTEGER)')
    const svc = new OpeningBalanceService(db) as any
    const expr = svc.getLedgerDateExpression('lt')
    expect(expr).toBe("DATE('now')")
  })

  it('getReceiptDateExpression returns DATE(now) when receipt has no date columns', () => {
    db.exec('DROP TABLE IF EXISTS receipt')
    db.exec('CREATE TABLE receipt (id INTEGER PRIMARY KEY, receipt_number TEXT, amount INTEGER)')
    const svc = new OpeningBalanceService(db) as any
    const expr = svc.getReceiptDateExpression('r')
    expect(expr).toBe("DATE('now')")
  })

  it('getCreditDateExpression returns DATE(now) when credit_transaction has no created_at', () => {
    db.exec('DROP TABLE IF EXISTS credit_transaction')
    db.exec('CREATE TABLE credit_transaction (id INTEGER PRIMARY KEY, student_id INTEGER, amount INTEGER)')
    const svc = new OpeningBalanceService(db) as any
    const expr = svc.getCreditDateExpression('ct')
    expect(expr).toBe("DATE('now')")
  })

  it('getLedgerCreatedAtExpression falls back to date concatenation when created_at missing', () => {
    db.exec('DROP TABLE IF EXISTS ledger_transaction')
    db.exec('CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL, transaction_date TEXT)')
    const svc = new OpeningBalanceService(db) as any
    const ledgerDate = svc.getLedgerDateExpression('lt')
    const expr = svc.getLedgerCreatedAtExpression('lt', ledgerDate)
    expect(expr).toContain("T00:00:00.000Z")
  })

  it('getReceiptCreatedAtExpression falls back to date concatenation when created_at missing', () => {
    db.exec('DROP TABLE IF EXISTS receipt')
    db.exec('CREATE TABLE receipt (id INTEGER PRIMARY KEY, receipt_number TEXT, receipt_date TEXT)')
    const svc = new OpeningBalanceService(db) as any
    const receiptDate = svc.getReceiptDateExpression('r')
    const expr = svc.getReceiptCreatedAtExpression('r', receiptDate)
    expect(expr).toContain("T00:00:00.000Z")
  })

  // ── branch coverage: columnExists returns cached result on second call ──
  it('columnExists returns consistent cached result on repeated calls', () => {
    const svc = new OpeningBalanceService(db) as any
    const result1 = svc.columnExists('fee_invoice', 'total_amount')
    const result2 = svc.columnExists('fee_invoice', 'total_amount')
    expect(result1).toBe(result2)
    expect(typeof result1).toBe('boolean')
  })

  // ── branch coverage: tableExists returns false for missing table ──
  it('tableExists returns false for non-existent table then true after creation', () => {
    const svc = new OpeningBalanceService(db) as any
    expect(svc.tableExists('nonexistent_xyz')).toBe(false)
    db.exec('CREATE TABLE nonexistent_xyz (id INTEGER PRIMARY KEY)')
    // Cache should still return false since it was cached
    // Create new service to bypass cache
    const svc2 = new OpeningBalanceService(db) as any
    expect(svc2.tableExists('nonexistent_xyz')).toBe(true)
  })

  // ── branch coverage: getInvoiceAmountExpression with no recognized columns ──
  it('getInvoiceAmountExpression returns 0 when no recognized columns exist', () => {
    // Create a fee_invoice table with only id column (no amount columns)
    const testDb = new (require('better-sqlite3'))(':memory:')
    testDb.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, status TEXT)')
    const svc = new OpeningBalanceService(testDb) as any
    const expr = svc.getInvoiceAmountExpression('fi')
    expect(expr).toBe('0')
    testDb.close()
  })

  // ── branch coverage: getInvoiceDateExpression with only created_at ──
  it('getInvoiceDateExpression uses created_at when invoice_date is absent', () => {
    const testDb = new (require('better-sqlite3'))(':memory:')
    testDb.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, created_at DATETIME, student_id INTEGER)')
    const svc = new OpeningBalanceService(testDb) as any
    const expr = svc.getInvoiceDateExpression('fi')
    expect(expr).toContain('created_at')
    testDb.close()
  })

  // ── branch coverage: getInvoiceDateExpression with only due_date ──
  it('getInvoiceDateExpression uses due_date when others absent', () => {
    const testDb = new (require('better-sqlite3'))(':memory:')
    testDb.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, due_date TEXT, student_id INTEGER)')
    const svc = new OpeningBalanceService(testDb) as any
    const expr = svc.getInvoiceDateExpression('fi')
    expect(expr).toContain('due_date')
    testDb.close()
  })

  // ── branch coverage: getInvoiceDateExpression with no date columns ──
  it('getInvoiceDateExpression falls back to DATE(now) when no date columns', () => {
    const testDb = new (require('better-sqlite3'))(':memory:')
    testDb.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER)')
    const svc = new OpeningBalanceService(testDb) as any
    const expr = svc.getInvoiceDateExpression('fi')
    expect(expr).toContain("DATE('now')")
    testDb.close()
  })

  // ── branch coverage: columnExists returns cached false for nonexistent table column ──
  it('columnExists returns false for column on nonexistent table', () => {
    const svc = new OpeningBalanceService(db) as any
    expect(svc.columnExists('nonexistent_table_abc', 'some_col')).toBe(false)
    // Second call should hit cache
    expect(svc.columnExists('nonexistent_table_abc', 'some_col')).toBe(false)
  })

  // ── branch coverage: getExternalCreditFilter generates correct SQL ──
  it('getExternalCreditFilter returns non-empty SQL predicate', () => {
    const svc = new OpeningBalanceService(db) as any
    const filter = svc.getExternalCreditFilter('ct')
    expect(filter).toContain('CREDIT_RECEIVED')
    expect(filter).toContain('CREDIT_REFUNDED')
  })

  // ── branch coverage: getStudentLedger WITHOUT receipt/credit_transaction tables ──
  // Covers the "false" side of many ternaries: L456, L457, L459, L463-465, L499, L521, L546-547, L593, L599
  it('getStudentLedger works without receipt and credit_transaction tables', async () => {
    const minimalDb = new (require('better-sqlite3'))(':memory:')
    minimalDb.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY, admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL, last_name TEXT NOT NULL, credit_balance INTEGER DEFAULT 0
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT,
        student_id INTEGER NOT NULL, invoice_date TEXT, total_amount INTEGER,
        amount INTEGER, amount_due INTEGER, amount_paid INTEGER DEFAULT 0,
        status TEXT, description TEXT, created_at TEXT
      );
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_ref TEXT,
        transaction_date TEXT, transaction_type TEXT, amount INTEGER,
        debit_credit TEXT, student_id INTEGER, payment_reference TEXT,
        description TEXT, is_voided INTEGER DEFAULT 0, created_at TEXT
      );
      CREATE TABLE opening_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL,
        student_id INTEGER, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0
      );
      INSERT INTO student (id, admission_number, first_name, last_name) VALUES (1, 'MIN-001', 'Min', 'Student');
    `)
    const svc = new OpeningBalanceService(minimalDb)
    const ledger = await svc.getStudentLedger(1, 2026, '1900-01-01', '2999-12-31')
    expect(ledger.student.admission_number).toBe('MIN-001')
    expect(ledger.opening_balance).toBe(0)
    expect(ledger.closing_balance).toBe(0)
    minimalDb.close()
  })

  // ── Branch coverage: columnExists – table does not exist (L72-74) ──
  it('columnExists returns false when table does not exist', () => {
    const minimalDb2 = new (require('better-sqlite3'))(':memory:')
    const svc2 = new OpeningBalanceService(minimalDb2)
    const fn = (svc2 as any).columnExists.bind(svc2)
    expect(fn('nonexistent_table', 'some_column')).toBe(false)
    minimalDb2.close()
  })

  // ── Branch coverage: getInvoiceAmountExpression – no candidates (L97) ──
  it('getInvoiceAmountExpression returns "0" when fee_invoice has no amount columns', () => {
    const bareDb = new (require('better-sqlite3'))(':memory:')
    bareDb.exec(`
      CREATE TABLE student (id INTEGER PRIMARY KEY, admission_number TEXT, first_name TEXT, last_name TEXT, credit_balance INTEGER DEFAULT 0);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, invoice_number TEXT, status TEXT);
      CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT, transaction_date TEXT, transaction_type TEXT, amount INTEGER, debit_credit TEXT, student_id INTEGER, description TEXT, is_voided INTEGER DEFAULT 0, created_at TEXT);
    `)
    const svc3 = new OpeningBalanceService(bareDb)
    const fn = (svc3 as any).getInvoiceAmountExpression.bind(svc3)
    expect(fn('fi')).toBe('0')
    bareDb.close()
  })

  // ── Branch coverage: createOpeningBalanceJournalEntry – CREDIT balance type (L276) ──
  it('createOpeningBalanceJournalEntry creates credit journal for CREDIT balance type', () => {
    const fn = (service as any).createOpeningBalanceJournalEntry.bind(service)
    // Should not throw; creates a credit-side journal entry
    expect(() => fn({
      student_id: 1,
      admission_number: 'STU-001',
      student_name: 'Test Student',
      opening_balance: 5000,
      balance_type: 'CREDIT'
    }, 1)).not.toThrow()
  })

  // ── Branch coverage: createOpeningBalanceJournalEntry – balance <= 0 (L258) ──
  it('createOpeningBalanceJournalEntry no-ops when balance is zero', () => {
    const fn = (service as any).createOpeningBalanceJournalEntry.bind(service)
    expect(() => fn({
      student_id: 1,
      admission_number: 'STU-001',
      student_name: 'Test Student',
      opening_balance: 0,
      balance_type: 'DEBIT'
    }, 1)).not.toThrow()
  })

  // ── Branch coverage: verifyOpeningBalances – unbalanced case ──
  it('verifyOpeningBalances detects unbalanced opening balances', async () => {
    // Insert unbalanced opening balances (debit != credit)
    db.exec(`INSERT INTO opening_balance (academic_year_id, student_id, debit_amount, credit_amount)
      VALUES (2026, 1, 50000, 0)`)
    const result = await service.verifyOpeningBalances(2026, 1)
    expect(result.is_balanced).toBe(false)
    expect(result.message).toContain('OUT OF BALANCE')
    expect(result.variance).toBe(50000)
  })

  // ── Branch coverage: importGLOpeningBalances – invalid GL account ──
  it('importGLOpeningBalances rejects invalid GL account code', async () => {
    const result = await service.importGLOpeningBalances([{
      academic_year_id: 2026,
      gl_account_code: 'NONEXISTENT',
      debit_amount: 1000,
      credit_amount: 0,
      description: 'Test',
      imported_from: 'test',
      imported_by_user_id: 1
    }], 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Invalid GL account code')
  })

  // ── Branch coverage: importGLOpeningBalances – debit and credit both zero ──
  it('importGLOpeningBalances skips journal when both amounts are zero', async () => {
    const result = await service.importGLOpeningBalances([{
      academic_year_id: 2026,
      gl_account_code: '1100',
      debit_amount: 0,
      credit_amount: 0,
      description: 'Zero balance',
      imported_from: 'test',
      imported_by_user_id: 1
    }], 1)
    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(1)
  })

  // ── Branch coverage: importStudentOpeningBalances – error path ──
  it('importStudentOpeningBalances returns error on failure', async () => {
    // Close DB to trigger error
    const brokenDb = new (require('better-sqlite3'))(':memory:')
    const svc = new OpeningBalanceService(brokenDb)
    brokenDb.close()
    const result = await svc.importStudentOpeningBalances([{
      student_id: 1,
      admission_number: 'STU-001',
      student_name: 'Test',
      opening_balance: 5000,
      balance_type: 'DEBIT'
    }], 2026, 'test', 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to import')
  })

  // ── Branch coverage: getLedgerDateExpression – no candidates → DATE('now') ──
  it('getLedgerDateExpression returns DATE(now) for table without date columns', () => {
    const bareDb = new (require('better-sqlite3'))(':memory:')
    bareDb.exec(`
      CREATE TABLE student (id INTEGER PRIMARY KEY, admission_number TEXT, first_name TEXT, last_name TEXT, credit_balance INTEGER DEFAULT 0);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, invoice_number TEXT, status TEXT);
      CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT, transaction_type TEXT, amount INTEGER, debit_credit TEXT, student_id INTEGER, description TEXT, is_voided INTEGER DEFAULT 0);
    `)
    const svc = new OpeningBalanceService(bareDb)
    const fn = (svc as any).getLedgerDateExpression.bind(svc)
    expect(fn('lt')).toBe("DATE('now')")
    bareDb.close()
  })

  // ── Branch coverage: getInvoiceDateExpression – no candidates → DATE('now') ──
  it('getInvoiceDateExpression returns DATE(now) for fee_invoice without date columns', () => {
    const bareDb = new (require('better-sqlite3'))(':memory:')
    bareDb.exec(`
      CREATE TABLE student (id INTEGER PRIMARY KEY, admission_number TEXT, first_name TEXT, last_name TEXT, credit_balance INTEGER DEFAULT 0);
      CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, invoice_number TEXT, status TEXT);
      CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT, transaction_date TEXT, transaction_type TEXT, amount INTEGER, debit_credit TEXT, student_id INTEGER, description TEXT, is_voided INTEGER DEFAULT 0, created_at TEXT);
    `)
    const svc = new OpeningBalanceService(bareDb)
    const fn = (svc as any).getInvoiceDateExpression.bind(svc)
    expect(fn('fi')).toBe("DATE('now')")
    bareDb.close()
  })

  // ── Branch coverage: getReceiptDateExpression – no receipt table → DATE('now') ──
  it('getReceiptDateExpression returns DATE(now) when receipt table has no date columns', () => {
    const bareDb = new (require('better-sqlite3'))(':memory:')
    bareDb.exec(`
      CREATE TABLE receipt (id INTEGER PRIMARY KEY, receipt_number TEXT, transaction_id INTEGER, student_id INTEGER, amount INTEGER);
    `)
    const svc = new OpeningBalanceService(bareDb)
    const fn = (svc as any).getReceiptDateExpression.bind(svc)
    expect(fn('r')).toBe("DATE('now')")
    bareDb.close()
  })

  // ── Branch coverage: getCreditDateExpression – no credit_transaction table → DATE('now') ──
  it('getCreditDateExpression returns DATE(now) when credit_transaction has no date columns', () => {
    const bareDb = new (require('better-sqlite3'))(':memory:')
    bareDb.exec(`
      CREATE TABLE credit_transaction (id INTEGER PRIMARY KEY, student_id INTEGER, amount INTEGER, transaction_type TEXT, notes TEXT);
    `)
    const svc = new OpeningBalanceService(bareDb)
    const fn = (svc as any).getCreditDateExpression.bind(svc)
    expect(fn('ct')).toBe("DATE('now')")
    bareDb.close()
  })

  // ── Branch coverage: tableExists – cache hit ──
  it('tableExists returns cached value on second call', () => {
    const fn = (service as any).tableExists.bind(service)
    const first = fn('student')
    const second = fn('student')
    expect(first).toBe(second)
    expect(first).toBe(true)
  })

  // ── Branch: importGLOpeningBalances – credit_amount > 0 only (debit=0) ──
  it('importGLOpeningBalances creates journal when only credit_amount is positive', async () => {
    const result = await service.importGLOpeningBalances([{
      academic_year_id: 2026,
      gl_account_code: '1100',
      debit_amount: 0,
      credit_amount: 75000,
      description: 'Credit-only opening balance',
      imported_from: 'MIGRATION',
      imported_by_user_id: 99
    }], 99)
    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(1)
    // Verify opening balance record was created with credit amount
    const ob = db.prepare('SELECT * FROM opening_balance WHERE academic_year_id = 2026').get() as any
    expect(ob.debit_amount).toBe(0)
    expect(ob.credit_amount).toBe(75000)
  })
})
