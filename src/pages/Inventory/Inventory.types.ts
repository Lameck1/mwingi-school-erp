export type AddItemFormData = {
    item_code: string
    item_name: string
    category_id: string
    unit_of_measure: string
    reorder_level: number
    unit_cost: number
}

export type StockMovementFormData = {
    quantity: number
    unit_cost: number
    description: string
    reference_number: string
    supplier_id: string
}

export const INITIAL_ITEM: AddItemFormData = {
    item_code: '', item_name: '', category_id: '',
    unit_of_measure: 'Pieces', reorder_level: 10, unit_cost: 0
}

export function buildStockMovement(unitCost = 0): StockMovementFormData {
    return { quantity: 0, unit_cost: unitCost, description: '', reference_number: '', supplier_id: '' }
}

export type { InventoryItem, InventoryCategory, Supplier } from '../../types/electron-api/InventoryAPI'
