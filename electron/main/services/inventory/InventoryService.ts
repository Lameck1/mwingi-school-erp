import { BaseService } from '../base/BaseService'
import { logAudit } from '../../database/utils/audit'

export interface InventoryItem {
    id: number
    item_name: string
    category: string
    unit_of_measure: string
    quantity_in_stock: number
    reorder_level: number
    unit_price: number
    supplier_id: number | null
    description: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface StockTransaction {
    id: number
    item_id: number
    transaction_type: 'IN' | 'OUT' | 'ADJUSTMENT'
    quantity: number
    unit_price: number
    transaction_date: string
    reference: string | null
    notes: string | null
    created_by_user_id: number
    created_at: string
}

export interface CreateInventoryItemData {
    item_name: string
    category: string
    unit_of_measure: string
    reorder_level: number
    unit_price: number
    supplier_id?: number
    description?: string
}

export interface InventoryFilters {
    category?: string
    search?: string
    low_stock?: boolean
}

export class InventoryService extends BaseService<InventoryItem, CreateInventoryItemData, Partial<CreateInventoryItemData>, InventoryFilters> {
    protected getTableName(): string { return 'inventory_item' }
    protected getPrimaryKey(): string { return 'id' }

    protected buildSelectQuery(): string {
        return `
            SELECT i.*, c.category_name 
            FROM inventory_item i
            JOIN inventory_category c ON i.category_id = c.id
        `
    }

    protected mapRowToEntity(row: any): InventoryItem {
        return {
            id: row.id,
            item_code: row.item_code,
            item_name: row.item_name,
            category_name: row.category_name,
            category_id: row.category_id,
            unit_of_measure: row.unit_of_measure,
            current_stock: row.current_stock,
            reorder_level: row.reorder_level,
            unit_cost: row.unit_cost,
            is_active: Boolean(row.is_active),
            created_at: row.created_at
        } as any
    }

    protected validateCreate(data: any): string[] | null {
        const errors: string[] = []
        if (!data.item_name) errors.push('Item name is required')
        if (!data.item_code) errors.push('Item code is required')
        if (!data.category_id) errors.push('Category is required')
        if (!data.unit_of_measure) errors.push('Unit of measure is required')
        return errors.length > 0 ? errors : null
    }

    protected async validateUpdate(id: number, data: any): Promise<string[] | null> {
        return null
    }

    protected executeCreate(data: any): { lastInsertRowid: number | bigint } {
        return this.db.prepare(`
            INSERT INTO inventory_item (
                item_code, item_name, category_id, unit_of_measure, reorder_level, unit_cost
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            data.item_code, data.item_name, data.category_id,
            data.unit_of_measure, data.reorder_level || 0, data.unit_cost || 0
        )
    }

    protected executeUpdate(id: number, data: any): void {
        const sets: string[] = []
        const params: any[] = []

        if (data.item_name) { sets.push('item_name = ?'); params.push(data.item_name) }
        if (data.item_code) { sets.push('item_code = ?'); params.push(data.item_code) }
        if (data.category_id) { sets.push('category_id = ?'); params.push(data.category_id) }
        if (data.unit_of_measure) { sets.push('unit_of_measure = ?'); params.push(data.unit_of_measure) }
        if (data.reorder_level !== undefined) { sets.push('reorder_level = ?'); params.push(data.reorder_level) }
        if (data.unit_cost !== undefined) { sets.push('unit_cost = ?'); params.push(data.unit_cost) }

        if (sets.length > 0) {
            params.push(id)
            this.db.prepare(`UPDATE inventory_item SET ${sets.join(', ')} WHERE id = ?`).run(...params)
        }
    }

    protected applyFilters(filters: any, conditions: string[], params: any[]): void {
        if (filters.category_id) {
            conditions.push('category_id = ?')
            params.push(filters.category_id)
        }
        if (filters.search) {
            conditions.push('(item_name LIKE ? OR item_code LIKE ?)')
            params.push(`%${filters.search}%`, `%${filters.search}%`)
        }
        if (filters.low_stock) {
            conditions.push('current_stock <= reorder_level')
        }
    }

    // Custom Methods

    async adjustStock(itemId: number, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT', userId: number, notes?: string): Promise<{ success: boolean; error?: string }> {
        const item = await this.findById(itemId)
        if (!item) return { success: false, error: 'Item not found' }

        const current_stock = (item as any).current_stock
        let change = 0
        let finalQty = 0

        if (type === 'ADJUSTMENT') {
            finalQty = quantity
            change = finalQty - current_stock
        } else {
            change = type === 'OUT' ? -quantity : quantity
            finalQty = current_stock + change
        }

        if (finalQty < 0) return { success: false, error: 'Insufficient stock' }

        this.db.transaction(() => {
            this.db.prepare('UPDATE inventory_item SET current_stock = ? WHERE id = ?')
                .run(finalQty, itemId)

            this.db.prepare(`
                INSERT INTO stock_movement (
                    item_id, movement_type, quantity, unit_cost, 
                    description, movement_date, recorded_by_user_id
                ) VALUES (?, ?, ?, ?, ?, CURRENT_DATE, ?)
            `).run(itemId, type, Math.abs(change), (item as any).unit_cost, notes || null, userId)
        })()

        logAudit(userId, 'STOCK_UPDATE', 'inventory_item', itemId, { quantity: current_stock }, { quantity: finalQty })

        return { success: true }
    }

    async getHistory(itemId: number): Promise<any[]> {
        return this.db.prepare(`
            SELECT sm.*, u.full_name as recorded_by_name
            FROM stock_movement sm
            LEFT JOIN user u ON sm.recorded_by_user_id = u.id
            WHERE sm.item_id = ? 
            ORDER BY sm.created_at DESC
        `).all(itemId) as any[]
    }

    async getLowStock(): Promise<any[]> {
        return this.db.prepare(`
            ${this.buildSelectQuery()}
            WHERE i.current_stock <= i.reorder_level AND i.is_active = 1
        `).all() as any[]
    }

    async getCategories(): Promise<any[]> {
        return this.db.prepare('SELECT * FROM inventory_category WHERE is_active = 1').all() as any[]
    }

    async getSuppliers(): Promise<any[]> {
        return this.db.prepare('SELECT * FROM supplier WHERE is_active = 1').all() as any[]
    }
}
