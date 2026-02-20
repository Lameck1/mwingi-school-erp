import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    InventoryFiltersSchema,
    InventoryGetItemSchema,
    InventoryCreateSchema,
    InventoryUpdateSchema,
    InventoryMovementSchema,
    InventoryGetHistorySchema,
    InventoryGetLowStockSchema,
    InventoryGetCategoriesSchema,
    InventoryGetSuppliersSchema
} from '../schemas/inventory-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { InventoryService } from '../../services/inventory/InventoryService'

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
    validatedHandler('inventory:getAll', ROLES.STAFF, InventoryFiltersSchema, (_event, filters) => {
        return svc().findAll(filters)
    })

    validatedHandler('inventory:getItem', ROLES.STAFF, InventoryGetItemSchema, (_event, [id]) => {
        return svc().findById(id)
    })

    validatedHandler('inventory:createItem', ROLES.STAFF, InventoryCreateSchema, (event, data: InventoryCreateInput, actor) => {
        return svc().create(data, actor.id)
    })

    validatedHandlerMulti('inventory:updateItem', ROLES.STAFF, InventoryUpdateSchema, (event, [id, data]: [number, InventoryUpdateInput], actor) => {
        return svc().update(id, data, actor.id)
    })

    validatedHandler('inventory:recordMovement', ROLES.STAFF, InventoryMovementSchema, (event, data: InventoryMovementInput, actor) => {
        return svc().adjustStock(data.item_id, data.quantity, data.movement_type, actor.id, data.description, data.unit_cost)
    })

    validatedHandler('inventory:getHistory', ROLES.STAFF, InventoryGetHistorySchema, (_event, [itemId]) => {
        return svc().getHistory(itemId)
    })

    validatedHandler('inventory:getLowStock', ROLES.STAFF, InventoryGetLowStockSchema, () => {
        return svc().getLowStock()
    })

    validatedHandler('inventory:getCategories', ROLES.STAFF, InventoryGetCategoriesSchema, () => {
        return svc().getCategories()
    })

    validatedHandler('inventory:getSuppliers', ROLES.STAFF, InventoryGetSuppliersSchema, () => {
        return svc().getSuppliers()
    })
}
