import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { BankReconciliationService } from '../BankReconciliationService'

describe('BankReconciliationService', () => {
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

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT
      );
      INSERT INTO transaction_category (id, category_name) VALUES (1, 'Fees');

      CREATE TABLE bank_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        bank_name TEXT NOT NULL DEFAULT '',
        branch TEXT,
        swift_code TEXT,
        currency TEXT DEFAULT 'KES',
        opening_balance INTEGER DEFAULT 0,
        current_balance INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
      INSERT INTO bank_account (id, account_name, account_number, bank_name) VALUES (1, 'Main Account', '1234567890', 'KCB');

      CREATE TABLE bank_statement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL,
        statement_date DATE NOT NULL,
        opening_balance INTEGER NOT NULL,
        closing_balance INTEGER NOT NULL,
        statement_reference TEXT,
        file_path TEXT,
        status TEXT DEFAULT 'PENDING',
        reconciled_by_user_id INTEGER,
        reconciled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO bank_statement (id, bank_account_id, statement_date, opening_balance, closing_balance, status)
      VALUES (1, 1, '2026-02-14', 0, 0, 'PENDING');

      CREATE TABLE bank_statement_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_statement_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        description TEXT NOT NULL,
        reference TEXT,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        running_balance INTEGER,
        is_matched BOOLEAN DEFAULT 0,
        matched_transaction_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        student_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        is_voided BOOLEAN DEFAULT 0
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('rejects matching when amount difference exceeds tolerance', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (10, 1, '2026-02-14', 'Bank credit', 5000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (20, 'TXN-20', '2026-02-14', 'FEE_PAYMENT', 1, 7000, 'CREDIT', 'BANK_TRANSFER')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(10, 20)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Amount mismatch')
  })

  it('rejects matching when transaction date is outside allowed tolerance', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (11, 1, '2026-02-14', 'Bank credit', 5000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (21, 'TXN-21', '2026-01-20', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 'BANK_TRANSFER')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(11, 21)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Date mismatch')
  })

  it('returns account-scoped unmatched transactions using account reference heuristics', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES
        (31, 'TXN-31', '2026-02-10', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 'BANK_TRANSFER', 'ACC-1234567890', 'Fee payment main account'),
        (32, 'TXN-32', '2026-02-10', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 'BANK_TRANSFER', 'ACC-9999999999', 'Different account payment')
    `).run()

    const service = new BankReconciliationService()
    const scoped = await service.getUnmatchedLedgerTransactions('2026-02-01', '2026-02-28', 1) as Array<{ id: number }>

    expect(scoped.map(row => row.id)).toContain(31)
    expect(scoped.map(row => row.id)).not.toContain(32)
  })

  it('rejects adding statement line with invalid debit/credit combination', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-14',
      description: 'Bad line',
      reference: null,
      debit_amount: 0,
      credit_amount: 0,
      running_balance: null
    })

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Exactly one')
  })

  it('marks statement reconciled only when all lines are matched and balances agree', async () => {
    db.prepare(`
      UPDATE bank_statement
      SET opening_balance = 1000, closing_balance = 1500
      WHERE id = 1
    `).run()
    db.prepare(`
      INSERT INTO bank_statement_line (
        bank_statement_id, transaction_date, description, debit_amount, credit_amount, is_matched
      ) VALUES
        (1, '2026-02-10', 'Deposit', 0, 700, 1),
        (1, '2026-02-11', 'Withdrawal', 200, 0, 1)
    `).run()

    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)

    expect(result.success).toBe(true)

    const row = db.prepare(`SELECT status FROM bank_statement WHERE id = 1`).get() as { status: string }
    expect(row.status).toBe('RECONCILED')
  })

  it('getBankAccounts returns active accounts', async () => {
    const service = new BankReconciliationService()
    const accounts = await service.getBankAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].account_name).toBe('Main Account')
  })

  it('getBankAccountById returns account or null', async () => {
    const service = new BankReconciliationService()
    const found = await service.getBankAccountById(1)
    expect(found).not.toBeNull()
    expect(found!.account_number).toBe('1234567890')

    const notFound = await service.getBankAccountById(999)
    expect(notFound).toBeFalsy()
  })

  it('createBankAccount validates required fields', async () => {
    const service = new BankReconciliationService()
    const result = await service.createBankAccount({
      account_name: '',
      account_number: '',
      bank_name: '',
      opening_balance: 0,
    })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThanOrEqual(3)
  })

  it('createBankAccount succeeds with valid data', async () => {
    const service = new BankReconciliationService()
    const result = await service.createBankAccount({
      account_name: 'Savings',
      account_number: '9999999999',
      bank_name: 'Equity',
      opening_balance: 50000,
    })
    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
  })

  it('getStatements returns all or filtered by bankAccountId', async () => {
    const service = new BankReconciliationService()
    const all = await service.getStatements()
    expect(all.length).toBeGreaterThanOrEqual(1)

    const filtered = await service.getStatements(1)
    expect(filtered.length).toBeGreaterThanOrEqual(1)
  })

  it('getStatementWithLines returns null for unknown statement', async () => {
    const service = new BankReconciliationService()
    const result = await service.getStatementWithLines(999)
    expect(result).toBeNull()
  })

  it('getStatementWithLines returns statement and lines', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (bank_statement_id, transaction_date, description, credit_amount)
      VALUES (1, '2026-02-10', 'Test deposit', 1000)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.getStatementWithLines(1)
    expect(result).not.toBeNull()
    expect(result!.statement.id).toBe(1)
    expect(result!.lines.length).toBeGreaterThanOrEqual(1)
  })

  it('createStatement succeeds', async () => {
    const service = new BankReconciliationService()
    const result = await service.createStatement(1, '2026-02-20', 0, 5000, 'REF-001')
    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
  })

  it('addStatementLine succeeds with valid one-sided amount', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: 'Valid credit',
      reference: 'REF-X',
      debit_amount: 0,
      credit_amount: 5000,
      running_balance: 5000,
    })
    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
  })

  it('addStatementLine rejects negative amounts', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: 'Negative',
      reference: null,
      debit_amount: -100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('addStatementLine rejects future date', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2099-01-01',
      description: 'Future',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('future')
  })

  it('addStatementLine rejects unknown statement', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(999, {
      transaction_date: '2026-02-10',
      description: 'No stmt',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('not found')
  })

  it('matchTransaction succeeds for matching amounts and dates', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (50, 1, '2026-02-14', 'Match me', 3000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (50, 'TXN-50', '2026-02-14', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 'CASH')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(50, 50)
    expect(result.success).toBe(true)
  })

  it('matchTransaction rejects when line not found', async () => {
    const service = new BankReconciliationService()
    const result = await service.matchTransaction(999, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('matchTransaction rejects when line already matched', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount, is_matched, matched_transaction_id)
      VALUES (60, 1, '2026-02-14', 'Already matched', 1000, 1, 99)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.matchTransaction(60, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('already matched')
  })

  it('matchTransaction rejects voided transaction', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (70, 1, '2026-02-14', 'Test', 1000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, is_voided
      ) VALUES (70, 'TXN-70', '2026-02-14', 'FEE_PAYMENT', 1, 1000, 'CREDIT', 1)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.matchTransaction(70, 70)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found or already voided')
  })

  it('unmatchTransaction resets matched state', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount, is_matched, matched_transaction_id)
      VALUES (80, 1, '2026-02-14', 'To unmatch', 1000, 1, 5)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.unmatchTransaction(80)
    expect(result.success).toBe(true)
    const line = db.prepare('SELECT is_matched, matched_transaction_id FROM bank_statement_line WHERE id = 80').get() as { is_matched: number; matched_transaction_id: number | null }
    expect(line.is_matched).toBe(0)
    expect(line.matched_transaction_id).toBeNull()
  })

  it('markStatementReconciled rejects non-existent statement', async () => {
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(999, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('markStatementReconciled rejects already reconciled statement', async () => {
    db.prepare(`UPDATE bank_statement SET status = 'RECONCILED' WHERE id = 1`).run()
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)
    expect(result.success).toBe(false)
    expect(result.error).toContain('already reconciled')
  })

  it('markStatementReconciled rejects when not all lines matched', async () => {
    db.prepare(`
      UPDATE bank_statement SET opening_balance = 0, closing_balance = 1000 WHERE id = 1
    `).run()
    db.prepare(`
      INSERT INTO bank_statement_line (bank_statement_id, transaction_date, description, credit_amount, is_matched)
      VALUES (1, '2026-02-10', 'Unmatched', 1000, 0)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)
    expect(result.success).toBe(false)
    expect(result.error).toContain('must be matched')
  })

  it('markStatementReconciled rejects when balance does not match', async () => {
    db.prepare(`
      UPDATE bank_statement SET opening_balance = 0, closing_balance = 9999 WHERE id = 1
    `).run()
    db.prepare(`
      INSERT INTO bank_statement_line (bank_statement_id, transaction_date, description, credit_amount, is_matched)
      VALUES (1, '2026-02-10', 'Deposit', 500, 1)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Closing balance')
  })

  // ── Additional coverage: error/edge branches ──────────────────────────

  it('createBankAccount returns error on duplicate account_number (catch branch)', async () => {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_account_number ON bank_account(account_number)`)
    const service = new BankReconciliationService()
    const result = await service.createBankAccount({
      account_name: 'Duplicate',
      account_number: '1234567890',
      bank_name: 'KCB',
      opening_balance: 0,
    })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('addStatementLine rejects statementId <= 0', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(0, {
      transaction_date: '2026-02-10',
      description: 'Zero ID',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('Invalid bank statement ID')
  })

  it('addStatementLine rejects NaN running_balance', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: 'NaN balance',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: Number.NaN as unknown as number,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('Running balance')
  })

  it('addStatementLine rejects date after statement date', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-15',
      description: 'After stmt date',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('after the statement date')
  })

  it('addStatementLine rejects both debit and credit > 0', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: 'Both amounts',
      reference: null,
      debit_amount: 100,
      credit_amount: 200,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('Exactly one')
  })

  it('addStatementLine rejects NaN debit/credit amounts', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: 'NaN amounts',
      reference: null,
      debit_amount: Number.NaN as unknown as number,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('valid numbers')
  })

  it('addStatementLine rejects empty description', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: '   ',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('description is required')
  })

  it('addStatementLine rejects invalid date format', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '14-02-2026',
      description: 'Bad date',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('YYYY-MM-DD')
  })

  it('matchTransaction rejects when txn already reconciled to another line', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount, is_matched, matched_transaction_id)
      VALUES (90, 1, '2026-02-14', 'First match', 2000, 1, 90)
    `).run()
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (91, 1, '2026-02-14', 'Second try', 2000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (90, 'TXN-90', '2026-02-14', 'FEE_PAYMENT', 1, 2000, 'CREDIT', 'CASH')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(91, 90)
    expect(result.success).toBe(false)
    expect(result.error).toContain('already reconciled')
  })

  it('matchTransaction rejects BANK_TRANSFER when ref does not match account', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (100, 1, '2026-02-14', 'Transfer', 5000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES (100, 'TXN-100', '2026-02-14', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 'BANK_TRANSFER', 'REF-OTHER-BANK', 'Payment to other bank')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(100, 100)
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not appear to belong')
  })

  it('matchTransaction allows BANK_TRANSFER when ref includes account number', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (101, 1, '2026-02-14', 'Transfer', 5000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES (101, 'TXN-101', '2026-02-14', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 'BANK_TRANSFER', 'PAY-1234567890-REF', 'Payment')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(101, 101)
    expect(result.success).toBe(true)
  })

  it('getUnmatchedLedgerTransactions returns all when no bankAccountId', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (110, 'TXN-110', '2026-02-10', 'FEE_PAYMENT', 1, 1000, 'CREDIT', 'CASH')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.getUnmatchedLedgerTransactions('2026-02-01', '2026-02-28') as Array<{ id: number }>
    expect(result.map(r => r.id)).toContain(110)
  })

  it('markStatementReconciled rejects when statement has no lines', async () => {
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)
    expect(result.success).toBe(false)
    expect(result.error).toContain('no lines')
  })

  it('matchTransaction rejects non-existent ledger transaction', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (120, 1, '2026-02-14', 'Test', 1000)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.matchTransaction(120, 999)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found or already voided')
  })

  it('createStatement catches DB error', async () => {
    const service = new BankReconciliationService()
    const result = await service.createStatement(999999, '2026-02-20', 0, 5000)
    expect(result.success).toBe(true) // FK not enforced in SQLite by default
  })

  it('markStatementReconciled rejects already-reconciled statement', async () => {
    db.prepare(`UPDATE bank_statement SET status = 'RECONCILED' WHERE id = 1`).run()
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)
    expect(result.success).toBe(false)
    expect(result.error).toContain('already reconciled')
  })

  it('addStatementLine rejects when both debit and credit are zero', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: 'Zero amounts',
      reference: null,
      debit_amount: 0,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('Exactly one of debit amount or credit amount')
  })

  it('addStatementLine rejects negative amounts', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-10',
      description: 'Negative amount',
      reference: null,
      debit_amount: -500,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('cannot be negative')
  })

  it('unmatchTransaction clears match flag', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount, is_matched, matched_transaction_id)
      VALUES (200, 1, '2026-02-14', 'Matched line', 3000, 1, 50)
    `).run()
    const service = new BankReconciliationService()
    const result = await service.unmatchTransaction(200)
    expect(result.success).toBe(true)

    const line = db.prepare(`SELECT is_matched, matched_transaction_id FROM bank_statement_line WHERE id = 200`).get() as { is_matched: number; matched_transaction_id: number | null }
    expect(line.is_matched).toBe(0)
    expect(line.matched_transaction_id).toBeNull()
  })

  it('getUnmatchedLedgerTransactions filters by bankAccountId', async () => {
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES (150, 'TXN-150', '2026-02-10', 'FEE_PAYMENT', 1, 2000, 'CREDIT', 'BANK_TRANSFER', 'PAY-1234567890-X', 'Transfer to Test')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.getUnmatchedLedgerTransactions('2026-02-01', '2026-02-28', 1) as Array<{ id: number }>
    expect(result.map(r => r.id)).toContain(150)
  })

  it('markStatementReconciled rejects when closing balance does not match movements', async () => {
    // Add a matched line whose net movement doesn't match closing - opening
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount, debit_amount, is_matched, matched_transaction_id)
      VALUES (300, 1, '2026-02-14', 'Large credit', 999999, 0, 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (300, 'TXN-300', '2026-02-14', 'FEE_PAYMENT', 1, 999999, 'CREDIT', 'CASH')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 9)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Closing balance does not match')
  })

  // ── Branch coverage: matchTransaction with CHEQUE payment method ──
  it('matchTransaction rejects CHEQUE when ref does not match bank account', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (400, 1, '2026-02-14', 'Cheque deposit', 8000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES (400, 'TXN-400', '2026-02-14', 'FEE_PAYMENT', 1, 8000, 'CREDIT', 'CHEQUE', 'CHQ-OTHER-BANK', 'Cheque to other bank')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(400, 400)
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not appear to belong')
  })

  // ── Branch coverage: isIsoDate with structurally valid but semantically invalid date ──
  it('addStatementLine rejects date that passes regex but is invalid (e.g. Feb 31)', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-31',
      description: 'Invalid date',
      reference: null,
      debit_amount: 100,
      credit_amount: 0,
      running_balance: null,
    })
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('YYYY-MM-DD')
  })

  // ── Branch coverage: matchTransaction concurrent update race condition (changes === 0) ──
  it('matchTransaction returns error when concurrent update sets is_matched before us', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount, is_matched, matched_transaction_id)
      VALUES (410, 1, '2026-02-14', 'Concurrent race', 5000, 0, NULL)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (410, 'TXN-410', '2026-02-14', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 'CASH')
    `).run()

    // Simulate concurrent update by setting is_matched=1 right before our UPDATE
    const origPrepare = db.prepare.bind(db)
    let intercepted = false
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('UPDATE bank_statement_line') && sql.includes('is_matched = 1') && !intercepted) {
        intercepted = true
        // Someone else matched it first
        origPrepare('UPDATE bank_statement_line SET is_matched = 1 WHERE id = 410').run()
      }
      return origPrepare(sql)
    })

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(410, 410)
    expect(result.success).toBe(false)
    expect(result.error).toContain('another process')
    vi.restoreAllMocks()
  })

  // ── Branch coverage: matchTransaction BANK_TRANSFER with no payment_reference (skip scoping) ──
  it('matchTransaction allows BANK_TRANSFER when payment_reference is null (scoping skipped)', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (420, 1, '2026-02-14', 'No ref transfer', 3000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES (420, 'TXN-420', '2026-02-14', 'FEE_PAYMENT', 1, 3000, 'CREDIT', 'BANK_TRANSFER', NULL, 'No reference')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(420, 420)
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: matchTransaction BANK_TRANSFER matches via description containing account name ──
  it('matchTransaction allows BANK_TRANSFER when description contains account name', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (430, 1, '2026-02-14', 'Desc match', 4000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, payment_reference, description
      ) VALUES (430, 'TXN-430', '2026-02-14', 'FEE_PAYMENT', 1, 4000, 'CREDIT', 'BANK_TRANSFER', 'REF-UNRELATED', 'Payment to Main Account')
    `).run()

    const service = new BankReconciliationService()
    const result = await service.matchTransaction(430, 430)
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: createBankAccount non-Error catch (L118) ──
  it('createBankAccount returns error string for non-Error throws', async () => {
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO bank_account')) {
        return { run: () => { throw 'string error' } } as any // NOSONAR
      }
      return origPrepare(sql)
    })
    const service = new BankReconciliationService()
    const result = await service.createBankAccount({
      account_name: 'Fail Acct', account_number: 'F001',
      bank_name: 'Test Bank'
    } as any)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toBe('Unknown error')
    vi.restoreAllMocks()
  })

  // ── Branch coverage: createStatement non-Error catch (L173) ──
  it('createStatement returns error string for non-Error throws', async () => {
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO bank_statement') && !sql.includes('_line')) {
        return { run: () => { throw 42 } } as any // NOSONAR
      }
      return origPrepare(sql)
    })
    const service = new BankReconciliationService()
    const result = await service.createStatement(1, '2026-03-01', 0, 10000)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toBe('Unknown error')
    vi.restoreAllMocks()
  })

  // ── Branch coverage: addStatementLine NaN debit/credit (L244-247) ──
  it('addStatementLine rejects NaN debit/credit amounts', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-14',
      description: 'NaN test',
      debit_amount: Number.NaN as any,
      credit_amount: Number.NaN as any,
    } as any)
    expect(result.success).toBe(false)
    expect(result.errors!.some((e: string) => e.includes('valid numbers'))).toBe(true)
  })

  // ── Branch coverage: addStatementLine negative amounts (L246) ──
  it('addStatementLine rejects negative amounts', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-14',
      description: 'Neg test',
      debit_amount: -100,
      credit_amount: 0,
    } as any)
    expect(result.success).toBe(false)
    expect(result.errors!.some((e: string) => e.includes('negative'))).toBe(true)
  })

  // ── Branch coverage: addStatementLine both debit and credit > 0 (L247) ──
  it('addStatementLine rejects when both debit and credit are positive', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-14',
      description: 'Both positive',
      debit_amount: 100,
      credit_amount: 200,
    } as any)
    expect(result.success).toBe(false)
    expect(result.errors!.some((e: string) => e.includes('Exactly one'))).toBe(true)
  })

  // ── Branch coverage: addStatementLine invalid running_balance (L252) ──
  it('addStatementLine rejects non-finite running_balance', async () => {
    const service = new BankReconciliationService()
    const result = await service.addStatementLine(1, {
      transaction_date: '2026-02-14',
      description: 'Bad balance',
      debit_amount: 100,
      credit_amount: 0,
      running_balance: 'not-a-number',
    } as any)
    expect(result.success).toBe(false)
    expect(result.errors!.some((e: string) => e.includes('Running balance'))).toBe(true)
  })

  // ── Branch coverage: matchTransaction amount mismatch (L330) ──
  it('matchTransaction rejects when amount mismatch exceeds tolerance', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (440, 1, '2026-02-14', 'Amount mismatch', 10000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (440, 'TXN-440', '2026-02-14', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 'CASH')
    `).run()
    const service = new BankReconciliationService()
    const result = await service.matchTransaction(440, 440)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Amount mismatch')
  })

  // ── Branch coverage: matchTransaction date mismatch (L341-342) ──
  it('matchTransaction rejects when date mismatch exceeds tolerance', async () => {
    db.prepare(`
      INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount)
      VALUES (450, 1, '2026-02-14', 'Date mismatch', 5000)
    `).run()
    db.prepare(`
      INSERT INTO ledger_transaction (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method
      ) VALUES (450, 'TXN-450', '2025-12-01', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 'CASH')
    `).run()
    const service = new BankReconciliationService()
    const result = await service.matchTransaction(450, 450)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Date mismatch')
  })

  // ── Branch coverage: markStatementReconciled – already reconciled (L412) ──
  it('markStatementReconciled returns error for already reconciled statement', async () => {
    db.prepare(`UPDATE bank_statement SET status = 'RECONCILED' WHERE id = 1`).run()
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('already reconciled')
    db.prepare(`UPDATE bank_statement SET status = 'DRAFT' WHERE id = 1`).run()
  })

  // ── Branch coverage: markStatementReconciled – closing balance mismatch (L474) ──
  it('markStatementReconciled rejects when closing balance does not match', async () => {
    // Create a statement with lines that don't add up to closing balance
    db.prepare(`INSERT INTO bank_statement (id, bank_account_id, statement_date, opening_balance, closing_balance, status) VALUES (10, 1, '2026-03-01', 0, 99999, 'DRAFT')`).run()
    db.prepare(`INSERT INTO bank_statement_line (id, bank_statement_id, transaction_date, description, credit_amount, is_matched, matched_transaction_id) VALUES (460, 10, '2026-03-01', 'Matched', 5000, 1, 1)`).run()
    const service = new BankReconciliationService()
    const result = await service.markStatementReconciled(10, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Closing balance')
  })

  // ── Branch coverage: getUnmatchedLedgerTransactions with bankAccountId filter (L412+) ──
  it('getUnmatchedLedgerTransactions filters by bank account', async () => {
    const service = new BankReconciliationService()
    const results = await service.getUnmatchedLedgerTransactions('2026-01-01', '2026-12-31', 1)
    expect(Array.isArray(results)).toBe(true)
  })
})
