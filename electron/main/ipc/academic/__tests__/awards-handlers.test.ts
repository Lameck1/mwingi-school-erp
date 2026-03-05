import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

const { sessionData } = vi.hoisted(() => ({
  sessionData: {
    userId: 1,
    role: 'ADMIN' as string
  }
}))

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

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: sessionData.userId,
      username: 'admin',
      role: sessionData.role,
      full_name: 'Admin User',
      email: 'a@a.com',
      is_active: 1,
      last_login: null,
      created_at: '2026-01-01T00:00:00'
    },
    lastActivity: Date.now()
  })),
  clearSessionCache: vi.fn()
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

import { registerAwardsHandlers } from '../awards-handlers'

type Result = { success?: boolean; status?: string; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE award_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_type TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT,
      first_name TEXT,
      last_name TEXT
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT
    );

    CREATE TABLE student_award (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      award_category_id INTEGER NOT NULL,
      academic_year_id INTEGER,
      term_id INTEGER,
      awarded_date TEXT,
      remarks TEXT,
      approval_status TEXT DEFAULT 'pending',
      assigned_by_user_id INTEGER,
      approved_by_user_id INTEGER,
      approved_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO award_category (id, name, category_type) VALUES (1, 'Academic Excellence', 'ACADEMIC');
    INSERT INTO student (id, admission_number, first_name, last_name) VALUES (1, 'ADM001', 'John', 'Doe');
    INSERT INTO user (id, full_name) VALUES (1, 'Admin User');
  `)
}

describe('awards IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionData.userId = 1
    sessionData.role = 'ADMIN'
    db = new Database(':memory:')
    createSchema(db)
    registerAwardsHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('registers all awards channels', () => {
    expect(handlerMap.has('awards:assign')).toBe(true)
    expect(handlerMap.has('awards:approve')).toBe(true)
    expect(handlerMap.has('awards:reject')).toBe(true)
    expect(handlerMap.has('awards:delete')).toBe(true)
    expect(handlerMap.has('awards:getAll')).toBe(true)
    expect(handlerMap.has('awards:getPendingCount')).toBe(true)
    expect(handlerMap.has('awards:getStudentAwards')).toBe(true)
    expect(handlerMap.has('awards:getById')).toBe(true)
    expect(handlerMap.has('awards:getCategories')).toBe(true)
  })

  it('assigns an award with auto-approve for ADMIN', async () => {
    const result = await invoke('awards:assign', {
      studentId: 1,
      categoryId: 1,
      academicYearId: 1,
      termId: 1,
      remarks: 'Top student'
    })
    expect(result.status).toBe('success')
    expect(result.approval_status).toBe('approved')
    expect(result.auto_approved).toBe(true)
    expect(result.id).toBeDefined()
  })

  it('approves a pending award', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'pending', 1)
    `).run()
    const awardId = 1

    const result = await invoke('awards:approve', { awardId })
    expect(result.status).toBe('success')

    const award = db.prepare('SELECT approval_status FROM student_award WHERE id = ?').get(awardId) as { approval_status: string }
    expect(award.approval_status).toBe('approved')
  })

  it('rejects a pending award', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'pending', 1)
    `).run()

    const result = await invoke('awards:reject', { awardId: 1, reason: 'Insufficient evidence' })
    expect(result.status).toBe('success')

    const award = db.prepare('SELECT approval_status, rejection_reason FROM student_award WHERE id = ?').get(1) as { approval_status: string; rejection_reason: string }
    expect(award.approval_status).toBe('rejected')
    expect(award.rejection_reason).toBe('Insufficient evidence')
  })

  it('deletes a non-approved award', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'pending', 1)
    `).run()

    const result = await invoke('awards:delete', 1)
    expect(result.status).toBe('success')

    const count = db.prepare('SELECT COUNT(*) as count FROM student_award WHERE id = 1').get() as { count: number }
    expect(count.count).toBe(0)
  })

  it('prevents deleting an approved award', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()

    const result = await invoke('awards:delete', 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot delete an approved award')
  })

  it('gets all awards with optional filters', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()

    const result = await invoke('awards:getAll', {}) as unknown as unknown[]
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('approve throws when award not found', async () => {
    const result = await invoke('awards:approve', { awardId: 9999 })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Award not found')
  })

  it('approve throws when award is not pending', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()
    const result = await invoke('awards:approve', { awardId: 1 })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot approve award')
  })

  it('reject throws when award not found', async () => {
    const result = await invoke('awards:reject', { awardId: 9999, reason: 'test' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Award not found')
  })

  it('reject throws when award is not pending', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'rejected', 1)
    `).run()
    const result = await invoke('awards:reject', { awardId: 1, reason: 'already done' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot reject award')
  })

  it('delete throws when award not found', async () => {
    const result = await invoke('awards:delete', 9999)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Award not found')
  })

  it('getAll filters by status', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'pending', 1)
    `).run()
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()

    const pending = await invoke('awards:getAll', { status: 'pending' }) as unknown as unknown[]
    expect(pending.length).toBe(1)

    const allStatus = await invoke('awards:getAll', { status: 'all' }) as unknown as unknown[]
    expect(allStatus.length).toBe(2)
  })

  it('getAll filters by categoryId', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'pending', 1)
    `).run()

    const result = await invoke('awards:getAll', { categoryId: 1 }) as unknown as unknown[]
    expect(result.length).toBe(1)

    const empty = await invoke('awards:getAll', { categoryId: 999 }) as unknown as unknown[]
    expect(empty.length).toBe(0)
  })

  it('getAll filters by academicYearId and termId', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, term_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 2025, 1, 'pending', 1)
    `).run()

    const result = await invoke('awards:getAll', { academicYearId: 2025, termId: 1 }) as unknown as unknown[]
    expect(result.length).toBe(1)

    const empty = await invoke('awards:getAll', { academicYearId: 2024 }) as unknown as unknown[]
    expect(empty.length).toBe(0)
  })

  it('getPendingCount returns count of pending awards', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'pending', 1)
    `).run()
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()

    const result = await invoke('awards:getPendingCount') as unknown as number
    expect(result).toBe(1)
  })

  it('getStudentAwards returns awards for a student', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()

    const result = await invoke('awards:getStudentAwards', 1) as unknown as unknown[]
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
  })

  it('getById returns a single award with details', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()

    const result = await invoke('awards:getById', 1) as any
    expect(result).toBeDefined()
    expect(result.student_id).toBe(1)
    expect(result.category_name).toBe('Academic Excellence')
  })

  it('getCategories returns active categories', async () => {
    const result = await invoke('awards:getCategories') as unknown as unknown[]
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
  })

  // ── branch coverage: getAll with status='all' returns all statuses ──
  it('getAll with status=all returns awards regardless of approval status', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'pending', 1)
    `).run()
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'rejected', 1)
    `).run()
    const result = await invoke('awards:getAll', { status: 'all' }) as unknown as unknown[]
    expect(result.length).toBe(3)
  })

  // ── branch coverage: approve already approved award ──
  it('approve returns error for already approved award', async () => {
    db.prepare(`
      INSERT INTO student_award (student_id, award_category_id, academic_year_id, approval_status, assigned_by_user_id)
      VALUES (1, 1, 1, 'approved', 1)
    `).run()
    const awardId = (db.prepare('SELECT id FROM student_award ORDER BY id DESC LIMIT 1').get() as { id: number }).id
    const result = await invoke('awards:approve', awardId) as any
    expect(result.success === false || result.error !== undefined || result.changes === 0).toBeTruthy()
  })

  // ── branch coverage: awards:assign with non-approver role (TEACHER) → pending status ──
  it('assigns award with pending status for non-approver role (TEACHER)', async () => {
    sessionData.role = 'TEACHER'
    const result = await invoke('awards:assign', {
      studentId: 1,
      categoryId: 1,
      academicYearId: 1,
      termId: 1,
      remarks: 'Good student'
    })
    expect(result.status).toBe('success')
    expect(result.approval_status).toBe('pending')
    expect(result.auto_approved).toBe(false)

    const award = db.prepare('SELECT approval_status, approved_by_user_id, approved_at FROM student_award ORDER BY id DESC LIMIT 1').get() as { approval_status: string; approved_by_user_id: number | null; approved_at: string | null }
    expect(award.approval_status).toBe('pending')
    expect(award.approved_by_user_id).toBeNull()
    expect(award.approved_at).toBeNull()
  })

  // ── branch coverage: awards:assign without optional termId and remarks ──
  it('assigns award without termId and remarks (null fallbacks)', async () => {
    const result = await invoke('awards:assign', {
      studentId: 1,
      categoryId: 1,
      academicYearId: 1,
    })
    expect(result.status).toBe('success')
    expect(result.id).toBeDefined()
  })
})
