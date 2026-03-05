import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'a@a.com', is_active: 1, created_at: new Date().toISOString() },
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

import { registerStaffHandlers } from '../staff-handlers'
import * as validationUtils from '../../../utils/validation'

type Result = { success?: boolean; id?: number | bigint; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO staff (id, staff_number, first_name, last_name, basic_salary, is_active)
    VALUES (1, 'STF-001', 'Jane', 'Wanjiku', 50000, 1);

    INSERT INTO staff (id, staff_number, first_name, last_name, basic_salary, is_active)
    VALUES (2, 'STF-002', 'John', 'Kamau', 45000, 0);
  `)
}

describe('staff IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    db = new Database(':memory:')
    createSchema(db)
    registerStaffHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('registers all staff channels', () => {
    expect(handlerMap.has('staff:getAll')).toBe(true)
    expect(handlerMap.has('staff:getById')).toBe(true)
    expect(handlerMap.has('staff:create')).toBe(true)
    expect(handlerMap.has('staff:update')).toBe(true)
    expect(handlerMap.has('staff:setActive')).toBe(true)
  })

  it('getAll returns only active staff by default', async () => {
    const result = await invoke('staff:getAll') as unknown as unknown[]
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
    expect((result[0] as { staff_number: string }).staff_number).toBe('STF-001')
  })

  it('getAll returns all staff when activeOnly is false', async () => {
    const result = await invoke('staff:getAll', false) as unknown as unknown[]
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
  })

  it('getById returns a specific staff member', async () => {
    const result = await invoke('staff:getById', 1) as { first_name: string }
    expect(result.first_name).toBe('Jane')
  })

  it('create inserts a new staff member', async () => {
    const result = await invoke('staff:create', {
      staff_number: 'STF-003',
      first_name: 'Alice',
      last_name: 'Muthoni',
      basic_salary: 55000
    })
    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()

    const staff = db.prepare('SELECT * FROM staff WHERE staff_number = ?').get('STF-003') as { first_name: string }
    expect(staff.first_name).toBe('Alice')
  })

  it('create rejects missing required fields', async () => {
    const result = await invoke('staff:create', {
      staff_number: 'STF-004'
      // missing first_name and last_name
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('update modifies staff fields', async () => {
    const result = await invoke('staff:update', 1, {
      department: 'Science',
      job_title: 'Head of Science'
    })
    expect(result.success).toBe(true)

    const staff = db.prepare('SELECT department, job_title FROM staff WHERE id = 1').get() as { department: string; job_title: string }
    expect(staff.department).toBe('Science')
    expect(staff.job_title).toBe('Head of Science')
  })

  it('setActive toggles staff active status', async () => {
    const result = await invoke('staff:setActive', 2, true)
    expect(result.success).toBe(true)

    const staff = db.prepare('SELECT is_active FROM staff WHERE id = 2').get() as { is_active: number }
    expect(staff.is_active).toBe(1)
  })

  it('setActive deactivates a staff member', async () => {
    const result = await invoke('staff:setActive', 1, false)
    expect(result.success).toBe(true)

    const staff = db.prepare('SELECT is_active FROM staff WHERE id = 1').get() as { is_active: number }
    expect(staff.is_active).toBe(0)
  })

  it('create with is_active=false stores inactive staff', async () => {
    const result = await invoke('staff:create', {
      staff_number: 'STF-INACTIVE',
      first_name: 'Inactive',
      last_name: 'Staff',
      is_active: false
    })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT is_active FROM staff WHERE staff_number = ?').get('STF-INACTIVE') as { is_active: number }
    expect(row.is_active).toBe(0)
  })

  it('update with basic_salary persists the salary change', async () => {
    const result = await invoke('staff:update', 1, {
      basic_salary: 75000
    })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT basic_salary FROM staff WHERE id = 1').get() as { basic_salary: number }
    expect(row.basic_salary).toBe(75000)
  })

  it('create with all optional fields populates nullable columns', async () => {
    const result = await invoke('staff:create', {
      staff_number: 'STF-FULL',
      first_name: 'Full',
      middle_name: 'M',
      last_name: 'Staff',
      id_number: '12345678',
      kra_pin: 'A000000000B',
      nhif_number: 'NH123',
      nssf_number: 'NS456',
      phone: '0712345678',
      email: 'full@example.com',
      bank_name: 'KCB',
      bank_account: '1234567890',
      department: 'Math',
      job_title: 'HOD',
      employment_date: '2024-01-01',
      basic_salary: 80000
    })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT kra_pin, department, basic_salary FROM staff WHERE staff_number = ?').get('STF-FULL') as { kra_pin: string; department: string; basic_salary: number }
    expect(row.kra_pin).toBe('A000000000B')
    expect(row.department).toBe('Math')
    expect(row.basic_salary).toBe(80000)
  })

  // ── Branch coverage: update with is_active=true → mapOptionalActive(true)→1 ──
  it('update with is_active=true sets is_active to 1', async () => {
    const result = await invoke('staff:update', 2, { is_active: true })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT is_active FROM staff WHERE id = 2').get() as { is_active: number }
    expect(row.is_active).toBe(1)
  })

  // ── Branch coverage: update without basic_salary → buildUpdateParams undefined path ──
  it('update without basic_salary leaves salary unchanged', async () => {
    const result = await invoke('staff:update', 1, { department: 'Languages' })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT basic_salary, department FROM staff WHERE id = 1').get() as { basic_salary: number; department: string }
    expect(row.basic_salary).toBe(50000) // unchanged
    expect(row.department).toBe('Languages')
  })

  // ── Branch coverage: create with explicitly invalid salary ──
  it('create rejects explicitly provided invalid salary', async () => {
    const result = await invoke('staff:create', {
      staff_number: 'STF-BADSALARY',
      first_name: 'Bad',
      last_name: 'Salary',
      basic_salary: -999
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ── Branch coverage: toNullableString with null input ──
  it('create stores null for explicitly null nullable fields', async () => {
    const result = await invoke('staff:create', {
      staff_number: 'STF-NULL',
      first_name: 'Nullable',
      last_name: 'Fields',
      middle_name: null,
      phone: null,
      email: null
    })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT middle_name, phone, email FROM staff WHERE staff_number = ?').get('STF-NULL') as { middle_name: string | null; phone: string | null; email: string | null }
    // Handler coerces null to empty string for optional text fields
    expect(row.middle_name === null || row.middle_name === '').toBe(true)
    expect(row.phone === null || row.phone === '').toBe(true)
    expect(row.email === null || row.email === '').toBe(true)
  })

  // ── Branch coverage: create with basic_salary=null skips salary validation throw (L80-82) ──
  it('create with basic_salary null uses default salary of zero', async () => {
    const result = await invoke('staff:create', {
      staff_number: 'STF-NULLSAL',
      first_name: 'Null',
      last_name: 'Salary',
      basic_salary: null
    })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT basic_salary FROM staff WHERE staff_number = ?').get('STF-NULLSAL') as { basic_salary: number }
    expect(row.basic_salary).toBe(0)
  })

  // ── Branch coverage: update with invalid salary → validateAmount fails → null fallback (L111) ──
  it('update with invalid basic_salary leaves salary unchanged via COALESCE', async () => {
    const result = await invoke('staff:update', 1, {
      basic_salary: -500
    })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT basic_salary FROM staff WHERE id = 1').get() as { basic_salary: number }
    expect(row.basic_salary).toBe(50000) // unchanged due to COALESCE(null, basic_salary)
  })

  // ── Branch coverage: validateAmount returns { success: false } without error field → ?? fallback (L80) ──
  it('create uses fallback error message when validateAmount.error is undefined', async () => {
    const spy = vi.spyOn(validationUtils, 'validateAmount').mockReturnValueOnce({ success: false })
    const result = await invoke('staff:create', {
      staff_number: 'STF-FALLBACK',
      first_name: 'Fallback',
      last_name: 'Err',
      basic_salary: 1
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid salary amount')
    spy.mockRestore()
  })

  // ── Branch coverage: validateAmount returns { success: true } without data → ?? 0 fallback (L82) ──
  it('create defaults salary to 0 when validateAmount.data is undefined', async () => {
    const spy = vi.spyOn(validationUtils, 'validateAmount').mockReturnValueOnce({ success: true })
    const result = await invoke('staff:create', {
      staff_number: 'STF-NODATA',
      first_name: 'No',
      last_name: 'Data',
      basic_salary: 1
    })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT basic_salary FROM staff WHERE staff_number = ?').get('STF-NODATA') as { basic_salary: number }
    expect(row.basic_salary).toBe(0)
    spy.mockRestore()
  })

  // ── Branch coverage: buildUpdateParams → validateAmount returns { success: true } without data → ?? null (L111) ──
  it('update falls back to null salary when validateAmount.data is undefined', async () => {
    const spy = vi.spyOn(validationUtils, 'validateAmount').mockReturnValueOnce({ success: true })
    const result = await invoke('staff:update', 1, { basic_salary: 1 })
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT basic_salary FROM staff WHERE id = 1').get() as { basic_salary: number }
    expect(row.basic_salary).toBe(50000) // unchanged — COALESCE(null, basic_salary)
    spy.mockRestore()
  })
})
