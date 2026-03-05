import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 7
let sessionRole = 'TEACHER'

const hireServiceMock = {
  getClients: vi.fn(() => []),
  getClientById: vi.fn(() => null),
  createClient: vi.fn(() => ({ success: true })),
  updateClient: vi.fn(() => ({ success: true })),
  getAssets: vi.fn(() => []),
  getAssetById: vi.fn(() => null),
  createAsset: vi.fn(() => ({ success: true })),
  updateAsset: vi.fn(() => ({ success: true })),
  checkAssetAvailability: vi.fn(() => true),
  getBookings: vi.fn(() => []),
  getBookingById: vi.fn(() => null),
  createBooking: vi.fn(() => ({ success: true, id: 1 })),
  updateBookingStatus: vi.fn(() => ({ success: true })),
  recordPayment: vi.fn(() => ({ success: true })),
  getPaymentsByBooking: vi.fn(() => []),
  getHireStats: vi.fn(() => ({ totalBookings: 0, totalIncome: 0, pendingAmount: 0, thisMonth: 0 })),
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
        created_at: '2026-01-01T00:00:00'
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

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => hireServiceMock)
  }
}))

import { registerHireHandlers } from '../hire-handlers'

function attachActor(event: any) {
  event.__ipcActor = {
    id: sessionUserId,
    role: sessionRole,
    username: 'session-user',
    full_name: 'Session User',
    email: null,
    is_active: 1,
    created_at: '2026-01-01T00:00:00'
  };
}

