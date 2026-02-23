import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 55
let sessionRole = 'ACCOUNTS_CLERK'

const fixedAssetServiceMock = {
  getCategories: vi.fn(() => [{ id: 1, category_name: 'Vehicles' }]),
  getFinancialPeriods: vi.fn(() => [{ id: 2, period_name: '2026-Q1' }]),
  findAll: vi.fn(() => []),
  findById: vi.fn(() => null),
  create: vi.fn(() => ({ success: true, id: 11 })),
  update: vi.fn(() => ({ success: true })),
  runDepreciation: vi.fn(() => ({ success: true }))
}

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
        created_at: new Date().toISOString()
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn()
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'FixedAssetService') {
        return fixedAssetServiceMock
      }
      return {}
    })
  }
}))

import { registerFixedAssetHandlers } from '../fixed-asset-handlers'

const validCreatePayload = {
  asset_name: 'School Bus',
  category_id: 1,
  acquisition_date: '2026-01-02',
  acquisition_cost: 1000000,
  description: 'Main transport bus'
}

describe('fixed-asset IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 55
    sessionRole = 'ACCOUNTS_CLERK'
    fixedAssetServiceMock.create.mockClear()
    fixedAssetServiceMock.update.mockClear()
    fixedAssetServiceMock.runDepreciation.mockClear()
    registerFixedAssetHandlers()
  })

  it('registers create, update, and run-depreciation channels', () => {
    const registered = Array.from(handlerMap.keys())
    expect(registered).toEqual(expect.arrayContaining([
      'assets:create',
      'assets:update',
      'assets:run-depreciation'
    ]))
  })

  it('rejects renderer user mismatch for assets:create', async () => {
    const handler = handlerMap.get('assets:create')
    expect(handler).toBeDefined()

    const result = await handler!({}, validCreatePayload, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(fixedAssetServiceMock.create).not.toHaveBeenCalled()
  })

  it('routes update and depreciation with authenticated actor id', async () => {
    const updateHandler = handlerMap.get('assets:update')
    const depreciationHandler = handlerMap.get('assets:run-depreciation')
    expect(updateHandler).toBeDefined()
    expect(depreciationHandler).toBeDefined()

    const updateResult = await updateHandler!(
      {},
      11,
      { description: 'Updated description' },
      55
    ) as { success: boolean; error?: string }
    expect(updateResult.success).toBe(true)
    expect(fixedAssetServiceMock.update).toHaveBeenCalledWith(11, { description: 'Updated description' }, 55)

    const depreciationResult = await depreciationHandler!({}, 11, 2, 55) as { success: boolean; error?: string }
    expect(depreciationResult.success).toBe(true)
    expect(fixedAssetServiceMock.runDepreciation).toHaveBeenCalledWith(11, 2, 55)
  })

  it('enforces role guard on finance channels', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('assets:create')
    expect(handler).toBeDefined()

    const result = await handler!({}, validCreatePayload, 55) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(fixedAssetServiceMock.create).not.toHaveBeenCalled()
  })
})
