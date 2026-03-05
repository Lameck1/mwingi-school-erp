import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 9, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'admin@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  }
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

import { setupMpesaHandlers } from '../mpesa-handlers'

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS mpesa_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpesa_receipt_number TEXT NOT NULL UNIQUE,
      transaction_date TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      amount INTEGER NOT NULL,
      account_reference TEXT,
      payer_name TEXT,
      imported_by_user_id INTEGER,
      status TEXT DEFAULT 'UNMATCHED',
      matched_student_id INTEGER,
      match_method TEXT,
      match_confidence REAL
    );

    CREATE TABLE IF NOT EXISTS mpesa_reconciliation_batch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_imported INTEGER,
      total_matched INTEGER,
      total_unmatched INTEGER,
      total_amount INTEGER,
      source TEXT,
      file_name TEXT,
      imported_by_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      admission_number TEXT,
      is_active BOOLEAN DEFAULT 1,
      guardian_phone TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action_type TEXT,
      table_name TEXT,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

type SuccessResult = { success: boolean; error?: string; [key: string]: unknown }

describe('mpesa-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    db = new Database(':memory:')
    createSchema(db)
    setupMpesaHandlers()
  })

  afterEach(() => {
    db.close()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected mpesa channels', () => {
    expect(handlerMap.has('mpesa:import')).toBe(true)
    expect(handlerMap.has('mpesa:getUnmatched')).toBe(true)
    expect(handlerMap.has('mpesa:getByStatus')).toBe(true)
    expect(handlerMap.has('mpesa:manualMatch')).toBe(true)
    expect(handlerMap.has('mpesa:getSummary')).toBe(true)
  })

  // ─── mpesa:import ───────────────────────────────────────────────────

  it('mpesa:import imports valid transactions', async () => {
    const handler = handlerMap.get('mpesa:import')!
    const rows = [
      { mpesa_receipt_number: 'RCP001', transaction_date: '2025-01-15', phone_number: '0712345678', amount: 5000 },
      { mpesa_receipt_number: 'RCP002', transaction_date: '2025-01-16', phone_number: '0712345679', amount: 3000 },
    ]
    const result = await handler({}, rows, 'CSV', 'test.csv') as SuccessResult

    expect(result.success).toBe(true)
    expect(result.total_imported).toBe(2)
    expect(result.total_amount).toBe(8000)
  })

  it('mpesa:import skips duplicate receipt numbers', async () => {
    db.prepare(`
      INSERT INTO mpesa_transaction (mpesa_receipt_number, transaction_date, phone_number, amount, imported_by_user_id, status)
      VALUES ('RCP-DUP', '2025-01-10', '0712000000', 1000, 9, 'UNMATCHED')
    `).run()

    const handler = handlerMap.get('mpesa:import')!
    const rows = [
      { mpesa_receipt_number: 'RCP-DUP', transaction_date: '2025-01-10', phone_number: '0712000000', amount: 1000 },
      { mpesa_receipt_number: 'RCP-NEW', transaction_date: '2025-01-11', phone_number: '0712000001', amount: 2000 },
    ]
    const result = await handler({}, rows, 'CSV') as SuccessResult

    expect(result.success).toBe(true)
    expect(result.total_imported).toBe(1)
    expect(result.duplicates_skipped).toBe(1)
  })

  it('mpesa:import rejects empty transaction array', async () => {
    const handler = handlerMap.get('mpesa:import')!
    const result = await handler({}, [], 'CSV') as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('No transactions to import')
  })

  it('mpesa:import auto-matches by phone number', async () => {
    db.prepare(`INSERT INTO student (id, first_name, last_name, admission_number, is_active, guardian_phone) VALUES (1, 'John', 'Doe', 'ADM001', 1, '0712345678')`).run()

    const handler = handlerMap.get('mpesa:import')!
    const rows = [
      { mpesa_receipt_number: 'RCP-AUTO', transaction_date: '2025-01-15', phone_number: '0712345678', amount: 5000 },
    ]
    const result = await handler({}, rows, 'CSV') as SuccessResult

    expect(result.success).toBe(true)
    expect(result.total_matched).toBe(1)
    expect(result.total_unmatched).toBe(0)
  })

  // ─── mpesa:getUnmatched ─────────────────────────────────────────────

  it('mpesa:getUnmatched returns unmatched transactions', async () => {
    db.exec(`
      INSERT INTO mpesa_transaction (mpesa_receipt_number, transaction_date, phone_number, amount, status) VALUES
        ('RCP-U1', '2025-01-15', '0712000001', 1000, 'UNMATCHED'),
        ('RCP-U2', '2025-01-16', '0712000002', 2000, 'UNMATCHED'),
        ('RCP-M1', '2025-01-17', '0712000003', 3000, 'MATCHED');
    `)

    const handler = handlerMap.get('mpesa:getUnmatched')!
    const result = await handler({}) as Array<{ mpesa_receipt_number: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
  })

  // ─── mpesa:getByStatus ──────────────────────────────────────────────

  it('mpesa:getByStatus returns transactions filtered by status', async () => {
    db.exec(`
      INSERT INTO mpesa_transaction (mpesa_receipt_number, transaction_date, phone_number, amount, status) VALUES
        ('RCP-P1', '2025-01-15', '0712000001', 1000, 'PENDING'),
        ('RCP-M1', '2025-01-16', '0712000002', 2000, 'MATCHED'),
        ('RCP-M2', '2025-01-17', '0712000003', 3000, 'MATCHED');
    `)

    const handler = handlerMap.get('mpesa:getByStatus')!
    const result = await handler({}, 'MATCHED') as Array<{ status: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result.every(t => t.status === 'MATCHED')).toBe(true)
  })

  // ─── mpesa:manualMatch ──────────────────────────────────────────────

  it('mpesa:manualMatch matches an unmatched transaction to a student', async () => {
    db.prepare(`INSERT INTO student (id, first_name, last_name, admission_number, is_active) VALUES (1, 'Jane', 'Doe', 'ADM001', 1)`).run()
    db.prepare(`INSERT INTO mpesa_transaction (id, mpesa_receipt_number, transaction_date, phone_number, amount, status) VALUES (1, 'RCP-MM1', '2025-01-15', '0712000001', 5000, 'UNMATCHED')`).run()

    const handler = handlerMap.get('mpesa:manualMatch')!
    const result = await handler({}, 1, 1) as SuccessResult

    expect(result.success).toBe(true)

    const txn = db.prepare('SELECT status, matched_student_id, match_method FROM mpesa_transaction WHERE id = 1').get() as { status: string; matched_student_id: number; match_method: string }
    expect(txn.status).toBe('MATCHED')
    expect(txn.matched_student_id).toBe(1)
    expect(txn.match_method).toBe('MANUAL')
  })

  it('mpesa:manualMatch rejects already-matched transaction', async () => {
    db.prepare(`INSERT INTO mpesa_transaction (id, mpesa_receipt_number, transaction_date, phone_number, amount, status, matched_student_id) VALUES (1, 'RCP-AM1', '2025-01-15', '0712000001', 5000, 'MATCHED', 1)`).run()

    const handler = handlerMap.get('mpesa:manualMatch')!
    const result = await handler({}, 1, 2) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('already matched')
  })

  // ─── mpesa:getSummary ───────────────────────────────────────────────

  it('mpesa:getSummary returns reconciliation summary', async () => {
    db.exec(`
      INSERT INTO mpesa_transaction (mpesa_receipt_number, transaction_date, phone_number, amount, status) VALUES
        ('RCP-S1', '2025-01-15', '0712000001', 1000, 'MATCHED'),
        ('RCP-S2', '2025-01-16', '0712000002', 2000, 'UNMATCHED'),
        ('RCP-S3', '2025-01-17', '0712000003', 3000, 'RECONCILED');
    `)

    const handler = handlerMap.get('mpesa:getSummary')!
    const result = await handler({}) as { total_transactions: number; total_matched: number; total_unmatched: number; total_amount: number }

    expect(result.total_transactions).toBe(3)
    expect(result.total_matched).toBe(2) // MATCHED + RECONCILED
    expect(result.total_unmatched).toBe(1)
    expect(result.total_amount).toBe(6000)
  })

  // ─── branch: import with optional payer_name / account_reference ──

  it('mpesa:import accepts rows with optional payer_name and account_reference', async () => {
    const handler = handlerMap.get('mpesa:import')!
    const rows = [
      { mpesa_receipt_number: 'RCP-OPT1', transaction_date: '2025-02-01', phone_number: '0712990001', amount: 4000, payer_name: 'John Doe', account_reference: 'ADM001' },
    ]
    const result = await handler({}, rows, 'API', 'api_import.json') as SuccessResult
    expect(result.success).toBe(true)
    expect(result.total_imported).toBe(1)
  })

  it('mpesa:getByStatus returns empty array for status with no transactions', async () => {
    const handler = handlerMap.get('mpesa:getByStatus')!
    const result = await handler({}, 'FAILED') as Array<{ status: string }>
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  // ─── Branch coverage: result.error ?? fallback (error undefined) ───

  it('mpesa:import uses fallback error when service returns success:false without error field', async () => {
    // Spy on the prototype to return { success: false } without an error property
    const { MpesaReconciliationService } = await import('../../../services/finance/MpesaReconciliationService')
    vi.spyOn(MpesaReconciliationService.prototype, 'importTransactions').mockReturnValueOnce({ success: false } as ReturnType<typeof MpesaReconciliationService.prototype.importTransactions>)

    const handler = handlerMap.get('mpesa:import')!
    const rows = [
      { mpesa_receipt_number: 'RCP-FALLBACK', transaction_date: '2025-03-01', phone_number: '0700000000', amount: 100 },
    ]
    const result = await handler({}, rows, 'API', 'test.json') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to import M-Pesa transactions')
  })

  it('mpesa:manualMatch uses fallback error when service returns success:false without error field', async () => {
    // Insert an unmatched transaction and student for the match attempt
    db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Test', 'Student', 'ADM-FALLBACK')`)
    db.exec(`INSERT INTO mpesa_transaction (mpesa_receipt_number, transaction_date, phone_number, amount, status) VALUES ('RCP-MATCH-FB', '2025-03-01', '0700000000', 500, 'UNMATCHED')`)

    const { MpesaReconciliationService } = await import('../../../services/finance/MpesaReconciliationService')
    vi.spyOn(MpesaReconciliationService.prototype, 'manualMatch').mockReturnValueOnce({ success: false } as ReturnType<typeof MpesaReconciliationService.prototype.manualMatch>)

    const handler = handlerMap.get('mpesa:manualMatch')!
    const result = await handler({}, 1, 1) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to manually match transaction')
  })
})
