import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 5
let sessionRole = 'TEACHER'

const { schedulerMock } = vi.hoisted(() => ({
  schedulerMock: {
    initialize: vi.fn(),
    getScheduledReports: vi.fn(() => []),
    createSchedule: vi.fn(() => ({ success: true, id: 1 })),
    updateSchedule: vi.fn(() => ({ success: true })),
    deleteSchedule: vi.fn(() => ({ success: true })),
  }
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'session-user',
        role: sessionRole,
        full_name: 'Session User',
        email: null,
        is_active: 1,
        last_login: null,
        created_at: '2026-01-01'
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../services/reports/ReportScheduler', () => ({
  reportScheduler: schedulerMock
}))

import { registerReportSchedulerHandlers } from '../scheduler-handlers'

describe('scheduler handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 5
    sessionRole = 'TEACHER'
    schedulerMock.createSchedule.mockClear()
    registerReportSchedulerHandlers()
  })

  it('scheduler:create rejects invalid user id', async () => {
    const handler = handlerMap.get('scheduler:create')!
    const result = await handler({}, {
      report_name: 'Daily Collections',
      report_type: 'FINANCE',
      parameters: '{}',
      schedule_type: 'DAILY',
      day_of_week: null,
      day_of_month: null,
      time_of_day: '09:00',
      recipients: '["a@school.com"]',
      export_format: 'PDF',
      is_active: true,
      created_by_user_id: 1
    }, 0) as { success: boolean; errors?: string[] }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Invalid user session')
    expect(schedulerMock.createSchedule).not.toHaveBeenCalled()
  })

  it('scheduler:create rejects invalid time format', async () => {
    const handler = handlerMap.get('scheduler:create')!
    const result = await handler({}, {
      report_name: 'Daily Collections',
      report_type: 'FINANCE',
      parameters: '{}',
      schedule_type: 'DAILY',
      day_of_week: null,
      day_of_month: null,
      time_of_day: '9:00 AM',
      recipients: '["a@school.com"]',
      export_format: 'PDF',
      is_active: true,
      created_by_user_id: 1
    }, 5) as { success: boolean; errors?: string[] }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('HH:MM')
    expect(schedulerMock.createSchedule).not.toHaveBeenCalled()
  })

  it('scheduler:create rejects invalid weekly day_of_week', async () => {
    const handler = handlerMap.get('scheduler:create')!
    const result = await handler({}, {
      report_name: 'Weekly Collections',
      report_type: 'FINANCE',
      parameters: '{}',
      schedule_type: 'WEEKLY',
      day_of_week: 8,
      day_of_month: null,
      time_of_day: '09:00',
      recipients: '["a@school.com"]',
      export_format: 'PDF',
      is_active: true,
      created_by_user_id: 1
    }, 5) as { success: boolean; errors?: string[] }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('day_of_week')
  })

  it('scheduler:create passes valid payload to scheduler service', async () => {
    const handler = handlerMap.get('scheduler:create')!
    const payload = {
      report_name: 'Monthly Collections',
      report_type: 'FINANCE',
      parameters: '{}',
      schedule_type: 'MONTHLY' as const,
      day_of_week: null,
      day_of_month: 10,
      time_of_day: '09:00',
      recipients: '["a@school.com"]',
      export_format: 'PDF' as const,
      is_active: true,
      created_by_user_id: 1
    }
    const result = await handler({}, payload, 5) as { success: boolean; id?: number }
    expect(result.success).toBe(true)
    expect(result.id).toBe(1)
    expect(schedulerMock.createSchedule).toHaveBeenCalledWith(payload, 5)
  })

  it('scheduler:update rejects invalid schedule id and user id', async () => {
    const handler = handlerMap.get('scheduler:update')!
    const result = await handler({}, 0, { report_name: 'X' }, 0) as { success: boolean; errors?: string[] }

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Invalid Schedule ID')
    expect(schedulerMock.updateSchedule).not.toHaveBeenCalled()
  })

  it('scheduler:update rejects unsupported TERM_END and YEAR_END schedule types', async () => {
    const handler = handlerMap.get('scheduler:update')!
    const result = await handler({}, 3, { schedule_type: 'TERM_END' }, 5) as { success: boolean; errors?: string[] }

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('not supported')
    expect(schedulerMock.updateSchedule).not.toHaveBeenCalled()
  })

  it('scheduler:delete rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('scheduler:delete')!
    const result = await handler({}, 3, 9) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(schedulerMock.deleteSchedule).not.toHaveBeenCalled()
  })
})
