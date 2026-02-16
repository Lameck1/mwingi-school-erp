import { container } from '../../services/base/ServiceContainer'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

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
    safeHandleRawWithRole('inventory:getAll', ROLES.STAFF, (_event, filters?: InventoryFilters) => {
        return svc().findAll(filters)
    })

    safeHandleRawWithRole('inventory:getItem', ROLES.STAFF, (_event, id: number) => {
        return svc().findById(id)
    })

    safeHandleRawWithRole('inventory:createItem', ROLES.STAFF, (event, data: InventoryCreateInput, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return svc().create(data, actor.actorId)
    })

    safeHandleRawWithRole('inventory:updateItem', ROLES.STAFF, (event, id: number, data: InventoryUpdateInput, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return svc().update(id, data, actor.actorId)
    })

    safeHandleRawWithRole('inventory:recordMovement', ROLES.STAFF, (event, data: InventoryMovementInput, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return svc().adjustStock(data.item_id, data.quantity, data.movement_type, actor.actorId, data.description, data.unit_cost)
    })

    safeHandleRawWithRole('inventory:getHistory', ROLES.STAFF, (_event, itemId: number) => {
        return svc().getHistory(itemId)
    })

    safeHandleRawWithRole('inventory:getLowStock', ROLES.STAFF, () => {
        return svc().getLowStock()
    })

    safeHandleRawWithRole('inventory:getCategories', ROLES.STAFF, () => {
        return svc().getCategories()
    })

    safeHandleRawWithRole('inventory:getSuppliers', ROLES.STAFF, () => {
        return svc().getSuppliers()
    })
}
