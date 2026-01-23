import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { getDatabase } from '../../database/index'
import type { InventoryItem, InventoryItemCreateData, StockMovementData } from './types'

export function registerInventoryHandlers(): void {
    const db = getDatabase()

    // ======== INVENTORY ========
    ipcMain.handle('inventory:getAll', async () => {
        return db.prepare(`SELECT i.*, c.category_name FROM inventory_item i
      LEFT JOIN inventory_category c ON i.category_id = c.id
      WHERE i.is_active = 1 ORDER BY i.item_name`).all()
    })

    ipcMain.handle('inventory:getLowStock', async () => {
        return db.prepare(`SELECT i.*, c.category_name FROM inventory_item i
      LEFT JOIN inventory_category c ON i.category_id = c.id
      WHERE i.is_active = 1 AND i.current_stock <= i.reorder_level`).all()
    })

    ipcMain.handle('inventory:getCategories', async () => {
        return db.prepare('SELECT * FROM inventory_category WHERE is_active = 1 ORDER BY category_name').all()
    })

    ipcMain.handle('inventory:createItem', async (_event: IpcMainInvokeEvent, data: InventoryItemCreateData) => {
        const stmt = db.prepare(`INSERT INTO inventory_item (
            item_code, item_name, category_id, unit_of_measure, reorder_level, unit_cost
        ) VALUES (?, ?, ?, ?, ?, ?)`)
        const result = stmt.run(
            data.item_code, data.item_name, data.category_id,
            data.unit_of_measure, data.reorder_level, data.unit_cost
        )
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('inventory:updateItem', async (_event: IpcMainInvokeEvent, id: number, data: Partial<InventoryItem>) => {
        const item = db.prepare('SELECT * FROM inventory_item WHERE id = ?').get(id) as InventoryItem | undefined
        if (!item) return { success: false, error: 'Item not found' }

        const stmt = db.prepare(`UPDATE inventory_item SET 
            item_code = ?, item_name = ?, category_id = ?, 
            unit_of_measure = ?, reorder_level = ?, unit_cost = ?,
            is_active = ?
            WHERE id = ?`)

        stmt.run(
            data.item_code !== undefined ? data.item_code : item.item_code,
            data.item_name !== undefined ? data.item_name : item.item_name,
            data.category_id !== undefined ? data.category_id : item.category_id,
            data.unit_of_measure !== undefined ? data.unit_of_measure : item.unit_of_measure,
            data.reorder_level !== undefined ? data.reorder_level : item.reorder_level,
            data.unit_cost !== undefined ? data.unit_cost : item.unit_cost,
            data.is_active !== undefined ? data.is_active : item.is_active,
            id
        )
        return { success: true }
    })

    ipcMain.handle('inventory:recordMovement', async (_event: IpcMainInvokeEvent, data: StockMovementData, userId: number) => {
        return db.transaction(() => {
            // 1. Record movement
            const stmt = db.prepare(`INSERT INTO stock_movement (
                item_id, movement_type, quantity, unit_cost, total_cost,
                reference_number, supplier_id, description, movement_date, recorded_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

            const totalCost = data.quantity * data.unit_cost
            stmt.run(
                data.item_id, data.movement_type, data.quantity, data.unit_cost, totalCost,
                data.reference_number, data.supplier_id, data.description, data.movement_date, userId
            )

            // 2. Update stock level
            const item = db.prepare('SELECT current_stock, unit_cost FROM inventory_item WHERE id = ?').get(data.item_id) as { current_stock: number; unit_cost: number }
            let newStock = item.current_stock

            if (data.movement_type === 'IN') {
                newStock += data.quantity
                db.prepare('UPDATE inventory_item SET current_stock = ?, unit_cost = ? WHERE id = ?')
                    .run(newStock, data.unit_cost, data.item_id)
            } else if (data.movement_type === 'OUT') {
                newStock -= data.quantity
                db.prepare('UPDATE inventory_item SET current_stock = ? WHERE id = ?')
                    .run(newStock, data.item_id)
            } else if (data.movement_type === 'ADJUSTMENT') {
                newStock += data.quantity
                db.prepare('UPDATE inventory_item SET current_stock = ? WHERE id = ?')
                    .run(newStock, data.item_id)
            }

            return { success: true, newStock }
        })()
    })

    ipcMain.handle('inventory:getSuppliers', async () => {
        return db.prepare('SELECT id, supplier_name, contact_person, phone, email FROM supplier WHERE is_active = 1 ORDER BY supplier_name').all()
    })
}

















