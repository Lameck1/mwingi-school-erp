// Utility to attach session actor to event
function attachActor(event: any) {
  event.__ipcActor = { id: 1, username: 'admin', role: 'ADMIN' };
}
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const journalServiceMock = {
  createJournalEntrySync: vi.fn((): { success: boolean; error?: string } => ({ success: true })),
}

// Mock keytar to provide a valid ADMIN session so safeHandleRawWithRole passes
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'a@t.com', is_active: 1, last_login: null, created_at: '2026-01-01T00:00:00' },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  },
  getPassword: vi.fn().mockResolvedValue(JSON.stringify({
    user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'a@t.com', is_active: 1, last_login: null, created_at: '2026-01-01T00:00:00' },
    lastActivity: Date.now()
  })),
  setPassword: vi.fn().mockResolvedValue(null),
  deletePassword: vi.fn().mockResolvedValue(true)
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'DoubleEntryJournalService') {
        return journalServiceMock
      }
      return {}
    })
  }
}))

import { registerTransactionsHandlers } from '../transactions-handlers'

describe('transactions IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    journalServiceMock.createJournalEntrySync.mockReset()
    journalServiceMock.createJournalEntrySync.mockReturnValue({ success: true })

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
        category_name TEXT NOT NULL,
        category_type TEXT NOT NULL,
        gl_account_code TEXT,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        payment_reference TEXT,
        description TEXT,
        recorded_by_user_id INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0
      );
    `)

    db.prepare(`
      INSERT INTO transaction_category (id, category_name, category_type, gl_account_code, is_active)
      VALUES (1, 'General Income', 'INCOME', '4300', 1)
    `).run()

    registerTransactionsHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('transaction:create rejects invalid amount', async () => {
    const handler = handlerMap.get('transaction:create')
    expect(handler).toBeDefined()
    const today = new Date().toISOString().slice(0, 10)

    const event = {};
    attachActor(event);
    const result = await handler!(
      event,
      {
        transaction_date: today,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: -1,
        payment_method: 'CASH',
      },
      1
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('transaction:create rejects invalid transaction date format', async () => {
    const handler = handlerMap.get('transaction:create')!
    const event = {};
    attachActor(event);
    const result = await handler(
      event,
      {
        transaction_date: '01/02/2026',
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 1200,
        payment_method: 'CASH',
      },
      1
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid date format')
  })

  it('transaction:create rejects future transaction date', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const handler = handlerMap.get('transaction:create')!
    const event = {};
    attachActor(event);
    const result = await handler(
      event,
      {
        transaction_date: tomorrow,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 1200,
        payment_method: 'CASH',
      },
      1
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('future')
  })

  it('transaction:create returns failure and rolls back ledger insert when journal creation fails', async () => {
    journalServiceMock.createJournalEntrySync.mockReturnValueOnce({ success: false, error: 'Journal config missing' })
    const today = new Date().toISOString().slice(0, 10)

    const handler = handlerMap.get('transaction:create')!
    const event = {};
    attachActor(event);
    const result = await handler(
      event,
      {
        transaction_date: today,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 2500,
        payment_method: 'CASH',
        description: 'Fundraiser',
      },
      1
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Journal config missing')

    const count = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction`).get() as { count: number }
    expect(count.count).toBe(0)
  })

  it('transaction:create persists on successful journal posting', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('transaction:create')!
    const event = {};
    attachActor(event);
    const result = await handler(
      event,
      {
        transaction_date: today,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 2500,
        payment_method: 'BANK',
        payment_reference: 'BNK-REF-1',
        description: 'Grant income',
      },
      1
    ) as { success: boolean; id?: number }

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
    expect(journalServiceMock.createJournalEntrySync).toHaveBeenCalledTimes(1)

    const row = db.prepare(`SELECT payment_method, amount, transaction_type FROM ledger_transaction`).get() as {
      payment_method: string
      amount: number
      transaction_type: string
    }
    expect(row.payment_method).toBe('BANK')
    expect(row.amount).toBe(2500)
    expect(row.transaction_type).toBe('INCOME')
  })
})
