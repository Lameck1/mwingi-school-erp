import type { Database, Statement } from 'better-sqlite3'

/**
 * Migration 1001: Journal Entry Bridge
 *
 * 1. Add gl_account_code to transaction_category so expenses/income can map to GL
 * 2. Add FEE_INVOICE to journal_entry.entry_type CHECK constraint
 * 3. Add INCOME to journal_entry.entry_type CHECK constraint
 * 4. Seed default gl_account_code values for existing categories
 * 5. Backfill journal_entry + journal_entry_line from existing ledger_transaction rows
 */
export function up(db: Database): void {
  // 1. Add gl_account_code to transaction_category
  const columns = db.pragma('table_info(transaction_category)') as Array<{ name: string }>
  const hasGlCode = columns.some(c => c.name === 'gl_account_code')
  if (!hasGlCode) {
    db.exec(`ALTER TABLE transaction_category ADD COLUMN gl_account_code TEXT`)
  }

  // 2. Recreate journal_entry with expanded CHECK constraint
  //    SQLite doesn't support ALTER CHECK, so we need to recreate if the constraint is missing.
  //    But since we use SAVEPOINT and this is risky, we'll just drop and recreate the CHECK
  //    by creating a new table and migrating data.
  //    However, since journal_entry is likely empty (that's the whole problem), we can do it safely.
  const journalCount = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entry').get() as { cnt: number }).cnt

  if (journalCount === 0) {
    // Safe to recreate — table is empty
    db.exec(`DROP TABLE IF EXISTS journal_entry_line`)
    db.exec(`DROP TABLE IF EXISTS journal_entry`)

    db.exec(`
      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_ref TEXT NOT NULL UNIQUE,
        entry_date DATE NOT NULL,
        entry_type TEXT NOT NULL CHECK(entry_type IN (
          'FEE_PAYMENT', 'FEE_INVOICE', 'EXPENSE', 'INCOME', 'SALARY', 'REFUND',
          'OPENING_BALANCE', 'ADJUSTMENT', 'ASSET_PURCHASE',
          'ASSET_DISPOSAL', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT',
          'DONATION', 'GRANT'
        )),
        description TEXT NOT NULL,
        student_id INTEGER,
        staff_id INTEGER,
        term_id INTEGER,
        is_posted BOOLEAN DEFAULT 0,
        posted_by_user_id INTEGER, posted_at DATETIME,
        is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME,
        requires_approval BOOLEAN DEFAULT 0,
        approval_status TEXT DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
        approved_by_user_id INTEGER, approved_at DATETIME,
        created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_ledger_txn_id INTEGER,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (staff_id) REFERENCES staff(id),
        FOREIGN KEY (term_id) REFERENCES term(id),
        FOREIGN KEY (created_by_user_id) REFERENCES user(id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_entry_ref ON journal_entry(entry_ref)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_entry_source ON journal_entry(source_ledger_txn_id)`)

    db.exec(`
      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        description TEXT,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id) ON DELETE CASCADE,
        FOREIGN KEY (gl_account_id) REFERENCES gl_account(id),
        CHECK (debit_amount >= 0 AND credit_amount >= 0)
      )
    `)
  }

  // 3. Seed default GL account codes for existing transaction categories
  const categories = db.prepare('SELECT id, category_name, category_type FROM transaction_category').all() as Array<{
    id: number
    category_name: string
    category_type: string
  }>

  const updateCat = db.prepare('UPDATE transaction_category SET gl_account_code = ? WHERE id = ?')

  for (const cat of categories) {
    // Map known category names to GL accounts
    const code = mapCategoryToGLCode(cat.category_name, cat.category_type)
    updateCat.run(code, cat.id)
  }

  // 4. Backfill journal entries from existing ledger_transaction records
  backfillJournalEntries(db)
}

const INCOME_GL_MAP: Array<[string[], string]> = [
  [['school fees', 'tuition'], '4010'],
  [['boarding'], '4020'],
  [['transport'], '4030'],
  [['activity'], '4040'],
  [['exam'], '4050'],
  [['capitation', 'grant'], '4100'],
  [['donation'], '4200'],
]

const EXPENSE_GL_MAP: Array<[string[], string]> = [
  [['salary', 'salaries'], '5010'],
  [['food', 'catering'], '5100'],
  [['transport', 'fuel'], '5200'],
  [['electric'], '5300'],
  [['water'], '5310'],
  [['station'], '5400'],
  [['clean'], '5410'],
  [['repair', 'maintenance'], '5500'],
  [['bank'], '5700'],
  [['professional', 'legal', 'audit'], '5800'],
]

function mapCategoryToGLCode(name: string, type: string): string {
  const lower = name.toLowerCase()
  const lookupMap = type === 'INCOME' ? INCOME_GL_MAP : EXPENSE_GL_MAP
  const fallback = type === 'INCOME' ? '4300' : '5900'

  for (const [keywords, code] of lookupMap) {
    if (keywords.some(kw => lower.includes(kw))) {
      return code
    }
  }

  return fallback
}