describe('hire handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 7
    sessionRole = 'TEACHER'
    clearSessionCache()
    vi.clearAllMocks()
    registerHireHandlers()
  })

  // ========== CLIENTS ==========

  it('hire:getClients calls service with no filters', async () => {
    const handler = handlerMap.get('hire:getClients')!
    const event = {}; attachActor(event)
    await handler(event)
    expect(hireServiceMock.getClients).toHaveBeenCalledWith()
  })

  it('hire:getClients passes search filters', async () => {
    const handler = handlerMap.get('hire:getClients')!
    const event = {}; attachActor(event)
    await handler(event, { search: 'test', isActive: true })
    expect(hireServiceMock.getClients).toHaveBeenCalledWith({ search: 'test', isActive: true })
  })

  it('hire:getClientById calls service with id', async () => {
    const handler = handlerMap.get('hire:getClientById')!
    const event = {}; attachActor(event)
    await handler(event, 5)
    expect(hireServiceMock.getClientById).toHaveBeenCalledWith(5)
  })

  it('hire:getClientById rejects non-positive id', async () => {
    const handler = handlerMap.get('hire:getClientById')!
    const event = {}; attachActor(event)
    const result = await handler(event, -1) as { success: boolean }
    expect(result.success).toBe(false)
  })

  it('hire:createClient calls service with normalized data', async () => {
    const handler = handlerMap.get('hire:createClient')!
    const event = {}; attachActor(event)
    await handler(event, { client_name: 'ACME' })
    expect(hireServiceMock.createClient).toHaveBeenCalledWith(expect.objectContaining({ client_name: 'ACME' }))
  })

  it('hire:updateClient calls service with id and data', async () => {
    const handler = handlerMap.get('hire:updateClient')!
    const event = {}; attachActor(event)
    await handler(event, 1, { client_name: 'Updated' })
    expect(hireServiceMock.updateClient).toHaveBeenCalledWith(1, expect.objectContaining({ client_name: 'Updated' }))
  })

  it('hire:updateClient rejects non-positive id', async () => {
    const handler = handlerMap.get('hire:updateClient')!
    const event = {}; attachActor(event)
    const result = await handler(event, 0, { client_name: 'Bad' }) as { success: boolean }
    expect(result.success).toBe(false)
  })

  // ========== ASSETS ==========

  it('hire:getAssets calls service with no filters', async () => {
    const handler = handlerMap.get('hire:getAssets')!
    const event = {}; attachActor(event)
    await handler(event)
    expect(hireServiceMock.getAssets).toHaveBeenCalledWith()
  })

  it('hire:getAssets passes type and active filters', async () => {
    const handler = handlerMap.get('hire:getAssets')!
    const event = {}; attachActor(event)
    await handler(event, { type: 'VEHICLE', isActive: true })
    expect(hireServiceMock.getAssets).toHaveBeenCalledWith({ type: 'VEHICLE', isActive: true })
  })

  it('hire:getAssetById calls service with id', async () => {
    const handler = handlerMap.get('hire:getAssetById')!
    const event = {}; attachActor(event)
    await handler(event, 3)
    expect(hireServiceMock.getAssetById).toHaveBeenCalledWith(3)
  })

  it('hire:createAsset calls service with normalized data', async () => {
    const handler = handlerMap.get('hire:createAsset')!
    const event = {}; attachActor(event)
    await handler(event, { asset_name: 'Bus A', asset_type: 'VEHICLE' })
    expect(hireServiceMock.createAsset).toHaveBeenCalledWith(expect.objectContaining({ asset_name: 'Bus A', asset_type: 'VEHICLE' }))
  })

  it('hire:updateAsset calls service with id and data', async () => {
    const handler = handlerMap.get('hire:updateAsset')!
    const event = {}; attachActor(event)
    await handler(event, 2, { asset_name: 'Updated Bus' })
    expect(hireServiceMock.updateAsset).toHaveBeenCalledWith(2, expect.objectContaining({ asset_name: 'Updated Bus' }))
  })

  it('hire:checkAvailability calls service', async () => {
    const handler = handlerMap.get('hire:checkAvailability')!
    const event = {}; attachActor(event)
    await handler(event, 1, '2026-03-01', '2026-03-05')
    expect(hireServiceMock.checkAssetAvailability).toHaveBeenCalledWith(1, '2026-03-01', '2026-03-05')
  })

  // ========== BOOKINGS ==========

  it('hire:getBookings calls service with no filters', async () => {
    const handler = handlerMap.get('hire:getBookings')!
    const event = {}; attachActor(event)
    await handler(event)
    expect(hireServiceMock.getBookings).toHaveBeenCalledWith()
  })

  it('hire:getBookings passes booking filters', async () => {
    const handler = handlerMap.get('hire:getBookings')!
    const event = {}; attachActor(event)
    await handler(event, { status: 'ACTIVE', assetId: 1, clientId: 2 })
    expect(hireServiceMock.getBookings).toHaveBeenCalledWith({ status: 'ACTIVE', assetId: 1, clientId: 2 })
  })

  it('hire:getBookingById calls service with id', async () => {
    const handler = handlerMap.get('hire:getBookingById')!
    const event = {}; attachActor(event)
    await handler(event, 10)
    expect(hireServiceMock.getBookingById).toHaveBeenCalledWith(10)
  })

  it('hire:createBooking rejects invalid hire date format', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const event = {};
    attachActor(event);
    const result = await handler(event, {
      asset_id: 1,
      client_id: 2,
      hire_date: '02/01/2026',
      total_amount: 5000
    }, 7) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
    expect(hireServiceMock.createBooking).not.toHaveBeenCalled()
  })

  it('hire:createBooking rejects return date earlier than hire date', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const event = {};
    attachActor(event);
    const result = await handler(event, {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-02-10',
      return_date: '2026-02-01',
      total_amount: 5000
    }, 7) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Return date cannot be earlier')
    expect(hireServiceMock.createBooking).not.toHaveBeenCalled()
  })

  it('hire:createBooking rejects non-positive amount', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const event = {};
    attachActor(event);
    const result = await handler(event, {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-02-10',
      total_amount: 0
    }, 7) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
    expect(hireServiceMock.createBooking).not.toHaveBeenCalled()
  })

  it('hire:createBooking passes valid payload to service', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const event = {};
    attachActor(event);
    const payload = {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-02-10',
      return_date: '2026-02-11',
      total_amount: 5000
    }
    const result = await handler(event, payload, 7) as { success: boolean }
    expect(result.success).toBe(true)
    expect(hireServiceMock.createBooking).toHaveBeenCalledWith({ ...payload, status: 'PENDING' }, 7)
  })

  it('hire:updateBookingStatus rejects unknown status values', async () => {
    const handler = handlerMap.get('hire:updateBookingStatus')!
    const event = {};
    attachActor(event);
    const result = await handler(event, 10, 'ARCHIVED') as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid booking status')
    expect(hireServiceMock.updateBookingStatus).not.toHaveBeenCalled()
  })

  it('hire:updateBookingStatus accepts valid status', async () => {
    const handler = handlerMap.get('hire:updateBookingStatus')!
    const event = {}; attachActor(event)
    await handler(event, 10, 'CONFIRMED')
    expect(hireServiceMock.updateBookingStatus).toHaveBeenCalledWith(10, 'CONFIRMED')
  })

  it('hire:createBooking rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const event = {};
    attachActor(event);
    const result = await handler(event, {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-02-10',
      total_amount: 5000
    }, 3) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(hireServiceMock.createBooking).not.toHaveBeenCalled()
  })

  // ========== PAYMENTS ==========

  it('hire:recordPayment calls service with matching actor', async () => {
    const handler = handlerMap.get('hire:recordPayment')!
    const event = {}; attachActor(event)
    const paymentData = { amount: 1000, payment_date: '2026-03-01' }
    await handler(event, 5, paymentData, 7)
    expect(hireServiceMock.recordPayment).toHaveBeenCalledWith(5, paymentData, 7)
  })

  it('hire:recordPayment rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('hire:recordPayment')!
    const event = {}; attachActor(event)
    const paymentData = { amount: 1000, payment_date: '2026-03-01' }
    const result = await handler(event, 5, paymentData, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('hire:getPaymentsByBooking calls service with booking id', async () => {
    const handler = handlerMap.get('hire:getPaymentsByBooking')!
    const event = {}; attachActor(event)
    await handler(event, 8)
    expect(hireServiceMock.getPaymentsByBooking).toHaveBeenCalledWith(8)
  })

  // ========== STATS ==========

  it('hire:getStats calls service', async () => {
    const handler = handlerMap.get('hire:getStats')!
    const event = {}; attachActor(event)
    const result = await handler(event)
    expect(hireServiceMock.getHireStats).toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ totalBookings: 0 }))
  })

  // ========== NORMALIZATION COVERAGE ==========

  it('hire:createClient normalizes all optional fields', async () => {
    const handler = handlerMap.get('hire:createClient')!
    const event = {}; attachActor(event)
    await handler(event, { client_name: 'Full Corp', contact_phone: '555-1234', contact_email: 'corp@mail.com', is_active: 1 })
    expect(hireServiceMock.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ client_name: 'Full Corp', contact_phone: '555-1234', contact_email: 'corp@mail.com', is_active: 1 })
    )
  })

  it('hire:createAsset normalizes all optional fields', async () => {
    const handler = handlerMap.get('hire:createAsset')!
    const event = {}; attachActor(event)
    await handler(event, { asset_name: 'Generator', asset_type: 'EQUIPMENT', default_rate: 2000, is_active: 1 })
    expect(hireServiceMock.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ asset_name: 'Generator', asset_type: 'EQUIPMENT', default_rate: 2000, is_active: 1 })
    )
  })

  it('hire:getBookings normalizes partial filters (status only)', async () => {
    const handler = handlerMap.get('hire:getBookings')!
    const event = {}; attachActor(event)
    await handler(event, { status: 'PENDING' })
    expect(hireServiceMock.getBookings).toHaveBeenCalledWith({ status: 'PENDING' })
  })

  it('hire:getClients normalizes partial filters (search only)', async () => {
    const handler = handlerMap.get('hire:getClients')!
    const event = {}; attachActor(event)
    await handler(event, { search: 'test' })
    expect(hireServiceMock.getClients).toHaveBeenCalledWith({ search: 'test' })
  })

  it('hire:getAssets normalizes partial filters (type only)', async () => {
    const handler = handlerMap.get('hire:getAssets')!
    const event = {}; attachActor(event)
    await handler(event, { type: 'VEHICLE' })
    expect(hireServiceMock.getAssets).toHaveBeenCalledWith({ type: 'VEHICLE' })
  })

  it('hire:createBooking without optional return_date and status', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const event = {}; attachActor(event)
    const payload = {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-03-01',
      total_amount: 3000
    }
    const result = await handler(event, payload, 7) as { success: boolean }
    expect(result.success).toBe(true)
    expect(hireServiceMock.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ asset_id: 1, client_id: 2, hire_date: '2026-03-01', total_amount: 3000 }),
      7
    )
  })

  // ── Coverage: getClients with isActive filter ──
  it('hire:getClients with isActive=false filter', async () => {
    const handler = handlerMap.get('hire:getClients')!
    const event = {}; attachActor(event)
    await handler(event, { isActive: false })
    expect(hireServiceMock.getClients).toHaveBeenCalledWith({ isActive: false })
  })

  // ── Coverage: getAssets with isActive filter ──
  it('hire:getAssets with isActive=true filter', async () => {
    const handler = handlerMap.get('hire:getAssets')!
    const event = {}; attachActor(event)
    await handler(event, { isActive: true })
    expect(hireServiceMock.getAssets).toHaveBeenCalledWith({ isActive: true })
  })

  // ── Coverage: getBookings with assetId and clientId filters ──
  it('hire:getBookings with assetId and clientId filters', async () => {
    const handler = handlerMap.get('hire:getBookings')!
    const event = {}; attachActor(event)
    await handler(event, { assetId: 3, clientId: 5 })
    expect(hireServiceMock.getBookings).toHaveBeenCalledWith({ assetId: 3, clientId: 5 })
  })

  // ── Coverage: updateClient with all optional fields ──
  it('hire:updateClient normalizes all optional fields', async () => {
    const handler = handlerMap.get('hire:updateClient')!
    const event = {}; attachActor(event)
    await handler(event, 1, { client_name: 'ABC', contact_phone: '0712', contact_email: 'a@b.com', is_active: 0 })
    expect(hireServiceMock.updateClient).toHaveBeenCalledWith(1, expect.objectContaining({
      client_name: 'ABC', contact_phone: '0712', contact_email: 'a@b.com', is_active: 0
    }))
  })

  // ── Coverage: updateAsset with all optional fields ──
  it('hire:updateAsset normalizes all optional fields', async () => {
    const handler = handlerMap.get('hire:updateAsset')!
    const event = {}; attachActor(event)
    await handler(event, 1, { asset_name: 'Van', asset_type: 'VEHICLE', default_rate: 3000, is_active: 0 })
    expect(hireServiceMock.updateAsset).toHaveBeenCalledWith(1, expect.objectContaining({
      asset_name: 'Van', asset_type: 'VEHICLE', default_rate: 3000, is_active: 0
    }))
  })

  // ── Coverage: createBooking with explicit status ──
  it('hire:createBooking with explicit status and return_date', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const event = {}; attachActor(event)
    const payload = {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-04-01',
      return_date: '2026-04-05',
      total_amount: 8000,
      status: 'CONFIRMED'
    }
    await handler(event, payload, 7)
    expect(hireServiceMock.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED', return_date: '2026-04-05' }),
      7
    )
  })

  // ── Branch coverage: createClient with empty object → false branches for all if checks (L39) ──
  it('hire:createClient with empty data skips all normalization fields', async () => {
    const handler = handlerMap.get('hire:createClient')!
    const event = {}; attachActor(event)
    await handler(event, {})
    expect(hireServiceMock.createClient).toHaveBeenCalledWith({})
  })

  // ── Branch coverage: updateClient with only is_active → client_name false branch (L56) ──
  it('hire:updateClient with only is_active skips client_name normalization', async () => {
    const handler = handlerMap.get('hire:updateClient')!
    const event = {}; attachActor(event)
    await handler(event, 1, { is_active: 0 })
    expect(hireServiceMock.updateClient).toHaveBeenCalledWith(1, { is_active: 0 })
  })

  // ── Branch coverage: createAsset with only default_rate → asset_name and asset_type false branches (L92, L95) ──
  it('hire:createAsset with only default_rate skips asset_name and asset_type', async () => {
    const handler = handlerMap.get('hire:createAsset')!
    const event = {}; attachActor(event)
    await handler(event, { default_rate: 500 })
    expect(hireServiceMock.createAsset).toHaveBeenCalledWith({ default_rate: 500 })
  })

  // ── Branch coverage: updateAsset with only is_active → asset_name false branch (L109) ──
  it('hire:updateAsset with only is_active skips asset_name', async () => {
    const handler = handlerMap.get('hire:updateAsset')!
    const event = {}; attachActor(event)
    await handler(event, 1, { is_active: 1 })
    expect(hireServiceMock.updateAsset).toHaveBeenCalledWith(1, { is_active: 1 })
  })
})
