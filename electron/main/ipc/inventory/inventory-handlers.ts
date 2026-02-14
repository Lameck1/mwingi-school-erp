import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

import type { InventoryService } from '../../services/inventory/InventoryService'

type InventoryFilters = Parameters<InventoryService['findAll']>[0]
type InventoryCreateInput = Parameters<InventoryService['create']>[0]
type InventoryUpdateInput = Parameters<InventoryService['update']>[1]
interface InventoryMovementInput {
    item_id: number
    quantity: number
    movement_type: 'IN' | 'OUT' | 'ADJUSTMENT'
    description?: string
    unit_cost?: number
}

const svc = () => container.resolve('InventoryService')

export function registerInventoryHandlers() {
    safeHandleRaw('inventory:getAll', (_event, filters?: InventoryFilters) => {
        return svc().findAll(filters)
    })

    safeHandleRaw('inventory:getItem', (_event, id: number) => {
        return svc().findById(id)
    })

    safeHandleRaw('inventory:createItem', (_event, data: InventoryCreateInput, userId: number) => {
        return svc().create(data, userId)
    })

    safeHandleRaw('inventory:updateItem', (_event, id: number, data: InventoryUpdateInput, userId: number) => {
        return svc().update(id, data, userId)
    })

    safeHandleRaw('inventory:recordMovement', (_event, data: InventoryMovementInput, userId: number) => {
        return svc().adjustStock(data.item_id, data.quantity, data.movement_type, userId, data.description, data.unit_cost)
    })

    safeHandleRaw('inventory:getHistory', (_event, itemId: number) => {
        return svc().getHistory(itemId)
    })

    safeHandleRaw('inventory:getLowStock', () => {
        return svc().getLowStock()
    })

    safeHandleRaw('inventory:getCategories', () => {
        return svc().getCategories()
    })

    safeHandleRaw('inventory:getSuppliers', () => {
        return svc().getSuppliers()
    })
}
