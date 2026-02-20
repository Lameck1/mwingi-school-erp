import { logAudit } from '../../database/utils/audit'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'
import { SystemAccounts } from '../accounting/SystemAccounts'
import { BaseService } from '../base/BaseService'

export interface InventoryItem {
    id: number
    item_code: string
    item_name: string
    category: string
    category_id: number
    unit_of_measure: string
    current_stock: number
    reorder_level: number
    unit_cost: number
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
    item_code: string
    item_name: string
    category_id: number
    unit_of_measure: string
    reorder_level: number
    unit_cost: number
    unit_price: number
    supplier_id?: number
    description?: string
}

export interface InventoryFilters {
    category?: string
    category_id?: number
    search?: string
    low_stock?: boolean
}

export interface StockMovementHistory extends StockTransaction {
    recorded_by_name: string | null
}

export interface InventoryCategory {
    id: number
    category_name: string
    description: string | null
    is_active: boolean
}

export interface Supplier {
    id: number
    supplier_name: string
    contact_person: string | null
    email: string | null
    phone: string | null
    address: string | null
    is_active: boolean
}

type AdjustStockArgs = [
    itemId: number,
    quantity: number,
    type: 'IN' | 'OUT' | 'ADJUSTMENT',
    userId: number,
    notes?: string,
    unitCost?: number
]

interface StockComputation {
    currentStock: number
    finalQty: number
    change: number
}

interface InventoryItemRow {
    id: number;
    item_code: string;
    item_name: string;
    category_name: string;
    category_id: number;
    unit_of_measure: string;
    current_stock: number;
    reorder_level: number;
    unit_cost: number;
    unit_price: number;
    supplier_id: number | null;
    description: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
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

    protected mapRowToEntity(row: unknown): InventoryItem {
        const r = row as InventoryItemRow
        return {
            id: r.id,
            item_code: r.item_code,
            item_name: r.item_name,
            category: r.category_name,
            category_id: r.category_id,
            unit_of_measure: r.unit_of_measure,
            current_stock: r.current_stock,
            reorder_level: r.reorder_level,
            unit_cost: r.unit_cost,
            unit_price: r.unit_price,
            supplier_id: r.supplier_id,
            description: r.description,
            is_active: Boolean(r.is_active),
            created_at: r.created_at,
            updated_at: r.updated_at
        }
    }

    protected validateCreate(data: CreateInventoryItemData): string[] | null {
        const errors: string[] = []
        if (!data.item_name) { errors.push('Item name is required') }
        if (!data.item_code) { errors.push('Item code is required') }
        if (!data.category_id) { errors.push('Category is required') }
        if (!data.unit_of_measure) { errors.push('Unit of measure is required') }
        return errors.length > 0 ? errors : null
    }

    protected async validateUpdate(_id: number, _data: Partial<CreateInventoryItemData>): Promise<string[] | null> {
        return null
    }

