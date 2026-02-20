import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const { sessionData } = vi.hoisted(() => ({
  sessionData: {
    userId: 9,
    role: 'TEACHER'
  }
}))

const nemisServiceMock = {
  extractStudentData: vi.fn(async () => []),
  extractStaffData: vi.fn(async () => []),
  extractEnrollmentData: vi.fn(async () => []),
  createExport: vi.fn(async () => ({ success: true })),
  getExportHistory: vi.fn(async () => []),
  validateStudentData: vi.fn(() => ({ valid: true })),
}

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: sessionData.userId,
      username: 'session-user',
      role: sessionData.role,
      full_name: 'Session User',
      email: null,
      is_active: 1,
      last_login: null,
      created_at: '2026-01-01T00:00:00'
    },
    lastActivity: Date.now()
  }))
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

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'NEMISExportService') {
        return nemisServiceMock
      }
      return {}
    })
  }
}))

import { registerReportsHandlers } from '../reports-handlers'

describe('reports IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionData.userId = 9
    sessionData.role = 'TEACHER'
    nemisServiceMock.createExport.mockClear()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT,
        guardian_phone TEXT
      );
      CREATE TABLE stream (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_name TEXT
      );
      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        invoice_number TEXT,
        total_amount INTEGER NOT NULL,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        due_date TEXT
      );
    `)
    registerReportsHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('report:defaulters excludes PAID and CANCELLED invoices', async () => {
    db.prepare(`
      INSERT INTO student (id, first_name, last_name, admission_number, guardian_phone)
      VALUES (1, 'Jane', 'Doe', 'ADM001', '+254700000001')
    `).run()
    db.prepare(`INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 8')`).run()
    db.prepare(`INSERT INTO enrollment (id, student_id, stream_id) VALUES (1, 1, 1)`).run()

    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-OPEN', 10000, 1000, 'PENDING', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-PAID', 12000, 12000, 'PAID', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-CANCELLED', 8000, 0, 'CANCELLED', '2026-02-20')
    `).run()

    const handler = handlerMap.get('report:defaulters')
    expect(handler).toBeDefined()

    const result = await handler!({}) as Array<{ invoice_number: string }>
    expect(result).toHaveLength(1)
    expect(result[0].invoice_number).toBe('INV-OPEN')
  })

  it('report:defaulters applies term filter', async () => {
    db.prepare(`
      INSERT INTO student (id, first_name, last_name, admission_number, guardian_phone)
      VALUES (1, 'Jane', 'Doe', 'ADM001', '+254700000001')
    `).run()
    db.prepare(`INSERT INTO enrollment (id, student_id) VALUES (1, 1)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 1, 'INV-T1', 10000, 1000, 'PENDING', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount_paid, status, due_date)
      VALUES (1, 2, 'INV-T2', 10000, 1000, 'PENDING', '2026-04-20')
    `).run()

    const handler = handlerMap.get('report:defaulters')!
    const term1Result = await handler({}, 1) as Array<{ invoice_number: string }>
    expect(term1Result).toHaveLength(1)
    expect(term1Result[0].invoice_number).toBe('INV-T1')
  })

  it('report:defaulters normalizes invoice amount and status casing', async () => {
    db.prepare(`
      INSERT INTO student (id, first_name, last_name, admission_number, guardian_phone)
      VALUES (2, 'Sarah', 'Ochieng', 'MAS-2026', '+254700000002')
    `).run()
    db.prepare(`INSERT INTO enrollment (id, student_id) VALUES (2, 2)`).run()

    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount, amount_due, amount_paid, status, due_date)
      VALUES (2, 1, 'INV-LEGACY', 0, 1700000, 1700000, 0, 'pending', '2026-02-20')
    `).run()
    db.prepare(`
      INSERT INTO fee_invoice (student_id, term_id, invoice_number, total_amount, amount, amount_due, amount_paid, status, due_date)
      VALUES (2, 1, 'INV-CAN', 100000, 100000, 100000, 0, 'cancelled', '2026-02-20')
    `).run()

    const handler = handlerMap.get('report:defaulters')!
    const result = await handler({}, 1) as Array<{ invoice_number: string; total_amount: number; balance: number }>

    expect(result).toHaveLength(1)
    expect(result[0].invoice_number).toBe('INV-LEGACY')
    expect(result[0].total_amount).toBe(1700000)
    expect(result[0].balance).toBe(1700000)
  })

  it('reports:createNEMISExport rejects renderer actor mismatch', async () => {
    sessionData.role = 'PRINCIPAL'
    const handler = handlerMap.get('reports:createNEMISExport')
    expect(handler).toBeDefined()

    const result = await handler!({}, { exportType: 'students' }, 3) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(nemisServiceMock.createExport).not.toHaveBeenCalled()
  })
})
