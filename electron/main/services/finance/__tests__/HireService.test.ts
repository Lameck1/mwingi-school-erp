import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { HireService } from '../HireService'

describe('HireService status transitions', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE hire_asset (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_name TEXT
      );
      CREATE TABLE hire_client (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT
      );
      CREATE TABLE hire_booking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_number TEXT UNIQUE NOT NULL,
        asset_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL,
        hire_date TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        updated_at TEXT
      );
      CREATE TABLE hire_payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        receipt_number TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        payment_reference TEXT,
        payment_date TEXT NOT NULL,
        notes TEXT,
        is_voided INTEGER DEFAULT 0,
        recorded_by_user_id INTEGER
      );
      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT
      );
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT,
        payment_reference TEXT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        description TEXT,
        recorded_by_user_id INTEGER
      );
    `)

    db.prepare(`INSERT INTO hire_asset (id, asset_name) VALUES (1, 'School Bus')`).run()
    db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Jane Doe')`).run()
    db.prepare(`INSERT INTO transaction_category (id, category_name) VALUES (1, 'Other Income')`).run()
  })

  afterEach(() => {
    db.close()
  })

  it('rejects invalid status transition from COMPLETED to PENDING', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (10, 'HB-10', 1, 1, '2026-02-14', 10000, 10000, 'COMPLETED')
    `).run()

    const service = new HireService()
    const result = service.updateBookingStatus(10, 'PENDING')

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Invalid status transition')
  })

  it('prevents marking booking as COMPLETED when outstanding balance exists', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (11, 'HB-11', 1, 1, '2026-02-14', 12000, 2000, 'IN_PROGRESS')
    `).run()

    const service = new HireService()
    const result = service.updateBookingStatus(11, 'COMPLETED')

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('before full payment')
  })

  it('allows valid transition from PENDING to CONFIRMED', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (12, 'HB-12', 1, 1, '2026-02-14', 12000, 0, 'PENDING')
    `).run()

    const service = new HireService()
    const result = service.updateBookingStatus(12, 'CONFIRMED')

    expect(result.success).toBe(true)

    const updated = db.prepare(`SELECT status FROM hire_booking WHERE id = 12`).get() as { status: string }
    expect(updated.status).toBe('CONFIRMED')
  })

  it('clamps pending hire stats to zero for overpaid bookings', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (13, 'HB-13', 1, 1, '2026-02-14', 10000, 15000, 'COMPLETED')
    `).run()

    const service = new HireService()
    const stats = service.getHireStats()

    expect(stats.pendingAmount).toBe(0)
  })
})
