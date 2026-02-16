import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { ReportScheduler } from '../ReportScheduler'

interface SchedulerInternals {
  generateReportPayload(schedule: {
    id: number
    report_name: string
    report_type: string
    parameters: string
    schedule_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TERM_END' | 'YEAR_END'
    day_of_week: number | null
    day_of_month: number | null
    time_of_day: string
    recipients: string
    export_format: 'PDF' | 'EXCEL' | 'CSV'
    is_active: boolean
    last_run_at: string | null
    next_run_at: string | null
    created_by_user_id: number
    created_at: string
  }, startDate: string, endDate: string): Promise<Array<{ invoice_number: string; balance: number }>>
}

describe('ReportScheduler defaulters payload normalization', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        invoice_number TEXT NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT,
        due_date TEXT
      );
    `)

    db.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name)
      VALUES
        (1, 'ADM-001', 'Grace', 'Mutua'),
        (2, 'ADM-002', 'Sarah', 'Ochieng');

      INSERT INTO fee_invoice (id, student_id, invoice_number, total_amount, amount_due, amount, amount_paid, status, due_date)
      VALUES
        (1, 1, 'INV-1', 0, 17000, 17000, 0, 'pending', '2026-01-10'),
        (2, 2, 'INV-2', NULL, NULL, 9000, 1000, 'partial', '2026-01-12'),
        (3, 1, 'INV-3', 9000, 9000, 9000, 0, 'cancelled', '2026-01-14');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('includes lowercase outstanding statuses and excludes cancelled invoices', async () => {
    const scheduler = new ReportScheduler()
    const schedule = {
      id: 1,
      report_name: 'Defaulters',
      report_type: 'DEFAULTERS_LIST',
      parameters: '{}',
      schedule_type: 'DAILY' as const,
      day_of_week: null,
      day_of_month: null,
      time_of_day: '09:00',
      recipients: '[]',
      export_format: 'PDF' as const,
      is_active: true,
      last_run_at: null,
      next_run_at: null,
      created_by_user_id: 1,
      created_at: '2026-01-01T00:00:00.000Z'
    }

    const payload = await (scheduler as unknown as SchedulerInternals)
      .generateReportPayload(schedule, '2026-01-01', '2026-01-31')

    expect(payload).toHaveLength(2)
    expect(payload[0]).toMatchObject({ invoice_number: 'INV-1', balance: 17000 })
    expect(payload[1]).toMatchObject({ invoice_number: 'INV-2', balance: 8000 })
  })
})
