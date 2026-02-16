import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AgedReceivablesService } from '../AgedReceivablesService'

describe('AgedReceivablesService normalization', () => {
  let db: Database.Database
  let service: AgedReceivablesService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT NOT NULL,
        phone TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT,
        due_date TEXT NOT NULL,
        invoice_date TEXT,
        created_at TEXT
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        amount REAL
      );

      CREATE TABLE collection_action (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        action_date TEXT NOT NULL,
        notes TEXT
      );
    `)

    db.exec(`
      INSERT INTO student (id, first_name, last_name, admission_number, phone)
      VALUES (1, 'Grace', 'Mutua', 'ADM-001', '0700000000');

      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status, due_date, invoice_date, created_at)
      VALUES
        (1, 1, 0, 17000, 17000, 2000, 'partial', '2026-01-10', '2026-01-02', '2026-01-02T08:00:00.000Z'),
        (2, 1, 9000, 9000, 9000, 0, 'cancelled', '2026-01-12', '2026-01-03', '2026-01-03T08:00:00.000Z'),
        (3, 1, NULL, NULL, 5000, 1000, 'OUTSTANDING', '2026-01-14', '2026-01-04', '2026-01-04T08:00:00.000Z');

      INSERT INTO ledger_transaction (id, student_id, transaction_type, transaction_date, amount)
      VALUES
        (1, 1, 'FEE_PAYMENT', date('now', '-1 day'), 4200),
        (2, 1, 'PAYMENT', date('now', '-2 day'), 300);
    `)

    service = new AgedReceivablesService(db)
  })

  afterEach(() => {
    db.close()
  })

  it('uses normalized outstanding balance for aging buckets', async () => {
    const buckets = await service.generateAgedReceivablesReport('2026-02-16')
    const accounts = buckets.flatMap((bucket) => bucket.accounts)

    expect(accounts).toHaveLength(1)
    expect(accounts[0].amount).toBe(15000)
  })

  it('excludes cancelled invoices from outstanding metrics and keeps lowercase statuses', async () => {
    const report = await service.getCollectionsEffectivenessReport()

    expect(report.outstanding_metrics.total_outstanding_invoices).toBe(2)
    expect(report.outstanding_metrics.total_outstanding_amount).toBe(19000)
  })

  it('includes canonical fee payment transaction types in collection metrics', async () => {
    const report = await service.getCollectionsEffectivenessReport()

    expect(report.collection_metrics.total_payments).toBe(2)
    expect(report.collection_metrics.total_amount_collected).toBe(4500)
    expect(report.collection_metrics.unique_students_paying).toBe(1)
  })

  it('derives last payment date from canonical fee payments', async () => {
    const buckets = await service.generateAgedReceivablesReport('2026-02-16')
    const account = buckets.flatMap((bucket) => bucket.accounts).at(0)

    expect(account?.last_payment_date).toBeTruthy()
    expect(account?.last_payment_date).not.toBe('N/A')
  })
})
