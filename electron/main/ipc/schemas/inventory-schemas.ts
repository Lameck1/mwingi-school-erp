import { z } from 'zod'

export const InventoryFiltersSchema = z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    lowStock: z.boolean().optional()
}).optional()

export const InventoryGetItemSchema = z.tuple([z.number()])

export const InventoryCreateSchema = z.object({
    item_name: z.string().min(1, 'Item name is required'),
    item_code: z.string().min(1, 'Item code is required'),
    category_id: z.number().int().positive('Category is required'),
    unit_of_measure: z.string().min(1, 'Unit of measure is required'),
    reorder_level: z.number().min(0).default(0),
    unit_cost: z.number().min(0).default(0),
    unit_price: z.number().min(0).default(0),
    supplier_id: z.number().nullable().optional().transform(v => v ?? undefined),
    description: z.string().nullable().optional().transform(v => v ?? undefined)
})

export const InventoryUpdateSchema = z.tuple([
    z.number(), // id
    z.object({
        item_name: z.string().optional(),
        item_code: z.string().optional(),
        category_id: z.number().optional(),
        unit_of_measure: z.string().optional(),
        reorder_level: z.number().optional(),
        unit_cost: z.number().optional(),
        unit_price: z.number().optional(),
        supplier_id: z.number().nullable().optional().transform(v => v ?? undefined),
        description: z.string().nullable().optional().transform(v => v ?? undefined)
    })
])

export const InventoryMovementSchema = z.object({
    item_id: z.number(),
    quantity: z.number(),
    movement_type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
    description: z.string().optional(),
    unit_cost: z.number().optional()
})

export const InventoryGetHistorySchema = z.tuple([z.number()])
export const InventoryGetLowStockSchema = z.void()
export const InventoryGetCategoriesSchema = z.void()
export const InventoryGetSuppliersSchema = z.void()
