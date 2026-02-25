import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScheduledReport } from '../ReportScheduler'

let db: Database.Database
const logAuditMock = vi.fn()
const notificationSendMock = vi.fn()
const trialBalanceMock = vi.fn()

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args)
}))

vi.mock('../../notifications/NotificationService', () => ({
  NotificationService: class {
    send(...args: unknown[]) {
      return notificationSendMock(...args)
    }
  }
}))

vi.mock('../../accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class {
    getTrialBalance(...args: unknown[]) {
      return trialBalanceMock(...args)
    }
  }
}))

import { ReportScheduler } from '../ReportScheduler'

type ReportSchedulerInternals = {
  buildEmailBody: (schedule: ScheduledReport, startDate: string, endDate: string, payload: unknown) => string
  checkAndRunReports: () => Promise<void>
  executeReport: (schedule: ScheduledReport) => Promise<void>
  generateReportPayload: (schedule: ScheduledReport, startDate: string, endDate: string) => Promise<unknown>
  parseRecipients: (raw: string) => string[]
  resolveWindow: (schedule: ScheduledReport, runAt: Date) => { startDate: string; endDate: string }
  shouldRun: (schedule: ScheduledReport, now: Date) => boolean
  validateSchedule: (data: Partial<ScheduledReport>) => string[]
}

