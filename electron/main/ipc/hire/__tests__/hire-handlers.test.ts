import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
const handlerMap = new Map<string, IpcHandler>()

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

describe('hire handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    hireServiceMock.createBooking.mockClear()
    hireServiceMock.updateBookingStatus.mockClear()
    registerHireHandlers()
  })

  it('hire:createBooking rejects invalid hire date format', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const result = await handler({}, {
      asset_id: 1,
      client_id: 2,
      hire_date: '02/01/2026',
      total_amount: 5000
    }, 7) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid date format')
    expect(hireServiceMock.createBooking).not.toHaveBeenCalled()
  })

  it('hire:createBooking rejects return date earlier than hire date', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const result = await handler({}, {
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
    const result = await handler({}, {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-02-10',
      total_amount: 0
    }, 7) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('greater than zero')
    expect(hireServiceMock.createBooking).not.toHaveBeenCalled()
  })

  it('hire:createBooking passes valid payload to service', async () => {
    const handler = handlerMap.get('hire:createBooking')!
    const payload = {
      asset_id: 1,
      client_id: 2,
      hire_date: '2026-02-10',
      return_date: '2026-02-11',
      total_amount: 5000
    }
    const result = await handler({}, payload, 7) as { success: boolean }
    expect(result.success).toBe(true)
    expect(hireServiceMock.createBooking).toHaveBeenCalledWith(payload, 7)
  })

  it('hire:updateBookingStatus rejects unknown status values', async () => {
    const handler = handlerMap.get('hire:updateBookingStatus')!
    const result = await handler({}, 10, 'ARCHIVED') as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid booking status')
    expect(hireServiceMock.updateBookingStatus).not.toHaveBeenCalled()
  })
})
