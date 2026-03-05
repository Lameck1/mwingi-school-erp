import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

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
    clearSessionCache()
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

  it('assets:get-categories returns asset categories', async () => {
    const handler = handlerMap.get('assets:get-categories')!
    const result = await handler({})
    expect(result).toEqual([{ id: 1, category_name: 'Vehicles' }])
    expect(fixedAssetServiceMock.getCategories).toHaveBeenCalled()
  })

  it('assets:get-financial-periods returns financial periods', async () => {
    const handler = handlerMap.get('assets:get-financial-periods')!
    const result = await handler({})
    expect(result).toEqual([{ id: 2, period_name: '2026-Q1' }])
    expect(fixedAssetServiceMock.getFinancialPeriods).toHaveBeenCalled()
  })

  it('assets:get-all returns all assets with optional filters', async () => {
    fixedAssetServiceMock.findAll.mockReturnValueOnce([{ id: 1, asset_name: 'Bus' }])
    const handler = handlerMap.get('assets:get-all')!
    const result = await handler({}, { category_id: 1, status: 'ACTIVE' })
    expect(result).toEqual([{ id: 1, asset_name: 'Bus' }])
    expect(fixedAssetServiceMock.findAll).toHaveBeenCalledWith({ category_id: 1, status: 'ACTIVE' })
  })

  it('assets:get-all passes undefined when no filters', async () => {
    fixedAssetServiceMock.findAll.mockReturnValueOnce([])
    const handler = handlerMap.get('assets:get-all')!
    await handler({})
    expect(fixedAssetServiceMock.findAll).toHaveBeenCalledWith(undefined)
  })

  it('assets:get-one returns a single asset by id', async () => {
    fixedAssetServiceMock.findById.mockReturnValueOnce({ id: 11, asset_name: 'Bus' })
    const handler = handlerMap.get('assets:get-one')!
    const result = await handler({}, 11)
    expect(result).toEqual({ id: 11, asset_name: 'Bus' })
    expect(fixedAssetServiceMock.findById).toHaveBeenCalledWith(11)
  })

  it('assets:create succeeds with valid payload and matching actor', async () => {
    const handler = handlerMap.get('assets:create')!
    const result = await handler({}, validCreatePayload, 55) as { success: boolean; id: number }
    expect(result.success).toBe(true)
    expect(result.id).toBe(11)
    expect(fixedAssetServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ asset_name: 'School Bus', acquisition_cost: 1000000 }),
      55
    )
  })

  it('assets:create normalizes optional fields', async () => {
    const handler = handlerMap.get('assets:create')!
    const payload = {
      ...validCreatePayload,
      asset_code: 'ASSET-001',
      serial_number: 'SN-12345',
      location: 'Parking',
      supplier_id: 3,
      warranty_expiry: '2028-01-01',
      accumulated_depreciation: 50000
    }
    await handler({}, payload, 55)
    expect(fixedAssetServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_code: 'ASSET-001',
        serial_number: 'SN-12345',
        location: 'Parking',
        supplier_id: 3,
        warranty_expiry: '2028-01-01',
        accumulated_depreciation: 50000
      }),
      55
    )
  })

  it('assets:update rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('assets:update')!
    const result = await handler({}, 11, { description: 'Hack' }, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(fixedAssetServiceMock.update).not.toHaveBeenCalled()
  })

  it('assets:run-depreciation rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('assets:run-depreciation')!
    const result = await handler({}, 11, 2, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(fixedAssetServiceMock.runDepreciation).not.toHaveBeenCalled()
  })

  // ── Coverage: assets:get-all with only status filter (no category_id) ──
  it('assets:get-all with only status filter', async () => {
    fixedAssetServiceMock.findAll.mockReturnValueOnce([{ id: 2 }])
    const handler = handlerMap.get('assets:get-all')!
    const result = await handler({}, { status: 'DISPOSED' })
    expect(result).toEqual([{ id: 2 }])
    expect(fixedAssetServiceMock.findAll).toHaveBeenCalledWith({ status: 'DISPOSED' })
  })

  // ── Coverage: assets:update with all optional fields individually ──
  it('assets:update normalizes individual optional fields', async () => {
    const handler = handlerMap.get('assets:update')!
    await handler({}, 11, {
      description: 'Updated desc',
      acquisition_cost: 2000000,
      salvage_value: 100000,
      useful_life_months: 60,
      depreciation_method: 'STRAIGHT_LINE',
      status: 'IN_USE'
    }, 55)
    expect(fixedAssetServiceMock.update).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        description: 'Updated desc',
        acquisition_cost: 2000000
      }),
      55
    )
  })

  // ── Coverage: assets:create without legacyUserId ──
  it('assets:create without legacyUserId uses session actor', async () => {
    const handler = handlerMap.get('assets:create')!
    const result = await handler({}, validCreatePayload) as { success: boolean }
    expect(result.success).toBe(true)
    expect(fixedAssetServiceMock.create).toHaveBeenCalled()
  })

  // ── Coverage: toAssetFilters returns undefined for empty filters obj ──
  it('assets:get-all returns undefined filters when empty object provided', async () => {
    fixedAssetServiceMock.findAll.mockReturnValueOnce([])
    const handler = handlerMap.get('assets:get-all')!
    await handler({}, {})
    expect(fixedAssetServiceMock.findAll).toHaveBeenCalledWith(undefined)
  })

  // ── Coverage: toUpdateAssetData with all optional fields ──
  it('assets:update passes all optional create-style fields', async () => {
    const handler = handlerMap.get('assets:update')!
    await handler({}, 11, {
      asset_name: 'Renamed Bus',
      category_id: 2,
      acquisition_date: '2026-06-01',
      acquisition_cost: 1500000,
      accumulated_depreciation: 200000,
      asset_code: 'ASSET-UPDATED',
      description: 'Updated description',
      serial_number: 'SN-UPDATED',
      location: 'New Parking',
      supplier_id: 5,
      warranty_expiry: '2029-01-01'
    }, 55)
    expect(fixedAssetServiceMock.update).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        asset_name: 'Renamed Bus',
        category_id: 2,
        acquisition_date: '2026-06-01',
        acquisition_cost: 1500000,
        accumulated_depreciation: 200000,
        asset_code: 'ASSET-UPDATED',
        serial_number: 'SN-UPDATED',
        location: 'New Parking',
        supplier_id: 5,
        warranty_expiry: '2029-01-01'
      }),
      55
    )
  })

  // ── Coverage: assets:update and run-depreciation without legacyUserId ──
  it('assets:update without legacyUserId uses session actor', async () => {
    const handler = handlerMap.get('assets:update')!
    const result = await handler({}, 11, { description: 'No legacy' }) as { success: boolean }
    expect(result.success).toBe(true)
    expect(fixedAssetServiceMock.update).toHaveBeenCalled()
  })

  it('assets:run-depreciation without legacyUserId uses session actor', async () => {
    const handler = handlerMap.get('assets:run-depreciation')!
    const result = await handler({}, 11, 2) as { success: boolean }
    expect(result.success).toBe(true)
    expect(fixedAssetServiceMock.runDepreciation).toHaveBeenCalled()
  })

  // ── Coverage: assets:get-all with only category_id filter ──
  it('assets:get-all with only category_id filter', async () => {
    fixedAssetServiceMock.findAll.mockReturnValueOnce([{ id: 3 }])
    const handler = handlerMap.get('assets:get-all')!
    const result = await handler({}, { category_id: 2 })
    expect(result).toEqual([{ id: 3 }])
    expect(fixedAssetServiceMock.findAll).toHaveBeenCalledWith({ category_id: 2 })
  })
})
