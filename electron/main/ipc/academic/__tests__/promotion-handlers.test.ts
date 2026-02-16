import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const promotionServiceMock = {
  getStreams: vi.fn(() => []),
  getStudentsForPromotion: vi.fn(() => []),
  promoteStudent: vi.fn(() => ({ success: true })),
  batchPromote: vi.fn(() => ({ success: true, promoted: 0, failed: 0 })),
  getStudentPromotionHistory: vi.fn(() => []),
  getNextStream: vi.fn(() => null),
}

let sessionUserId = 9
let sessionRole = 'PRINCIPAL'

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
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => promotionServiceMock)
  }
}))

import { registerPromotionHandlers } from '../promotion-handlers'

describe('promotion IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'PRINCIPAL'
    promotionServiceMock.promoteStudent.mockClear()
    promotionServiceMock.batchPromote.mockClear()

    registerPromotionHandlers()
  })

  it('rejects renderer user mismatch for promoteStudent and does not invoke service', async () => {
    const handler = handlerMap.get('promotion:promoteStudent')
    expect(handler).toBeDefined()

    const result = await handler!(
      {},
      {
        student_id: 11,
        from_stream_id: 1,
        to_stream_id: 2,
        from_academic_year_id: 2025,
        to_academic_year_id: 2026,
        to_term_id: 1,
      },
      3
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(promotionServiceMock.promoteStudent).not.toHaveBeenCalled()
  })

  it('uses authenticated actor id when legacy user id matches session', async () => {
    const handler = handlerMap.get('promotion:promoteStudent')
    expect(handler).toBeDefined()

    await handler!(
      {},
      {
        student_id: 11,
        from_stream_id: 1,
        to_stream_id: 2,
        from_academic_year_id: 2025,
        to_academic_year_id: 2026,
        to_term_id: 1,
      },
      9
    )

    expect(promotionServiceMock.promoteStudent).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 11, to_stream_id: 2 }),
      9
    )
  })

  it('enforces management role for batch promotion', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('promotion:batchPromote')
    expect(handler).toBeDefined()

    const result = await handler!(
      {},
      [1, 2, 3],
      1,
      2,
      2025,
      2026,
      1,
      9
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(promotionServiceMock.batchPromote).not.toHaveBeenCalled()
  })
})
