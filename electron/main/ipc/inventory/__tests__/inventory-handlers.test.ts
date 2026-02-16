import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 9
let sessionRole = 'TEACHER'

const inventoryServiceMock = {
  findAll: vi.fn(() => []),
  findById: vi.fn(() => null),
  create: vi.fn(() => ({ success: true, id: 1 })),
  update: vi.fn(() => ({ success: true })),
  adjustStock: vi.fn(() => ({ success: true })),
  getHistory: vi.fn(() => []),
  getLowStock: vi.fn(() => []),
  getCategories: vi.fn(() => []),
  getSuppliers: vi.fn(() => []),
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
    resolve: vi.fn(() => inventoryServiceMock)
  }
}))

import { registerInventoryHandlers } from '../inventory-handlers'

describe('inventory IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'TEACHER'
    inventoryServiceMock.create.mockClear()
    registerInventoryHandlers()
  })

  it('inventory:createItem rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('inventory:createItem')
    expect(handler).toBeDefined()

    const result = await handler!({}, { item_name: 'Paper', current_stock: 5 }, 3) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(inventoryServiceMock.create).not.toHaveBeenCalled()
  })

  it('inventory:createItem uses authenticated actor id', async () => {
    const handler = handlerMap.get('inventory:createItem')!
    const payload = { item_name: 'Chalk', current_stock: 10 }
    const result = await handler({}, payload, 9) as { success: boolean }

    expect(result.success).toBe(true)
    expect(inventoryServiceMock.create).toHaveBeenCalledWith(payload, 9)
  })
})
