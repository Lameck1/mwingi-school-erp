import { ipcMain } from '../../electron-env'
import { container } from '../../services/base/ServiceContainer'

import type { InventoryService } from '../../services/inventory/InventoryService'
import type { IpcMainInvokeEvent } from 'electron'

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

export function registerInventoryHandlers() {
    ipcMain.handle('inventory:getAll', async (_event: IpcMainInvokeEvent, filters?: InventoryFilters) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.findAll(filters)
    })

    ipcMain.handle('inventory:getItem', async (_event: IpcMainInvokeEvent, id: number) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.findById(id)
    })

    ipcMain.handle('inventory:createItem', async (_event: IpcMainInvokeEvent, data: InventoryCreateInput, userId: number) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.create(data, userId)
    })

    ipcMain.handle('inventory:updateItem', async (_event: IpcMainInvokeEvent, id: number, data: InventoryUpdateInput, userId: number) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.update(id, data, userId)
    })

    ipcMain.handle('inventory:recordMovement', async (_event: IpcMainInvokeEvent, data: InventoryMovementInput, userId: number) => {
        const service = container.resolve<InventoryService>('InventoryService')
        // In the service, adjustStock might be the underlying method
        return await service.adjustStock(data.item_id, data.quantity, data.movement_type, userId, data.description, data.unit_cost)
    })

    ipcMain.handle('inventory:getHistory', async (_event: IpcMainInvokeEvent, itemId: number) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getHistory(itemId)
    })

    ipcMain.handle('inventory:getLowStock', async (_event: IpcMainInvokeEvent) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getLowStock()
    })

    ipcMain.handle('inventory:getCategories', async (_event: IpcMainInvokeEvent) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getCategories()
    })

    ipcMain.handle('inventory:getSuppliers', async (_event: IpcMainInvokeEvent) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getSuppliers()
    })
}
