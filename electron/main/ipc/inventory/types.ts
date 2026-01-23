export interface InventoryItem {
  id: number
  item_code: string
  item_name: string
  category_id: number
  unit_of_measure: string
  current_stock: number
  reorder_level: number
  unit_cost: number
  is_active: boolean
  created_at: string
  updated_at: string
  category_name?: string
}

export interface InventoryCategory {
  id: number
  category_name: string
  description?: string
  is_active: boolean
  created_at: string
}

export interface StockMovement {
  id: number
  item_id: number
  movement_type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  unit_cost: number
  total_cost: number
  reference_number?: string
  supplier_id?: number
  description?: string
  movement_date: string
  recorded_by_user_id: number
  created_at: string
}

export interface InventoryItemCreateData {
  item_code: string
  item_name: string
  category_id: number
  unit_of_measure: string
  reorder_level: number
  unit_cost: number
}

export interface StockMovementData {
  item_id: number
  movement_type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  unit_cost: number
  reference_number?: string
  supplier_id?: number
  description?: string
  movement_date: string
}


