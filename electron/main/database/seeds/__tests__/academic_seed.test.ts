import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { up, down } from '../academic_seed'

describe('academic_seed', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = OFF')
    // Create tables the seed needs
    db.exec(`CREATE TABLE grading_scale (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curriculum TEXT NOT NULL,
      grade TEXT NOT NULL,
      min_score INTEGER NOT NULL,
      max_score INTEGER NOT NULL,
      points REAL NOT NULL,
      remarks TEXT,
      UNIQUE(curriculum, grade)
    )`)
    db.exec(`CREATE TABLE subject (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      curriculum TEXT NOT NULL,
      is_compulsory INTEGER DEFAULT 0
    )`)
  })

  afterEach(() => {
    db.close()
  })

  it('up() seeds 8-4-4 grading scale', () => {
    up(db)
    const grades844 = db.prepare("SELECT COUNT(*) as cnt FROM grading_scale WHERE curriculum = '8-4-4'").get() as { cnt: number }
    expect(grades844.cnt).toBe(12)
  })

  it('up() seeds CBC grading scale with 8 levels', () => {
    up(db)
    const gradesCBC = db.prepare("SELECT COUNT(*) as cnt FROM grading_scale WHERE curriculum = 'CBC'").get() as { cnt: number }
    expect(gradesCBC.cnt).toBe(8)
  })

  it('up() seeds ECDE grading scale', () => {
    up(db)
    const gradesECDE = db.prepare("SELECT COUNT(*) as cnt FROM grading_scale WHERE curriculum = 'ECDE'").get() as { cnt: number }
    expect(gradesECDE.cnt).toBe(8)
  })

  it('up() seeds ECDE, CBC, and JSS subjects', () => {
    up(db)
    const subjects = db.prepare('SELECT COUNT(*) as cnt FROM subject').get() as { cnt: number }
    expect(subjects.cnt).toBeGreaterThanOrEqual(20)
  })

  it('up() is idempotent', () => {
    up(db)
    expect(() => up(db)).not.toThrow()
  })

  it('down() does not throw', () => {
    expect(() => down()).not.toThrow()
  })
})
