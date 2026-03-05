/**
 * Tests for the abstract BaseService template via a concrete TestWidgetService.
 *
 * This exercises every branch in BaseService:
 * - findById / findAll / exists
 * - create (validation, success, DB error)
 * - update (not-found, validation, success, DB error)
 * - delete (not-found, success)
 * - getAuditTrail
 * - buildFilteredQuery + applyFilters override
 * - getTableAlias / getTablePrefix
 */
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { BaseService } from '../../base/BaseService'

/* ------------------------------------------------------------------ */
/*  Mock getDatabase / logAudit                                       */
/* ------------------------------------------------------------------ */
let testDb: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => testDb,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

/* ------------------------------------------------------------------ */
/*  Concrete TestWidgetService extending BaseService                  */
/* ------------------------------------------------------------------ */
interface Widget {
  id: number
  name: string
  colour: string
  weight: number
}

interface WidgetCreate {
  name: string
  colour: string
  weight: number
}

interface WidgetFilters {
  colour?: string
  search?: string
}

class TestWidgetService extends BaseService<Widget, WidgetCreate, Partial<WidgetCreate>, WidgetFilters> {
  protected getTableName(): string { return 'widget' }
  protected getPrimaryKey(): string { return 'id' }
  protected buildSelectQuery(): string { return 'SELECT * FROM widget' }
  protected mapRowToEntity(row: unknown): Widget { return row as Widget }

  protected validateCreate(data: WidgetCreate): string[] | null {
    const errors: string[] = []
    if (!data.name) { errors.push('name is required') }
    if (data.weight < 0) { errors.push('weight must be non-negative') }
    return errors.length > 0 ? errors : null
  }

  protected async validateUpdate(_id: number, data: Partial<WidgetCreate>): Promise<string[] | null> {
    if (data.weight !== undefined && data.weight < 0) { return ['weight must be non-negative'] }
    return null
  }

  protected executeCreate(data: WidgetCreate) {
    return this.db.prepare(
      'INSERT INTO widget (name, colour, weight) VALUES (?, ?, ?)',
    ).run(data.name, data.colour, data.weight)
  }

