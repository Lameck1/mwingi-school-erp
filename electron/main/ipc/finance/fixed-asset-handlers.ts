import { ipcMain } from 'electron'
import { container } from '../../services/base/ServiceContainer'
import type { FixedAssetService } from '../../services/finance/FixedAssetService'

export function registerFixedAssetHandlers() {
    ipcMain.handle('assets:get-all', async (_event, filters) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.findAll(filters)
    })

    ipcMain.handle('assets:get-one', async (_event, id) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.findById(id)
    })

    ipcMain.handle('assets:create', async (_event, data, userId) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.create(data, userId)
    })

    ipcMain.handle('assets:update', async (_event, id, data, userId) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.update(id, data, userId)
    })

    ipcMain.handle('assets:run-depreciation', async (_event, assetId, periodId, userId) => {
        const service = container.resolve<FixedAssetService>('FixedAssetService')
        return await service.runDepreciation(assetId, periodId, userId)
    })

    // Add delete/dispose handlers if needed
}
