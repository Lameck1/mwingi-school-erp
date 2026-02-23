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

const svc = () => container.resolve('InventoryService')

export function registerInventoryHandlers() {
    validatedHandler('inventory:getAll', ROLES.STAFF, InventoryFiltersSchema, (_event, filters) => {
        if (!filters) {
            return svc().findAll()
        }
        const normalized: Parameters<InventoryService['findAll']>[0] = {}
        if (filters.search !== undefined) {
            normalized.search = filters.search
        }
        if (filters.category !== undefined) {
            normalized.category = filters.category
        }
        if (filters.lowStock !== undefined) {
            normalized.low_stock = filters.lowStock
        }
        return svc().findAll(normalized)
    })

    validatedHandler('inventory:getItem', ROLES.STAFF, InventoryGetItemSchema, (_event, [id]) => {
        return svc().findById(id)
    })

    validatedHandler('inventory:createItem', ROLES.STAFF, InventoryCreateSchema, (_event, data, actor) => {
        const normalized: InventoryCreateInput = {
            item_name: data.item_name,
            item_code: data.item_code,
            category_id: data.category_id,
            unit_of_measure: data.unit_of_measure,
            reorder_level: data.reorder_level,
            unit_cost: data.unit_cost,
            unit_price: data.unit_price,
            ...(data.supplier_id !== undefined ? { supplier_id: data.supplier_id } : {}),
            ...(data.description !== undefined ? { description: data.description } : {})
        }
        return svc().create(normalized, actor.id)
    })

    validatedHandlerMulti('inventory:updateItem', ROLES.STAFF, InventoryUpdateSchema, (_event, [id, data], actor) => {
        const normalized: InventoryUpdateInput = {}
        if (data.item_name !== undefined) {
            normalized.item_name = data.item_name
        }
        if (data.item_code !== undefined) {
            normalized.item_code = data.item_code
        }
        if (data.category_id !== undefined) {
            normalized.category_id = data.category_id
        }
        if (data.unit_of_measure !== undefined) {
            normalized.unit_of_measure = data.unit_of_measure
        }
        if (data.reorder_level !== undefined) {
            normalized.reorder_level = data.reorder_level
        }
        if (data.unit_cost !== undefined) {
            normalized.unit_cost = data.unit_cost
        }
        if (data.unit_price !== undefined) {
            normalized.unit_price = data.unit_price
        }
        if (data.supplier_id !== undefined) {
            normalized.supplier_id = data.supplier_id
        }
        if (data.description !== undefined) {
            normalized.description = data.description
        }
        return svc().update(id, normalized, actor.id)
    })

    validatedHandler('inventory:recordMovement', ROLES.STAFF, InventoryMovementSchema, (_event, data, actor) => {
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
