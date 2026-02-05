import { ipcMain } from 'electron'
import { container } from '../../services/base/ServiceContainer'
import type { InventoryService } from '../../services/inventory/InventoryService'

export function registerInventoryHandlers() {
    ipcMain.handle('inventory:getAll', async (_event, filters) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.findAll(filters)
    })

    ipcMain.handle('inventory:getItem', async (_event, id) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.findById(id)
    })

    ipcMain.handle('inventory:createItem', async (_event, data, userId) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.create(data, userId)
    })

    ipcMain.handle('inventory:updateItem', async (_event, id, data, userId) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.update(id, data, userId)
    })

    ipcMain.handle('inventory:recordMovement', async (_event, data, userId) => {
        const service = container.resolve<InventoryService>('InventoryService')
        // In the service, adjustStock might be the underlying method
        return await service.adjustStock(data.item_id, data.quantity, data.movement_type, userId, data.description, data.unit_cost)
    })

    ipcMain.handle('inventory:getHistory', async (_event, itemId) => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getHistory(itemId)
    })

    ipcMain.handle('inventory:getLowStock', async () => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getLowStock()
    })

    ipcMain.handle('inventory:getCategories', async () => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getCategories()
    })

    ipcMain.handle('inventory:getSuppliers', async () => {
        const service = container.resolve<InventoryService>('InventoryService')
        return await service.getSuppliers()
    })
}