  protected executeUpdate(id: number, data: Partial<WidgetCreate>): void {
    const sets: string[] = []
    const params: unknown[] = []
    if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
    if (data.colour !== undefined) { sets.push('colour = ?'); params.push(data.colour) }
    if (data.weight !== undefined) { sets.push('weight = ?'); params.push(data.weight) }
    if (sets.length === 0) { return }
    params.push(id)
    this.db.prepare(`UPDATE widget SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }

  protected applyFilters(filters: WidgetFilters, conditions: string[], params: unknown[]): void {
    if (filters.colour) { conditions.push('colour = ?'); params.push(filters.colour) }
    if (filters.search) { conditions.push('name LIKE ?'); params.push(`%${filters.search}%`) }
  }
}

/* ------------------------------------------------------------------ */
/*  Aliased variant to test getTableAlias / getTablePrefix            */
/* ------------------------------------------------------------------ */
class AliasedWidgetService extends TestWidgetService {
  protected override getTableAlias(): string { return 'w' }
  protected override buildSelectQuery(): string { return 'SELECT w.* FROM widget w' }
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                  */
/* ------------------------------------------------------------------ */
function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE widget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      colour TEXT NOT NULL,
      weight REAL NOT NULL CHECK(weight >= 0)
    );
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );
    INSERT INTO user (id, username, password_hash, full_name, role) VALUES (1, 'tester', 'hash', 'Test User', 'ADMIN');
  `)
}

/* ================================================================== */
describe('BaseService (via TestWidgetService)', () => {
  let db: Database.Database
  let service: TestWidgetService

  beforeEach(() => {
    db = new Database(':memory:')
    testDb = db
    createSchema(db)
    service = new TestWidgetService()
  })

  afterEach(() => { db.close() })

  /* ------ create ------- */
  describe('create', () => {
    it('inserts a row and returns success + id', async () => {
      const result = await service.create({ name: 'Sprocket', colour: 'red', weight: 5 }, 1)
      expect(result).toEqual({ success: true, id: 1 })
    })

    it('returns validation errors when name is empty', async () => {
      const result = await service.create({ name: '', colour: 'blue', weight: 2 }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('name is required')
      expect(result.id).toBe(0)
    })

    it('returns validation errors when weight is negative', async () => {
      const result = await service.create({ name: 'Bad', colour: 'x', weight: -1 }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('weight must be non-negative')
    })

    it('returns multiple validation errors', async () => {
      const result = await service.create({ name: '', colour: 'x', weight: -1 }, 1)
      expect(result.success).toBe(false)
      expect(result.errors!.length).toBe(2)
    })

    it('calls logAudit on success', async () => {
      const { logAudit } = await import('../../../database/utils/audit')
      await service.create({ name: 'A', colour: 'b', weight: 0 }, 1)
      expect(logAudit).toHaveBeenCalledWith(
        1, 'CREATE', 'widget', 1, null,
        { name: 'A', colour: 'b', weight: 0 },
      )
    })

    it('catches DB constraint error and returns errors array', async () => {
      // Insert a row then try to trigger a constraint failure
      // The CHECK(weight >= 0) is validated in our code, so let's test a unique constraint:
      // widget doesn't have UNIQUE on name, so we'll just verify the error handling path
      // by mocking executeCreate to throw
      const orig = (service as any).executeCreate.bind(service)
      ;(service as any).executeCreate = () => { throw new Error('UNIQUE constraint failed') }
      const result = await service.create({ name: 'Dup', colour: 'x', weight: 1 }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toEqual(['UNIQUE constraint failed'])
      ;(service as any).executeCreate = orig
    })
  })

  /* ------ findById ------- */
  describe('findById', () => {
    it('returns the entity when found', async () => {
      db.exec("INSERT INTO widget (name, colour, weight) VALUES ('W', 'green', 3)")
      const widget = await service.findById(1)
      expect(widget).toMatchObject({ id: 1, name: 'W', colour: 'green', weight: 3 })
    })

    it('returns null for non-existent id', async () => {
      expect(await service.findById(999)).toBeNull()
    })
  })

  /* ------ findAll ------- */
  describe('findAll', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO widget (name, colour, weight) VALUES ('A', 'red', 1);
        INSERT INTO widget (name, colour, weight) VALUES ('B', 'blue', 2);
        INSERT INTO widget (name, colour, weight) VALUES ('C', 'red', 3);
      `)
    })

    it('returns all rows when no filters', async () => {
      const all = await service.findAll()
      expect(all.length).toBe(3)
    })

    it('filters by colour', async () => {
      const reds = await service.findAll({ colour: 'red' })
      expect(reds.length).toBe(2)
      expect(reds.every(w => w.colour === 'red')).toBe(true)
    })

    it('filters by search', async () => {
      const result = await service.findAll({ search: 'B' })
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('B')
    })

    it('applies multiple filters (AND)', async () => {
      const result = await service.findAll({ colour: 'red', search: 'A' })
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('A')
    })
  })

  /* ------ exists ------- */
  describe('exists', () => {
    it('returns true for existing', async () => {
      db.exec("INSERT INTO widget (name, colour, weight) VALUES ('X', 'y', 0)")
      expect(await service.exists(1)).toBe(true)
    })

    it('returns false for non-existent', async () => {
      expect(await service.exists(999)).toBe(false)
    })
  })

  /* ------ update ------- */
  describe('update', () => {
    beforeEach(() => {
      db.exec("INSERT INTO widget (name, colour, weight) VALUES ('Old', 'grey', 10)")
    })

    it('updates successfully', async () => {
      const result = await service.update(1, { name: 'New' }, 1)
      expect(result).toEqual({ success: true })
      const row = db.prepare('SELECT name FROM widget WHERE id = 1').get() as { name: string }
      expect(row.name).toBe('New')
    })

    it('returns not-found for missing id', async () => {
      const result = await service.update(999, { name: 'X' }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Record not found')
    })

    it('returns validation errors for invalid data', async () => {
      const result = await service.update(1, { weight: -5 }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('weight must be non-negative')
    })

    it('calls logAudit with old and new data', async () => {
      const { logAudit } = await import('../../../database/utils/audit')
      ;(logAudit as ReturnType<typeof vi.fn>).mockClear()
      await service.update(1, { colour: 'pink' }, 1)
      expect(logAudit).toHaveBeenCalledWith(
        1, 'UPDATE', 'widget', 1,
        expect.objectContaining({ name: 'Old' }),
        { colour: 'pink' },
      )
    })
  })

  /* ------ delete ------- */
  describe('delete', () => {
    beforeEach(() => {
      db.exec("INSERT INTO widget (name, colour, weight) VALUES ('Del', 'x', 0)")
    })

    it('deletes successfully', async () => {
      const result = await service.delete(1, 1)
      expect(result).toEqual({ success: true })
      expect(db.prepare('SELECT * FROM widget WHERE id=1').get()).toBeUndefined()
    })

    it('returns not-found for missing id', async () => {
      const result = await service.delete(999, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Record not found')
    })

    it('calls logAudit with full old record', async () => {
      const { logAudit } = await import('../../../database/utils/audit')
      ;(logAudit as ReturnType<typeof vi.fn>).mockClear()
      await service.delete(1, 1)
      expect(logAudit).toHaveBeenCalledWith(
        1, 'DELETE', 'widget', 1,
        expect.objectContaining({ id: 1, name: 'Del' }),
        null,
      )
    })
  })

  /* ------ getAuditTrail ------- */
  describe('getAuditTrail', () => {
    it('returns audit entries ordered by created_at DESC', async () => {
      db.exec(`
        INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values, created_at)
        VALUES (1, 'CREATE', 'widget', 42, '{}', '2025-01-01 00:00:00');
        INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values, created_at)
        VALUES (1, 'UPDATE', 'widget', 42, '{}', '2025-06-01 00:00:00');
      `)
      const trail = await service.getAuditTrail(42)
      expect(trail.length).toBe(2)
      expect(trail[0].action_type).toBe('UPDATE') // most recent first
      expect(trail[0].user_name).toBe('Test User')
    })

    it('returns empty array when no audit entries', async () => {
      const trail = await service.getAuditTrail(999)
      expect(trail).toEqual([])
    })
  })
})

/* ================================================================== */
describe('BaseService with table alias (AliasedWidgetService)', () => {
  let db: Database.Database
  let service: AliasedWidgetService

  beforeEach(() => {
    db = new Database(':memory:')
    testDb = db
    createSchema(db)
    service = new AliasedWidgetService()
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('Aliased', 'gold', 7)")
  })

  afterEach(() => { db.close() })

  it('getTablePrefix includes alias', () => {
    // Access protected method via cast
    expect((service as any).getTablePrefix()).toBe('w.')
  })

  it('findById works with aliased query', async () => {
    const widget = await service.findById(1)
    expect(widget).toMatchObject({ name: 'Aliased', colour: 'gold' })
  })

  it('findAll works with aliased query', async () => {
    const all = await service.findAll()
    expect(all.length).toBe(1)
  })
})

/* ================================================================== */
describe('BaseService – uncovered branches', () => {
  let db: Database.Database
  let service: TestWidgetService

  beforeEach(() => {
    db = new Database(':memory:')
    testDb = db
    createSchema(db)
    service = new TestWidgetService()
  })

  afterEach(() => { db.close() })

  it('update catches DB error and returns errors array', async () => {
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('Old', 'grey', 10)")
    const orig = (service as any).executeUpdate.bind(service)
    ;(service as any).executeUpdate = () => { throw new Error('DB write failed') }
    const result = await service.update(1, { name: 'New' }, 1)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['DB write failed'])
    ;(service as any).executeUpdate = orig
  })

  it('update catches non-Error throw and returns Unknown error', async () => {
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('Old', 'grey', 10)")
    const orig = (service as any).executeUpdate.bind(service)
    ;(service as any).executeUpdate = () => {
      throw 'string error' // NOSONAR intentional: testing non-Error catch branch
    }
    const result = await service.update(1, { name: 'New' }, 1)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['Unknown error'])
    ;(service as any).executeUpdate = orig
  })

  it('delete catches DB error and returns errors array', async () => {
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('Del', 'x', 0)")
    // Close the underlying db to force an error on the delete query
    const origPrepare = db.prepare.bind(db)
    let firstCall = true
    ;(db as any).prepare = (...args: unknown[]) => {
      const stmt = origPrepare(args[0] as string)
      if (firstCall && typeof args[0] === 'string' && (args[0] as string).includes('DELETE')) {
        firstCall = false
        return { run: () => { throw new Error('Cannot delete') } }
      }
      return stmt
    }
    const result = await service.delete(1, 1)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['Cannot delete'])
  })

  it('create catches non-Error throw and returns Unknown error', async () => {
    const orig = (service as any).executeCreate.bind(service)
    ;(service as any).executeCreate = () => {
      throw 42 // NOSONAR intentional: testing non-Error catch branch
    }
    const result = await service.create({ name: 'X', colour: 'y', weight: 1 }, 1)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['Unknown error'])
    ;(service as any).executeCreate = orig
  })

  it('getGroupBy returns empty string by default', () => {
    expect((service as any).getGroupBy()).toBe('')
  })

  it('findAll with undefined filters returns all rows', async () => {
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('A', 'red', 1)")
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('B', 'blue', 2)")
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    const all = await service.findAll(undefined)
    expect(all.length).toBe(2)
  })

  it('findAll with empty filters object returns all rows', async () => {
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('A', 'red', 1)")
    const all = await service.findAll({})
    expect(all.length).toBe(1)
  })

  it('delete catches non-Error throw and returns Unknown error', async () => {
    db.exec("INSERT INTO widget (name, colour, weight) VALUES ('Del', 'x', 0)")
    const origPrepare = db.prepare.bind(db)
    ;(db as any).prepare = (...args: unknown[]) => {
      const stmt = origPrepare(args[0] as string)
      if (typeof args[0] === 'string' && (args[0] as string).includes('DELETE')) {
        return {
          run: () => {
            throw 'string error in delete' // NOSONAR intentional: testing non-Error catch branch
          },
        }
      }
      return stmt
    }
    const result = await service.delete(1, 1)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['Unknown error'])
  })
})
