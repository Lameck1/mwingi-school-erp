import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const journalServiceMock = {
  createJournalEntrySync: vi.fn((): { success: boolean; error?: string } => ({ success: true })),
}

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

    const result = await handler!(
      {},
      {
        transaction_date: today,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: -1,
        payment_method: 'CASH',
      },
      3
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('transaction:create rejects invalid transaction date format', async () => {
    const handler = handlerMap.get('transaction:create')!
    const result = await handler(
      {},
      {
        transaction_date: '01/02/2026',
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 1200,
        payment_method: 'CASH',
      },
      3
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid date format')
  })

  it('transaction:create rejects future transaction date', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const handler = handlerMap.get('transaction:create')!
    const result = await handler(
      {},
      {
        transaction_date: tomorrow,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 1200,
        payment_method: 'CASH',
      },
      3
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('future')
  })

  it('transaction:create returns failure and rolls back ledger insert when journal creation fails', async () => {
    journalServiceMock.createJournalEntrySync.mockReturnValueOnce({ success: false, error: 'Journal config missing' })
    const today = new Date().toISOString().slice(0, 10)

    const handler = handlerMap.get('transaction:create')!
    const result = await handler(
      {},
      {
        transaction_date: today,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 2500,
        payment_method: 'CASH',
        description: 'Fundraiser',
      },
      11
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Journal config missing')

    const count = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction`).get() as { count: number }
    expect(count.count).toBe(0)
  })

  it('transaction:create persists on successful journal posting', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('transaction:create')!
    const result = await handler(
      {},
      {
        transaction_date: today,
        transaction_type: 'INCOME',
        category_id: 1,
        amount: 2500,
        payment_method: 'BANK',
        payment_reference: 'BNK-REF-1',
        description: 'Grant income',
      },
      11
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
