import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

import { PromotionService } from '../PromotionService'

describe('PromotionService.promoteStudent', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        academic_term_id INTEGER,
        stream_id INTEGER NOT NULL,
        student_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('fails when student is not actively enrolled in the source stream/year', async () => {
    const service = new PromotionService()

    const result = await service.promoteStudent({
      student_id: 10,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('not actively enrolled')
  })

  it('rejects promotion when target academic year already has active enrollment in different stream', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES
        (10, 2025, 3, 3, 1, 'BOARDER', 'ACTIVE'),
        (10, 2026, 1, 1, 4, 'BOARDER', 'ACTIVE');
    `)

    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 10,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('active enrollment in the target academic year')
  })

  it('promotes student by updating source status and creating target active enrollment', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES (10, 2025, 3, 3, 1, 'DAY_SCHOLAR', 'ACTIVE');
    `)

    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 10,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)

    expect(result.success).toBe(true)

    const source = db.prepare(`
      SELECT status
      FROM enrollment
      WHERE student_id = 10 AND academic_year_id = 2025 AND stream_id = 1
      LIMIT 1
    `).get() as { status: string }
    expect(source.status).toBe('PROMOTED')

    const target = db.prepare(`
      SELECT status, stream_id, student_type, term_id, academic_term_id
      FROM enrollment
      WHERE student_id = 10 AND academic_year_id = 2026
      LIMIT 1
    `).get() as { status: string; stream_id: number; student_type: string; term_id: number; academic_term_id: number }

    expect(target.status).toBe('ACTIVE')
    expect(target.stream_id).toBe(2)
    expect(target.student_type).toBe('DAY_SCHOLAR')
    expect(target.term_id).toBe(1)
    expect(target.academic_term_id).toBe(1)
  })
})
