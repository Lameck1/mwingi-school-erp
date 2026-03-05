import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 9
let sessionRole = 'TEACHER'
const validIsoDate = new Date().toISOString();

const inventoryServiceMock = {
  findAll: vi.fn((..._args: unknown[]): unknown[] => []),
  findById: vi.fn((..._args: unknown[]): unknown => null),
  create: vi.fn((..._args: unknown[]): unknown => ({ success: true, id: 1 })),
  update: vi.fn((..._args: unknown[]): unknown => ({ success: true })),
  adjustStock: vi.fn((..._args: unknown[]): unknown => ({ success: true })),
  getHistory: vi.fn((..._args: unknown[]): unknown[] => []),
  getLowStock: vi.fn((..._args: unknown[]): unknown[] => []),
  getCategories: vi.fn((..._args: unknown[]): unknown[] => []),
  getSuppliers: vi.fn((..._args: unknown[]): unknown[] => []),
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
        created_at: validIsoDate
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

function attachActor(event: any) {
  event.__ipcActor = { id: sessionUserId, role: sessionRole, username: 'session-user', full_name: 'Session User', email: null, is_active: 1, created_at: validIsoDate }
}

describe('inventory IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'TEACHER'
    vi.clearAllMocks()
    registerInventoryHandlers()
  })

  // ======= inventory:getAll =======
  describe('inventory:getAll', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:getAll')).toBe(true)
    })

    it('returns all items without filters', async () => {
      const handler = handlerMap.get('inventory:getAll')!
      const event = {}; attachActor(event)
      inventoryServiceMock.findAll.mockReturnValue([{ id: 1, item_name: 'Chalk' }])
      const result = await handler(event)
      expect(inventoryServiceMock.findAll).toHaveBeenCalledWith()
      expect(result).toEqual([{ id: 1, item_name: 'Chalk' }])
    })

    it('passes normalized filters to service', async () => {
      const handler = handlerMap.get('inventory:getAll')!
      const event = {}; attachActor(event)
      await handler(event, { search: 'chalk', category: 'Stationery', lowStock: true })
      expect(inventoryServiceMock.findAll).toHaveBeenCalledWith({
        search: 'chalk', category: 'Stationery', low_stock: true
      })
    })

    it('passes partial filters correctly', async () => {
      const handler = handlerMap.get('inventory:getAll')!
      const event = {}; attachActor(event)
      await handler(event, { search: 'pen' })
      expect(inventoryServiceMock.findAll).toHaveBeenCalledWith({ search: 'pen' })
    })
  })

  // ======= inventory:getItem =======
  describe('inventory:getItem', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:getItem')).toBe(true)
    })

    it('returns item by id', async () => {
      const handler = handlerMap.get('inventory:getItem')!
      const event = {}; attachActor(event)
      inventoryServiceMock.findById.mockReturnValue({ id: 5, item_name: 'Eraser' })
      const result = await handler(event, [5])
      expect(inventoryServiceMock.findById).toHaveBeenCalledWith(5)
      expect(result).toEqual({ id: 5, item_name: 'Eraser' })
    })
  })

  // ======= inventory:createItem =======
  describe('inventory:createItem', () => {
    it('creates an item with valid data (uses authenticated actor id)', async () => {
      const handler = handlerMap.get('inventory:createItem')!
      const payload = {
        item_name: 'Chalk',
        item_code: 'CHK001',
        category_id: 1,
        unit_of_measure: 'Box',
        reorder_level: 5,
        unit_cost: 50,
        unit_price: 0
      }
      const result = await handler({}, payload, 9) as { success: boolean; error?: string }
      expect(result.success).toBe(true)
      expect(inventoryServiceMock.create).toHaveBeenCalledWith(expect.objectContaining(payload), 9)
    })

    it('passes optional supplier_id and description', async () => {
      const handler = handlerMap.get('inventory:createItem')!
      const event = {}; attachActor(event)
      const payload = {
        item_name: 'Eraser',
        item_code: 'ERS-001',
        category_id: 1,
        unit_of_measure: 'piece',
        reorder_level: 5,
        unit_cost: 10,
        unit_price: 15,
        supplier_id: 3,
        description: 'Large whiteboard eraser'
      }
      await handler(event, payload, 9)
      const calledWith = inventoryServiceMock.create.mock.calls[0][0] as Record<string, unknown>
      expect(calledWith.supplier_id).toBe(3)
      expect(calledWith.description).toBe('Large whiteboard eraser')
    })

    it('rejects missing required fields', async () => {
      const handler = handlerMap.get('inventory:createItem')!
      const event = {}; attachActor(event)
      const result = await handler(event, { item_name: 'Incomplete' }, 9) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Validation failed')
    })
  })

  // ======= inventory:updateItem =======
  describe('inventory:updateItem', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:updateItem')).toBe(true)
    })

    it('updates item with valid data', async () => {
      const handler = handlerMap.get('inventory:updateItem')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1, { item_name: 'Updated Name' })
      expect(inventoryServiceMock.update).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })
  })

  // ======= inventory:recordMovement =======
  describe('inventory:recordMovement', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:recordMovement')).toBe(true)
    })

    it('records stock IN movement', async () => {
      const handler = handlerMap.get('inventory:recordMovement')!
      const event = {}; attachActor(event)
      const data = { item_id: 1, quantity: 20, movement_type: 'IN', description: 'Restock' }
      const result = await handler(event, data, 9)
      expect(inventoryServiceMock.adjustStock).toHaveBeenCalledWith(1, 20, 'IN', 9, 'Restock', undefined)
      expect(result).toEqual({ success: true })
    })

    it('passes optional unit_cost for IN movement', async () => {
      const handler = handlerMap.get('inventory:recordMovement')!
      const event = {}; attachActor(event)
      const data = { item_id: 1, quantity: 5, movement_type: 'IN', unit_cost: 25 }
      await handler(event, data, 9)
      expect(inventoryServiceMock.adjustStock).toHaveBeenCalledWith(1, 5, 'IN', 9, undefined, 25)
    })

    it('rejects invalid movement_type', async () => {
      const handler = handlerMap.get('inventory:recordMovement')!
      const event = {}; attachActor(event)
      const data = { item_id: 1, quantity: 5, movement_type: 'INVALID' }
      const result = await handler(event, data, 9) as any
      expect(result.success).toBe(false)
      expect(inventoryServiceMock.adjustStock).not.toHaveBeenCalled()
    })
  })

  // ======= inventory:getHistory =======
  describe('inventory:getHistory', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:getHistory')).toBe(true)
    })

    it('returns movement history for item', async () => {
      const handler = handlerMap.get('inventory:getHistory')!
      const event = {}; attachActor(event)
      inventoryServiceMock.getHistory.mockReturnValue([{ id: 1, movement_type: 'IN', quantity: 10 }])
      const result = await handler(event, [3])
      expect(inventoryServiceMock.getHistory).toHaveBeenCalledWith(3)
      expect(result).toEqual([{ id: 1, movement_type: 'IN', quantity: 10 }])
    })
  })

  // ======= inventory:getLowStock =======
  describe('inventory:getLowStock', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:getLowStock')).toBe(true)
    })

    it('returns low stock items', async () => {
      const handler = handlerMap.get('inventory:getLowStock')!
      const event = {}; attachActor(event)
      inventoryServiceMock.getLowStock.mockReturnValue([{ id: 2, item_name: 'Pens', current_stock: 2 }])
      const result = await handler(event)
      expect(inventoryServiceMock.getLowStock).toHaveBeenCalled()
      expect(result).toEqual([{ id: 2, item_name: 'Pens', current_stock: 2 }])
    })
  })

  // ======= inventory:getCategories =======
  describe('inventory:getCategories', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:getCategories')).toBe(true)
    })

    it('returns categories list', async () => {
      const handler = handlerMap.get('inventory:getCategories')!
      const event = {}; attachActor(event)
      inventoryServiceMock.getCategories.mockReturnValue([{ id: 1, name: 'Stationery' }])
      const result = await handler(event)
      expect(inventoryServiceMock.getCategories).toHaveBeenCalled()
      expect(result).toEqual([{ id: 1, name: 'Stationery' }])
    })
  })

  // ======= inventory:getSuppliers =======
  describe('inventory:getSuppliers', () => {
    it('registers handler', () => {
      expect(handlerMap.has('inventory:getSuppliers')).toBe(true)
    })

    it('returns suppliers list', async () => {
      const handler = handlerMap.get('inventory:getSuppliers')!
      const event = {}; attachActor(event)
      inventoryServiceMock.getSuppliers.mockReturnValue([{ id: 1, name: 'Office Supplies Ltd' }])
      const result = await handler(event)
      expect(inventoryServiceMock.getSuppliers).toHaveBeenCalled()
      expect(result).toEqual([{ id: 1, name: 'Office Supplies Ltd' }])
    })
  })

  // ======= Coverage: inventory:getAll with individual filters =======
  describe('inventory:getAll individual filters', () => {
    it('passes only category filter', async () => {
      const handler = handlerMap.get('inventory:getAll')!
      const event = {}; attachActor(event)
      await handler(event, { category: 'Electronics' })
      expect(inventoryServiceMock.findAll).toHaveBeenCalledWith({ category: 'Electronics' })
    })

    it('passes only lowStock filter', async () => {
      const handler = handlerMap.get('inventory:getAll')!
      const event = {}; attachActor(event)
      await handler(event, { lowStock: true })
      expect(inventoryServiceMock.findAll).toHaveBeenCalledWith({ low_stock: true })
    })
  })

  // ======= Coverage: inventory:updateItem with all optional fields =======
  describe('inventory:updateItem all optional fields', () => {
    it('normalizes all update fields individually', async () => {
      const handler = handlerMap.get('inventory:updateItem')!
      const event = {}; attachActor(event)
      await handler(event, 1, {
        item_name: 'New Name',
        item_code: 'NC-001',
        category_id: 2,
        unit_of_measure: 'kg',
        reorder_level: 10,
        unit_cost: 200,
        unit_price: 300,
        supplier_id: 5,
        description: 'Updated description'
      })
      expect(inventoryServiceMock.update).toHaveBeenCalledWith(1, expect.objectContaining({
        item_name: 'New Name',
        item_code: 'NC-001',
        category_id: 2,
        unit_of_measure: 'kg',
        reorder_level: 10,
        unit_cost: 200,
        unit_price: 300,
        supplier_id: 5,
        description: 'Updated description'
      }), 9)
    })

    it('omits undefined fields from update payload', async () => {
      const handler = handlerMap.get('inventory:updateItem')!
      const event = {}; attachActor(event)
      await handler(event, 1, { unit_cost: 100 })
      const calledWith = inventoryServiceMock.update.mock.calls[0][1] as Record<string, unknown>
      expect(calledWith).toEqual({ unit_cost: 100 })
      expect(calledWith).not.toHaveProperty('item_name')
      expect(calledWith).not.toHaveProperty('supplier_id')
    })
  })
})
