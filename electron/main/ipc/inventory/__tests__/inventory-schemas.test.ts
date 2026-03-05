/**
 * Zod schema tests for inventory IPC contracts.
 *
 * Validates that the boundary between frontend and backend rejects bad data
 * and correctly transforms edge-case inputs. These are the exact schemas
 * used by the validated-handler middleware.
 */
import { describe, it, expect } from 'vitest'

import {
  InventoryCreateSchema,
  InventoryUpdateSchema,
  InventoryMovementSchema,
  InventoryFiltersSchema,
  InventoryGetItemSchema,
} from '../../schemas/inventory-schemas'

/* ================================================================== */
/*  InventoryCreateSchema                                             */
/* ================================================================== */
describe('InventoryCreateSchema', () => {
  const valid = {
    item_name: 'Chalk', item_code: 'CHK-001', category_id: 1,
    unit_of_measure: 'Box', reorder_level: 5, unit_cost: 200, unit_price: 250,
  }

  it('parses valid input', () => {
    const result = InventoryCreateSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('rejects empty item_name', () => {
    const result = InventoryCreateSchema.safeParse({ ...valid, item_name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty item_code', () => {
    const result = InventoryCreateSchema.safeParse({ ...valid, item_code: '' })
    expect(result.success).toBe(false)
  })

  it('rejects category_id = 0', () => {
    const result = InventoryCreateSchema.safeParse({ ...valid, category_id: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative category_id', () => {
    const result = InventoryCreateSchema.safeParse({ ...valid, category_id: -1 })
    expect(result.success).toBe(false)
  })

  it('defaults reorder_level/unit_cost/unit_price to 0', () => {
    const { reorder_level, unit_cost, unit_price, ...minimal } = valid
    const result = InventoryCreateSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reorder_level).toBe(0)
      expect(result.data.unit_cost).toBe(0)
      expect(result.data.unit_price).toBe(0)
    }
  })

  it('transforms null supplier_id to undefined', () => {
    const result = InventoryCreateSchema.safeParse({ ...valid, supplier_id: null })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.supplier_id).toBeUndefined()
    }
  })

  it('rejects negative unit_cost', () => {
    const result = InventoryCreateSchema.safeParse({ ...valid, unit_cost: -10 })
    expect(result.success).toBe(false)
  })
})

/* ================================================================== */
/*  InventoryUpdateSchema                                             */
/* ================================================================== */
describe('InventoryUpdateSchema', () => {
  it('parses [id, partial data] tuple', () => {
    const result = InventoryUpdateSchema.safeParse([1, { item_name: 'New Name' }])
    expect(result.success).toBe(true)
  })

  it('allows all fields optional in partial', () => {
    const result = InventoryUpdateSchema.safeParse([1, {}])
    expect(result.success).toBe(true)
  })

  it('rejects non-numeric id', () => {
    const result = InventoryUpdateSchema.safeParse(['one', {}])
    expect(result.success).toBe(false)
  })
})

/* ================================================================== */
/*  InventoryMovementSchema                                           */
/* ================================================================== */
describe('InventoryMovementSchema', () => {
  it('parses valid IN movement', () => {
    const result = InventoryMovementSchema.safeParse({
      item_id: 1, quantity: 10, movement_type: 'IN',
    })
    expect(result.success).toBe(true)
  })

  it('parses valid OUT movement', () => {
    const result = InventoryMovementSchema.safeParse({
      item_id: 1, quantity: 5, movement_type: 'OUT',
    })
    expect(result.success).toBe(true)
  })

  it('parses ADJUSTMENT with description', () => {
    const result = InventoryMovementSchema.safeParse({
      item_id: 1, quantity: 100, movement_type: 'ADJUSTMENT', description: 'Recount',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid movement_type', () => {
    const result = InventoryMovementSchema.safeParse({
      item_id: 1, quantity: 10, movement_type: 'TRANSFER',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing item_id', () => {
    const result = InventoryMovementSchema.safeParse({
      quantity: 10, movement_type: 'IN',
    })
    expect(result.success).toBe(false)
  })
})

/* ================================================================== */
/*  InventoryFiltersSchema                                            */
/* ================================================================== */
describe('InventoryFiltersSchema', () => {
  it('accepts undefined (no filters)', () => {
    const result = InventoryFiltersSchema.safeParse(void 0)
    expect(result.success).toBe(true)
  })

  it('accepts search only', () => {
    const result = InventoryFiltersSchema.safeParse({ search: 'chalk' })
    expect(result.success).toBe(true)
  })

  it('accepts lowStock boolean', () => {
    const result = InventoryFiltersSchema.safeParse({ lowStock: true })
    expect(result.success).toBe(true)
  })
})

/* ================================================================== */
/*  InventoryGetItemSchema                                            */
/* ================================================================== */
describe('InventoryGetItemSchema', () => {
  it('accepts [number] tuple', () => {
    const result = InventoryGetItemSchema.safeParse([42])
    expect(result.success).toBe(true)
  })

  it('rejects [string] tuple', () => {
    const result = InventoryGetItemSchema.safeParse(['abc'])
    expect(result.success).toBe(false)
  })
})