function backfillJournalEntries(db: Database): void {
  const transactions = db.prepare(`
    SELECT lt.id, lt.transaction_ref, lt.transaction_date, lt.transaction_type,
           lt.amount, lt.debit_credit, lt.student_id, lt.staff_id, lt.term_id,
           lt.payment_method, lt.description, lt.recorded_by_user_id,
           lt.category_id, lt.is_voided,
           tc.category_type, tc.gl_account_code
    FROM ledger_transaction lt
    LEFT JOIN transaction_category tc ON lt.category_id = tc.id
    WHERE lt.is_voided = 0
    ORDER BY lt.transaction_date ASC, lt.id ASC
  `).all() as Array<{
    id: number
    transaction_ref: string
    transaction_date: string
    transaction_type: string
    amount: number
    debit_credit: string
    student_id: number | null
    staff_id: number | null
    term_id: number | null
    payment_method: string | null
    description: string | null
    recorded_by_user_id: number
    category_id: number
    is_voided: number
    category_type: string | null
    gl_account_code: string | null
  }>

  if (transactions.length === 0) {
    return
  }

  // Check if we already have entries with source_ledger_txn_id
  const existingSourceIds = new Set(
    (db.prepare('SELECT source_ledger_txn_id FROM journal_entry WHERE source_ledger_txn_id IS NOT NULL').all() as Array<{ source_ledger_txn_id: number }>)
      .map(r => r.source_ledger_txn_id)
  )

  const insertEntry = db.prepare(`
    INSERT INTO journal_entry (
      entry_ref, entry_date, entry_type, description,
      student_id, staff_id, term_id,
      requires_approval, approval_status, is_posted, posted_by_user_id, posted_at,
      created_by_user_id, source_ledger_txn_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'APPROVED', 1, ?, CURRENT_TIMESTAMP, ?, ?)
  `)

  const insertLine = db.prepare(`
    INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const getGLAccount = db.prepare('SELECT id FROM gl_account WHERE account_code = ?')

  const backfill = db.transaction(() => {
    let counter = 0
    for (const txn of transactions) {
      if (existingSourceIds.has(txn.id)) {
        continue
      }

      const inserted = insertBackfillEntry(txn, insertEntry, insertLine, getGLAccount)
      if (inserted) {
        counter++
      }
    }

    if (counter > 0) {
      console.warn(`  Backfilled ${counter} journal entries from ledger_transaction`)
    }
  })

  backfill()
}

function insertBackfillEntry(
  txn: { id: number; transaction_ref: string; transaction_date: string; transaction_type: string; amount: number; student_id: number | null; staff_id: number | null; term_id: number | null; payment_method: string | null; description: string | null; recorded_by_user_id: number; gl_account_code: string | null; category_type: string | null },
  insertEntry: Statement,
  insertLine: Statement,
  getGLAccount: Statement,
): boolean {
  const entryRef = `MIG-${txn.transaction_ref}`
  const { entryType, debitCode, creditCode } = resolveGLMapping(txn)

  const debitAccount = getGLAccount.get(debitCode) as { id: number } | undefined
  const creditAccount = getGLAccount.get(creditCode) as { id: number } | undefined

  if (!debitAccount || !creditAccount) {
    console.warn(`Skipping backfill for txn ${txn.id}: GL account not found (debit=${debitCode}, credit=${creditCode})`)
    return false
  }

  const result = insertEntry.run(
    entryRef,
    txn.transaction_date,
    entryType,
    txn.description || `Backfilled from ${txn.transaction_type}`,
    txn.student_id,
    txn.staff_id,
    txn.term_id,
    txn.recorded_by_user_id,
    txn.recorded_by_user_id,
    txn.id,
  )

  const entryId = result.lastInsertRowid as number
  insertLine.run(entryId, 1, debitAccount.id, txn.amount, 0, `Debit: ${txn.description || txn.transaction_type}`)
  insertLine.run(entryId, 2, creditAccount.id, 0, txn.amount, `Credit: ${txn.description || txn.transaction_type}`)
  return true
}

function resolveGLMapping(txn: {
  transaction_type: string
  payment_method: string | null
  gl_account_code: string | null
  category_type: string | null
}): { entryType: string; debitCode: string; creditCode: string } {
  const cashCode = txn.payment_method === 'CASH' ? '1010' : '1020'

  switch (txn.transaction_type) {
    case 'FEE_PAYMENT':
      return {
        entryType: 'FEE_PAYMENT',
        debitCode: cashCode,                    // Debit Cash/Bank
        creditCode: '1100'                      // Credit Accounts Receivable
      }
    case 'EXPENSE':
      return {
        entryType: 'EXPENSE',
        debitCode: txn.gl_account_code || '5900', // Debit Expense account
        creditCode: cashCode                       // Credit Cash/Bank
      }
    case 'SALARY_PAYMENT':
      return {
        entryType: 'SALARY',
        debitCode: '5010',                      // Debit Salaries
        creditCode: cashCode                    // Credit Cash/Bank
      }
    case 'DONATION':
      return {
        entryType: 'DONATION',
        debitCode: cashCode,                    // Debit Cash/Bank
        creditCode: '4200'                      // Credit Donation revenue
      }
    case 'GRANT':
      return {
        entryType: 'GRANT',
        debitCode: cashCode,                    // Debit Cash/Bank
        creditCode: '4100'                      // Credit Grant revenue
      }
    case 'REFUND':
      return {
        entryType: 'REFUND',
        debitCode: '1100',                      // Debit Accounts Receivable (reverse payment)
        creditCode: cashCode                    // Credit Cash/Bank
      }
    default:
      // Income or other
      return {
        entryType: 'INCOME',
        debitCode: cashCode,
        creditCode: txn.gl_account_code || '4300'
      }
  }
}