    protected executeCreate(data: CreateInventoryItemData): { lastInsertRowid: number | bigint } {
        return this.db.prepare(`
            INSERT INTO inventory_item (
                item_code, item_name, category_id, unit_of_measure, reorder_level, unit_cost,
                unit_price, supplier_id, description, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            data.item_code, data.item_name, data.category_id,
            data.unit_of_measure, data.reorder_level || 0, data.unit_cost || 0,
            data.unit_price || 0, data.supplier_id || null, data.description || null
        )
    }

    protected executeUpdate(id: number, data: Partial<CreateInventoryItemData>): void {
        const sets: string[] = []
        const params: unknown[] = []

        const assign = (column: string, value: unknown): void => {
            sets.push(`${column} = ?`)
            params.push(value)
        }

        const assignIfPresent = (column: string, value: unknown): void => {
            if (value !== undefined && value !== null && value !== '') {
                assign(column, value)
            }
        }

        const assignIfDefined = (column: string, value: unknown): void => {
            if (value !== undefined) {
                assign(column, value)
            }
        }

        assignIfPresent('item_name', data.item_name)
        assignIfPresent('item_code', data.item_code)
        assignIfPresent('category_id', data.category_id)
        assignIfPresent('unit_of_measure', data.unit_of_measure)
        assignIfDefined('reorder_level', data.reorder_level)
        assignIfDefined('unit_cost', data.unit_cost)
        assignIfDefined('unit_price', data.unit_price)
        assignIfDefined('supplier_id', data.supplier_id)
        assignIfDefined('description', data.description)

        if (sets.length > 0) {
            params.push(id)
            this.db.prepare(`UPDATE inventory_item SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params)
        }
    }

    protected override applyFilters(filters: unknown, conditions: string[], params: unknown[]): void {
        const f = filters as InventoryFilters
        if (f.category_id) {
            conditions.push('category_id = ?')
            params.push(f.category_id)
        }
        if (f.search) {
            conditions.push('(item_name LIKE ? OR item_code LIKE ?)')
            params.push(`%${f.search}%`, `%${f.search}%`)
        }
        if (f.low_stock) {
            conditions.push('current_stock <= reorder_level')
        }
    }

    // Custom Methods

    private computeStockLevels(item: InventoryItem, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT'): StockComputation {
        const currentStock = item.current_stock

        if (type === 'ADJUSTMENT') {
            return {
                currentStock,
                finalQty: quantity,
                change: quantity - currentStock
            }
        }

        const change = type === 'OUT' ? -quantity : quantity
        return {
            currentStock,
            finalQty: currentStock + change,
            change
        }
    }

    async adjustStock(...[itemId, quantity, type, userId, notes, unitCost]: AdjustStockArgs): Promise<{ success: boolean; error?: string }> {
        const item = await this.findById(itemId)
        if (!item) { return { success: false, error: 'Item not found' } }

        const { currentStock, finalQty, change } = this.computeStockLevels(item, quantity, type)

        if (finalQty < 0) { return { success: false, error: 'Insufficient stock' } }

        // Use provided unit cost for IN/ADJUSTMENT, otherwise fallback to item's current cost
        // For OUT, we typically use the item's current cost (FIFO/LIFO/Avg not strictly implemented here, assuming standard cost)
        const movementCost = (type === 'IN' && unitCost !== undefined) ? unitCost : item.unit_cost

        this.db.transaction(() => {
            // Update stock level
            this.db.prepare('UPDATE inventory_item SET current_stock = ? WHERE id = ?')
                .run(finalQty, itemId)

            // If it's an IN movement with a new cost, update the item's unit cost (Last Price)
            if (type === 'IN' && unitCost !== undefined && unitCost > 0) {
                this.db.prepare('UPDATE inventory_item SET unit_cost = ? WHERE id = ?')
                    .run(unitCost, itemId)
            }

            this.db.prepare(`
                INSERT INTO stock_movement (
                    item_id, movement_type, quantity, unit_cost, 
                    description, movement_date, recorded_by_user_id
                ) VALUES (?, ?, ?, ?, ?, CURRENT_DATE, ?)
            `).run(itemId, type, Math.abs(change), movementCost, notes || null, userId)

            // Create Journal Entry
            // Determine accounting impact
            const value = Math.abs(change) * movementCost;
            if (value > 0) {
                const journalService = new DoubleEntryJournalService(this.db);
                let debitCode: string;
                let creditCode: string;
                let jeType: string;

                if (change > 0) {
                    // Asset Increase (Debit Inventory)
                    debitCode = SystemAccounts.INVENTORY_ASSET;

                    if (type === 'IN') {
                        // Purchase (Credit AP)
                        creditCode = SystemAccounts.ACCOUNTS_PAYABLE;
                        jeType = 'STOCK_PURCHASE';
                    } else {
                        // Adjustment Gain (Credit Expense/Gain)
                        creditCode = SystemAccounts.INVENTORY_EXPENSE;
                        jeType = 'STOCK_ADJUSTMENT_GAIN';
                    }
                } else {
                    // Asset Decrease (Credit Inventory)
                    creditCode = SystemAccounts.INVENTORY_ASSET;
                    // Debit Expense (Usage/Loss)
                    debitCode = SystemAccounts.INVENTORY_EXPENSE;
                    jeType = type === 'OUT' ? 'STOCK_USAGE' : 'STOCK_ADJUSTMENT_LOSS';
                }

                journalService.createJournalEntrySync({
                    entry_date: new Date().toISOString(),
                    entry_type: jeType,
                    description: `Stock ${type}: ${item.item_name} (Qty: ${Math.abs(change)})`,
                    created_by_user_id: userId,
                    supplier_id: item.supplier_id ?? undefined,
                    lines: [
                        {
                            gl_account_code: debitCode,
                            debit_amount: value,
                            credit_amount: 0,
                            description: type === 'IN' ? 'Inventory Addition' : 'Expense/Usage'
                        },
                        {
                            gl_account_code: creditCode,
                            debit_amount: 0,
                            credit_amount: value,
                            description: type === 'IN' ? 'Accounts Payable' : 'Inventory Reduction'
                        }
                    ]
                });
            }
        })()

        logAudit(userId, 'STOCK_UPDATE', 'inventory_item', itemId, { quantity: currentStock }, { quantity: finalQty })

        return { success: true }
    }

    async getHistory(itemId: number): Promise<StockMovementHistory[]> {
        return this.db.prepare(`
            SELECT sm.*, u.full_name as recorded_by_name
            FROM stock_movement sm
            LEFT JOIN user u ON sm.recorded_by_user_id = u.id
            WHERE sm.item_id = ? 
            ORDER BY sm.created_at DESC
        `).all(itemId) as StockMovementHistory[]
    }

    async getLowStock(): Promise<InventoryItem[]> {
        const rows = this.db.prepare(`
            ${this.buildSelectQuery()}
            WHERE i.current_stock <= i.reorder_level AND i.is_active = 1
        `).all() as InventoryItemRow[]
        return rows.map(row => this.mapRowToEntity(row))
    }

    async getCategories(): Promise<InventoryCategory[]> {
        return this.db.prepare('SELECT * FROM inventory_category WHERE is_active = 1').all() as InventoryCategory[]
    }

    async getSuppliers(): Promise<Supplier[]> {
        return this.db.prepare('SELECT * FROM supplier WHERE is_active = 1').all() as Supplier[]
    }
}