type SchedulerRuntime = {
  checkInterval: ReturnType<typeof setInterval> | null
  isRunning: boolean
}

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE scheduled_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      parameters TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      day_of_week INTEGER,
      day_of_month INTEGER,
      time_of_day TEXT NOT NULL,
      recipients TEXT NOT NULL,
      export_format TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE report_execution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_report_id INTEGER NOT NULL,
      execution_time TEXT NOT NULL,
      status TEXT NOT NULL,
      recipients_notified INTEGER DEFAULT 0,
      error_message TEXT
    );

    CREATE TABLE ledger_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_date TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      is_voided INTEGER DEFAULT 0,
      amount REAL NOT NULL,
      payment_method TEXT,
      category_id INTEGER
    );

    CREATE TABLE transaction_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL
    );

    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT,
      admission_date TEXT,
      is_active INTEGER DEFAULT 1
    );
  `)
}

function seedBaseData(targetDb: Database.Database): void {
  targetDb.exec(`
    INSERT INTO transaction_category (id, category_name) VALUES (1, 'Operations');

    INSERT INTO ledger_transaction (transaction_date, transaction_type, is_voided, amount, payment_method, category_id)
    VALUES
      ('2026-02-01', 'FEE_PAYMENT', 0, 5000, 'CASH', NULL),
      ('2026-02-01', 'EXPENSE', 0, 2200, 'BANK', 1),
      ('2026-02-02', 'SALARY_PAYMENT', 0, 1300, 'BANK', 1),
      ('2026-02-02', 'REFUND', 1, 500, 'BANK', 1);

    INSERT INTO student (admission_number, first_name, last_name, gender, admission_date, is_active)
    VALUES
      ('ADM-001', 'Grace', 'Mutua', 'F', '2023-01-10', 1),
      ('ADM-002', 'Rose', 'Akinyi', 'F', '2023-02-12', 1),
      ('ADM-003', 'Dormant', 'Student', 'M', '2020-01-10', 0);
  `)
}

function baseSchedule(overrides: Partial<ScheduledReport> = {}): ScheduledReport {
  return {
    id: 1,
    report_name: 'Daily Report',
    report_type: 'STUDENT_LIST',
    parameters: '{}',
    schedule_type: 'DAILY',
    day_of_week: null,
    day_of_month: null,
    time_of_day: '09:30',
    recipients: '["ops@example.com"]',
    export_format: 'PDF',
    is_active: true,
    last_run_at: null,
    next_run_at: null,
    created_by_user_id: 7,
    created_at: '2026-02-24T00:00:00Z',
    ...overrides
  }
}

describe('ReportScheduler coverage hardening', () => {
  beforeEach(() => {
    logAuditMock.mockReset()
    notificationSendMock.mockReset()
    trialBalanceMock.mockReset()
    db = new Database(':memory:')
    createSchema(db)
    seedBaseData(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('validates recipients, schedules, and shouldRun schedule windows', () => {
    const scheduler = new ReportScheduler()
    const internal = scheduler as unknown as ReportSchedulerInternals
    const now = new Date('2026-02-02T09:30:00')

    expect(internal.parseRecipients('["ops@example.com","x"," teacher@example.com "]')).toEqual(['ops@example.com', 'teacher@example.com'])
    expect(internal.parseRecipients('{bad json')).toEqual([])
    expect(internal.parseRecipients('"not array"')).toEqual([])

    expect(internal.shouldRun(baseSchedule({ schedule_type: 'DAILY' }), now)).toBe(true)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'DAILY', time_of_day: '10:00' }), now)).toBe(false)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'WEEKLY', day_of_week: now.getDay() }), now)).toBe(true)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'WEEKLY', day_of_week: 0 }), now)).toBe(false)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'MONTHLY', day_of_month: now.getDate() }), now)).toBe(true)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'MONTHLY', day_of_month: 1 }), now)).toBe(false)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'TERM_END' }), now)).toBe(false)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'YEAR_END' }), now)).toBe(false)
    expect(internal.shouldRun(baseSchedule({ schedule_type: 'DAILY' as ScheduledReport['schedule_type'], time_of_day: 'bad' }), now)).toBe(false)

    const errors = internal.validateSchedule({
      report_name: '',
      report_type: '',
      time_of_day: '9am',
      recipients: '[]',
      schedule_type: 'WEEKLY'
    })
    expect(errors.join(' | ')).toContain('Report name is required')
    expect(errors.join(' | ')).toContain('Report type is required')
    expect(errors.join(' | ')).toContain('Time must be in HH:MM 24-hour format')
    expect(errors.join(' | ')).toContain('Weekly schedules require day_of_week between 0 and 6')
    expect(errors.join(' | ')).toContain('At least one valid recipient email is required')
  })

  it('creates, updates, and deletes schedules with audit events', () => {
    const scheduler = new ReportScheduler()
    const createInput = {
      report_name: 'Fees Daily',
      report_type: 'FEE_COLLECTION',
      parameters: '{}',
      schedule_type: 'DAILY' as const,
      day_of_week: null,
      day_of_month: null,
      time_of_day: '08:00',
      recipients: '["ops@example.com"]',
      export_format: 'PDF' as const,
      is_active: true,
      created_by_user_id: 7
    }

    const created = scheduler.createSchedule(createInput, 7)
    expect(created.success).toBe(true)
    expect(created.id).toBeGreaterThan(0)

    const missingUpdate = scheduler.updateSchedule(999, { report_name: 'Nope' }, 7)
    expect(missingUpdate.success).toBe(false)

    const invalidUpdate = scheduler.updateSchedule(created.id as number, { schedule_type: 'MONTHLY', day_of_month: 50 }, 7)
    expect(invalidUpdate.success).toBe(false)

    const successfulUpdate = scheduler.updateSchedule(created.id as number, { report_name: 'Fees Daily Updated' }, 7)
    expect(successfulUpdate.success).toBe(true)

    const existing = scheduler.getScheduledReports()
    expect(existing.length).toBe(1)

    const missingDelete = scheduler.deleteSchedule(999, 7)
    expect(missingDelete.success).toBe(false)

    const deleted = scheduler.deleteSchedule(created.id as number, 7)
    expect(deleted.success).toBe(true)

    expect(logAuditMock).toHaveBeenCalledWith(7, 'CREATE', 'scheduled_report', expect.any(Number), null, expect.objectContaining({ report_name: 'Fees Daily' }))
    expect(logAuditMock).toHaveBeenCalledWith(7, 'UPDATE', 'scheduled_report', created.id, expect.any(Object), expect.objectContaining({ report_name: 'Fees Daily Updated' }))
    expect(logAuditMock).toHaveBeenCalledWith(7, 'DELETE', 'scheduled_report', created.id, expect.any(Object), null)
  })

  it('resolves report windows and builds email bodies', () => {
    const scheduler = new ReportScheduler()
    const internal = scheduler as unknown as ReportSchedulerInternals
    const runAt = new Date('2026-02-24T00:00:00Z')

    const explicit = internal.resolveWindow(baseSchedule({ parameters: '{"start_date":"2026-01-01","end_date":"2026-01-31"}' }), runAt)
    expect(explicit).toEqual({ startDate: '2026-01-01', endDate: '2026-01-31' })

    const fallback = internal.resolveWindow(baseSchedule({ parameters: '{broken' }), runAt)
    expect(fallback).toEqual({ startDate: '2026-02-01', endDate: '2026-02-24' })

    const objectBody = internal.buildEmailBody(baseSchedule(), '2026-02-01', '2026-02-24', [{ item: 'value' }])
    expect(objectBody).toContain('Scheduled report: Daily Report')
    expect(objectBody).toContain('"item": "value"')

    const textBody = internal.buildEmailBody(baseSchedule(), '2026-02-01', '2026-02-24', 'raw summary')
    expect(textBody).toContain('raw summary')
  })

  it('generates payloads for scheduler report types and rejects unsupported types', async () => {
    const scheduler = new ReportScheduler()
    const internal = scheduler as unknown as ReportSchedulerInternals

    const feePayload = await internal.generateReportPayload(baseSchedule({ report_type: 'FEE_COLLECTION' }), '2026-02-01', '2026-02-28') as Array<{ amount: number }>
    expect(feePayload.length).toBeGreaterThan(0)

    const expensePayload = await internal.generateReportPayload(baseSchedule({ report_type: 'EXPENSE_SUMMARY' }), '2026-02-01', '2026-02-28') as Array<{ amount: number }>
    expect(expensePayload[0]?.amount).toBeGreaterThan(0)

    const studentPayload = await internal.generateReportPayload(baseSchedule({ report_type: 'STUDENT_LIST' }), '2026-02-01', '2026-02-28') as Array<{ admission_number: string }>
    expect(studentPayload).toHaveLength(2)

    trialBalanceMock.mockResolvedValue([{ account: 'Cash', debit: 1000, credit: 0 }])
    const trialBalance = await internal.generateReportPayload(baseSchedule({ report_type: 'TRIAL_BALANCE' }), '2026-02-01', '2026-02-28')
    expect(trialBalance).toEqual([{ account: 'Cash', debit: 1000, credit: 0 }])
    expect(trialBalanceMock).toHaveBeenCalledWith('2026-02-01', '2026-02-28')

    await expect(
      internal.generateReportPayload(baseSchedule({ report_type: 'UNKNOWN_REPORT' }), '2026-02-01', '2026-02-28')
    ).rejects.toThrow('Unsupported report type for scheduler')
  })

  it('executes scheduled reports with partial failures and writes execution logs', async () => {
    const scheduler = new ReportScheduler()
    db.prepare(`
      INSERT INTO scheduled_report (
        report_name, report_type, parameters, schedule_type, day_of_week, day_of_month, time_of_day,
        recipients, export_format, is_active, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Student Snapshot',
      'STUDENT_LIST',
      '{}',
      'DAILY',
      null,
      null,
      '09:30',
      '["ok@example.com","fail@example.com"]',
      'PDF',
      1,
      7
    )

    notificationSendMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'smtp timeout' })

    const schedule = scheduler.getScheduledReports()[0] as ScheduledReport
    await (scheduler as unknown as ReportSchedulerInternals).executeReport(schedule)

    const logRow = db.prepare(`
      SELECT status, recipients_notified, error_message
      FROM report_execution_log
      ORDER BY id DESC
      LIMIT 1
    `).get() as { status: string; recipients_notified: number; error_message: string | null } | undefined

    expect(logRow?.status).toBe('SUCCESS')
    expect(logRow?.recipients_notified).toBe(1)
    expect(logRow?.error_message ?? '').toContain('fail@example.com')
  })

  it('records FAILED execution when no recipients or all sends fail', async () => {
    const scheduler = new ReportScheduler()
    const internal = scheduler as unknown as ReportSchedulerInternals

    const noRecipientsSchedule = baseSchedule({ id: 42, recipients: '[]' })
    await internal.executeReport(noRecipientsSchedule)

    notificationSendMock.mockResolvedValue({ success: false, error: 'mailbox unavailable' })
    const allFailSchedule = baseSchedule({ id: 43, recipients: '["ops@example.com"]' })
    await internal.executeReport(allFailSchedule)

    const failedRows = db.prepare(`
      SELECT status, error_message
      FROM report_execution_log
      WHERE status = 'FAILED'
      ORDER BY id ASC
    `).all() as Array<{ status: string; error_message: string }>

    expect(failedRows.length).toBeGreaterThanOrEqual(2)
    expect(failedRows[0]?.error_message).toContain('No valid recipients')
    expect(failedRows[1]?.error_message).toContain('mailbox unavailable')
  })

  it('runs scheduled checks safely and handles not-initialized startup windows', async () => {
    const scheduler = new ReportScheduler()
    const internal = scheduler as unknown as ReportSchedulerInternals
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')

    db.prepare(`
      INSERT INTO scheduled_report (
        report_name, report_type, parameters, schedule_type, day_of_week, day_of_month, time_of_day,
        recipients, export_format, is_active, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Due Now',
      'STUDENT_LIST',
      '{}',
      'DAILY',
      null,
      null,
      `${hh}:${mm}`,
      '["ops@example.com"]',
      'PDF',
      1,
      7
    )

    notificationSendMock.mockResolvedValue({ success: true })
    await internal.checkAndRunReports()

    const successCount = db.prepare(`SELECT COUNT(*) as count FROM report_execution_log WHERE status = 'SUCCESS'`).get() as { count: number }
    expect(successCount.count).toBeGreaterThan(0)

    const schedulerWithTransientFailure = new ReportScheduler() as unknown as ReportSchedulerInternals & {
      getActiveSchedules: () => ScheduledReport[]
    }
    schedulerWithTransientFailure.getActiveSchedules = () => {
      throw new Error('database not initialized')
    }

    await expect(schedulerWithTransientFailure.checkAndRunReports()).resolves.toBeUndefined()
  })

  it('initializes once and shuts down cleanly', () => {
    vi.useFakeTimers()
    const scheduler = new ReportScheduler()
    const runtime = scheduler as unknown as SchedulerRuntime

    scheduler.initialize()
    const firstInterval = runtime.checkInterval
    expect(runtime.isRunning).toBe(true)
    expect(firstInterval).not.toBeNull()

    scheduler.initialize()
    expect(runtime.checkInterval).toBe(firstInterval)

    scheduler.shutdown()
    expect(runtime.isRunning).toBe(false)
    expect(runtime.checkInterval).toBeNull()
  })
})
