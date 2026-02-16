import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { CBCStrandService } from '../CBCStrandService'

describe('CBCStrandService', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE cbc_strand (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE fee_category_strand (
        fee_category_id INTEGER NOT NULL,
        cbc_strand_id INTEGER NOT NULL
      );
      CREATE TABLE invoice_item (
        id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        fee_category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        term_id INTEGER,
        invoice_date TEXT NOT NULL
      );
      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        term_number INTEGER NOT NULL
      );
    `)

    db.prepare(`INSERT INTO cbc_strand (id, code, name) VALUES (1, 'ART', 'Arts')`).run()
    db.prepare(`INSERT INTO term (id, term_number) VALUES (11, 1)`).run()
    db.prepare(`INSERT INTO fee_category_strand (fee_category_id, cbc_strand_id) VALUES (5, 1)`).run()
    db.prepare(`INSERT INTO fee_invoice (id, student_id, term_id, invoice_date) VALUES (8, 101, 11, '2026-02-10')`).run()
    db.prepare(`INSERT INTO invoice_item (invoice_id, fee_category_id, amount) VALUES (8, 5, 4000)`).run()
  })

  afterEach(() => {
    db.close()
  })

  it('calculates strand revenue without SQL alias errors', () => {
    const service = new CBCStrandService()
    const revenue = service.getStrandRevenue(2026, 1)

    expect(revenue).toHaveLength(1)
    expect(revenue[0].strand_name).toBe('Arts')
    expect(revenue[0].total_fees_cents).toBe(4000)
    expect(revenue[0].student_count).toBe(1)
  })
})
