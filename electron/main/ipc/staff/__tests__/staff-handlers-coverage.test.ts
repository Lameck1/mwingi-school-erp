/**
 * Additional coverage for staff-handlers.ts
 * Targets: validateCreateData with missing required fields, salary validation,
 *          buildUpdateParams with salary, mapOptionalActive, is_active=false,
 *          getAll with activeOnly=false, setActive toggle
 */
import Database from 'better-sqlite3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
let sessionRole = 'ADMIN'
let sessionUserId = 1

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: { id: sessionUserId, username: 'admin', role: sessionRole, full_name: 'Admin', email: null, is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({ getDatabase: () => db }))
vi.mock('../../../database/utils/audit', () => ({ logAudit: vi.fn() }))

import { registerStaffHandlers } from '../staff-handlers'

describe('staff-handlers coverage expansion', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionRole = 'ADMIN'
    sessionUserId = 1

    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_number TEXT NOT NULL UNIQUE,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        id_number TEXT,
        kra_pin TEXT,
        nhif_number TEXT,
        nssf_number TEXT,
        phone TEXT,
        email TEXT,
        bank_name TEXT,
        bank_account TEXT,
        department TEXT,
        job_title TEXT,
        employment_date TEXT,
        basic_salary INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    registerStaffHandlers()
  })

  afterEach(() => { db.close() })

  // ─── staff:getAll activeOnly=false ──────────────────────
  it('getAll returns all staff when activeOnly=false', async () => {
    db.exec(`INSERT INTO staff (staff_number, first_name, last_name, is_active) VALUES ('S001', 'Jane', 'Doe', 1)`)
    db.exec(`INSERT INTO staff (staff_number, first_name, last_name, is_active) VALUES ('S002', 'John', 'Doe', 0)`)
    const handler = handlerMap.get('staff:getAll')!
    const result = await handler({}, false) as Array<{ staff_number: string }>
    expect(result.length).toBe(2)
  })

  it('getAll returns only active when activeOnly=true (default)', async () => {
    db.exec(`INSERT INTO staff (staff_number, first_name, last_name, is_active) VALUES ('S001', 'Jane', 'Doe', 1)`)
    db.exec(`INSERT INTO staff (staff_number, first_name, last_name, is_active) VALUES ('S002', 'John', 'Doe', 0)`)
    const handler = handlerMap.get('staff:getAll')!
    const result = await handler({}) as Array<{ staff_number: string }>
    expect(result.length).toBe(1)
  })

  // ─── staff:create with is_active=false ──────────────────
  it('create sets is_active=0 when false', async () => {
    const handler = handlerMap.get('staff:create')!
    const result = await handler({}, {
      staff_number: 'S003',
      first_name: 'Inactive',
      last_name: 'Staff',
      is_active: false
    }) as { success: boolean; id: number }
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT is_active FROM staff WHERE id = ?').get(result.id) as { is_active: number }
    expect(row.is_active).toBe(0)
  })

  // ─── staff:create with all optional fields ──────────────
  it('create with full optional fields', async () => {
    const handler = handlerMap.get('staff:create')!
    const result = await handler({}, {
      staff_number: 'S004',
      first_name: 'Full',
      middle_name: 'M',
      last_name: 'Staff',
      id_number: '12345678',
      kra_pin: 'A123456789B',
      nhif_number: 'NH001',
      nssf_number: 'NS001',
      phone: '+254700000000',
      email: 'full@test.com',
      bank_name: 'KCB',
      bank_account: '1234567890',
      department: 'Admin',
      job_title: 'Manager',
      employment_date: '2025-01-01',
      basic_salary: 5000000,
    }) as { success: boolean; id: number }
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT * FROM staff WHERE id = ?').get(result.id) as any
    expect(row.kra_pin).toBe('A123456789B')
    expect(row.basic_salary).toBe(5000000)
  })

  // ─── staff:create rejects missing required fields ───────
  it('create rejects empty staff_number', async () => {
    const handler = handlerMap.get('staff:create')!
    const result = await handler({}, {
      staff_number: '',
      first_name: 'Jane',
      last_name: 'Doe',
    }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
  })

  // ─── staff:update with salary ───────────────────────────
  it('update changes basic_salary via COALESCE', async () => {
    db.exec(`INSERT INTO staff (id, staff_number, first_name, last_name, basic_salary) VALUES (1, 'S001', 'Jane', 'Doe', 3000000)`)
    const handler = handlerMap.get('staff:update')!
    const result = await handler({}, 1, { basic_salary: 4000000 }) as { success: boolean }
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT basic_salary FROM staff WHERE id = 1').get() as { basic_salary: number }
    expect(row.basic_salary).toBe(4000000)
  })

  // ─── staff:update with is_active toggle ─────────────────
  it('update toggles is_active', async () => {
    db.exec(`INSERT INTO staff (id, staff_number, first_name, last_name, is_active) VALUES (1, 'S001', 'Jane', 'Doe', 1)`)
    const handler = handlerMap.get('staff:update')!
    await handler({}, 1, { is_active: false })
    const row = db.prepare('SELECT is_active FROM staff WHERE id = 1').get() as { is_active: number }
    expect(row.is_active).toBe(0)
  })

  // ─── staff:setActive ───────────────────────────────────
  it('setActive deactivates staff', async () => {
    db.exec(`INSERT INTO staff (id, staff_number, first_name, last_name, is_active) VALUES (1, 'S001', 'Jane', 'Doe', 1)`)
    const handler = handlerMap.get('staff:setActive')!
    const result = await handler({}, 1, false) as { success: boolean }
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT is_active FROM staff WHERE id = 1').get() as { is_active: number }
    expect(row.is_active).toBe(0)
  })

  it('setActive reactivates staff', async () => {
    db.exec(`INSERT INTO staff (id, staff_number, first_name, last_name, is_active) VALUES (1, 'S001', 'Jane', 'Doe', 0)`)
    const handler = handlerMap.get('staff:setActive')!
    const result = await handler({}, 1, true) as { success: boolean }
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT is_active FROM staff WHERE id = 1').get() as { is_active: number }
    expect(row.is_active).toBe(1)
  })

  // ─── staff:getById returns undefined for missing ────────
  it('getById returns undefined for non-existent staff', async () => {
    const handler = handlerMap.get('staff:getById')!
    const result = await handler({}, 999)
    expect(result).toBeUndefined()
  })

  // ─── role enforcement ───────────────────────────────────
  it('staff:create rejects non-management role', async () => {
    sessionRole = 'TEACHER'
    clearSessionCache()
    handlerMap.clear()
    registerStaffHandlers()
    const handler = handlerMap.get('staff:create')!
    const result = await handler({}, {
      staff_number: 'S005',
      first_name: 'Test',
      last_name: 'User',
    }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })
})
