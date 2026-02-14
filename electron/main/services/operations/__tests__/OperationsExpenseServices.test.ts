import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { BoardingCostService } from '../BoardingCostService'
import { TransportCostService } from '../TransportCostService'

describe('Operations expense services', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_name TEXT NOT NULL,
        is_current BOOLEAN DEFAULT 0
      );
      CREATE TABLE term (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        term_number INTEGER NOT NULL,
        is_current BOOLEAN DEFAULT 0
      );
      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE gl_account (
        account_code TEXT PRIMARY KEY,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE boarding_facility (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE boarding_expense (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        facility_id INTEGER NOT NULL,
        gl_account_code TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        term INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        expense_type TEXT NOT NULL,
        description TEXT,
        recorded_date TEXT,
        recorded_by INTEGER NOT NULL
      );
      CREATE TABLE transport_route (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE transport_route_expense (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER NOT NULL,
        gl_account_code TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        term INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        expense_type TEXT NOT NULL,
        description TEXT,
        recorded_date TEXT,
        recorded_by INTEGER NOT NULL
      );
    `)

    db.prepare(`INSERT INTO academic_year (id, year_name, is_current) VALUES (1, '2026', 1)`).run()
    db.prepare(`INSERT INTO term (id, academic_year_id, term_number, is_current) VALUES (10, 1, 2, 1)`).run()
    db.prepare(`INSERT INTO user (id, is_active) VALUES (5, 1)`).run()
    db.prepare(`INSERT INTO gl_account (account_code, is_active) VALUES ('5000', 1)`).run()
    db.prepare(`INSERT INTO boarding_facility (id, is_active) VALUES (1, 1)`).run()
    db.prepare(`INSERT INTO transport_route (id, is_active) VALUES (1, 1)`).run()
  })

  afterEach(() => {
    db.close()
  })

  it('rejects boarding expense when payload period does not match active academic context', () => {
    const service = new BoardingCostService()

    expect(() => service.recordBoardingExpense({
      facility_id: 1,
      gl_account_code: '5000',
      fiscal_year: 2026,
      term: 1,
      amount_cents: 10000,
      expense_type: 'FOOD',
      description: 'Food supplies',
      recorded_by: 5
    })).toThrow('active period')
  })

  it('rejects transport expense with blank GL account code', () => {
    const service = new TransportCostService()

    expect(() => service.recordTransportExpense({
      route_id: 1,
      gl_account_code: '   ',
      fiscal_year: 2026,
      term: 2,
      amount_cents: 15000,
      expense_type: 'FUEL',
      description: 'Fuel top-up',
      recorded_by: 5
    })).toThrow('GL account code is required')
  })

  it('records transport expense when payload is valid and in active context', () => {
    const service = new TransportCostService()

    const expenseId = service.recordTransportExpense({
      route_id: 1,
      gl_account_code: '5000',
      fiscal_year: 2026,
      term: 2,
      amount_cents: 15000,
      expense_type: 'FUEL',
      description: 'Fuel top-up',
      recorded_by: 5
    })

    expect(expenseId).toBeGreaterThan(0)
  })
})
