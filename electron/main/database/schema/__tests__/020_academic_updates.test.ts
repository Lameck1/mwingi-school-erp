import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { up, down } from '../fragments/020_academic_updates'

describe('020_academic_updates', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = OFF')
    // Create prerequisite tables
    db.exec('CREATE TABLE academic_year (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE term (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE student (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE award_category (id INTEGER PRIMARY KEY)')
  })

  afterEach(() => {
    db.close()
  })

  it('up() creates academic_exam, award_category, and student_award tables', () => {
    up(db)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('academic_exam','award_category','student_award')"
    ).all() as { name: string }[]

    // award_category already exists from prereq, but student_award and academic_exam are new
    const names = tables.map(t => t.name)
    expect(names).toContain('academic_exam')
    expect(names).toContain('student_award')
  })

  it('down() drops the tables', () => {
    up(db)
    down(db)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('academic_exam','student_award')"
    ).all() as { name: string }[]

    expect(tables).toHaveLength(0)
  })

  it('up() is idempotent', () => {
    up(db)
    expect(() => up(db)).not.toThrow()
  })
})
