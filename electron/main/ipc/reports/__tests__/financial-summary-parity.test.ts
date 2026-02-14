import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

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
      if (name === 'NEMISExportService') {
        return {
          extractStudentData: vi.fn(async () => []),
          extractStaffData: vi.fn(async () => []),
          extractEnrollmentData: vi.fn(async () => []),
          createExport: vi.fn(async () => ({ success: true })),
          getExportHistory: vi.fn(async () => []),
          validateStudentData: vi.fn(() => ({ valid: true })),
        }
      }
      if (name === 'OpeningBalanceService') {
        return { getStudentLedger: vi.fn(async () => ({ transactions: [] })) }
      }
      if (name === 'DoubleEntryJournalService') {
        return { createJournalEntrySync: vi.fn(() => ({ success: true })) }
      }
      return {}
    }),
  }
}))

import { registerTransactionsHandlers } from '../../transactions/transactions-handlers'
import { registerReportsHandlers } from '../reports-handlers'

describe('financial summary parity', () => {
  beforeEach(() => {
    handlerMap.clear()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        category_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        recorded_by_user_id INTEGER,
        transaction_ref TEXT
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_amount INTEGER NOT NULL,
        amount_paid INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL
      );
      CREATE TABLE student (id INTEGER PRIMARY KEY AUTOINCREMENT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE staff (id INTEGER PRIMARY KEY AUTOINCREMENT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT,
        category_type TEXT,
        gl_account_code TEXT,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT);
    `)

    db.prepare(`INSERT INTO student (is_active) VALUES (1), (1), (0)`).run()
    db.prepare(`INSERT INTO staff (is_active) VALUES (1), (0)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (total_amount, amount_paid, status) VALUES
      (10000, 7000, 'PENDING'),
      (9000, 8500, 'PARTIAL'),
      (8000, 7500, 'OUTSTANDING'),
      (6000, 6000, 'PAID')
    `).run()

    db.prepare(`
      INSERT INTO ledger_transaction (transaction_date, transaction_type, amount, is_voided, category_id, payment_method, recorded_by_user_id, transaction_ref)
      VALUES
      ('2026-02-10', 'INCOME', 1000, 0, 1, 'CASH', 1, 'T1'),
      ('2026-02-11', 'FEE_PAYMENT', 2000, 0, 1, 'CASH', 1, 'T2'),
      ('2026-02-12', 'DONATION', 400, 0, 1, 'BANK', 1, 'T3'),
      ('2026-02-12', 'GRANT', 600, 1, 1, 'BANK', 1, 'T4'),
      ('2026-02-13', 'EXPENSE', 500, 0, 1, 'BANK', 1, 'T5'),
      ('2026-02-13', 'SALARY_PAYMENT', 700, 0, 1, 'BANK', 1, 'T6'),
      ('2026-02-14', 'REFUND', 300, 0, 1, 'BANK', 1, 'T7'),
      ('2026-01-15', 'FEE_PAYMENT', 9999, 0, 1, 'CASH', 1, 'T8')
    `).run()

    registerReportsHandlers()
    registerTransactionsHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('report:financialSummary and transaction:getSummary use identical totals', async () => {
    const reportSummaryHandler = handlerMap.get('report:financialSummary')
    const transactionSummaryHandler = handlerMap.get('transaction:getSummary')
    expect(reportSummaryHandler).toBeDefined()
    expect(transactionSummaryHandler).toBeDefined()

    const reportSummary = await reportSummaryHandler!({}, '2026-02-01', '2026-02-28') as {
      totalIncome: number
      totalExpense: number
      feePayments: number
      netBalance: number
    }
    const transactionSummary = await transactionSummaryHandler!({}, '2026-02-01', '2026-02-28') as {
      totalIncome: number
      totalExpense: number
      netBalance: number
    }

    expect(reportSummary.totalIncome).toBe(3400)
    expect(reportSummary.totalExpense).toBe(1500)
    expect(reportSummary.feePayments).toBe(2000)
    expect(reportSummary.netBalance).toBe(1900)

    expect(transactionSummary.totalIncome).toBe(reportSummary.totalIncome)
    expect(transactionSummary.totalExpense).toBe(reportSummary.totalExpense)
    expect(transactionSummary.netBalance).toBe(reportSummary.netBalance)
  })

  it('report:dashboard includes OUTSTANDING invoice status in outstanding balance', async () => {
    const dashboardHandler = handlerMap.get('report:dashboard')
    expect(dashboardHandler).toBeDefined()

    const dashboard = await dashboardHandler!({}) as {
      totalStudents: number
      totalStaff: number
      feeCollected: number
      outstandingBalance: number
    }

    expect(dashboard.totalStudents).toBe(2)
    expect(dashboard.totalStaff).toBe(1)
    expect(dashboard.feeCollected).toBe(11999)
    expect(dashboard.outstandingBalance).toBe(4000)
  })
})
